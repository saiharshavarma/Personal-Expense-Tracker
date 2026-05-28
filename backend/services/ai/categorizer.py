import logging
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from services.ai.provider import AICategorizationResult
from services.ai.rules_engine import RulesEngine

logger = logging.getLogger(__name__)

# Confidence thresholds
AUTO_THRESHOLD = 0.90    # >= 0.90 → apply silently, no review needed
YELLOW_THRESHOLD = 0.75  # 0.75–0.89 → flag needs_review=True (yellow)
# < 0.75 → red flag, needs_review=True

# Maximum transactions per AI batch (avoid token limits)
BATCH_SIZE = 50

# Sanitized fields sent to AI — NEVER send account info, full card numbers, etc.
SANITIZED_FIELDS = {"id", "date", "description", "amount", "direction"}


def _sanitize(txn: dict) -> dict:
    return {k: v for k, v in txn.items() if k in SANITIZED_FIELDS}


async def categorize_transactions(
    transactions: List[dict],
    db: AsyncSession,
    provider=None,
) -> List[AICategorizationResult]:
    """
    Full AI categorization pipeline:
    1. Check rule engine for each transaction (local, fast, free)
    2. Batch unmatched transactions to AI provider
    3. Apply confidence routing:
       - >= 0.90 → auto-apply, ai_reviewed=True, needs_review=False
       - 0.75–0.89 → apply, needs_review=True (yellow)
       - < 0.75 → apply ai suggestion, needs_review=True (red flag)
    """
    rules_engine = RulesEngine()
    results: List[AICategorizationResult] = []
    needs_ai: List[dict] = []
    rule_results: dict[str, dict] = {}

    # Pass 1: rules engine
    for txn in transactions:
        txn_id = str(txn.get("id", ""))
        desc = txn.get("description", "")
        match = await rules_engine.match(desc, db)
        if match and match["confidence"] >= AUTO_THRESHOLD:
            rule_results[txn_id] = match
        else:
            needs_ai.append(txn)

    # Pass 2: AI provider for unmatched (skip if no provider or no API key)
    ai_results: dict[str, AICategorizationResult] = {}
    if provider and needs_ai:
        try:
            for i in range(0, len(needs_ai), BATCH_SIZE):
                batch = needs_ai[i:i + BATCH_SIZE]
                sanitized_batch = [_sanitize(t) for t in batch]
                batch_results = await provider.categorize(sanitized_batch)
                for r in batch_results:
                    ai_results[r.transaction_id] = r
        except Exception as e:
            logger.warning(f"AI categorization failed: {e}")
            # Fall through — unmatched transactions get needs_review=True with empty category

    # Assemble final results
    for txn in transactions:
        txn_id = str(txn.get("id", ""))

        if txn_id in rule_results:
            r = rule_results[txn_id]
            results.append(AICategorizationResult(
                transaction_id=txn_id,
                category=r.get("category", "Other"),
                subcategory=r.get("subcategory", ""),
                merchant_clean=r.get("merchant_clean", ""),
                need_want_savings=r.get("need_want_savings", "want"),
                fixed_variable=r.get("fixed_variable"),
                personal_work_shared=r.get("personal_work_shared"),
                is_reimbursable=bool(r.get("is_reimbursable", False)),
                is_recurring=bool(r.get("is_recurring", False)),
                suggested_tags=r.get("tags") or [],
                confidence=r.get("confidence", 1.0),
                flags=[],
            ))
        elif txn_id in ai_results:
            results.append(ai_results[txn_id])
        else:
            # No rule match, no AI result → unclassified
            results.append(AICategorizationResult(
                transaction_id=txn_id,
                category="Other",
                subcategory="",
                merchant_clean="",
                need_want_savings="want",
                confidence=0.0,
                flags=["needs_review"],
            ))

    return results


def confidence_to_review_flag(confidence: float) -> bool:
    """Return True if the transaction should be flagged for review."""
    return confidence < AUTO_THRESHOLD


def confidence_to_color(confidence: float) -> str:
    """Return 'green', 'yellow', or 'red' based on confidence level."""
    if confidence >= AUTO_THRESHOLD:
        return "green"
    if confidence >= YELLOW_THRESHOLD:
        return "yellow"
    return "red"
