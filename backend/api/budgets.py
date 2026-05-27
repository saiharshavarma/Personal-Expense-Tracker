import uuid
from typing import Optional
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.database import get_db
from db.models import Budget

router = APIRouter(tags=["budgets"])


class BudgetCreate(BaseModel):
    month: int
    year: int
    category: str
    budget_amount: Decimal
    needs_pct: Optional[Decimal] = None
    wants_pct: Optional[Decimal] = None
    savings_pct: Optional[Decimal] = None


class BudgetUpdate(BaseModel):
    budget_amount: Optional[Decimal] = None
    needs_pct: Optional[Decimal] = None
    wants_pct: Optional[Decimal] = None
    savings_pct: Optional[Decimal] = None


def _serialize(b: Budget) -> dict:
    return {
        "id": str(b.id),
        "month": b.month,
        "year": b.year,
        "category": b.category,
        "budget_amount": float(b.budget_amount),
        "needs_pct": float(b.needs_pct) if b.needs_pct else None,
        "wants_pct": float(b.wants_pct) if b.wants_pct else None,
        "savings_pct": float(b.savings_pct) if b.savings_pct else None,
    }


@router.get("")
async def list_budgets(
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Budget)
    if month:
        q = q.where(Budget.month == month)
    if year:
        q = q.where(Budget.year == year)
    result = await db.execute(q.order_by(Budget.category))
    return [_serialize(b) for b in result.scalars().all()]


@router.post("", status_code=201)
async def create_budget(
    body: BudgetCreate,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    b = Budget(**body.model_dump())
    db.add(b)
    try:
        await db.commit()
        await db.refresh(b)
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Budget for this month/year/category already exists")
    return _serialize(b)


@router.put("/{budget_id}")
async def update_budget(
    budget_id: uuid.UUID,
    body: BudgetUpdate,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    b = await db.get(Budget, budget_id)
    if not b:
        raise HTTPException(status_code=404, detail="Budget not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(b, k, v)
    await db.commit()
    await db.refresh(b)
    return _serialize(b)


@router.delete("/{budget_id}", status_code=204)
async def delete_budget(
    budget_id: uuid.UUID,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    b = await db.get(Budget, budget_id)
    if not b:
        raise HTTPException(status_code=404, detail="Budget not found")
    await db.delete(b)
    await db.commit()


@router.post("/copy-previous-month")
async def copy_previous_month(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(...),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    prev_month = month - 1 if month > 1 else 12
    prev_year = year if month > 1 else year - 1

    result = await db.execute(
        select(Budget).where(and_(Budget.month == prev_month, Budget.year == prev_year))
    )
    source_budgets = result.scalars().all()
    if not source_budgets:
        raise HTTPException(status_code=404, detail="No budgets found for previous month")

    created = 0
    for src in source_budgets:
        exists = await db.execute(
            select(Budget).where(and_(Budget.month == month, Budget.year == year, Budget.category == src.category))
        )
        if exists.scalar_one_or_none():
            continue
        new_budget = Budget(
            month=month, year=year, category=src.category,
            budget_amount=src.budget_amount,
            needs_pct=src.needs_pct, wants_pct=src.wants_pct, savings_pct=src.savings_pct,
        )
        db.add(new_budget)
        created += 1

    await db.commit()
    return {"created": created, "month": month, "year": year}
