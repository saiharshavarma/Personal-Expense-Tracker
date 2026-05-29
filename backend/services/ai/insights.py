import json
import logging
from calendar import monthrange
from datetime import date, timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from db.models import Transaction, Budget

logger = logging.getLogger(__name__)

_MONTH_NAMES = [
    "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]


def _resolve_range(
    month: Optional[int],
    year: Optional[int],
    date_from: Optional[date],
    date_to: Optional[date],
):
    """
    Return (df, dt, prev_df, prev_dt, period_label, is_all_time).
    Precedence: date_from/date_to > month/year > current month.
    If both date_from and date_to are None AND month/year are None → all time.
    """
    today = date.today()

    # ── explicit date range ───────────────────────────────────────────────────
    if date_from is not None or date_to is not None:
        # L-7: Cap day to the last day of the target month to prevent a crash when
        # today is Feb 29 on a leap year and last year was not a leap year.
        _prev_year = today.year - 1
        _capped_day = min(today.day, monthrange(_prev_year, today.month)[1])
        df = date_from or date(_prev_year, today.month, _capped_day)
        dt = date_to or today
        days = (dt - df).days + 1
        prev_dt = df - timedelta(days=1)
        prev_df = prev_dt - timedelta(days=max(days - 1, 0))

        # Human-readable label
        if df.year == dt.year and df.month == dt.month:
            label = f"{_MONTH_NAMES[df.month]} {df.year}"
        elif df.year == dt.year:
            label = f"{_MONTH_NAMES[df.month]}–{_MONTH_NAMES[dt.month]} {df.year}"
        else:
            label = f"{_MONTH_NAMES[df.month]} {df.year} – {_MONTH_NAMES[dt.month]} {dt.year}"

        return df, dt, prev_df, prev_dt, label, False

    # ── legacy month/year ─────────────────────────────────────────────────────
    if month or year:
        m = month or today.month
        y = year or today.year
        _, last_day = monthrange(y, m)
        df = date(y, m, 1)
        dt = date(y, m, last_day)
        prev_m = m - 1 if m > 1 else 12
        prev_y = y if m > 1 else y - 1
        _, prev_last = monthrange(prev_y, prev_m)
        prev_df = date(prev_y, prev_m, 1)
        prev_dt = date(prev_y, prev_m, prev_last)
        label = f"{_MONTH_NAMES[m]} {y}"
        return df, dt, prev_df, prev_dt, label, False

    # ── all time ──────────────────────────────────────────────────────────────
    return None, None, None, None, "All time", True


def _reimb_filters(exclude: bool) -> list:
    """Return SQLAlchemy clauses to exclude reimbursable transactions when requested."""
    if not exclude:
        return []
    return [Transaction.is_reimbursable != True]


async def build_aggregated_context(
    db: AsyncSession,
    month: Optional[int] = None,
    year: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    exclude_reimbursable: bool = False,
) -> dict:
    """
    Build sanitized context for AI insights.
    NEVER includes raw transactions, merchant names, or account info.
    Supports: single month, arbitrary date range, or all-time.
    """
    df, dt, prev_df, prev_dt, period_label, is_all_time = _resolve_range(
        month, year, date_from, date_to
    )
    reimb = _reimb_filters(exclude_reimbursable)

    # Build SQLAlchemy filter clauses
    if is_all_time:
        main_where: list = []
        prev_where: list = []
    else:
        main_where = [Transaction.date >= df, Transaction.date <= dt]
        prev_where = [Transaction.date >= prev_df, Transaction.date <= prev_dt]

    # ── Income + expenses for period ──────────────────────────────────────────
    income = float((await db.execute(
        select(func.sum(Transaction.amount).label("total"))
        .where(Transaction.direction == "credit", *main_where)
    )).scalar() or 0)

    expenses = float((await db.execute(
        select(func.sum(Transaction.amount).label("total"))
        .where(Transaction.direction == "debit", *main_where, *reimb)
    )).scalar() or 0)

    # ── Previous period expenses ──────────────────────────────────────────────
    if prev_where:
        prev_exp = float((await db.execute(
            select(func.sum(Transaction.amount))
            .where(Transaction.direction == "debit", *prev_where, *reimb)
        )).scalar() or 0)
    else:
        prev_exp = 0.0  # no comparison for all-time

    # ── Category breakdown (top 10 by spend) ─────────────────────────────────
    cat_rows = (await db.execute(
        select(Transaction.category, func.sum(Transaction.amount).label("total"))
        .where(Transaction.direction == "debit", Transaction.category.isnot(None),
               *main_where, *reimb)
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(10)
    )).all()
    total_cat = expenses or 1
    categories = [
        {
            "category": r.category,
            "total": round(float(r.total or 0), 2),
            "pct": round(float(r.total or 0) / total_cat * 100, 1),
        }
        for r in cat_rows
    ]

    # ── Need / Want / Savings split ───────────────────────────────────────────
    nws_rows = (await db.execute(
        select(Transaction.need_want_savings, func.sum(Transaction.amount).label("total"))
        .where(
            Transaction.direction == "debit",
            Transaction.need_want_savings.isnot(None),
            *main_where,
            *reimb,
        )
        .group_by(Transaction.need_want_savings)
    )).all()
    nws = {r.need_want_savings: round(float(r.total or 0), 2) for r in nws_rows}

    # ── Monthly trend (up to last 12 months within the range) ─────────────────
    trend_query = (
        select(
            func.extract("year", Transaction.date).label("yr"),
            func.extract("month", Transaction.date).label("mo"),
            func.sum(Transaction.amount).label("total"),
        )
        .where(Transaction.direction == "debit", *main_where, *reimb)
        .group_by("yr", "mo")
        .order_by("yr", "mo")
    )
    trend_rows = (await db.execute(trend_query)).all()
    trend = [
        {"year": int(r.yr), "month": int(r.mo), "total": round(float(r.total or 0), 2)}
        for r in trend_rows[-12:]
    ]

    return {
        "period": period_label,
        "date_from": df.isoformat() if df else None,
        "date_to": dt.isoformat() if dt else None,
        "is_all_time": is_all_time,
        "total_spending": round(expenses, 2),
        "total_income": round(income, 2),
        "net": round(income - expenses, 2),
        "savings_rate_pct": round((income - expenses) / income * 100, 1) if income else None,
        "prev_period_spending": round(prev_exp, 2),
        "period_change_pct": round((expenses - prev_exp) / prev_exp * 100, 1) if prev_exp else None,
        "category_breakdown": categories,
        "need_want_savings": nws,
        "monthly_trend": trend,
        "exclude_reimbursable": exclude_reimbursable,
    }


async def query_insights(
    question: str,
    db: AsyncSession,
    provider=None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    exclude_reimbursable: bool = False,
) -> dict:
    """Answer a natural language question with aggregated context only."""
    if not provider:
        raise ValueError("No AI provider configured. Add an API key in Settings → AI Configuration.")
    context = await build_aggregated_context(
        db, month=month, year=year, date_from=date_from, date_to=date_to,
        exclude_reimbursable=exclude_reimbursable,
    )
    result = await provider.query(question, context)
    return {"answer": result.answer, "context_snapshot": context}


async def build_advisor_context(
    db: AsyncSession,
    month: Optional[int] = None,
    year: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    exclude_reimbursable: bool = False,
) -> dict:
    """
    Richer aggregated context for the financial advisor.
    Extends build_aggregated_context with budget adherence data.
    NEVER includes raw transactions, merchant names, or PII.
    """
    base = await build_aggregated_context(
        db, month=month, year=year, date_from=date_from, date_to=date_to,
        exclude_reimbursable=exclude_reimbursable,
    )

    df_str = base.get("date_from")
    dt_str = base.get("date_to")

    # Budget adherence — query all budget months within the range
    budget_query = select(Budget)
    covered: set = set()
    if df_str and dt_str:
        df_d = date.fromisoformat(df_str)
        dt_d = date.fromisoformat(dt_str)
        # Collect (month, year) pairs covered by the range
        cur = date(df_d.year, df_d.month, 1)
        while cur <= dt_d:
            covered.add((cur.month, cur.year))
            next_month = cur.month + 1 if cur.month < 12 else 1
            next_year = cur.year if cur.month < 12 else cur.year + 1
            cur = date(next_year, next_month, 1)

        if covered:
            # Build OR filter across all covered months
            from sqlalchemy import or_
            month_filters = [
                and_(Budget.month == m, Budget.year == y)
                for m, y in covered
            ]
            budget_query = budget_query.where(or_(*month_filters))

    budget_rows = (await db.execute(budget_query)).scalars().all()

    # Accumulate budget totals across all covered months, then divide by the
    # number of months to get a per-month average.  This makes the adherence
    # numbers directly comparable to single-month averages for any range length
    # and avoids the situation where a 3-month range shows 3× the monthly budget
    # as the "budget" ceiling.
    # M-16: Average only over months that actually have budget rows, not all
    # calendar months in the range. If the user only set budgets for 2 of 6
    # months, dividing by 6 would under-state the per-month budget average
    # and make the advisor think the user is chronically over-budget.
    months_with_budgets = len({(b.month, b.year) for b in budget_rows})
    num_months = max(months_with_budgets, 1)
    budget_map: dict[str, float] = {}
    for b in budget_rows:
        budget_map[b.category] = budget_map.get(b.category, 0) + float(b.budget_amount)
    # Convert accumulated totals → per-month averages
    budget_map = {cat: amt / num_months for cat, amt in budget_map.items()}

    # Also use per-month averages for the actual spending so the comparison is
    # on the same scale regardless of how many months the range spans.
    total_budgeted = sum(budget_map.values())
    adherence = []
    for cat in base["category_breakdown"]:
        cat_name = cat["category"]
        budgeted = budget_map.get(cat_name)
        # Use per-month average actual to match the per-month budget
        actual = round(cat["total"] / num_months, 2)
        if budgeted:
            adherence.append({
                "category": cat_name,
                "budgeted": round(budgeted, 2),
                "actual": actual,
                "pct_used": round(actual / budgeted * 100, 1),
                "over_budget": actual > budgeted,
            })

    unbudgeted = [
        cat["category"]
        for cat in base["category_breakdown"]
        if cat["category"] not in budget_map
    ]

    return {
        **base,
        "period_months": num_months,
        "total_budgeted_monthly_avg": round(total_budgeted, 2),
        "budget_adherence_by_category": adherence,
        "unbudgeted_categories": unbudgeted,
        "over_budget_count": sum(1 for a in adherence if a["over_budget"]),
    }


_ADVISOR_PROMPT = """
You are a certified financial planner (CFP) and wealth strategist. Analyze the user's real financial data below and generate a comprehensive, personalized financial strategy.

Financial Data:
{context_json}

Instructions:
- Be specific — reference the actual numbers from the data
- Be actionable — give concrete steps, not vague advice
- Be encouraging but honest — flag problems clearly
- Focus on: (1) expense reduction, (2) wealth building, (3) better financial habits

Return ONLY a valid JSON object. No markdown fences, no explanation outside the JSON.

JSON structure:
{{
  "score_label": "Excellent|Good|Fair|Needs Work",
  "health_verdict": "2-3 sentence overall assessment mentioning key metrics",
  "executive_summary": "3-4 sentence narrative of their financial situation for this period",
  "alert": "urgent warning string if savings rate < 5% or over budget by >30%, otherwise null",
  "expense_reductions": [
    {{"title": "action title", "detail": "specific detail with numbers", "estimated_monthly_saving": "$X"}}
  ],
  "wealth_building": [
    {{"strategy": "strategy title", "detail": "concrete steps with amounts", "timeframe": "e.g. Start this month"}}
  ],
  "habits": [
    {{"habit": "habit name", "impact": "why this matters to their finances"}}
  ],
  "action_plan": [
    {{"week": 1, "action": "specific action", "impact": "high|medium|low"}}
  ]
}}

Generate exactly 3 expense_reductions, 3 wealth_building strategies, 4 habits, and a 4-week action_plan.
"""


async def generate_financial_advice(
    db: AsyncSession,
    provider=None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    exclude_reimbursable: bool = False,
) -> dict:
    """Generate proactive financial strategy advice using aggregated data only."""
    if not provider:
        raise ValueError("No AI provider configured. Add an API key in Settings → AI Configuration.")

    context = await build_advisor_context(
        db, month=month, year=year, date_from=date_from, date_to=date_to,
        exclude_reimbursable=exclude_reimbursable,
    )
    context_json = json.dumps(context, indent=2)

    question = _ADVISOR_PROMPT.format(context_json=context_json)
    result = await provider.query(question, context)

    raw = result.answer.strip()
    # Strip markdown fences if the model wrapped anyway
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    try:
        advice = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("Advisor: could not parse JSON response, returning raw text")
        advice = {"raw_advice": result.answer}

    return {"advice": advice, "context_snapshot": context}
