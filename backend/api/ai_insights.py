from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.database import get_db
from db.models import Transaction, UserPreferences

router = APIRouter(tags=["ai"])


class QueryRequest(BaseModel):
    question: str
    month: Optional[int] = None
    year: Optional[int] = None


class CategorizeRequest(BaseModel):
    transaction_ids: List[str]


async def _get_ai_provider(db: AsyncSession):
    result = await db.execute(select(UserPreferences).where(UserPreferences.id == 1))
    prefs = result.scalar_one_or_none()
    if not prefs:
        return None
    provider_name = prefs.ai_provider or "anthropic"
    if provider_name == "anthropic" and prefs.anthropic_api_key:
        from services.ai.anthropic_provider import AnthropicProvider
        return AnthropicProvider(
            api_key=prefs.anthropic_api_key,
            categorization_model=prefs.ai_model_categorization or "claude-haiku-4-5-20251001",
            insights_model=prefs.ai_model_insights or "claude-sonnet-4-5",
        )
    elif provider_name == "openai" and prefs.openai_api_key:
        from services.ai.openai_provider import OpenAIProvider
        return OpenAIProvider(
            api_key=prefs.openai_api_key,
            categorization_model=prefs.ai_model_categorization or "gpt-4o-mini",
            insights_model=prefs.ai_model_insights or "gpt-4o",
        )
    return None


@router.post("/query")
async def query_insights(
    body: QueryRequest,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Phase 11: Natural language question answered using aggregated stats only.
    NEVER sends raw transactions or merchant names to AI.
    """
    result = await db.execute(select(UserPreferences).where(UserPreferences.id == 1))
    prefs = result.scalar_one_or_none()
    if not prefs or not prefs.ai_insights_opt_in:
        raise HTTPException(
            status_code=403,
            detail="AI insights not enabled. Enable it in Settings → AI Configuration."
        )

    ai_provider = await _get_ai_provider(db)
    if not ai_provider:
        raise HTTPException(
            status_code=400,
            detail="No AI provider configured. Add an Anthropic or OpenAI API key in Settings."
        )

    from services.ai.insights import query_insights as _query
    try:
        data = await _query(body.question, db, ai_provider, month=body.month, year=body.year)
        return data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI query failed: {e}")


@router.post("/categorize")
async def categorize_transactions_endpoint(
    body: CategorizeRequest,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Re-categorize specific transactions using the AI pipeline.
    Sanitized data only — no PII sent to external API.
    """
    from services.ai.categorizer import categorize_transactions
    from decimal import Decimal

    if not body.transaction_ids:
        return {"categorized": 0, "results": []}

    import uuid
    uuids = []
    for tid in body.transaction_ids:
        try:
            uuids.append(uuid.UUID(tid))
        except ValueError:
            pass

    result = await db.execute(
        select(Transaction).where(Transaction.id.in_(uuids))
    )
    txns = result.scalars().all()

    if not txns:
        return {"categorized": 0, "results": []}

    txn_dicts = [
        {
            "id": str(t.id),
            "date": t.date.isoformat(),
            "description": t.description,
            "amount": float(t.amount),
            "direction": t.direction,
        }
        for t in txns
    ]

    ai_provider = await _get_ai_provider(db)
    try:
        cat_results = await categorize_transactions(txn_dicts, db, ai_provider)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI categorization failed: {e}")

    cat_map = {r.transaction_id: r for r in cat_results}
    updated = []

    for t in txns:
        tid = str(t.id)
        if tid in cat_map:
            r = cat_map[tid]
            t.ai_category = r.category
            t.ai_subcategory = r.subcategory
            t.ai_confidence = Decimal(str(round(r.confidence, 3)))
            t.ai_flags = r.flags or []
            if r.merchant_clean:
                t.merchant = r.merchant_clean
            if r.confidence >= 0.90:
                t.category = r.category
                t.subcategory = r.subcategory
                t.need_want_savings = r.need_want_savings
                t.needs_review = False
                t.ai_reviewed = True
            else:
                t.needs_review = True
            t.updated_at = datetime.utcnow()
            updated.append({
                "id": tid,
                "category": r.category,
                "subcategory": r.subcategory,
                "confidence": round(r.confidence * 100),
                "needs_review": t.needs_review,
            })

    await db.commit()
    return {"categorized": len(updated), "results": updated}
