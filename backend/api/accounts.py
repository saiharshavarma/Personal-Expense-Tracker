import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.database import get_db
from db.models import Account

router = APIRouter(tags=["accounts"])


class AccountCreate(BaseModel):
    name: str
    type: str
    institution: Optional[str] = None
    last_four: Optional[str] = None
    currency: str = "USD"
    color: Optional[str] = None
    icon: Optional[str] = None


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    institution: Optional[str] = None
    last_four: Optional[str] = None
    currency: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_active: Optional[bool] = None


def _serialize(acct: Account) -> dict:
    return {
        "id": str(acct.id),
        "name": acct.name,
        "type": acct.type,
        "institution": acct.institution,
        "last_four": acct.last_four,
        "currency": acct.currency,
        "is_active": acct.is_active,
        "color": acct.color,
        "icon": acct.icon,
        "created_at": acct.created_at.isoformat() if acct.created_at else None,
        "updated_at": acct.updated_at.isoformat() if acct.updated_at else None,
    }


@router.get("")
async def list_accounts(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Account).where(Account.is_active == True).order_by(Account.name))
    accounts = result.scalars().all()
    return [_serialize(a) for a in accounts]


@router.post("", status_code=201)
async def create_account(
    body: AccountCreate,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    acct = Account(**body.model_dump())
    db.add(acct)
    await db.commit()
    await db.refresh(acct)
    return _serialize(acct)


@router.get("/{account_id}")
async def get_account(
    account_id: uuid.UUID,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    acct = await db.get(Account, account_id)
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found")
    return _serialize(acct)


@router.put("/{account_id}")
async def update_account(
    account_id: uuid.UUID,
    body: AccountUpdate,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    acct = await db.get(Account, account_id)
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(acct, k, v)
    acct.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(acct)
    return _serialize(acct)


@router.delete("/{account_id}", status_code=204)
async def deactivate_account(
    account_id: uuid.UUID,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    acct = await db.get(Account, account_id)
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found")
    acct.is_active = False
    acct.updated_at = datetime.utcnow()
    await db.commit()
