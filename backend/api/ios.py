from datetime import date
from decimal import Decimal
from typing import Optional
import secrets
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.database import get_db
from db.models import Account, Transaction
from services.dedup import compute_duplicate_hash

router = APIRouter(tags=["ios"])


async def _verify_ios_key(x_ios_api_key: Optional[str] = Header(default=None)) -> None:
    """
    Validate the iOS API key from the X-iOS-API-Key header.
    IOS_API_KEY MUST be set in .env — the endpoint is disabled when it is absent
    to prevent unauthenticated transaction ingestion from the local network.
    """
    if not settings.ios_api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "iOS endpoint is disabled. "
                "Set IOS_API_KEY in your .env file and restart to enable it."
            ),
        )
    if not x_ios_api_key or not secrets.compare_digest(x_ios_api_key, settings.ios_api_key):
        raise HTTPException(status_code=401, detail="Invalid or missing iOS API key")


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
    _key: None = Depends(_verify_ios_key),
):
    """
    Endpoint for iOS Shortcut to POST Apple Pay transactions directly.
    Set IOS_API_KEY in .env and include X-iOS-API-Key header in your Shortcut
    for network-level protection. Without IOS_API_KEY the endpoint is disabled.
    """
    txn_date = body.date or date.today()
    amount = abs(body.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    account_uuid = None
    if body.account_id:
        try:
            account_uuid = uuid.UUID(body.account_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid account_id")
        if await db.get(Account, account_uuid) is None:
            raise HTTPException(status_code=404, detail="Account not found")

    dup_hash = compute_duplicate_hash(txn_date, amount, body.merchant, "debit")

    t = Transaction(
        date=txn_date,
        amount=amount,
        direction="debit",
        description=body.merchant,
        merchant=body.merchant,
        account_id=account_uuid,
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
