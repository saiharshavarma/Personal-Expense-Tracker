from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.database import get_db
from db.models import UserPreferences

router = APIRouter(tags=["preferences"])

_VALID_AI_PROVIDERS = {"anthropic", "openai"}


class PreferencesUpdate(BaseModel):
    theme: Optional[str] = None
    ai_provider: Optional[str] = None
    ai_model_categorization: Optional[str] = None
    ai_model_insights: Optional[str] = None
    ai_insights_opt_in: Optional[bool] = None
    anthropic_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    expense_tool_name: Optional[str] = None
    backup_path: Optional[str] = None
    backup_to_icloud: Optional[bool] = None
    dashboard_layout: Optional[dict] = None
    default_budget_rule: Optional[dict] = None
    currency: Optional[str] = None


def _prefs_to_dict(prefs: UserPreferences) -> dict:
    return {
        "theme": prefs.theme,
        "ai_provider": prefs.ai_provider,
        "ai_model_categorization": prefs.ai_model_categorization,
        "ai_model_insights": prefs.ai_model_insights,
        "ai_insights_opt_in": prefs.ai_insights_opt_in,
        # Mask API keys — never return full key
        "anthropic_api_key_set": bool(prefs.anthropic_api_key),
        "openai_api_key_set": bool(prefs.openai_api_key),
        "anthropic_api_key_preview": (
            f"...{prefs.anthropic_api_key[-4:]}" if prefs.anthropic_api_key and len(prefs.anthropic_api_key) >= 4 else None
        ),
        "openai_api_key_preview": (
            f"...{prefs.openai_api_key[-4:]}" if prefs.openai_api_key and len(prefs.openai_api_key) >= 4 else None
        ),
        "expense_tool_name": prefs.expense_tool_name,
        "backup_path": prefs.backup_path,
        "backup_to_icloud": prefs.backup_to_icloud,
        "dashboard_layout": prefs.dashboard_layout,
        "default_budget_rule": prefs.default_budget_rule,
        "onboarding_complete": prefs.onboarding_complete,
        "webauthn_enrolled": prefs.webauthn_credential is not None,
        "currency": prefs.currency or "USD",
    }


@router.get("")
async def get_preferences(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(UserPreferences).where(UserPreferences.id == 1))
    prefs = result.scalar_one_or_none()
    if not prefs:
        raise HTTPException(status_code=404, detail="Preferences not found")
    return _prefs_to_dict(prefs)


@router.put("")
async def update_preferences(
    body: PreferencesUpdate,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(UserPreferences).where(UserPreferences.id == 1))
    prefs = result.scalar_one_or_none()
    if not prefs:
        raise HTTPException(status_code=404, detail="Preferences not found")

    if body.ai_provider and body.ai_provider not in _VALID_AI_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid ai_provider '{body.ai_provider}'. Must be one of: {sorted(_VALID_AI_PROVIDERS)}",
        )

    update_data = body.model_dump(exclude_none=True)
    for field, value in update_data.items():
        if hasattr(prefs, field):
            setattr(prefs, field, value)

    prefs.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(prefs)
    return _prefs_to_dict(prefs)
