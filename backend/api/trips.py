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


@router.get("/{trip_id}/expenses")
async def get_trip_expenses(trip_id: uuid.UUID, _user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    trip = await db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    result = await db.execute(
        select(Transaction).where(Transaction.business_trip_id == trip_id).order_by(Transaction.date)
    )
    txns = result.scalars().all()
    total = sum(float(t.amount) for t in txns)
    return {
        "trip": _serialize(trip),
        "expenses": [{"id": str(t.id), "date": t.date.isoformat(), "amount": float(t.amount),
                      "merchant": t.merchant or t.description, "category": t.category} for t in txns],
        "total_spent": total,
        "budget_remaining": float(trip.budget) - total if trip.budget else None,
    }
