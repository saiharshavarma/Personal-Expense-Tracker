from datetime import date
from typing import Optional
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_, extract
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.database import get_db
from db.models import Transaction, Budget

router = APIRouter(tags=["analytics"])


@router.get("/spend-trends")
async def spend_trends(
    months: int = Query(6, ge=1, le=36),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            func.sum(Transaction.amount).label("total"),
        )
        .where(Transaction.direction == "debit")
        .group_by("year", "month")
        .order_by("year", "month")
        .limit(months)
    )
    rows = result.all()
    return [{"year": int(r.year), "month": int(r.month), "total": float(r.total or 0)} for r in rows]


@router.get("/category-breakdown")
async def category_breakdown(
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(
        Transaction.category,
        func.sum(Transaction.amount).label("total"),
        func.count(Transaction.id).label("count"),
    ).where(Transaction.direction == "debit", Transaction.category.isnot(None))

    if month and year:
        q = q.where(
            extract("month", Transaction.date) == month,
            extract("year", Transaction.date) == year,
        )
    result = await db.execute(q.group_by(Transaction.category).order_by(func.sum(Transaction.amount).desc()))
    rows = result.all()
    total = sum(float(r.total or 0) for r in rows)
    return [
        {"category": r.category, "total": float(r.total or 0), "count": r.count,
         "pct": round(float(r.total or 0) / total * 100, 1) if total else 0}
        for r in rows
    ]


@router.get("/income-expenses")
async def income_expenses(
    months: int = Query(6),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            Transaction.direction,
            func.sum(Transaction.amount).label("total"),
        )
        .group_by("year", "month", Transaction.direction)
        .order_by("year", "month")
    )
    rows = result.all()
    data: dict = {}
    for r in rows:
        key = (int(r.year), int(r.month))
        if key not in data:
            data[key] = {"year": int(r.year), "month": int(r.month), "income": 0, "expenses": 0}
        if r.direction == "credit":
            data[key]["income"] = float(r.total or 0)
        else:
            data[key]["expenses"] = float(r.total or 0)
    return sorted(data.values(), key=lambda x: (x["year"], x["month"]))


@router.get("/savings-rate")
async def savings_rate(
    months: int = Query(6),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await income_expenses(months=months, _user=None, db=db)
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
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from services.projections import calculate_month_end_projection
    import calendar

    today = date.today()
    m = month or today.month
    y = year or today.year

    result = await db.execute(
        select(Transaction.date, func.sum(Transaction.amount).label("daily_total"))
        .where(
            Transaction.direction == "debit",
            extract("month", Transaction.date) == m,
            extract("year", Transaction.date) == y,
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
    result = await db.execute(
        select(Transaction.reimbursement_status, func.sum(Transaction.expected_reimbursement).label("total"),
               func.count(Transaction.id).label("count"))
        .where(Transaction.is_reimbursable == True)
        .group_by(Transaction.reimbursement_status)
    )
    return [{"status": r.reimbursement_status, "total": float(r.total or 0), "count": r.count} for r in result.all()]


@router.get("/top-merchants")
async def top_merchants(
    limit: int = Query(10),
    month: Optional[int] = None,
    year: Optional[int] = None,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(
        Transaction.merchant,
        func.sum(Transaction.amount).label("total"),
        func.count(Transaction.id).label("visits"),
    ).where(Transaction.direction == "debit", Transaction.merchant.isnot(None))
    if month and year:
        q = q.where(extract("month", Transaction.date) == month, extract("year", Transaction.date) == year)
    result = await db.execute(q.group_by(Transaction.merchant).order_by(func.sum(Transaction.amount).desc()).limit(limit))
    return [{"merchant": r.merchant, "total": float(r.total or 0), "visits": r.visits} for r in result.all()]


@router.get("/need-want-savings")
async def need_want_savings_split(
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(
        Transaction.need_want_savings,
        func.sum(Transaction.amount).label("total"),
        func.count(Transaction.id).label("count"),
    ).where(Transaction.direction == "debit", Transaction.need_want_savings.isnot(None))
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
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(
        Transaction.is_recurring,
        func.sum(Transaction.amount).label("total"),
        func.count(Transaction.id).label("count"),
    ).where(Transaction.direction == "debit")
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
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    m = month or today.month
    y = year or today.year
    prev_m = m - 1 if m > 1 else 12
    prev_y = y if m > 1 else y - 1

    # Income + expenses for selected period
    period_rows = (await db.execute(
        select(Transaction.direction, func.sum(Transaction.amount).label("total"),
               func.count(Transaction.id).label("count"))
        .where(extract("month", Transaction.date) == m, extract("year", Transaction.date) == y)
        .group_by(Transaction.direction)
    )).all()
    income = 0.0; expenses = 0.0; txn_count = 0
    for r in period_rows:
        if r.direction == "credit": income = float(r.total or 0)
        else: expenses = float(r.total or 0); txn_count = r.count

    # Previous month expenses
    prev_exp = float((await db.execute(
        select(func.sum(Transaction.amount).label("t"))
        .where(Transaction.direction == "debit",
               extract("month", Transaction.date) == prev_m, extract("year", Transaction.date) == prev_y)
    )).scalar() or 0)
    mom_pct = round((expenses - prev_exp) / prev_exp * 100, 1) if prev_exp else 0

    # Top category
    top_cat_row = (await db.execute(
        select(Transaction.category, func.sum(Transaction.amount).label("total"))
        .where(Transaction.direction == "debit", Transaction.category.isnot(None),
               extract("month", Transaction.date) == m, extract("year", Transaction.date) == y)
        .group_by(Transaction.category).order_by(func.sum(Transaction.amount).desc()).limit(1)
    )).first()

    # Pending reimbursements
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
               extract("month", Transaction.date) == m, extract("year", Transaction.date) == y)
    )).scalar() or 0)

    # Needs-review count
    review_count = (await db.execute(
        select(func.count(Transaction.id)).where(Transaction.needs_review == True)
    )).scalar() or 0

    return {
        "month": m, "year": y,
        "expenses": round(expenses, 2),
        "income": round(income, 2),
        "savings": round(income - expenses, 2),
        "savings_rate": round((income - expenses) / income * 100, 1) if income else 0,
        "transaction_count": txn_count,
        "top_category": top_cat_row.category if top_cat_row else None,
        "top_category_total": round(float(top_cat_row.total or 0), 2) if top_cat_row else 0,
        "mom_change_pct": mom_pct,
        "prev_month_expenses": round(prev_exp, 2),
        "reimbursement_pending": round(float(reimb_row.total or 0), 2) if reimb_row else 0,
        "reimbursement_count": reimb_row.count if reimb_row else 0,
        "recurring_total": round(recurring, 2),
        "needs_review_count": review_count,
    }


@router.get("/health-score")
async def health_score(
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    m = month or today.month
    y = year or today.year

    # Income and expenses for the month
    period_rows = (await db.execute(
        select(Transaction.direction, func.sum(Transaction.amount).label("total"))
        .where(extract("month", Transaction.date) == m, extract("year", Transaction.date) == y)
        .group_by(Transaction.direction)
    )).all()
    income = 0.0
    expenses = 0.0
    for r in period_rows:
        if r.direction == "credit":
            income = float(r.total or 0)
        else:
            expenses = float(r.total or 0)

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
        budget_adherence_pct = 0.0
    else:
        # Actual spend per category for the month
        actual_rows = (await db.execute(
            select(Transaction.category, func.sum(Transaction.amount).label("total"))
            .where(
                Transaction.direction == "debit",
                Transaction.category.isnot(None),
                extract("month", Transaction.date) == m,
                extract("year", Transaction.date) == y,
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

    review_completion_pct = (1 - needs_review_count / max(total_transactions, 1)) * 100
    review_score = (1 - needs_review_count / max(total_transactions, 1)) * 30

    total_score = int(round(savings_score + budget_score + review_score))

    return {
        "score": total_score,
        "savings_score": round(savings_score, 2),
        "budget_score": round(budget_score, 2),
        "review_score": round(review_score, 2),
        "savings_rate": round(savings_rate, 2),
        "budget_adherence_pct": round(budget_adherence_pct, 2) if budgets else 0.0,
        "review_completion_pct": round(review_completion_pct, 2),
    }


@router.get("/day-of-week")
async def day_of_week(
    months: int = Query(6, ge=1, le=36),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from dateutil.relativedelta import relativedelta

    today = date.today()
    cutoff = today - relativedelta(months=months)

    result = await db.execute(
        select(
            extract("dow", Transaction.date).label("dow"),
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .where(
            Transaction.direction == "debit",
            Transaction.date >= cutoff,
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
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from dateutil.relativedelta import relativedelta

    today = date.today()
    results = []

    for i in range(months - 1, -1, -1):
        target = today - relativedelta(months=i)
        m = target.month
        y = target.year

        # Actual spend per category
        actual_rows = (await db.execute(
            select(Transaction.category, func.sum(Transaction.amount).label("total"))
            .where(
                Transaction.direction == "debit",
                Transaction.category.isnot(None),
                extract("month", Transaction.date) == m,
                extract("year", Transaction.date) == y,
            )
            .group_by(Transaction.category)
        )).all()
        actual_by_cat = {r.category: float(r.total or 0) for r in actual_rows}

        # Budget amounts for this month
        budget_rows = (await db.execute(
            select(Budget.category, Budget.budget_amount)
            .where(Budget.month == m, Budget.year == y)
        )).all()
        budget_by_cat = {b.category: float(b.budget_amount) for b in budget_rows}

        # Union of categories that have a budget OR had actual spend
        all_categories = set(actual_by_cat.keys()) | set(budget_by_cat.keys())

        for cat in sorted(all_categories):
            actual_val = actual_by_cat.get(cat, 0.0)
            budget_val = budget_by_cat.get(cat)
            # Only include if has budget OR actual spend > 0
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
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import calendar
    from dateutil.relativedelta import relativedelta

    today = date.today()
    m = today.month
    y = today.year
    days_elapsed = today.day

    # Current month total debit spend
    month_total = float((await db.execute(
        select(func.sum(Transaction.amount))
        .where(
            Transaction.direction == "debit",
            extract("month", Transaction.date) == m,
            extract("year", Transaction.date) == y,
        )
    )).scalar() or 0)

    current_rate = month_total / days_elapsed if days_elapsed else 0.0

    # Historical rates over the past N months
    historical_rates = []
    for i in range(1, months + 1):
        target = today - relativedelta(months=i)
        hm = target.month
        hy = target.year
        days_in_month = calendar.monthrange(hy, hm)[1]

        hist_total = float((await db.execute(
            select(func.sum(Transaction.amount))
            .where(
                Transaction.direction == "debit",
                extract("month", Transaction.date) == hm,
                extract("year", Transaction.date) == hy,
            )
        )).scalar() or 0)

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
