import uuid
from decimal import Decimal
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.database import get_db
from db.models import Trip, Transaction

router = APIRouter(tags=["trips"])


class TripCreate(BaseModel):
    name: str
    destination: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    trip_type: str = "business"
    budget: Optional[Decimal] = None
    expense_tool: Optional[str] = None
    expense_tool_reference: Optional[str] = None
    notes: Optional[str] = None


class TripUpdate(TripCreate):
    name: Optional[str] = None
    # C-1: Override parent's default "business" so a PATCH without trip_type
    # does NOT silently reset the field.  model_dump(exclude_none=True) below
    # means None values are simply skipped, preserving the existing DB value.
    trip_type: Optional[str] = None
    status: Optional[str] = None


def _serialize(t: Trip) -> dict:
    return {
        "id": str(t.id),
        "name": t.name,
        "destination": t.destination,
        "start_date": t.start_date.isoformat() if t.start_date else None,
        "end_date": t.end_date.isoformat() if t.end_date else None,
        "trip_type": t.trip_type,
        "budget": float(t.budget) if t.budget else None,
        "status": t.status,
        "expense_tool": t.expense_tool,
        "expense_tool_reference": t.expense_tool_reference,
        "notes": t.notes,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


@router.get("")
async def list_trips(_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Trip).order_by(Trip.start_date.desc()))
    return [_serialize(t) for t in result.scalars().all()]


@router.post("", status_code=201)
async def create_trip(body: TripCreate, _user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    t = Trip(**body.model_dump())
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return _serialize(t)


@router.get("/{trip_id}")
async def get_trip(trip_id: uuid.UUID, _user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    t = await db.get(Trip, trip_id)
    if not t:
        raise HTTPException(status_code=404, detail="Trip not found")
    return _serialize(t)


@router.put("/{trip_id}")
async def update_trip(trip_id: uuid.UUID, body: TripUpdate, _user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    t = await db.get(Trip, trip_id)
    if not t:
        raise HTTPException(status_code=404, detail="Trip not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(t, k, v)
    t.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(t)
    return _serialize(t)


@router.delete("/{trip_id}", status_code=204)
async def delete_trip(trip_id: uuid.UUID, _user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    t = await db.get(Trip, trip_id)
    if not t:
        raise HTTPException(status_code=404, detail="Trip not found")
    await db.delete(t)
    await db.commit()


@router.post("/{trip_id}/auto-tag")
async def auto_tag_trip_expenses(
    trip_id: uuid.UUID,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Auto-tag transactions that fall within the trip's date range.
    Only tags transactions that are not already assigned to a trip.
    Returns the count of newly tagged transactions.
    """
    trip = await db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if not trip.start_date or not trip.end_date:
        raise HTTPException(status_code=400, detail="Trip must have both start_date and end_date to auto-tag expenses.")

    result = await db.execute(
        select(Transaction).where(
            Transaction.date >= trip.start_date,
            Transaction.date <= trip.end_date,
            Transaction.direction == "debit",
            Transaction.business_trip_id.is_(None),
            # H-11: Exclude recurring charges (rent, subscriptions, utilities).
            # Auto-tag should only capture one-off trip expenses, not standing
            # obligations that happen to fall inside the travel window.
            Transaction.is_recurring != True,
        )
    )
    untagged = result.scalars().all()

    for t in untagged:
        t.business_trip_id = trip_id
        t.updated_at = datetime.utcnow()

    await db.commit()
    # H-11: Return tagged transaction IDs so the frontend can refresh the list
    # without a round-trip and the user can audit exactly which transactions were tagged.
    return {
        "tagged_count": len(untagged),
        "trip_id": str(trip_id),
        "tagged_transaction_ids": [str(t.id) for t in untagged],
    }


@router.get("/{trip_id}/expenses")
async def get_trip_expenses(trip_id: uuid.UUID, _user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    trip = await db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    # C-6: Filter to debit direction only — credits (refunds) tagged to a trip
    # should be handled via received_reimbursement on the debit transaction rather
    # than appearing as negative expenses here, which would confuse total_spent.
    result = await db.execute(
        select(Transaction).where(
            Transaction.business_trip_id == trip_id,
            Transaction.direction == "debit",
        ).order_by(Transaction.date)
    )
    txns = result.scalars().all()
    # total_spent is net (gross minus any received reimbursement) for accurate
    # budget tracking.  Each expense also exposes both gross and net amounts so
    # the frontend can show whichever is appropriate without ambiguity.
    total = sum(float(t.amount) - float(t.received_reimbursement or 0) for t in txns)
    return {
        "trip": _serialize(trip),
        "expenses": [
            {
                "id": str(t.id),
                "date": t.date.isoformat(),
                "amount": float(t.amount),               # gross
                "net_amount": round(float(t.amount) - float(t.received_reimbursement or 0), 2),  # net personal cost
                "merchant": t.merchant or t.description,
                "category": t.category,
            }
            for t in txns
        ],
        "total_spent": round(total, 2),
        "budget_remaining": round(float(trip.budget) - total, 2) if trip.budget else None,
    }
