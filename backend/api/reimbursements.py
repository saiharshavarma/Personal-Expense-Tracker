import uuid
from typing import Optional, List
from decimal import Decimal
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.database import get_db
from db.models import ReimbursementBatch, Transaction

router = APIRouter(tags=["reimbursements"])


class BatchCreate(BaseModel):
    name: Optional[str] = None
    source: str
    expense_tool: Optional[str] = None
    submission_method: Optional[str] = None
    notes: Optional[str] = None
    transaction_ids: List[uuid.UUID] = []


class BatchUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    submitted_date: Optional[date] = None
    expected_payment_date: Optional[date] = None
    total_received: Optional[Decimal] = None
    submission_reference: Optional[str] = None
    notes: Optional[str] = None


def _serialize_batch(b: ReimbursementBatch) -> dict:
    return {
        "id": str(b.id),
        "name": b.name,
        "source": b.source,
        "submitted_date": b.submitted_date.isoformat() if b.submitted_date else None,
        "expected_payment_date": b.expected_payment_date.isoformat() if b.expected_payment_date else None,
        "total_submitted": float(b.total_submitted) if b.total_submitted else None,
        "total_received": float(b.total_received) if b.total_received else 0,
        "status": b.status,
        "expense_tool": b.expense_tool,
        "submission_reference": b.submission_reference,
        "submission_method": b.submission_method,
        "notes": b.notes,
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


@router.get("/pipeline")
async def get_pipeline(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return reimbursable transactions grouped by status."""
    result = await db.execute(
        select(Transaction).where(Transaction.is_reimbursable == True).order_by(Transaction.date.desc())
    )
    transactions = result.scalars().all()

    pipeline = {"to_submit": [], "submitted": [], "approved": [], "paid": [], "rejected": []}
    for t in transactions:
        status = t.reimbursement_status or "not_reimbursable"
        key = status.replace(" ", "_").lower()
        if key in pipeline:
            pipeline[key].append({
                "id": str(t.id),
                "date": t.date.isoformat(),
                "merchant": t.merchant or t.description,
                "amount": float(t.amount),
                "expected_reimbursement": float(t.expected_reimbursement) if t.expected_reimbursement else float(t.amount),
                "reimbursement_source": t.reimbursement_source,
                "category": t.category,
                "days_outstanding": (date.today() - t.date).days if t.date else 0,
            })
    return pipeline


@router.get("/batches")
async def list_batches(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ReimbursementBatch).order_by(ReimbursementBatch.created_at.desc()))
    return [_serialize_batch(b) for b in result.scalars().all()]


@router.post("/batches", status_code=201)
async def create_batch(
    body: BatchCreate,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    total = Decimal("0")
    if body.transaction_ids:
        result = await db.execute(select(Transaction).where(Transaction.id.in_(body.transaction_ids)))
        txns = result.scalars().all()
        total = sum(t.expected_reimbursement or t.amount for t in txns)

    batch = ReimbursementBatch(
        name=body.name,
        source=body.source,
        expense_tool=body.expense_tool,
        submission_method=body.submission_method,
        notes=body.notes,
        total_submitted=total,
    )
    db.add(batch)
    await db.flush()

    if body.transaction_ids:
        result = await db.execute(select(Transaction).where(Transaction.id.in_(body.transaction_ids)))
        for t in result.scalars().all():
            t.reimbursement_batch_id = batch.id
            t.reimbursement_status = "submitted"

    await db.commit()
    await db.refresh(batch)
    return _serialize_batch(batch)


@router.put("/batches/{batch_id}")
async def update_batch(
    batch_id: uuid.UUID,
    body: BatchUpdate,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    batch = await db.get(ReimbursementBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(batch, k, v)
    await db.commit()
    await db.refresh(batch)
    return _serialize_batch(batch)


@router.put("/transactions/{transaction_id}/status")
async def update_reimbursement_status(
    transaction_id: uuid.UUID,
    status: str = Query(...),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    t = await db.get(Transaction, transaction_id)
    if not t:
        raise HTTPException(status_code=404, detail="Transaction not found")
    valid = {"to_submit", "submitted", "approved", "paid", "partial", "rejected", "not_reimbursable"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid}")
    t.reimbursement_status = status
    # When marked paid, record the received amount if not already set
    if status == "paid" and not t.received_reimbursement:
        t.received_reimbursement = t.expected_reimbursement or t.amount
    # When moved back out of paid, clear the received amount
    elif status != "paid" and status != "partial":
        t.received_reimbursement = None
    await db.commit()
    return {"id": str(t.id), "reimbursement_status": status}
