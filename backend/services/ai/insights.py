from datetime import date
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, extract
from db.models import Transaction


async def build_aggregated_context(
    db: AsyncSession,
    month: Optional[int] = None,
    year: Optional[int] = None,
) -> dict:
    """
    Build sanitized context for AI insights.
    NEVER includes raw transactions, merchant names, or account info.
    Only aggregated category totals, percentages, and MoM trends.
    """
    today = date.today()
    m = month or today.month
    y = year or today.year
    prev_m = m - 1 if m > 1 else 12
    prev_y = y if m > 1 else y - 1

    # Income + expenses for the period
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

    # Previous month expenses
    prev_exp = float((await db.execute(
        select(func.sum(Transaction.amount))
        .where(Transaction.direction == "debit",
               extract("month", Transaction.date) == prev_m,
               extract("year", Transaction.date) == prev_y)
    )).scalar() or 0)

    # Category breakdown (top 10 by spend)
    cat_rows = (await db.execute(
        select(Transaction.category, func.sum(Transaction.amount).label("total"))
        .where(Transaction.direction == "debit", Transaction.category.isnot(None),
               extract("month", Transaction.date) == m, extract("year", Transaction.date) == y)
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

    # Need/Want/Savings split
    nws_rows = (await db.execute(
        select(Transaction.need_want_savings, func.sum(Transaction.amount).label("total"))
        .where(Transaction.direction == "debit", Transaction.need_want_savings.isnot(None),
               extract("month", Transaction.date) == m, extract("year", Transaction.date) == y)
        .group_by(Transaction.need_want_savings)
    )).all()
    nws = {r.need_want_savings: round(float(r.total or 0), 2) for r in nws_rows}

    # Last 6 months trend (expenses only)
    trend_rows = (await db.execute(
        select(
            extract("year", Transaction.date).label("yr"),
            extract("month", Transaction.date).label("mo"),
            func.sum(Transaction.amount).label("total"),
        )
        .where(Transaction.direction == "debit")
        .group_by("yr", "mo")
        .order_by("yr", "mo")
    )).all()
    trend = [
        {"year": int(r.yr), "month": int(r.mo), "total": round(float(r.total or 0), 2)}
        for r in trend_rows[-6:]
    ]

    return {
        "period": f"{m}/{y}",
        "month": m,
        "year": y,
        "total_spending": round(expenses, 2),
        "total_income": round(income, 2),
        "net": round(income - expenses, 2),
        "savings_rate_pct": round((income - expenses) / income * 100, 1) if income else 0,
        "mom_change_pct": round((expenses - prev_exp) / prev_exp * 100, 1) if prev_exp else 0,
        "prev_month_spending": round(prev_exp, 2),
        "category_breakdown": categories,
        "need_want_savings": nws,
        "monthly_trend_last_6": trend,
    }


async def query_insights(
    question: str,
    db: AsyncSession,
    provider=None,
    month: Optional[int] = None,
    year: Optional[int] = None,
) -> dict:
    """Answer a natural language question with aggregated context only."""
    if not provider:
        raise ValueError("No AI provider configured. Add an API key in Settings → AI Configuration.")
    context = await build_aggregated_context(db, month=month, year=year)
    result = await provider.query(question, context)
    return {"answer": result.answer, "context_snapshot": context}
