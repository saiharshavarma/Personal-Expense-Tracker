from datetime import date
from typing import Optional
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_, extract
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.database import get_db
from db.models import Transaction

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
        {**d, "savings_rate": round((d["income"] - d["expenses"]) / d["income"] * 100, 1) if d["income"] else 0}
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
