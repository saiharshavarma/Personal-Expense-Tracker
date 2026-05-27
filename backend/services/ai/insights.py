from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession


async def build_aggregated_context(db: AsyncSession, month: Optional[int] = None, year: Optional[int] = None) -> dict:
    """
    Phase 11: Build sanitized context for AI insights.
    NEVER includes raw transactions, merchant names, or account info.
    Only aggregated category totals, percentages, and MoM trends.
    """
    raise NotImplementedError("Implemented in Phase 11")


async def query_insights(question: str, db: AsyncSession, provider=None) -> dict:
    """Phase 11: Answer natural language question with aggregated context only."""
    raise NotImplementedError("Implemented in Phase 11")
