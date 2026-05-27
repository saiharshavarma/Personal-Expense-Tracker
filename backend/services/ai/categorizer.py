from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from services.ai.provider import AICategorizationResult
from services.ai.rules_engine import RulesEngine


SANITIZED_FIELDS = {"id", "date", "description", "amount", "direction"}


async def categorize_transactions(
    transactions: List[dict],
    db: AsyncSession,
    provider=None,
) -> List[AICategorizationResult]:
    """
    Phase 4: Full AI categorization pipeline.
    - Check rule engine first (local, free)
    - Send only sanitized fields to AI for unmatched transactions
    - Apply confidence routing (>=90 auto, 75-89 yellow, <75 red)
    """
    raise NotImplementedError("Implemented in Phase 4")
