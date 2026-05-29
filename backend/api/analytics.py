from datetime import date
from typing import Optional, List
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_, or_, extract, case as sa_case
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.database import get_db
from db.models import Transaction, Budget

router = APIRouter(tags=["analytics"])


def _reimb_filters(exclude: bool) -> List:
    """
    When exclude_reimbursable=True, keep transactions that are either:
    - Not reimbursable at all, OR
    - Partially split (is_reimbursable=True AND expected_reimbursement is set
      AND expected_reimbursement < amount, i.e. the user still bears some cost).

    Fully-reimbursable rows (no expected amount set, or expected >= amount) are
    excluded so the "personal-only" view shows zero cost for those.
    The net amount for partial splits is handled by _amount_expr().
    """
    if not exclude:
        return []
    return [
        or_(
            Transaction.is_reimbursable != True,
            and_(
                Transaction.is_reimbursable == True,
                Transaction.expected_reimbursement.isnot(None),
                Transaction.expected_reimbursement < Transaction.amount,
            ),
        )
    ]


def _amount_expr(exclude_reimbursable: bool):
    """
    Amount expression for debit aggregations.

    When exclude_reimbursable=False  →  Transaction.amount (full gross spend).
    When exclude_reimbursable=True   →  for split transactions (is_reimbursable=True
        AND expected_reimbursement is set) return amount - expected_reimbursement,
        i.e. only the user's personal share.  All other rows use the full amount.
        Fully-reimbursable rows are already removed by _reimb_filters so they
        won't appear in any aggregation.
    """
    if not exclude_reimbursable:
        return Transaction.amount
    return sa_case(
        (
            and_(
                Transaction.is_reimbursable == True,
                Transaction.expected_reimbursement.isnot(None),
            ),
            Transaction.amount - Transaction.expected_reimbursement,
        ),
        else_=Transaction.amount,
    )


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


def _month_key(year: int, month: int) -> str:
    return f"{year}-{month:02d}"


def _median(values: list[float]) -> Optional[float]:
    vals = sorted(v for v in values if v is not None)
    if not vals:
        return None
    mid = len(vals) // 2
    if len(vals) % 2:
        return vals[mid]
    return (vals[mid - 1] + vals[mid]) / 2


def _avg(values: list[float]) -> Optional[float]:
    vals = [v for v in values if v is not None]
    return sum(vals) / len(vals) if vals else None


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
            func.sum(_amount_expr(exclude_reimbursable)).label("total"),
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

    amt = _amount_expr(exclude_reimbursable)
    # Categorized spend per category
    q = select(
        Transaction.category,
        func.sum(amt).label("total"),
        func.count(Transaction.id).label("count"),
    ).where(Transaction.direction == "debit", Transaction.category.isnot(None), *date_filters, *reimb)
    result = await db.execute(q.group_by(Transaction.category).order_by(func.sum(amt).desc()))
    rows = result.all()

    # Use ALL debit spend (including uncategorized) as the denominator so that
    # category percentages reflect true share of total spending, not just
    # categorized-only share.
    total_all = float((await db.execute(
        select(func.sum(amt))
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
            func.sum(_amount_expr(exclude_reimbursable)).label("total"),
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
        select(Transaction.date, func.sum(_amount_expr(exclude_reimbursable)).label("daily_total"))
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
    _amt = _amount_expr(exclude_reimbursable)
    q = select(
        Transaction.merchant,
        func.sum(_amt).label("total"),
        func.count(Transaction.id).label("visits"),
    ).where(Transaction.direction == "debit", Transaction.merchant.isnot(None),
            *_reimb_filters(exclude_reimbursable))
    if month and year:
        q = q.where(extract("month", Transaction.date) == month, extract("year", Transaction.date) == year)
    result = await db.execute(q.group_by(Transaction.merchant).order_by(func.sum(_amt).desc()).limit(limit))
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
        func.sum(_amount_expr(exclude_reimbursable)).label("total"),
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
        func.sum(_amount_expr(exclude_reimbursable)).label("total"),
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

    _ds_amt = _amount_expr(exclude_reimbursable)
    debit_row = (await db.execute(
        select(func.sum(_ds_amt).label("total"), func.count(Transaction.id).label("count"))
        .where(Transaction.direction == "debit",
               extract("month", Transaction.date) == m, extract("year", Transaction.date) == y,
               *reimb)
    )).first()
    expenses = float((debit_row.total if debit_row else None) or 0)
    txn_count = (debit_row.count if debit_row else None) or 0

    # Previous month expenses (same filter applied for consistent MoM comparison)
    prev_exp = float((await db.execute(
        select(func.sum(_ds_amt).label("t"))
        .where(Transaction.direction == "debit",
               extract("month", Transaction.date) == prev_m, extract("year", Transaction.date) == prev_y,
               *reimb)
    )).scalar() or 0)
    # L-8: Return None when there's no previous-month data so the frontend can
    # show a "no prior data" placeholder rather than a misleading 0% change.
    mom_pct = round((expenses - prev_exp) / prev_exp * 100, 1) if prev_exp else None

    # Top category
    top_cat_row = (await db.execute(
        select(Transaction.category, func.sum(_ds_amt).label("total"))
        .where(Transaction.direction == "debit", Transaction.category.isnot(None),
               extract("month", Transaction.date) == m, extract("year", Transaction.date) == y,
               *reimb)
        .group_by(Transaction.category).order_by(func.sum(_ds_amt).desc()).limit(1)
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
        select(func.sum(_ds_amt).label("t"))
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
        select(func.sum(_amount_expr(exclude_reimbursable)).label("total"))
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
            func.sum(_amount_expr(exclude_reimbursable)).label("total"),
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
            func.sum(_amount_expr(exclude_reimbursable)).label("total"),
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

    _sv_amt = _amount_expr(exclude_reimbursable)
    # Selected-month total debit spend
    month_total = float((await db.execute(
        select(func.sum(_sv_amt))
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
            func.sum(_sv_amt).label("total"),
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


@router.get("/decision-signals")
async def decision_signals(
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    months: int = Query(6, ge=3, le=24),
    exclude_reimbursable: bool = Query(False),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Higher-signal analytics for action, not just description:
    - Is this month abnormal versus the user's own baseline?
    - Which categories/merchants are expanding beyond their normal footprint?
    - How much income is already locked by recurring/fixed commitments?
    - Which budgets are likely to break at the current pace?
    """
    import calendar
    import math
    from dateutil.relativedelta import relativedelta

    today = date.today()
    m = month or today.month
    y = year or today.year
    selected_start = date(y, m, 1)
    history_start = selected_start - relativedelta(months=months)
    next_month = selected_start + relativedelta(months=1)
    reimb = _reimb_filters(exclude_reimbursable)

    selected_days_elapsed = (
        today.day if y == today.year and m == today.month
        else calendar.monthrange(y, m)[1]
    )
    selected_days_total = calendar.monthrange(y, m)[1]
    pace_factor = selected_days_total / selected_days_elapsed if selected_days_elapsed else 1

    income = float((await db.execute(
        select(func.sum(Transaction.amount))
        .where(
            Transaction.direction == "credit",
            extract("month", Transaction.date) == m,
            extract("year", Transaction.date) == y,
            _income_filter(),
        )
    )).scalar() or 0)

    _ds_sig_amt = _amount_expr(exclude_reimbursable)
    selected_expenses = float((await db.execute(
        select(func.sum(_ds_sig_amt))
        .where(
            Transaction.direction == "debit",
            extract("month", Transaction.date) == m,
            extract("year", Transaction.date) == y,
            *reimb,
        )
    )).scalar() or 0)

    monthly_rows = (await db.execute(
        select(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            func.sum(_ds_sig_amt).label("total"),
        )
        .where(
            Transaction.direction == "debit",
            Transaction.date >= history_start,
            Transaction.date < selected_start,
            *reimb,
        )
        .group_by("year", "month")
        .order_by("year", "month")
    )).all()
    monthly_totals = [float(r.total or 0) for r in monthly_rows if float(r.total or 0) > 0]
    median_month = _median(monthly_totals)
    avg_month = _avg(monthly_totals)
    volatility_pct = None
    if avg_month and len(monthly_totals) >= 2:
        variance = sum((v - avg_month) ** 2 for v in monthly_totals) / len(monthly_totals)
        volatility_pct = math.sqrt(variance) / avg_month * 100 if avg_month else None

    projected_expenses = selected_expenses * pace_factor
    anomaly_pct = (
        (projected_expenses - median_month) / median_month * 100
        if median_month else None
    )

    selected_cat_rows = (await db.execute(
        select(
            Transaction.category,
            func.sum(_ds_sig_amt).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .where(
            Transaction.direction == "debit",
            Transaction.category.isnot(None),
            extract("month", Transaction.date) == m,
            extract("year", Transaction.date) == y,
            *reimb,
        )
        .group_by(Transaction.category)
    )).all()
    selected_cat = {
        r.category: {"total": float(r.total or 0), "count": r.count}
        for r in selected_cat_rows
    }

    hist_cat_rows = (await db.execute(
        select(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            Transaction.category,
            func.sum(_ds_sig_amt).label("total"),
        )
        .where(
            Transaction.direction == "debit",
            Transaction.category.isnot(None),
            Transaction.date >= history_start,
            Transaction.date < selected_start,
            *reimb,
        )
        .group_by("year", "month", Transaction.category)
    )).all()
    hist_cat: dict[str, list[float]] = {}
    for r in hist_cat_rows:
        hist_cat.setdefault(r.category, []).append(float(r.total or 0))

    category_drift = []
    for cat, cur in selected_cat.items():
        hist_avg = _avg(hist_cat.get(cat, []))
        if not hist_avg or hist_avg < 25:
            continue
        delta = cur["total"] - hist_avg
        pct = delta / hist_avg * 100
        if delta > 20 and pct > 15:
            category_drift.append({
                "category": cat,
                "current": round(cur["total"], 2),
                "baseline": round(hist_avg, 2),
                "delta": round(delta, 2),
                "pct_change": round(pct, 1),
            })
    category_drift.sort(key=lambda x: x["delta"], reverse=True)

    selected_merchant_rows = (await db.execute(
        select(
            Transaction.merchant,
            func.sum(_ds_sig_amt).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .where(
            Transaction.direction == "debit",
            Transaction.merchant.isnot(None),
            extract("month", Transaction.date) == m,
            extract("year", Transaction.date) == y,
            *reimb,
        )
        .group_by(Transaction.merchant)
    )).all()
    selected_merchants = {
        r.merchant: {"total": float(r.total or 0), "count": r.count}
        for r in selected_merchant_rows
    }

    hist_merchant_rows = (await db.execute(
        select(
            Transaction.merchant,
            func.sum(_ds_sig_amt).label("total"),
            func.count(func.distinct(func.date_trunc("month", Transaction.date))).label("active_months"),
        )
        .where(
            Transaction.direction == "debit",
            Transaction.merchant.isnot(None),
            Transaction.date >= history_start,
            Transaction.date < selected_start,
            *reimb,
        )
        .group_by(Transaction.merchant)
    )).all()
    hist_merchants = {
        r.merchant: {
            "baseline": float(r.total or 0) / r.active_months if r.active_months else 0,
            "active_months": r.active_months,
        }
        for r in hist_merchant_rows
    }

    merchant_creep = []
    for merchant, cur in selected_merchants.items():
        hist = hist_merchants.get(merchant)
        if not hist or hist["active_months"] < 2 or hist["baseline"] < 15:
            continue
        delta = cur["total"] - hist["baseline"]
        pct = delta / hist["baseline"] * 100
        if delta > 15 and pct > 25:
            merchant_creep.append({
                "merchant": merchant,
                "current": round(cur["total"], 2),
                "baseline": round(hist["baseline"], 2),
                "delta": round(delta, 2),
                "pct_change": round(pct, 1),
                "transactions": cur["count"],
            })
    merchant_creep.sort(key=lambda x: x["delta"], reverse=True)

    fixed_total = float((await db.execute(
        select(func.sum(_ds_sig_amt))
        .where(
            Transaction.direction == "debit",
            or_(Transaction.is_recurring == True, Transaction.fixed_variable == "fixed"),
            extract("month", Transaction.date) == m,
            extract("year", Transaction.date) == y,
            *reimb,
        )
    )).scalar() or 0)
    fixed_income_pct = fixed_total / income * 100 if income else None
    discretionary_after_fixed = income - fixed_total if income else None

    budget_rows = (await db.execute(
        select(Budget.category, Budget.subcategory, Budget.budget_amount)
        .where(Budget.month == m, Budget.year == y)
    )).all()
    budget_risk = []
    for b in budget_rows:
        filters = [
            Transaction.direction == "debit",
            Transaction.category == b.category,
            extract("month", Transaction.date) == m,
            extract("year", Transaction.date) == y,
            *reimb,
        ]
        if b.subcategory:
            filters.append(Transaction.subcategory == b.subcategory)
        actual = float((await db.execute(
            select(func.sum(Transaction.net_personal_cost)).where(*filters)
        )).scalar() or 0)
        projected = actual * pace_factor
        budget = float(b.budget_amount or 0)
        if budget > 0 and projected > budget:
            budget_risk.append({
                "category": b.category,
                "subcategory": b.subcategory,
                "actual": round(actual, 2),
                "projected": round(projected, 2),
                "budget": round(budget, 2),
                "over_by": round(projected - budget, 2),
                "used_pct": round(actual / budget * 100, 1),
                "projected_pct": round(projected / budget * 100, 1),
            })
    budget_risk.sort(key=lambda x: x["over_by"], reverse=True)

    review_count = (await db.execute(
        select(func.count(Transaction.id))
        .where(
            Transaction.needs_review == True,
            extract("month", Transaction.date) == m,
            extract("year", Transaction.date) == y,
        )
    )).scalar() or 0

    high_risk_count = sum([
        1 if anomaly_pct is not None and anomaly_pct > 20 else 0,
        1 if fixed_income_pct is not None and fixed_income_pct > 50 else 0,
        1 if len(budget_risk) >= 3 else 0,
        1 if volatility_pct is not None and volatility_pct > 35 else 0,
        1 if review_count > 10 else 0,
    ])

    return {
        "month": m,
        "year": y,
        "history_months": months,
        "selected_spend": round(selected_expenses, 2),
        "projected_spend": round(projected_expenses, 2),
        "median_monthly_spend": round(median_month, 2) if median_month is not None else None,
        "spend_anomaly_pct": round(anomaly_pct, 1) if anomaly_pct is not None else None,
        "volatility_pct": round(volatility_pct, 1) if volatility_pct is not None else None,
        "fixed_commitments": round(fixed_total, 2),
        "fixed_income_pct": round(fixed_income_pct, 1) if fixed_income_pct is not None else None,
        "discretionary_after_fixed": round(discretionary_after_fixed, 2) if discretionary_after_fixed is not None else None,
        "budget_risk": budget_risk[:6],
        "category_drift": category_drift[:6],
        "merchant_creep": merchant_creep[:6],
        "review_count": review_count,
        "risk_level": "high" if high_risk_count >= 3 else "medium" if high_risk_count >= 1 else "low",
        "risk_score": min(100, high_risk_count * 25),
    }


@router.get("/cashflow-pace")
async def cashflow_pace(
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    months: int = Query(6, ge=3, le=24),
    exclude_reimbursable: bool = Query(False),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import calendar
    from dateutil.relativedelta import relativedelta

    today = date.today()
    m = month or today.month
    y = year or today.year
    selected_start = date(y, m, 1)
    history_start = selected_start - relativedelta(months=months)
    days_in_month = calendar.monthrange(y, m)[1]
    reimb = _reimb_filters(exclude_reimbursable)

    _cp_amt = _amount_expr(exclude_reimbursable)
    selected_rows = (await db.execute(
        select(
            extract("day", Transaction.date).label("day"),
            func.sum(_cp_amt).label("total"),
        )
        .where(
            Transaction.direction == "debit",
            extract("month", Transaction.date) == m,
            extract("year", Transaction.date) == y,
            *reimb,
        )
        .group_by("day")
        .order_by("day")
    )).all()
    selected_by_day = {int(r.day): float(r.total or 0) for r in selected_rows}

    hist_rows = (await db.execute(
        select(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            extract("day", Transaction.date).label("day"),
            func.sum(_cp_amt).label("total"),
        )
        .where(
            Transaction.direction == "debit",
            Transaction.date >= history_start,
            Transaction.date < selected_start,
            *reimb,
        )
        .group_by("year", "month", "day")
    )).all()

    hist_months: dict[tuple[int, int], dict[int, float]] = {}
    for r in hist_rows:
        hist_months.setdefault((int(r.year), int(r.month)), {})[int(r.day)] = float(r.total or 0)

    cumulative = 0.0
    data = []
    for day in range(1, days_in_month + 1):
        cumulative += selected_by_day.get(day, 0.0)
        hist_cums = []
        for (hy, hm), day_map in hist_months.items():
            hist_days = calendar.monthrange(hy, hm)[1]
            comparable_day = min(day, hist_days)
            hist_cums.append(sum(v for d, v in day_map.items() if d <= comparable_day))
        typical = _avg(hist_cums)
        data.append({
            "day": day,
            "actual_cumulative": round(cumulative, 2),
            "typical_cumulative": round(typical, 2) if typical is not None else None,
        })

    days_elapsed = today.day if y == today.year and m == today.month else days_in_month
    current_total = sum(v for d, v in selected_by_day.items() if d <= days_elapsed)
    projected_total = current_total / days_elapsed * days_in_month if days_elapsed else 0

    return {
        "month": m,
        "year": y,
        "days_elapsed": days_elapsed,
        "days_in_month": days_in_month,
        "current_total": round(current_total, 2),
        "projected_total": round(projected_total, 2),
        "data": data,
    }


@router.get("/fixed-commitment-trend")
async def fixed_commitment_trend(
    months: int = Query(6, ge=3, le=24),
    exclude_reimbursable: bool = Query(False),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import calendar
    from dateutil.relativedelta import relativedelta

    today = date.today()
    start = today.replace(day=1) - relativedelta(months=months - 1)
    reimb = _reimb_filters(exclude_reimbursable)

    income_rows = (await db.execute(
        select(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            func.sum(Transaction.amount).label("total"),
        )
        .where(Transaction.date >= start, Transaction.direction == "credit", _income_filter())
        .group_by("year", "month")
    )).all()
    fixed_rows = (await db.execute(
        select(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            func.sum(_amount_expr(exclude_reimbursable)).label("total"),
        )
        .where(
            Transaction.date >= start,
            Transaction.direction == "debit",
            or_(Transaction.is_recurring == True, Transaction.fixed_variable == "fixed"),
            *reimb,
        )
        .group_by("year", "month")
    )).all()

    income_by_key = {(int(r.year), int(r.month)): float(r.total or 0) for r in income_rows}
    fixed_by_key = {(int(r.year), int(r.month)): float(r.total or 0) for r in fixed_rows}

    results = []
    cur = start
    for _ in range(months):
        key = (cur.year, cur.month)
        income = income_by_key.get(key, 0.0)
        fixed = fixed_by_key.get(key, 0.0)
        results.append({
            "year": cur.year,
            "month": cur.month,
            "income": round(income, 2),
            "fixed": round(fixed, 2),
            "fixed_income_pct": round(fixed / income * 100, 1) if income else None,
            "days_in_month": calendar.monthrange(cur.year, cur.month)[1],
        })
        cur = cur + relativedelta(months=1)

    return results
