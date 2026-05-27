import uuid
from decimal import Decimal
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.database import get_db
from db.models import Subscription

router = APIRouter(tags=["subscriptions"])


class SubscriptionCreate(BaseModel):
    name: str
    amount: Decimal
    billing_frequency: Optional[str] = None
    next_billing_date: Optional[date] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    personal_work_shared: Optional[str] = "personal"
    is_reimbursable: bool = False
    account_id: Optional[uuid.UUID] = None
    value_rating: Optional[int] = None
    usage_rating: Optional[str] = None
    notes: Optional[str] = None


class SubscriptionUpdate(SubscriptionCreate):
    name: Optional[str] = None
    amount: Optional[Decimal] = None
    is_active: Optional[bool] = None


def _serialize(s: Subscription) -> dict:
    monthly = float(s.amount)
    if s.billing_frequency == "yearly":
        monthly = float(s.amount) / 12
    elif s.billing_frequency == "quarterly":
        monthly = float(s.amount) / 3
    return {
        "id": str(s.id),
        "name": s.name,
        "amount": float(s.amount),
        "monthly_equivalent": round(monthly, 2),
        "annual_equivalent": round(monthly * 12, 2),
        "billing_frequency": s.billing_frequency,
        "next_billing_date": s.next_billing_date.isoformat() if s.next_billing_date else None,
        "category": s.category,
        "subcategory": s.subcategory,
        "personal_work_shared": s.personal_work_shared,
        "is_reimbursable": s.is_reimbursable,
        "account_id": str(s.account_id) if s.account_id else None,
        "is_active": s.is_active,
        "value_rating": s.value_rating,
        "usage_rating": s.usage_rating,
        "notes": s.notes,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "cancelled_at": s.cancelled_at.isoformat() if s.cancelled_at else None,
    }


@router.get("")
async def list_subscriptions(
    active_only: bool = Query(True),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Subscription)
    if active_only:
        q = q.where(Subscription.is_active == True)
    result = await db.execute(q.order_by(Subscription.name))
    return [_serialize(s) for s in result.scalars().all()]


@router.get("/summary")
async def subscription_summary(_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Subscription).where(Subscription.is_active == True))
    subs = result.scalars().all()
    total_monthly = sum(
        float(s.amount) / (12 if s.billing_frequency == "yearly" else 3 if s.billing_frequency == "quarterly" else 1)
        for s in subs
    )
    personal_monthly = sum(
        float(s.amount) / (12 if s.billing_frequency == "yearly" else 3 if s.billing_frequency == "quarterly" else 1)
        for s in subs if s.personal_work_shared == "personal"
    )
    work_monthly = total_monthly - personal_monthly
    return {
        "total_monthly": round(total_monthly, 2),
        "total_annual": round(total_monthly * 12, 2),
        "personal_monthly": round(personal_monthly, 2),
        "work_monthly": round(work_monthly, 2),
        "count": len(subs),
    }


@router.post("", status_code=201)
async def create_subscription(
    body: SubscriptionCreate,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    s = Subscription(**body.model_dump())
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return _serialize(s)


@router.put("/{subscription_id}")
async def update_subscription(
    subscription_id: uuid.UUID,
    body: SubscriptionUpdate,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    s = await db.get(Subscription, subscription_id)
    if not s:
        raise HTTPException(status_code=404, detail="Subscription not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(s, k, v)
    await db.commit()
    await db.refresh(s)
    return _serialize(s)


@router.delete("/{subscription_id}", status_code=204)
async def cancel_subscription(
    subscription_id: uuid.UUID,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    s = await db.get(Subscription, subscription_id)
    if not s:
        raise HTTPException(status_code=404, detail="Subscription not found")
    s.is_active = False
    s.cancelled_at = datetime.utcnow()
    await db.commit()
