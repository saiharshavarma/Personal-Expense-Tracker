from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.database import get_db
from db.models import Transaction
from services.dedup import compute_duplicate_hash

router = APIRouter(tags=["ios"])


class IOSTransactionRequest(BaseModel):
    merchant: str
    amount: Decimal
    date: Optional[date] = None
    payment_method: Optional[str] = None
    account_id: Optional[str] = None


@router.post("/transaction", status_code=201)
async def receive_ios_transaction(
    body: IOSTransactionRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Endpoint for iOS Shortcut to POST Apple Pay transactions directly.
    No auth required (local network only, behind Docker port).
    Accepts: merchant, amount, date, payment_method.
    """
    txn_date = body.date or date.today()
    dup_hash = compute_duplicate_hash(txn_date, body.amount, body.merchant)

    t = Transaction(
        date=txn_date,
        amount=body.amount,
        direction="debit",
        description=body.merchant,
        merchant=body.merchant,
        source="ios_shortcut",
        needs_review=True,
        duplicate_hash=dup_hash,
    )
    db.add(t)
    try:
        await db.commit()
        await db.refresh(t)
    except Exception as e:
        await db.rollback()
        if "duplicate_hash" in str(e):
            return {"status": "skipped", "reason": "duplicate"}
        raise

    return {
        "status": "created",
        "id": str(t.id),
        "merchant": t.merchant,
        "amount": float(t.amount),
        "date": t.date.isoformat(),
    }
