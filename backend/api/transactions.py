import uuid
from datetime import datetime, date as _Date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.database import get_db
from db.models import Account, Transaction

router = APIRouter(tags=["transactions"])


class TransactionCreate(BaseModel):
    date: _Date
    amount: Decimal
    direction: str
    description: Optional[str] = None
    account_id: Optional[uuid.UUID] = None
    business_trip_id: Optional[uuid.UUID] = None
    transaction_type: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    need_want_savings: Optional[str] = None
    fixed_variable: Optional[str] = None
    personal_work_shared: Optional[str] = None
    merchant: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    is_reimbursable: bool = False
    reimbursement_source: Optional[str] = None
    reimbursement_status: str = "not_reimbursable"
    expected_reimbursement: Optional[Decimal] = None
    is_recurring: bool = False
    frequency: Optional[str] = None
    source: str = "manual"


class TransactionUpdate(BaseModel):
    date: Optional[_Date] = None
    amount: Optional[Decimal] = None
    direction: Optional[str] = None
    description: Optional[str] = None
    account_id: Optional[uuid.UUID] = None
    business_trip_id: Optional[uuid.UUID] = None
    transaction_type: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    need_want_savings: Optional[str] = None
    fixed_variable: Optional[str] = None
    personal_work_shared: Optional[str] = None
    merchant: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    is_reimbursable: Optional[bool] = None
    reimbursement_source: Optional[str] = None
    reimbursement_status: Optional[str] = None
    expected_reimbursement: Optional[Decimal] = None
    received_reimbursement: Optional[Decimal] = None
    is_recurring: Optional[bool] = None
    frequency: Optional[str] = None
    ai_reviewed: Optional[bool] = None
    needs_review: Optional[bool] = None


class BulkActionRequest(BaseModel):
    transaction_ids: List[uuid.UUID]
    action: str  # "categorize", "mark_reimbursable", "delete", "tag"
    payload: dict = Field(default_factory=dict)


_VALID_DIRECTIONS = {"debit", "credit"}
_REIMBURSABLE_STATUSES = {"to_submit", "submitted", "approved", "paid", "partial", "rejected"}


def _normalize_transaction_payload(data: dict) -> dict:
    if "amount" in data and data["amount"] is not None and data["amount"] <= 0:
        raise HTTPException(status_code=400, detail="Transaction amount must be positive")
    if "direction" in data and data["direction"] is not None and data["direction"] not in _VALID_DIRECTIONS:
        raise HTTPException(status_code=400, detail="Direction must be 'debit' or 'credit'")
    if (
        "received_reimbursement" in data
        and data["received_reimbursement"] is not None
        and data["received_reimbursement"] < 0
    ):
        raise HTTPException(status_code=400, detail="Received reimbursement cannot be negative")
    if (
        "expected_reimbursement" in data
        and data["expected_reimbursement"] is not None
        and data["expected_reimbursement"] < 0
    ):
        raise HTTPException(status_code=400, detail="Expected reimbursement cannot be negative")
    if (
        "reimbursement_status" in data
        and data["reimbursement_status"] is not None
        and data["reimbursement_status"] not in (_REIMBURSABLE_STATUSES | {"not_reimbursable"})
    ):
        raise HTTPException(status_code=400, detail="Invalid reimbursement status")

    if data.get("is_reimbursable") is True:
        if not data.get("reimbursement_status") or data.get("reimbursement_status") == "not_reimbursable":
            data["reimbursement_status"] = "to_submit"
        elif data["reimbursement_status"] not in _REIMBURSABLE_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid reimbursement status for a reimbursable transaction")
    elif data.get("is_reimbursable") is False:
        data["reimbursement_status"] = "not_reimbursable"
        data["reimbursement_source"] = None

    return data


async def _ensure_account_exists(account_id: Optional[uuid.UUID], db: AsyncSession) -> None:
    if account_id and await db.get(Account, account_id) is None:
        raise HTTPException(status_code=404, detail="Account not found")


def _serialize(t: Transaction) -> dict:
    return {
        "id": str(t.id),
        "date": t.date.isoformat() if t.date else None,
        "posted_date": t.posted_date.isoformat() if t.posted_date else None,
        "amount": float(t.amount) if t.amount is not None else None,
        "direction": t.direction,
        "description": t.description,
        "description_clean": t.description_clean,
        "merchant": t.merchant,
        "account_id": str(t.account_id) if t.account_id else None,
        "business_trip_id": str(t.business_trip_id) if t.business_trip_id else None,
        "transaction_type": t.transaction_type,
        "category": t.category,
        "subcategory": t.subcategory,
        "need_want_savings": t.need_want_savings,
        "fixed_variable": t.fixed_variable,
        "personal_work_shared": t.personal_work_shared,
        "notes": t.notes,
        "tags": t.tags or [],
        "is_reimbursable": t.is_reimbursable,
        "reimbursement_source": t.reimbursement_source,
        "reimbursement_status": t.reimbursement_status,
        "expected_reimbursement": float(t.expected_reimbursement) if t.expected_reimbursement else None,
        "received_reimbursement": float(t.received_reimbursement) if t.received_reimbursement else 0,
        "net_personal_cost": float(t.net_personal_cost) if t.net_personal_cost is not None else None,
        "is_recurring": t.is_recurring,
        "frequency": t.frequency,
        "source": t.source,
        "ai_category": t.ai_category,
        "ai_subcategory": t.ai_subcategory,
        # H-13: Use `is not None` so confidence=0.0 is serialized as 0.0, not None.
        # A None would make the frontend treat zero-confidence AI results as "not run"
        # rather than "ran and has no idea", which breaks review-queue colour coding.
        "ai_confidence": float(t.ai_confidence) if t.ai_confidence is not None else None,
        "ai_flags": t.ai_flags or [],
        "ai_reviewed": t.ai_reviewed,
        "needs_review": t.needs_review,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


@router.get("")
async def list_transactions(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    date_from: Optional[_Date] = None,
    date_to: Optional[_Date] = None,
    account_id: Optional[uuid.UUID] = None,
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
    direction: Optional[str] = None,
    needs_review: Optional[bool] = None,
    is_reimbursable: Optional[bool] = None,
    reimbursement_status: Optional[str] = None,
    is_recurring: Optional[bool] = None,
    need_want_savings: Optional[str] = None,
    fixed_variable: Optional[str] = None,
    personal_work_shared: Optional[str] = None,
    transaction_type: Optional[str] = None,
    source: Optional[str] = None,
    min_amount: Optional[Decimal] = None,
    max_amount: Optional[Decimal] = None,
    search: Optional[str] = None,
    sort_by: str = "date",
    sort_dir: str = "desc",
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Transaction)
    filters = []
    if date_from:
        filters.append(Transaction.date >= date_from)
    if date_to:
        filters.append(Transaction.date <= date_to)
    if account_id:
        filters.append(Transaction.account_id == account_id)
    if category:
        filters.append(Transaction.category == category)
    if subcategory:
        filters.append(Transaction.subcategory == subcategory)
    if direction:
        filters.append(Transaction.direction == direction)
    if needs_review is not None:
        filters.append(Transaction.needs_review == needs_review)
    if is_reimbursable is not None:
        filters.append(Transaction.is_reimbursable == is_reimbursable)
    if reimbursement_status:
        filters.append(Transaction.reimbursement_status == reimbursement_status)
    if is_recurring is not None:
        filters.append(Transaction.is_recurring == is_recurring)
    if need_want_savings:
        filters.append(Transaction.need_want_savings == need_want_savings)
    if fixed_variable:
        filters.append(Transaction.fixed_variable == fixed_variable)
    if personal_work_shared:
        filters.append(Transaction.personal_work_shared == personal_work_shared)
    if transaction_type:
        filters.append(Transaction.transaction_type == transaction_type)
    if source:
        filters.append(Transaction.source == source)
    if min_amount is not None:
        filters.append(Transaction.amount >= min_amount)
    if max_amount is not None:
        filters.append(Transaction.amount <= max_amount)
    if search:
        filters.append(or_(
            Transaction.description.ilike(f"%{search}%"),
            Transaction.merchant.ilike(f"%{search}%"),
            Transaction.description_clean.ilike(f"%{search}%"),
        ))
    if filters:
        q = q.where(and_(*filters))

    _SORTABLE = {
        "date", "posted_date", "amount", "description", "merchant",
        "category", "subcategory", "direction", "is_recurring",
        "needs_review", "created_at", "updated_at",
    }
    sort_col = getattr(Transaction, sort_by if sort_by in _SORTABLE else "date")
    q = q.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar_one()

    q = q.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    transactions = result.scalars().all()

    return {
        "items": [_serialize(t) for t in transactions],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
    }


@router.get("/summary")
async def get_summary(
    date_from: Optional[_Date] = None,
    date_to: Optional[_Date] = None,
    account_id: Optional[uuid.UUID] = None,
    category: Optional[str] = None,
    direction: Optional[str] = None,
    is_reimbursable: Optional[bool] = None,
    need_want_savings: Optional[str] = None,
    fixed_variable: Optional[str] = None,
    personal_work_shared: Optional[str] = None,
    search: Optional[str] = None,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return recurring vs one-time spend totals for the given filters."""
    filters = []
    if date_from:
        filters.append(Transaction.date >= date_from)
    if date_to:
        filters.append(Transaction.date <= date_to)
    if account_id:
        filters.append(Transaction.account_id == account_id)
    if category:
        filters.append(Transaction.category == category)
    if direction:
        filters.append(Transaction.direction == direction)
    if is_reimbursable is not None:
        filters.append(Transaction.is_reimbursable == is_reimbursable)
    if need_want_savings:
        filters.append(Transaction.need_want_savings == need_want_savings)
    if fixed_variable:
        filters.append(Transaction.fixed_variable == fixed_variable)
    if personal_work_shared:
        filters.append(Transaction.personal_work_shared == personal_work_shared)
    if search:
        filters.append(or_(
            Transaction.description.ilike(f"%{search}%"),
            Transaction.merchant.ilike(f"%{search}%"),
            Transaction.description_clean.ilike(f"%{search}%"),
        ))

    where = and_(*filters) if filters else True

    result = await db.execute(
        select(
            Transaction.is_recurring,
            func.count().label("count"),
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        )
        .where(where)
        .group_by(Transaction.is_recurring)
    )
    rows = result.all()

    summary = {"recurring": {"count": 0, "total": 0.0}, "one_time": {"count": 0, "total": 0.0}}
    for row in rows:
        key = "recurring" if row.is_recurring else "one_time"
        summary[key] = {"count": row.count, "total": float(row.total)}
    return summary


@router.post("", status_code=201)
async def create_transaction(
    body: TransactionCreate,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from services.dedup import compute_duplicate_hash
    data = _normalize_transaction_payload(body.model_dump())
    await _ensure_account_exists(data.get("account_id"), db)
    if data.get("description"):
        data["duplicate_hash"] = compute_duplicate_hash(
            data["date"], data["amount"], data["description"], data.get("direction", "")
        )

    t = Transaction(**{k: v for k, v in data.items() if hasattr(Transaction, k)})
    db.add(t)
    try:
        await db.commit()
        await db.refresh(t)
    except Exception as e:
        await db.rollback()
        if "duplicate_hash" in str(e):
            raise HTTPException(status_code=409, detail="Duplicate transaction")
        raise
    return _serialize(t)


@router.get("/{transaction_id}")
async def get_transaction(
    transaction_id: uuid.UUID,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    t = await db.get(Transaction, transaction_id)
    if not t:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return _serialize(t)


@router.put("/{transaction_id}")
async def update_transaction(
    transaction_id: uuid.UUID,
    body: TransactionUpdate,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    t = await db.get(Transaction, transaction_id)
    if not t:
        raise HTTPException(status_code=404, detail="Transaction not found")

    from services.dedup import compute_duplicate_hash
    updates = _normalize_transaction_payload(body.model_dump(exclude_none=True))
    await _ensure_account_exists(updates.get("account_id"), db)
    for k, v in updates.items():
        if hasattr(t, k):
            setattr(t, k, v)
    if "reimbursement_status" in updates and "is_reimbursable" not in updates:
        if t.reimbursement_status == "not_reimbursable":
            t.is_reimbursable = False
            t.reimbursement_source = None
        elif t.reimbursement_status in _REIMBURSABLE_STATUSES:
            t.is_reimbursable = True
    if {"date", "amount", "description", "direction"}.intersection(updates) and t.description:
        t.duplicate_hash = compute_duplicate_hash(t.date, t.amount, t.description, t.direction or "")
    t.updated_at = datetime.utcnow()
    try:
        await db.commit()
        await db.refresh(t)
    except Exception as e:
        await db.rollback()
        if "duplicate_hash" in str(e):
            raise HTTPException(status_code=409, detail="Duplicate transaction")
        raise

    # If any categorization field was explicitly edited, teach the rules engine
    _LEARNING_FIELDS = {
        "category", "subcategory", "merchant", "need_want_savings",
        "fixed_variable", "personal_work_shared", "is_reimbursable",
        "is_recurring", "tags",
    }
    if t.description and _LEARNING_FIELDS.intersection(updates):
        try:
            from services.ai.rules_engine import RulesEngine
            await RulesEngine().record_correction(
                description=t.description,
                category=t.category or "",
                subcategory=t.subcategory or "",
                merchant_clean=t.merchant or "",
                db=db,
                need_want_savings=t.need_want_savings,
                fixed_variable=t.fixed_variable,
                personal_work_shared=t.personal_work_shared,
                is_reimbursable=bool(t.is_reimbursable),
                is_recurring=bool(t.is_recurring),
                tags=t.tags or [],
            )
            await db.commit()
        except Exception:
            # H-6: Roll back the pending learning write so the session is clean.
            # Without this, subsequent queries in the same session may see or
            # propagate the failed write, causing confusing integrity errors.
            await db.rollback()

    return _serialize(t)


@router.delete("/{transaction_id}", status_code=204)
async def delete_transaction(
    transaction_id: uuid.UUID,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    t = await db.get(Transaction, transaction_id)
    if not t:
        raise HTTPException(status_code=404, detail="Transaction not found")
    await db.delete(t)
    await db.commit()


@router.post("/bulk")
async def bulk_action(
    body: BulkActionRequest,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # H-7: Validate action early so callers get a clear 400 rather than a silent no-op.
    _VALID_ACTIONS = {"delete", "categorize", "mark_reimbursable", "tag", "update"}
    if body.action not in _VALID_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown bulk action {body.action!r}. Must be one of: {sorted(_VALID_ACTIONS)}",
        )

    result = await db.execute(
        select(Transaction).where(Transaction.id.in_(body.transaction_ids))
    )
    transactions = result.scalars().all()
    updated = 0

    for t in transactions:
        if body.action == "delete":
            await db.delete(t)
        elif body.action == "categorize":
            for field in ("category", "subcategory", "need_want_savings", "fixed_variable", "personal_work_shared"):
                if field in body.payload:
                    setattr(t, field, body.payload[field])
            t.updated_at = datetime.utcnow()
        elif body.action == "mark_reimbursable":
            t.is_reimbursable = body.payload.get("is_reimbursable", True)
            if t.is_reimbursable:
                t.reimbursement_status = "to_submit"
            else:
                t.reimbursement_status = "not_reimbursable"
                t.reimbursement_source = None
            if "reimbursement_source" in body.payload:
                t.reimbursement_source = body.payload["reimbursement_source"]
            if "reimbursement_status" in body.payload:
                status = body.payload["reimbursement_status"]
                if t.is_reimbursable and status in _REIMBURSABLE_STATUSES:
                    t.reimbursement_status = status
                elif not t.is_reimbursable and status == "not_reimbursable":
                    t.reimbursement_status = status
                else:
                    raise HTTPException(status_code=400, detail="Invalid reimbursement status for transaction state")
            t.updated_at = datetime.utcnow()
        elif body.action == "tag":
            existing = set(t.tags or [])
            existing.update(body.payload.get("tags", []))
            t.tags = list(existing)
            t.updated_at = datetime.utcnow()
        elif body.action == "update":
            allowed = {
                "category", "subcategory", "need_want_savings", "fixed_variable",
                "personal_work_shared", "is_reimbursable", "reimbursement_source",
                "reimbursement_status", "expected_reimbursement", "notes",
                "merchant", "needs_review", "ai_reviewed", "is_recurring",
                "business_trip_id",
            }
            for field, value in body.payload.items():
                if field in allowed and hasattr(t, field):
                    setattr(t, field, value)
            if "is_reimbursable" in body.payload:
                if t.is_reimbursable and t.reimbursement_status == "not_reimbursable":
                    t.reimbursement_status = "to_submit"
                elif not t.is_reimbursable:
                    t.reimbursement_status = "not_reimbursable"
                    t.reimbursement_source = None
            if "reimbursement_status" in body.payload:
                if t.reimbursement_status == "not_reimbursable":
                    t.is_reimbursable = False
                    t.reimbursement_source = None
                elif t.reimbursement_status in _REIMBURSABLE_STATUSES:
                    t.is_reimbursable = True
                else:
                    raise HTTPException(status_code=400, detail="Invalid reimbursement status")
            t.updated_at = datetime.utcnow()
        updated += 1

    await db.commit()
    if body.action == "delete":
        return {"deleted": updated, "action": body.action}
    return {"updated": updated, "action": body.action}
