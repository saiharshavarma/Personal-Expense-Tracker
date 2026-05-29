import re
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.database import get_db
from db.models import Account

router = APIRouter(tags=["accounts"])

_VALID_ACCOUNT_TYPES = {"checking", "savings", "credit", "investment", "loan", "cash", "other"}
_HEX_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?$")


class AccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    type: str = Field(..., max_length=50)
    institution: Optional[str] = Field(None, max_length=100)
    last_four: Optional[str] = Field(None, min_length=4, max_length=4)
    currency: str = Field("USD", min_length=3, max_length=3)
    color: Optional[str] = Field(None, max_length=7)
    icon: Optional[str] = Field(None, max_length=50)

    @field_validator("last_four")
    @classmethod
    def validate_last_four(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.isdigit():
            raise ValueError("last_four must be exactly 4 digits")
        return v

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not _HEX_COLOR_RE.match(v):
            raise ValueError("color must be a valid hex color (e.g. #abc or #aabbcc)")
        return v


class AccountUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    type: Optional[str] = Field(None, max_length=50)
    institution: Optional[str] = Field(None, max_length=100)
    last_four: Optional[str] = Field(None, min_length=4, max_length=4)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    color: Optional[str] = Field(None, max_length=7)
    icon: Optional[str] = Field(None, max_length=50)
    is_active: Optional[bool] = None

    @field_validator("last_four")
    @classmethod
    def validate_last_four(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.isdigit():
            raise ValueError("last_four must be exactly 4 digits")
        return v

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not _HEX_COLOR_RE.match(v):
            raise ValueError("color must be a valid hex color (e.g. #abc or #aabbcc)")
        return v


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
