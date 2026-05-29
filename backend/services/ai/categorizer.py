import logging
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from services.ai.provider import AICategorizationResult
from services.ai.rules_engine import RulesEngine

# L-5: Define logger BEFORE the import guard so the warning can actually fire
# if anthropic_provider is unavailable (previously logger was defined after the
# try/except block, causing NameError on import failure).
logger = logging.getLogger(__name__)

# Import the canonical taxonomy so we can validate AI-returned subcategories.
# Importing lazily inside the function would re-evaluate on every call.
try:
    from services.ai.anthropic_provider import CATEGORY_MAP as _CATEGORY_MAP
except ImportError:
    _CATEGORY_MAP = {}
    logger.warning(
        "Could not import CATEGORY_MAP from anthropic_provider; subcategory validation disabled"
    )

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
    # M-15: Low-confidence rule matches (YELLOW_THRESHOLD ≤ conf < AUTO_THRESHOLD).
    # These are not strong enough to accept automatically, so we still send the
    # transaction to AI.  But if AI also fails we use this as a fallback rather
    # than dropping the result entirely and classifying as zero-confidence.
    low_conf_rule_results: dict[str, dict] = {}

    # Load all rules once — avoids an N×1 SELECT when processing large batches
    preloaded_rules = await rules_engine.load_rules(db)

    # Pass 1: rules engine (all in-memory after the single load above)
    for txn in transactions:
        txn_id = str(txn.get("id", ""))
        desc = txn.get("description", "")
        match = rules_engine.match_cached(desc, preloaded_rules)
        if match and match["confidence"] >= AUTO_THRESHOLD:
            rule_results[txn_id] = match
        elif match and match["confidence"] >= YELLOW_THRESHOLD:
            # M-15: Partial rule match — keep as fallback, still try AI
            low_conf_rule_results[txn_id] = match
            needs_ai.append(txn)
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
            logger.warning("AI categorization failed: %s", e)
            # Fall through — unmatched transactions get needs_review=True with empty category

    # ── Taxonomy guard ─────────────────────────────────────────────────────────
    def _validated_subcategory(category: str, subcategory: str) -> str:
        """Return subcategory only if it belongs to the given category; else empty."""
        if not _CATEGORY_MAP:
            return subcategory  # taxonomy unavailable — pass through
        valid_subs = _CATEGORY_MAP.get(category, [])
        if subcategory and subcategory not in valid_subs:
            logger.debug(
                "AI returned invalid subcategory %r for category %r; clearing",
                subcategory, category,
            )
            return ""
        return subcategory

    # Assemble final results
    for txn in transactions:
        txn_id = str(txn.get("id", ""))

        if txn_id in rule_results:
            r = rule_results[txn_id]
            _cat = r.get("category", "Other")
            results.append(AICategorizationResult(
                transaction_id=txn_id,
                category=_cat,
                subcategory=_validated_subcategory(_cat, r.get("subcategory", "")),
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
            ai_r = ai_results[txn_id]
            # Validate that the AI's subcategory belongs to its chosen category.
            validated_sub = _validated_subcategory(ai_r.category, ai_r.subcategory or "")
            if validated_sub != (ai_r.subcategory or ""):
                # Return a corrected copy; dataclass replacement avoids mutating shared state
                from dataclasses import replace as _dc_replace
                ai_r = _dc_replace(ai_r, subcategory=validated_sub)
            results.append(ai_r)
        elif txn_id in low_conf_rule_results:
            # M-15: AI returned nothing — fall back to the partial rule match.
            # Confidence is in YELLOW range so it will be flagged for human review,
            # but at least a plausible category/subcategory is surfaced instead of
            # "Other" at zero confidence.
            r = low_conf_rule_results[txn_id]
            _cat = r.get("category", "Other")
            results.append(AICategorizationResult(
                transaction_id=txn_id,
                category=_cat,
                subcategory=_validated_subcategory(_cat, r.get("subcategory", "")),
                merchant_clean=r.get("merchant_clean", ""),
                need_want_savings=r.get("need_want_savings"),
                fixed_variable=r.get("fixed_variable"),
                personal_work_shared=r.get("personal_work_shared"),
                is_reimbursable=bool(r.get("is_reimbursable", False)),
                is_recurring=bool(r.get("is_recurring", False)),
                suggested_tags=r.get("tags") or [],
                confidence=r.get("confidence", YELLOW_THRESHOLD),
                flags=["low_confidence_rule"],
            ))
        else:
            # No rule match, no AI result → unclassified.
            # C-4: need_want_savings must be None (not "want") for zero-confidence
            # results so that NWS analytics don't skew "want" with uncategorised data.
            results.append(AICategorizationResult(
                transaction_id=txn_id,
                category="Other",
                subcategory="",
                merchant_clean="",
                need_want_savings=None,
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
