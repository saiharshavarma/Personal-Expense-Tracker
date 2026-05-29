import logging
from datetime import datetime, date as date_type
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.database import get_db
from db.models import Transaction, UserPreferences

router = APIRouter(tags=["ai"])
logger = logging.getLogger(__name__)


class QueryRequest(BaseModel):
    question: str = Field(..., max_length=1000)
    # Legacy: single month selector
    month: Optional[int] = None
    year: Optional[int] = None
    # Flexible date range (takes precedence over month/year when provided)
    date_from: Optional[str] = None   # YYYY-MM-DD
    date_to: Optional[str] = None     # YYYY-MM-DD
    # Exclude reimbursable transactions from the analysis context
    exclude_reimbursable: bool = False


class AdvisorRequest(BaseModel):
    month: Optional[int] = None
    year: Optional[int] = None
    date_from: Optional[str] = None   # YYYY-MM-DD
    date_to: Optional[str] = None     # YYYY-MM-DD
    # Exclude reimbursable transactions from the analysis context
    exclude_reimbursable: bool = False


def _parse_date(s: Optional[str]) -> Optional[date_type]:
    if not s:
        return None
    try:
        return date_type.fromisoformat(s)
    except ValueError:
        return None


class CategorizeRequest(BaseModel):
    transaction_ids: List[str] = Field(..., max_length=200)


async def _get_ai_provider(db: AsyncSession):
    result = await db.execute(select(UserPreferences).where(UserPreferences.id == 1))
    prefs = result.scalar_one_or_none()
    if not prefs:
        return None
    provider_name = prefs.ai_provider or "anthropic"
    if provider_name == "anthropic" and prefs.anthropic_api_key:
        from services.ai.anthropic_provider import AnthropicProvider
        cat_m = prefs.ai_model_categorization or "claude-haiku-4-5-20251001"
        ins_m = prefs.ai_model_insights or "claude-sonnet-4-5"
        # Guard: if user switched FROM openai, stored model may be a gpt-* name
        if cat_m.startswith("gpt"):
            cat_m = "claude-haiku-4-5-20251001"
        if ins_m.startswith("gpt"):
            ins_m = "claude-sonnet-4-5"
        return AnthropicProvider(
            api_key=prefs.anthropic_api_key,
            categorization_model=cat_m,
            insights_model=ins_m,
        )
    elif provider_name == "openai" and prefs.openai_api_key:
        from services.ai.openai_provider import OpenAIProvider
        cat_m = prefs.ai_model_categorization or "gpt-4o-mini"
        ins_m = prefs.ai_model_insights or "gpt-4o"
        # Guard: if user switched FROM anthropic, stored model may be a claude-* name
        if cat_m.startswith("claude"):
            cat_m = "gpt-4o-mini"
        if ins_m.startswith("claude"):
            ins_m = "gpt-4o"
        return OpenAIProvider(
            api_key=prefs.openai_api_key,
            categorization_model=cat_m,
            insights_model=ins_m,
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
        data = await _query(
            body.question, db, ai_provider,
            month=body.month, year=body.year,
            date_from=_parse_date(body.date_from),
            date_to=_parse_date(body.date_to),
            exclude_reimbursable=body.exclude_reimbursable,
        )
        return data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("AI query failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="AI query failed. Check your API key and server logs.")


@router.post("/advisor")
async def financial_advisor(
    body: AdvisorRequest,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Proactive AI financial strategy advisor.
    Analyzes the user's aggregated financial data and returns structured
    actionable advice: expense reductions, wealth building, habits, and
    a 4-week action plan. NEVER sends raw transactions or merchant names.
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

    from services.ai.insights import generate_financial_advice
    try:
        data = await generate_financial_advice(
            db, ai_provider,
            month=body.month, year=body.year,
            date_from=_parse_date(body.date_from),
            date_to=_parse_date(body.date_to),
            exclude_reimbursable=body.exclude_reimbursable,
        )
        return data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Financial advisor failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Financial advisor failed. Check your API key and server logs.")


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
        logger.error("AI categorization failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="AI categorization failed. Check your API key and server logs.")

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
                "confidence": round(r.confidence, 3),
                "needs_review": t.needs_review,
            })

    await db.commit()
    return {"categorized": len(updated), "results": updated}


# ── Mascot comment ─────────────────────────────────────────────────────────────

class MascotCommentRequest(BaseModel):
    page: str = Field(..., max_length=100)
    month: Optional[int] = None
    year: Optional[int] = None
    screen_text: Optional[str] = Field(None, max_length=500)  # visible text near the mascot on screen


@router.post("/mascot")
async def get_mascot_comment(
    body: MascotCommentRequest,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a short witty Mochi comment.
    If screen_text is provided, react to what's visible on screen.
    Otherwise fall back to aggregated DB stats.
    Uses the cheapest/fastest model. No PII reaches the AI.
    Requires ai_insights_opt_in, same as all other AI endpoints.
    """
    from datetime import date as _date
    # Respect the same opt-in gate as /query and /advisor
    prefs_row = await db.execute(select(UserPreferences).where(UserPreferences.id == 1))
    prefs_check = prefs_row.scalar_one_or_none()
    if not prefs_check or not prefs_check.ai_insights_opt_in:
        raise HTTPException(
            status_code=403,
            detail="AI insights not enabled. Enable it in Settings → AI Configuration."
        )

    ai_provider = await _get_ai_provider(db)
    if not ai_provider:
        raise HTTPException(status_code=400, detail="AI not configured")

    page_context = {
        "dashboard":     "the financial overview dashboard",
        "transactions":  "the transaction list page",
        "budget":        "the budget vs actual page",
        "analytics":     "the analytics and trend charts page",
        "settings":      "the settings page",
        "import":        "the bank statement import page",
        "subscriptions": "the recurring subscriptions page",
        "trips":         "the trip expense tracker",
        "reimbursements":"the reimbursements tracker",
    }.get(body.page.lower(), body.page)

    # Prefer screen context (what the mascot actually sees) over DB aggregate stats
    if body.screen_text and body.screen_text.strip():
        context_line = f'On screen near me I can see: "{body.screen_text.strip()}".'
        extra = "React to the specific thing you see — make it feel like you glanced at it."
    else:
        from services.ai.insights import build_aggregated_context
        today = _date.today()
        month = body.month or today.month
        year  = body.year  or today.year
        ctx   = await build_aggregated_context(db, month=month, year=year)

        income   = ctx.get("income", 0)
        expenses = ctx.get("expenses", 0)
        cats     = ctx.get("categories", [])
        top_cat  = cats[0]["category"] if cats else "nothing much"
        period   = ctx.get("period", f"{month}/{year}")
        context_line = (
            f"Financial snapshot: Period {period}, "
            f"income ${income:,.0f}, expenses ${expenses:,.0f}, "
            f"top category {top_cat}."
        )
        extra = "React to the numbers with a finance-flavored quip."

    question = (
        f"You are Mochi, a witty red panda mascot for a personal finance app. "
        f"You are on {page_context}. "
        f"{context_line} "
        f"{extra} "
        f"Write ONE funny, punny, or insightful comment (max 90 characters, "
        f"exactly 1 sentence, include exactly 1 emoji). "
        f"Be clever and playful. Do NOT introduce yourself. Do NOT say 'Mochi'."
    )

    try:
        ctx_obj = {}  # minimal context object for the provider call
        result = await ai_provider.query(question, ctx_obj)
        comment = result.answer.strip()
        if len(comment) > 160:
            comment = comment[:157] + "…"
        return {"comment": comment, "ok": True}
    except Exception as e:
        logger.error("Mascot AI failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Mascot AI failed. Check your API key and server logs.")
