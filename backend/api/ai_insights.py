from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.database import get_db

router = APIRouter(tags=["ai"])


class QueryRequest(BaseModel):
    question: str
    month: int = None
    year: int = None


class CategorizeRequest(BaseModel):
    transaction_ids: list[str]


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
    raise HTTPException(status_code=501, detail="AI insights implemented in Phase 11. Enable opt-in in Settings first.")


@router.post("/categorize")
async def categorize_transactions(
    body: CategorizeRequest,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Phase 4: Categorize transactions using AI pipeline.
    Sanitized data only — no PII sent to external API.
    """
    raise HTTPException(status_code=501, detail="AI categorization implemented in Phase 4")
