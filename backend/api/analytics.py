from datetime import date
from typing import Optional, List
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_, or_, extract
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.database import get_db
from db.models import Transaction, Budget

router = APIRouter(tags=["analytics"])


def _reimb_filters(exclude: bool) -> List:
    """
    Return extra SQLAlchemy WHERE clauses when exclude_reimbursable=True.
    Excludes transactions that are marked reimbursable AND have not yet been paid
    (i.e. the money has not come back yet — once paid they count as zero-net-cost
    because net_personal_cost handles that; for simplicity we exclude all
    is_reimbursable rows so the toggle gives a clean "personal-only" view).
    """
    if not exclude:
        return []
    return [Transaction.is_reimbursable != True]


def _income_filter():
    """
    C-7: Single canonical income filter applied consistently across analytics and
    budgets endpoints.  Excludes Transfer and Financial category credits (which
    are inter-account movements, not real income) while keeping NULL-category
    credits (e.g. uncategorised salary deposits).

    budgets.py uses the same exclusion list — aligning here prevents the Dashboard
    savings rate and the Budget page NWS summary from showing different income
    figures for the same month.
    """
    return or_(
        Transaction.category.is_(None),
        Transaction.category.notin_(["Transfer", "Financial"]),
    )


@router.get("/spend-trends")
async def spend_trends(
    months: int = Query(6, ge=1, le=36),
    exclude_reimbursable: bool = Query(False),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from dateutil.relativedelta import relativedelta
    cutoff = date.today().replace(day=1) - relativedelta(months=months - 1)
    result = await db.execute(
        select(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            func.sum(Transaction.amount).label("total"),
        )
        .where(Transaction.direction == "debit", Transaction.date >= cutoff,
               *_reimb_filters(exclude_reimbursable))
        .group_by("year", "month")
        .order_by("year", "month")
    )
    rows = result.all()
    return [{"year": int(r.year), "month": int(r.month), "total": float(r.total or 0)} for r in rows]


@router.get("/category-breakdown")
async def category_breakdown(
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    exclude_reimbursable: bool = Query(False),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    date_filters = []
    if month and year:
        date_filters = [
            extract("month", Transaction.date) == month,
            extract("year", Transaction.date) == year,
        ]
    reimb = _reimb_filters(exclude_reimbursable)

    # Categorized spend per category
    q = select(
        Transaction.category,
        func.sum(Transaction.amount).label("total"),
        func.count(Transaction.id).label("count"),
    ).where(Transaction.direction == "debit", Transaction.category.isnot(None), *date_filters, *reimb)
    result = await db.execute(q.group_by(Transaction.category).order_by(func.sum(Transaction.amount).desc()))
    rows = result.all()

    # Use ALL debit spend (including uncategorized) as the denominator so that
    # category percentages reflect true share of total spending, not just
    # categorized-only share.
    total_all = float((await db.execute(
        select(func.sum(Transaction.amount))
        .where(Transaction.direction == "debit", *date_filters, *reimb)
    )).scalar() or 0)
    total = total_all or sum(float(r.total or 0) for r in rows)

    return [
        {"category": r.category, "total": float(r.total or 0), "count": r.count,
         "pct": round(float(r.total or 0) / total * 100, 1) if total else 0}
        for r in rows
    ]


@router.get("/income-expenses")
async def income_expenses(
    months: int = Query(6),
    exclude_reimbursable: bool = Query(False),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from dateutil.relativedelta import relativedelta
    cutoff = date.today().replace(day=1) - relativedelta(months=months - 1)
    reimb = _reimb_filters(exclude_reimbursable)

    # C-7: Query income (credits) and expenses (debits) separately so we can apply
    # the canonical income filter (_income_filter) on the credit side only — matching
    # the same exclusion list that budgets.py uses so Dashboard and Budget page
    # always show the same income figure for a given month.
    income_rows = (await db.execute(
        select(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            func.sum(Transaction.amount).label("total"),
        )
        .where(
            Transaction.date >= cutoff,
            Transaction.direction == "credit",
            _income_filter(),
        )
        .group_by("year", "month")
    )).all()

    expense_rows = (await db.execute(
        select(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            func.sum(Transaction.amount).label("total"),
        )
        .where(Transaction.date >= cutoff, Transaction.direction == "debit", *reimb)
        .group_by("year", "month")
    )).all()

    data: dict = {}
    for r in income_rows:
        key = (int(r.year), int(r.month))
        data[key] = {"year": int(r.year), "month": int(r.month), "income": float(r.total or 0), "expenses": 0}
    for r in expense_rows:
        key = (int(r.year), int(r.month))
        if key not in data:
            data[key] = {"year": int(r.year), "month": int(r.month), "income": 0, "expenses": 0}
        # H-1: expense total comes from the filtered query; months where ALL debits are
        # reimbursable produce no row so they correctly show $0 instead of the gross total.
        data[key]["expenses"] = float(r.total or 0)
    return sorted(data.values(), key=lambda x: (x["year"], x["month"]))


@router.get("/savings-rate")
async def savings_rate(
    months: int = Query(6),
    exclude_reimbursable: bool = Query(False),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await income_expenses(months=months, exclude_reimbursable=exclude_reimbursable, _user=None, db=db)
    return [
        {
            **d,
            # savings_rate is null when income=0 so the frontend can show a fallback
            "savings_rate": round((d["income"] - d["expenses"]) / d["income"] * 100, 1) if d["income"] else None,
            # savings_amount (income − expenses) is always available; negative means spending exceeds income
            "savings_amount": round(d["income"] - d["expenses"], 2),
        }
        for d in data
    ]


@router.get("/projections")
async def projections(
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    # H-5: Add exclude_reimbursable so projections match other analytics views
    exclude_reimbursable: bool = Query(False),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from services.projections import calculate_month_end_projection
    import calendar

    today = date.today()
    m = month or today.month
    y = year or today.year
    reimb = _reimb_filters(exclude_reimbursable)

    result = await db.execute(
        select(Transaction.date, func.sum(Transaction.amount).label("daily_total"))
        .where(
            Transaction.direction == "debit",
            extract("month", Transaction.date) == m,
            extract("year", Transaction.date) == y,
            *reimb,
        )
        .group_by(Transaction.date)
        .order_by(Transaction.date)
    )
    daily = [{"date": r.date, "amount": r.daily_total} for r in result.all()]
    return calculate_month_end_projection(daily, m, y)


@router.get("/heatmap")
async def spend_heatmap(
    year: int = Query(None),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    y = year or date.today().year
    result = await db.execute(
        select(Transaction.date, func.sum(Transaction.amount).label("total"))
        .where(Transaction.direction == "debit", extract("year", Transaction.date) == y)
        .group_by(Transaction.date)
        .order_by(Transaction.date)
    )
    return [{"date": r.date.isoformat(), "amount": float(r.total or 0)} for r in result.all()]


@router.get("/reimbursement-stats")
async def reimbursement_stats(_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # For paid transactions use the actual received amount; for all other
    # statuses use the expected amount (or fall back to the transaction amount).
    from sqlalchemy import case as sa_case
    amount_expr = sa_case(
        (
            Transaction.reimbursement_status == "paid",
            func.coalesce(Transaction.received_reimbursement, Transaction.expected_reimbursement, Transaction.amount),
        ),
        else_=func.coalesce(Transaction.expected_reimbursement, Transaction.amount),
    )
    result = await db.execute(
        select(
            Transaction.reimbursement_status,
            func.sum(amount_expr).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .where(Transaction.is_reimbursable == True)
        .group_by(Transaction.reimbursement_status)
    )
    return [{"status": r.reimbursement_status, "total": float(r.total or 0), "count": r.count} for r in result.all()]


@router.get("/top-merchants")
async def top_merchants(
    limit: int = Query(10),
    # M-13: Use Query(None) for consistent FastAPI query param handling
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    exclude_reimbursable: bool = Query(False),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(
        Transaction.merchant,
        func.sum(Transaction.amount).label("total"),
        func.count(Transaction.id).label("visits"),
    ).where(Transaction.direction == "debit", Transaction.merchant.isnot(None),
            *_reimb_filters(exclude_reimbursable))
    if month and year:
        q = q.where(extract("month", Transaction.date) == month, extract("year", Transaction.date) == year)
    result = await db.execute(q.group_by(Transaction.merchant).order_by(func.sum(Transaction.amount).desc()).limit(limit))
    return [{"merchant": r.merchant, "total": float(r.total or 0), "visits": r.visits} for r in result.all()]


@router.get("/need-want-savings")
async def need_want_savings_split(
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    exclude_reimbursable: bool = Query(False),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # M-17: Require both month AND year together — a lone month param is ambiguous
    # (which year?) and would silently aggregate across all years for that month.
    from fastapi import HTTPException as _HTTPException
    if (month is None) != (year is None):
        raise _HTTPException(status_code=400, detail="Provide both month and year, or neither.")

    q = select(
        Transaction.need_want_savings,
        func.sum(Transaction.amount).label("total"),
        func.count(Transaction.id).label("count"),
    ).where(Transaction.direction == "debit", Transaction.need_want_savings.isnot(None),
            *_reimb_filters(exclude_reimbursable))
    if month and year:
        q = q.where(extract("month", Transaction.date) == month, extract("year", Transaction.date) == year)
    result = await db.execute(q.group_by(Transaction.need_want_savings))
    rows = result.all()
    total = sum(float(r.total or 0) for r in rows)
    return [
        {"type": r.need_want_savings, "total": float(r.total or 0), "count": r.count,
         "pct": round(float(r.total or 0) / total * 100, 1) if total else 0}
        for r in rows
    ]


@router.get("/recurring-split")
async def recurring_split(
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    exclude_reimbursable: bool = Query(False),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # M-17: Require both month AND year together
    from fastapi import HTTPException as _HTTPException
    if (month is None) != (year is None):
        raise _HTTPException(status_code=400, detail="Provide both month and year, or neither.")

    q = select(
        Transaction.is_recurring,
        func.sum(Transaction.amount).label("total"),
        func.count(Transaction.id).label("count"),
    ).where(Transaction.direction == "debit", *_reimb_filters(exclude_reimbursable))
    if month and year:
        q = q.where(extract("month", Transaction.date) == month, extract("year", Transaction.date) == year)
    result = await db.execute(q.group_by(Transaction.is_recurring))
    rows = result.all()
    total = sum(float(r.total or 0) for r in rows)
    return [
        {"type": "recurring" if r.is_recurring else "one_time",
         "total": float(r.total or 0), "count": r.count,
         "pct": round(float(r.total or 0) / total * 100, 1) if total else 0}
        for r in rows
    ]


@router.get("/dashboard-summary")
async def dashboard_summary(
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    exclude_reimbursable: bool = Query(False),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    m = month or today.month
    y = year or today.year
    prev_m = m - 1 if m > 1 else 12
    prev_y = y if m > 1 else y - 1
    reimb = _reimb_filters(exclude_reimbursable)

    # Income + expenses for selected period
    # C-7: Apply _income_filter() to exclude Transfer/Financial credits so this
    # figure matches what budgets.py reports — same month = same income number.
    income_row = (await db.execute(
        select(func.sum(Transaction.amount).label("total"))
        .where(
            Transaction.direction == "credit",
            extract("month", Transaction.date) == m,
            extract("year", Transaction.date) == y,
            _income_filter(),
        )
    )).first()
    income = float((income_row.total if income_row else None) or 0)

    debit_row = (await db.execute(
        select(func.sum(Transaction.amount).label("total"), func.count(Transaction.id).label("count"))
        .where(Transaction.direction == "debit",
               extract("month", Transaction.date) == m, extract("year", Transaction.date) == y,
               *reimb)
    )).first()
    expenses = float((debit_row.total if debit_row else None) or 0)
    txn_count = (debit_row.count if debit_row else None) or 0

    # Previous month expenses (same filter applied for consistent MoM comparison)
    prev_exp = float((await db.execute(
        select(func.sum(Transaction.amount).label("t"))
        .where(Transaction.direction == "debit",
               extract("month", Transaction.date) == prev_m, extract("year", Transaction.date) == prev_y,
               *reimb)
    )).scalar() or 0)
    # L-8: Return None when there's no previous-month data so the frontend can
    # show a "no prior data" placeholder rather than a misleading 0% change.
    mom_pct = round((expenses - prev_exp) / prev_exp * 100, 1) if prev_exp else None

    # Top category
    top_cat_row = (await db.execute(
        select(Transaction.category, func.sum(Transaction.amount).label("total"))
        .where(Transaction.direction == "debit", Transaction.category.isnot(None),
               extract("month", Transaction.date) == m, extract("year", Transaction.date) == y,
               *reimb)
        .group_by(Transaction.category).order_by(func.sum(Transaction.amount).desc()).limit(1)
    )).first()

    # Pending reimbursements — always shown regardless of toggle (it's informational)
    reimb_row = (await db.execute(
        select(func.sum(Transaction.expected_reimbursement).label("total"),
               func.count(Transaction.id).label("count"))
        .where(Transaction.is_reimbursable == True,
               Transaction.reimbursement_status.in_(["to_submit", "submitted"]))
    )).first()

    # Recurring this month
    recurring = float((await db.execute(
        select(func.sum(Transaction.amount).label("t"))
        .where(Transaction.direction == "debit", Transaction.is_recurring == True,
               extract("month", Transaction.date) == m, extract("year", Transaction.date) == y,
               *reimb)
    )).scalar() or 0)

    # Needs-review count — scoped to the selected month so the badge reflects
    # this month's review backlog, not an all-time accumulation.
    review_count = (await db.execute(
        select(func.count(Transaction.id)).where(
            Transaction.needs_review == True,
            extract("month", Transaction.date) == m,
            extract("year", Transaction.date) == y,
        )
    )).scalar() or 0

    return {
        "month": m, "year": y,
        "expenses": round(expenses, 2),
        "income": round(income, 2),
        "savings": round(income - expenses, 2),
        "savings_rate": round((income - expenses) / income * 100, 1) if income else None,
        "transaction_count": txn_count,
        "top_category": top_cat_row.category if top_cat_row else None,
        "top_category_total": round(float(top_cat_row.total or 0), 2) if top_cat_row else 0,
        "mom_change_pct": mom_pct,
        "prev_month_expenses": round(prev_exp, 2),
        "reimbursement_pending": round(float(reimb_row.total or 0), 2) if reimb_row else 0,
        "reimbursement_count": reimb_row.count if reimb_row else 0,
        "recurring_total": round(recurring, 2),
        "needs_review_count": review_count,
        "exclude_reimbursable": exclude_reimbursable,
    }


@router.get("/health-score")
async def health_score(
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    exclude_reimbursable: bool = Query(False),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    m = month or today.month
    y = year or today.year
    reimb = _reimb_filters(exclude_reimbursable)

    # Income and expenses for the month
    # C-7: Use _income_filter() for consistent income across all analytics endpoints
    income_row = (await db.execute(
        select(func.sum(Transaction.amount).label("total"))
        .where(
            Transaction.direction == "credit",
            extract("month", Transaction.date) == m,
            extract("year", Transaction.date) == y,
            _income_filter(),
        )
    )).first()
    income = float((income_row.total if income_row else None) or 0)

    expense_row = (await db.execute(
        select(func.sum(Transaction.amount).label("total"))
        .where(Transaction.direction == "debit",
               extract("month", Transaction.date) == m, extract("year", Transaction.date) == y,
               *reimb)
    )).first()
    expenses = float((expense_row.total if expense_row else None) or 0)

    # savings_score (0-40)
    savings_rate = (income - expenses) / income * 100 if income else 0.0
    savings_score = min(max(savings_rate, 0) / 25 * 40, 40)

    # budget_score (0-30)
    budgets = (await db.execute(
        select(Budget.category, Budget.budget_amount)
        .where(Budget.month == m, Budget.year == y)
    )).all()

    if not budgets:
        budget_score = 15.0
        # M-12: null signals "no budgets set" so the frontend can show a
        # "Set up budgets to track adherence" prompt instead of 0%.
        budget_adherence_pct = None
    else:
        # C-8: Compare net personal cost (gross − received reimbursement) to budget,
        # not gross spend. A fully reimbursed expense should not count against the
        # budget because the money actually came back to the user.
        actual_rows = (await db.execute(
            select(Transaction.category, func.sum(Transaction.net_personal_cost).label("total"))
            .where(
                Transaction.direction == "debit",
                Transaction.category.isnot(None),
                extract("month", Transaction.date) == m,
                extract("year", Transaction.date) == y,
                *reimb,
            )
            .group_by(Transaction.category)
        )).all()
        actual_by_cat = {r.category: float(r.total or 0) for r in actual_rows}

        within_budget = sum(
            1 for b in budgets
            if actual_by_cat.get(b.category, 0) <= float(b.budget_amount)
        )
        budget_adherence_pct = within_budget / len(budgets) * 100
        budget_score = budget_adherence_pct / 100 * 30

    # review_score (0-30)
    total_transactions = (await db.execute(
        select(func.count(Transaction.id))
        .where(extract("month", Transaction.date) == m, extract("year", Transaction.date) == y)
    )).scalar() or 0

    needs_review_count = (await db.execute(
        select(func.count(Transaction.id))
        .where(
            Transaction.needs_review == True,
            extract("month", Transaction.date) == m,
            extract("year", Transaction.date) == y,
        )
    )).scalar() or 0

    # A month with zero transactions has no review work to do — give it a neutral
    # score (0) rather than perfect (30) so it doesn't inflate the health score
    # for inactive months (e.g. a future month selected in the picker).
    if total_transactions == 0:
        review_completion_pct = 0.0
        review_score = 0.0
    else:
        review_completion_pct = (1 - needs_review_count / total_transactions) * 100
        review_score = review_completion_pct / 100 * 30

    total_score = int(round(savings_score + budget_score + review_score))

    return {
        "score": total_score,
        "savings_score": round(savings_score, 2),
        "budget_score": round(budget_score, 2),
        "review_score": round(review_score, 2),
        "savings_rate": round(savings_rate, 2),
        # M-12: null when no budgets are set so frontend can distinguish "0%" from "not tracked"
        "budget_adherence_pct": round(budget_adherence_pct, 2) if budget_adherence_pct is not None else None,
        "review_completion_pct": round(review_completion_pct, 2),
    }


@router.get("/day-of-week")
async def day_of_week(
    months: int = Query(6, ge=1, le=36),
    exclude_reimbursable: bool = Query(False),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from dateutil.relativedelta import relativedelta

    today = date.today()
    cutoff = today.replace(day=1) - relativedelta(months=months - 1)

    result = await db.execute(
        select(
            extract("dow", Transaction.date).label("dow"),
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .where(
            Transaction.direction == "debit",
            Transaction.date >= cutoff,
            *_reimb_filters(exclude_reimbursable),
        )
        .group_by("dow")
        .order_by("dow")
    )
    rows = result.all()

    dow_labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    row_by_dow = {int(r.dow): r for r in rows}

    return [
        {
            "dow": d,
            "label": dow_labels[d],
            "total": round(float(row_by_dow[d].total or 0), 2) if d in row_by_dow else 0.0,
            "count": row_by_dow[d].count if d in row_by_dow else 0,
            "avg": round(float(row_by_dow[d].total or 0) / row_by_dow[d].count, 2)
                   if d in row_by_dow and row_by_dow[d].count else 0.0,
        }
        for d in range(7)
    ]


@router.get("/budget-trend")
async def budget_trend(
    months: int = Query(6, ge=1, le=36),
    exclude_reimbursable: bool = Query(False),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from dateutil.relativedelta import relativedelta
    from sqlalchemy import tuple_

    today = date.today()
    cutoff = today.replace(day=1) - relativedelta(months=months - 1)

    # Build the list of (month, year) pairs in range
    month_range: list[tuple[int, int]] = []
    cur = cutoff
    while cur <= today:
        month_range.append((cur.month, cur.year))
        cur = (cur.replace(day=1) + relativedelta(months=1))

    # Single query: actual spend by (year, month, category) for the whole range
    actual_rows = (await db.execute(
        select(
            extract("year",  Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            Transaction.category,
            func.sum(Transaction.amount).label("total"),
        )
        .where(
            Transaction.direction == "debit",
            Transaction.category.isnot(None),
            Transaction.date >= cutoff,
            *_reimb_filters(exclude_reimbursable),
        )
        .group_by("year", "month", Transaction.category)
    )).all()

    # Single query: budgets for all (month, year) pairs in range
    budget_rows = (await db.execute(
        select(Budget.year, Budget.month, Budget.category, Budget.budget_amount)
        .where(tuple_(Budget.month, Budget.year).in_(month_range))
    )).all()

    # Index both result sets
    actual_idx: dict[tuple, float] = {}
    for r in actual_rows:
        actual_idx[(int(r.year), int(r.month), r.category)] = float(r.total or 0)

    budget_idx: dict[tuple, float] = {}
    for b in budget_rows:
        budget_idx[(b.year, b.month, b.category)] = float(b.budget_amount)

    # Build output
    results = []
    for m, y in month_range:
        cats = set(
            cat for (yr, mo, cat) in actual_idx if yr == y and mo == m
        ) | set(
            cat for (yr, mo, cat) in budget_idx if yr == y and mo == m
        )
        for cat in sorted(cats):
            actual_val = actual_idx.get((y, m, cat), 0.0)
            budget_val = budget_idx.get((y, m, cat))
            if budget_val is not None or actual_val > 0:
                results.append({
                    "year": y,
                    "month": m,
                    "category": cat,
                    "actual": round(actual_val, 2),
                    "budget": round(budget_val, 2) if budget_val is not None else None,
                })

    return sorted(results, key=lambda x: (x["year"], x["month"], x["category"]))


@router.get("/spend-velocity")
async def spend_velocity(
    months: int = Query(3, ge=1, le=24),
    # M-1: Allow viewing velocity for any month so the Dashboard widget can show
    # the correct value for the selected month rather than always the current month.
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    exclude_reimbursable: bool = Query(False),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import calendar
    from dateutil.relativedelta import relativedelta

    today = date.today()
    m = month or today.month
    y = year or today.year
    # For past months the full month has elapsed; for the current month count only up to today.
    if y == today.year and m == today.month:
        days_elapsed = today.day
    else:
        days_elapsed = calendar.monthrange(y, m)[1]

    reimb = _reimb_filters(exclude_reimbursable)

    # Selected-month total debit spend
    month_total = float((await db.execute(
        select(func.sum(Transaction.amount))
        .where(
            Transaction.direction == "debit",
            extract("month", Transaction.date) == m,
            extract("year", Transaction.date) == y,
            *reimb,
        )
    )).scalar() or 0)

    current_rate = month_total / days_elapsed if days_elapsed else 0.0

    # Historical rates over the past N complete months relative to the selected month.
    # H-4: Anchor cutoff to the 1st of the selected month — anchoring to today's
    # calendar date shifts the window by up to 30 days depending on the day of month.
    hist_cutoff = date(y, m, 1) - relativedelta(months=months)
    hist_rows = (await db.execute(
        select(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            func.sum(Transaction.amount).label("total"),
        )
        .where(
            Transaction.direction == "debit",
            Transaction.date >= hist_cutoff,
            Transaction.date < date(y, m, 1),
            *reimb,
        )
        .group_by("year", "month")
    )).all()
    hist_totals = {(int(r.year), int(r.month)): float(r.total or 0) for r in hist_rows}

    historical_rates = []
    for i in range(1, months + 1):
        target = date(y, m, 1) - relativedelta(months=i)
        hm = target.month
        hy = target.year
        days_in_month = calendar.monthrange(hy, hm)[1]
        hist_total = hist_totals.get((hy, hm), 0.0)
        # H-3: Skip zero-spend months — a month with no transactions (e.g. account
        # didn't exist yet) would drag the baseline down and exaggerate pct_change.
        if hist_total > 0:
            historical_rates.append(hist_total / days_in_month)

    historical_rate = sum(historical_rates) / len(historical_rates) if historical_rates else None
    pct_change = (
        (current_rate - historical_rate) / historical_rate * 100
        if historical_rate else None
    )

    return {
        "current_rate": round(current_rate, 2),
        "historical_rate": round(historical_rate, 2) if historical_rate is not None else None,
        "pct_change": round(pct_change, 1) if pct_change is not None else None,
        "days_elapsed": days_elapsed,
        "month_total": round(month_total, 2),
    }
