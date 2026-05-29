"""
/api/app-insights  — App intelligence & data-quality metrics.

All data is read-only and derived from existing tables.  No new DB schema needed.
"""
from datetime import date, datetime
from typing import Optional, List
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_, or_, case as sa_case, distinct, text
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.database import get_db
from db.models import Transaction, ImportBatch, MerchantRule

router = APIRouter(tags=["app-insights"])


# ── helpers ──────────────────────────────────────────────────────────────────

def _safe_pct(num: float, denom: float) -> float:
    return round(num / denom * 100, 1) if denom else 0.0


# ── main endpoint ─────────────────────────────────────────────────────────────

@router.get("/summary")
async def app_insights_summary(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns a single JSON object with all app-intelligence metrics:
    • ai_performance   – acceptance rate, confidence buckets, top corrections
    • learning         – merchant rules stats
    • import_health    – batch counts, institution breakdown, dupe rates
    • data_quality     – categorization / merchant fill / review completion
    """

    # ── 1. AI PERFORMANCE ─────────────────────────────────────────────────────

    # Rows that were AI-processed (ai_category IS NOT NULL)
    ai_rows = (await db.execute(
        select(
            Transaction.category,
            Transaction.ai_category,
            Transaction.ai_confidence,
        ).where(Transaction.ai_category.isnot(None))
    )).all()

    total_ai = len(ai_rows)
    accepted  = sum(1 for r in ai_rows if r.category == r.ai_category)
    overridden = sum(1 for r in ai_rows if r.category and r.ai_category and r.category != r.ai_category)
    high_conf   = sum(1 for r in ai_rows if r.ai_confidence is not None and float(r.ai_confidence) >= 0.90)
    medium_conf = sum(1 for r in ai_rows if r.ai_confidence is not None and 0.75 <= float(r.ai_confidence) < 0.90)
    low_conf    = sum(1 for r in ai_rows if r.ai_confidence is not None and float(r.ai_confidence) < 0.75)
    confs = [float(r.ai_confidence) for r in ai_rows if r.ai_confidence is not None]
    avg_confidence = round(sum(confs) / len(confs) * 100, 1) if confs else None

    # Top corrections: (ai_category → user_category) pairs, sorted by count desc
    correction_tally: dict[tuple, int] = {}
    for r in ai_rows:
        if r.category and r.ai_category and r.category != r.ai_category:
            key = (r.ai_category, r.category)
            correction_tally[key] = correction_tally.get(key, 0) + 1
    top_corrections = [
        {"ai_said": ai, "you_used": u, "count": c}
        for (ai, u), c in sorted(correction_tally.items(), key=lambda x: -x[1])[:8]
    ]

    ai_performance = {
        "total_ai_categorized": total_ai,
        "accepted_count":       accepted,
        "overridden_count":     overridden,
        "acceptance_rate_pct":  _safe_pct(accepted, total_ai),
        "confidence_buckets": {
            "high":   high_conf,
            "medium": medium_conf,
            "low":    low_conf,
        },
        "avg_confidence_pct": avg_confidence,
        "top_corrections":    top_corrections,
    }

    # ── 2. LEARNING (MerchantRule table) ──────────────────────────────────────

    rule_rows = (await db.execute(
        select(
            MerchantRule.pattern,
            MerchantRule.category,
            MerchantRule.subcategory,
            MerchantRule.merchant_clean,
            MerchantRule.times_applied,
            MerchantRule.times_overridden,
            MerchantRule.confidence,
            MerchantRule.updated_at,
        ).order_by(MerchantRule.times_applied.desc())
    )).all()

    total_rules = len(rule_rows)
    # Rules that have actually fired (times_applied > 0)
    active_rules = sum(1 for r in rule_rows if (r.times_applied or 0) > 0)

    most_applied = [
        {
            "pattern":    r.pattern,
            "category":   r.category,
            "subcategory": r.subcategory,
            "merchant":   r.merchant_clean,
            "times_applied": r.times_applied or 0,
            "confidence_pct": round(float(r.confidence or 1) * 100),
        }
        for r in rule_rows[:10]
    ]

    # Recently updated rules (last learned corrections)
    recent_corrections = [
        {
            "pattern":   r.pattern,
            "category":  r.category,
            "subcategory": r.subcategory,
            "updated_at": r.updated_at.date().isoformat() if r.updated_at else None,
        }
        for r in sorted(rule_rows, key=lambda x: x.updated_at or datetime.min, reverse=True)[:8]
    ]

    learning = {
        "total_rules":          total_rules,
        "active_rules":         active_rules,
        "most_applied_rules":   most_applied,
        "recent_corrections":   recent_corrections,
    }

    # ── 3. IMPORT HEALTH ──────────────────────────────────────────────────────

    batch_rows = (await db.execute(
        select(
            ImportBatch.institution,
            ImportBatch.source_type,
            ImportBatch.total_transactions,
            ImportBatch.imported_transactions,
            ImportBatch.skipped_duplicates,
            ImportBatch.needs_review_count,
            ImportBatch.imported_at,
        ).order_by(ImportBatch.imported_at.desc())
    )).all()

    total_batches   = len(batch_rows)
    total_imported  = sum(r.imported_transactions or 0 for r in batch_rows)
    total_dupes     = sum(r.skipped_duplicates or 0 for r in batch_rows)
    total_parsed    = sum(r.total_transactions or 0 for r in batch_rows)
    avg_batch_size  = round(total_imported / total_batches, 1) if total_batches else 0

    # By institution
    inst_tally: dict[str, dict] = {}
    for r in batch_rows:
        key = r.institution or "Unknown"
        if key not in inst_tally:
            inst_tally[key] = {"institution": key, "batches": 0, "transactions": 0}
        inst_tally[key]["batches"]      += 1
        inst_tally[key]["transactions"] += r.imported_transactions or 0
    by_institution = sorted(inst_tally.values(), key=lambda x: -x["transactions"])

    # Source type split
    pdf_count = sum(1 for r in batch_rows if (r.source_type or "").lower() == "pdf")
    csv_count = sum(1 for r in batch_rows if (r.source_type or "").lower() == "csv")

    last_import = batch_rows[0].imported_at.date().isoformat() if batch_rows else None

    # Import volume by month (last 12 months)
    monthly_vol: dict[str, int] = {}
    for r in batch_rows:
        if r.imported_at:
            key = r.imported_at.strftime("%Y-%m")
            monthly_vol[key] = monthly_vol.get(key, 0) + (r.imported_transactions or 0)
    volume_trend = [{"month": k, "count": v} for k, v in sorted(monthly_vol.items())[-12:]]

    import_health = {
        "total_batches":       total_batches,
        "total_imported":      total_imported,
        "total_parsed":        total_parsed,
        "total_dupes_skipped": total_dupes,
        "dupe_rate_pct":       _safe_pct(total_dupes, total_parsed),
        "avg_batch_size":      avg_batch_size,
        "last_import_date":    last_import,
        "by_institution":      by_institution,
        "by_source_type":      {"pdf": pdf_count, "csv": csv_count},
        "volume_trend":        volume_trend,
    }

    # ── 4. DATA QUALITY ───────────────────────────────────────────────────────

    # Single pass over all transactions
    txn_rows = (await db.execute(
        select(
            Transaction.direction,
            Transaction.category,
            Transaction.subcategory,
            Transaction.merchant,
            Transaction.ai_category,
            Transaction.ai_confidence,
            Transaction.needs_review,
            Transaction.is_reimbursable,
            Transaction.is_recurring,
            Transaction.tags,
        )
    )).all()

    total_txns    = len(txn_rows)
    debits        = sum(1 for r in txn_rows if r.direction == "debit")
    categorized   = sum(1 for r in txn_rows if r.category)
    subcategorized = sum(1 for r in txn_rows if r.subcategory)
    merchant_filled = sum(1 for r in txn_rows if r.merchant)
    needs_review  = sum(1 for r in txn_rows if r.needs_review)
    reimbursable  = sum(1 for r in txn_rows if r.is_reimbursable)
    recurring     = sum(1 for r in txn_rows if r.is_recurring)
    tagged        = sum(1 for r in txn_rows if r.tags)

    data_quality = {
        "total_transactions":    total_txns,
        "total_debits":          debits,
        "categorized_count":     categorized,
        "categorized_pct":       _safe_pct(categorized, total_txns),
        "subcategorized_count":  subcategorized,
        "subcategorized_pct":    _safe_pct(subcategorized, total_txns),
        "merchant_filled_count": merchant_filled,
        "merchant_filled_pct":   _safe_pct(merchant_filled, total_txns),
        "uncategorized_count":   total_txns - categorized,
        "needs_review_count":    needs_review,
        "review_completion_pct": _safe_pct(total_txns - needs_review, total_txns),
        "reimbursable_tracked":  reimbursable,
        "recurring_tagged":      recurring,
        "tagged_count":          tagged,
        "tagged_pct":            _safe_pct(tagged, total_txns),
        # Overall completeness score (weighted average of key signals)
        "completeness_score": round(
            (
                _safe_pct(categorized, total_txns) * 0.40
                + _safe_pct(merchant_filled, total_txns) * 0.25
                + _safe_pct(subcategorized, total_txns) * 0.20
                + _safe_pct(total_txns - needs_review, total_txns) * 0.15
            ),
            1,
        ),
    }

    return {
        "generated_at":  datetime.utcnow().isoformat() + "Z",
        "ai_performance": ai_performance,
        "learning":       learning,
        "import_health":  import_health,
        "data_quality":   data_quality,
    }


@router.get("/corrections")
async def corrections_detail(
    limit: int = Query(50, le=200),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    All AI→user category corrections, most recent first.
    Useful for auditing what the AI keeps getting wrong.
    """
    rows = (await db.execute(
        select(
            Transaction.date,
            Transaction.description,
            Transaction.merchant,
            Transaction.ai_category,
            Transaction.ai_subcategory,
            Transaction.category,
            Transaction.subcategory,
            Transaction.ai_confidence,
        )
        .where(
            Transaction.ai_category.isnot(None),
            Transaction.category.isnot(None),
            Transaction.category != Transaction.ai_category,
        )
        .order_by(Transaction.date.desc())
        .limit(limit)
    )).all()

    return [
        {
            "date":          r.date.isoformat(),
            "description":   r.description,
            "merchant":      r.merchant,
            "ai_category":   r.ai_category,
            "ai_subcategory": r.ai_subcategory,
            "your_category": r.category,
            "your_subcategory": r.subcategory,
            "confidence_pct": round(float(r.ai_confidence) * 100) if r.ai_confidence else None,
        }
        for r in rows
    ]
