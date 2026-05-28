import uuid
from typing import Optional, List
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.database import get_db
from db.models import MerchantRule

router = APIRouter(tags=["rules"])


class RuleBody(BaseModel):
    pattern: str
    match_type: Optional[str] = None
    merchant_clean: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    need_want_savings: Optional[str] = None
    fixed_variable: Optional[str] = None
    is_reimbursable: Optional[bool] = None
    personal_work_shared: Optional[str] = None
    is_recurring: Optional[bool] = None
    tags: Optional[List[str]] = None


def _serialize(rule: MerchantRule) -> dict:
    return {
        "id": str(rule.id),
        "pattern": rule.pattern,
        "match_type": rule.match_type,
        "merchant_clean": rule.merchant_clean,
        "category": rule.category,
        "subcategory": rule.subcategory,
        "need_want_savings": rule.need_want_savings,
        "fixed_variable": rule.fixed_variable,
        "is_reimbursable": rule.is_reimbursable,
        "personal_work_shared": rule.personal_work_shared,
        "is_recurring": rule.is_recurring,
        "tags": rule.tags or [],
        "confidence": float(rule.confidence) if rule.confidence is not None else None,
        "times_applied": rule.times_applied,
        "times_overridden": rule.times_overridden,
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
    }


@router.get("")
async def list_rules(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MerchantRule).order_by(MerchantRule.times_applied.desc())
    )
    rules = result.scalars().all()
    return [_serialize(r) for r in rules]


@router.post("", status_code=201)
async def create_rule(
    body: RuleBody,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rule = MerchantRule(
        pattern=body.pattern,
        match_type=body.match_type,
        merchant_clean=body.merchant_clean,
        category=body.category,
        subcategory=body.subcategory,
        need_want_savings=body.need_want_savings,
        fixed_variable=body.fixed_variable,
        is_reimbursable=body.is_reimbursable,
        personal_work_shared=body.personal_work_shared,
        is_recurring=body.is_recurring,
        tags=body.tags or [],
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return _serialize(rule)


@router.put("/{rule_id}")
async def update_rule(
    rule_id: uuid.UUID,
    body: RuleBody,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MerchantRule).where(MerchantRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")

    rule.pattern = body.pattern
    rule.match_type = body.match_type
    rule.merchant_clean = body.merchant_clean
    rule.category = body.category
    rule.subcategory = body.subcategory
    rule.need_want_savings = body.need_want_savings
    rule.fixed_variable = body.fixed_variable
    rule.is_reimbursable = body.is_reimbursable
    rule.personal_work_shared = body.personal_work_shared
    rule.is_recurring = body.is_recurring
    rule.tags = body.tags or []

    await db.commit()
    await db.refresh(rule)
    return _serialize(rule)


@router.delete("/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: uuid.UUID,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MerchantRule).where(MerchantRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")

    await db.delete(rule)
    await db.commit()
