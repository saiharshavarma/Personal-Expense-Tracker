import logging
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Body
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.database import get_db
from db.models import ImportBatch, Transaction, UserPreferences
from services.dedup import compute_duplicate_hash
from services.ai.categorizer import categorize_transactions, confidence_to_color
from services.parsers.chase_parser import ChaseParser
from services.parsers.boa_parser import BankOfAmericaParser
from services.parsers.amex_parser import AmexParser
from services.parsers.apple_pay_parser import ApplePayParser
from services.parsers.generic_parser import GenericParser

logger = logging.getLogger(__name__)

router = APIRouter(tags=["import"])

ALL_PARSERS = [ChaseParser(), BankOfAmericaParser(), AmexParser(), ApplePayParser(), GenericParser()]

# Confidence thresholds (stored as 0-1, returned as 0-100)
AUTO_THRESHOLD = 0.90


def _detect_parser(file_bytes: bytes, filename: str):
    best_parser = GenericParser()
    best_score = 0.0
    for p in ALL_PARSERS:
        score = p.detect(file_bytes, filename)
        if score > best_score:
            best_score = score
            best_parser = p
    return best_parser, best_score


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


async def _ingest_file(
    file_bytes: bytes,
    filename: str,
    account_id: Optional[str],
    db: AsyncSession,
) -> dict:
    """
    Full import pipeline (called by both upload-pdf and upload-csv):
    1. Parse → 2. Dedup → 3. Insert transactions → 4. AI categorize → 5. Create batch record
    Returns { batch_id, preview, total, institution, duplicate_count }
    """
    parser, _confidence = _detect_parser(file_bytes, filename)
    is_generic = isinstance(parser, GenericParser)

    try:
        parsed_txns = parser.parse(file_bytes, filename)
    except Exception as e:
        logger.error(f"Parser error for {filename}: {e}")
        raise HTTPException(status_code=422, detail=f"Could not parse file: {e}")

    if not parsed_txns:
        raise HTTPException(status_code=422, detail="No transactions found in file.")

    account_uuid = uuid.UUID(account_id) if account_id else None

    # Dedup pass
    new_txns = []
    skipped = 0
    seen_hashes: set = set()

    for txn in parsed_txns:
        h = compute_duplicate_hash(txn.date, txn.amount, txn.description)
        if h in seen_hashes:
            skipped += 1
            continue
        seen_hashes.add(h)
        existing = await db.execute(
            select(Transaction.id).where(Transaction.duplicate_hash == h)
        )
        if existing.scalar_one_or_none() is not None:
            skipped += 1
            continue
        new_txns.append((txn, h))

    total_parsed = len(parsed_txns)

    # Create ImportBatch (staged)
    batch = ImportBatch(
        filename=filename,
        source_type="pdf" if filename.lower().endswith(".pdf") else "csv",
        institution=parser.institution_name,
        account_id=account_uuid,
        total_transactions=total_parsed,
        imported_transactions=0,
        skipped_duplicates=skipped,
        needs_review_count=0,
        status="staged",
        imported_at=datetime.utcnow(),
    )
    db.add(batch)
    await db.flush()

    # Insert new transactions
    txn_objects: List[Transaction] = []
    for (parsed, h) in new_txns:
        t = Transaction(
            date=parsed.date,
            posted_date=parsed.posted_date,
            amount=parsed.amount,
            direction=parsed.direction,
            description=parsed.description,
            account_id=account_uuid,
            source="import",
            import_batch_id=batch.id,
            duplicate_hash=h,
            raw_text=parsed.raw_text or None,
            needs_review=True,  # Will be updated after AI
            ai_reviewed=False,
        )
        db.add(t)
        txn_objects.append(t)

    await db.flush()  # assign IDs

    # AI categorization
    ai_provider = await _get_ai_provider(db)
    txn_dicts = [
        {
            "id": str(t.id),
            "date": t.date.isoformat(),
            "description": t.description,
            "amount": float(t.amount),
            "direction": t.direction,
        }
        for t in txn_objects
    ]

    cat_results = []
    try:
        cat_results = await categorize_transactions(txn_dicts, db, ai_provider)
    except Exception as e:
        logger.warning(f"AI categorization failed during import: {e}")

    cat_map = {r.transaction_id: r for r in cat_results}
    needs_review_count = 0

    for t in txn_objects:
        tid = str(t.id)
        if tid in cat_map:
            r = cat_map[tid]
            t.ai_category = r.category
            t.ai_subcategory = r.subcategory
            t.ai_confidence = Decimal(str(round(r.confidence, 3)))
            t.ai_flags = r.flags or []
            t.merchant = r.merchant_clean or None

            if r.confidence >= AUTO_THRESHOLD:
                # High confidence: auto-apply, no review needed
                t.category = r.category
                t.subcategory = r.subcategory
                t.need_want_savings = r.need_want_savings
                t.needs_review = False
                t.ai_reviewed = True
            else:
                t.needs_review = True
                needs_review_count += 1
        else:
            t.needs_review = True
            needs_review_count += 1

        # Generic parser: always needs review
        if is_generic:
            t.needs_review = True
            if tid in cat_map:
                needs_review_count += 1 if not cat_map[tid].confidence >= AUTO_THRESHOLD else 0
            else:
                needs_review_count += 1

    batch.imported_transactions = len(txn_objects)
    batch.needs_review_count = needs_review_count
    # Keep status="staged" until user clicks Confirm

    await db.commit()
    await db.refresh(batch)

    # Build preview (first 10)
    preview = [
        {
            "date": txn_objects[i].date.isoformat(),
            "description": txn_objects[i].description,
            "amount": float(txn_objects[i].amount),
            "direction": txn_objects[i].direction,
        }
        for i in range(min(10, len(txn_objects)))
    ]

    return {
        "batch_id": str(batch.id),
        "institution": parser.institution_name,
        "preview": preview,
        "total": total_parsed,
        "new_count": len(txn_objects),
        "duplicate_count": skipped,
        "needs_review_count": needs_review_count,
    }


@router.post("/upload-pdf")
async def upload_pdf(
    file: UploadFile = File(...),
    account_id: Optional[str] = Form(None),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files accepted on this endpoint.")
    file_bytes = await file.read()
    if len(file_bytes) > 50_000_000:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB).")
    if not file_bytes.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="File does not appear to be a valid PDF.")
    return await _ingest_file(file_bytes, file.filename, account_id, db)


@router.post("/upload-csv")
async def upload_csv(
    file: UploadFile = File(...),
    account_id: Optional[str] = Form(None),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files accepted on this endpoint.")
    file_bytes = await file.read()
    if len(file_bytes) > 50_000_000:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB).")
    # Reject obvious binary files — CSV must be UTF-8 or Latin-1 text
    try:
        file_bytes.decode("utf-8")
    except UnicodeDecodeError:
        try:
            file_bytes.decode("latin-1")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="File does not appear to be a valid CSV (encoding error).")
    return await _ingest_file(file_bytes, file.filename, account_id, db)


class ConfirmImportBody(BaseModel):
    batch_id: str
    accept_all: bool = True


@router.post("/confirm")
async def confirm_import(
    body: ConfirmImportBody,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Mark a staged import batch as complete.
    If accept_all=True, accept all high-confidence AI categorizations.
    """
    try:
        batch_uuid = uuid.UUID(body.batch_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid batch_id")

    result = await db.execute(select(ImportBatch).where(ImportBatch.id == batch_uuid))
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Import batch not found")

    if body.accept_all:
        # Accept AI suggestions for all high-confidence transactions in this batch
        txn_result = await db.execute(
            select(Transaction).where(
                Transaction.import_batch_id == batch_uuid,
                Transaction.needs_review == True,
                Transaction.ai_confidence >= Decimal("0.750"),
            )
        )
        txns = txn_result.scalars().all()
        for t in txns:
            if t.ai_category:
                t.category = t.ai_category
            if t.ai_subcategory:
                t.subcategory = t.ai_subcategory
            t.needs_review = False
            t.ai_reviewed = True
            t.updated_at = datetime.utcnow()

    batch.status = "complete"
    await db.commit()

    return {
        "imported": batch.imported_transactions,
        "duplicates": batch.skipped_duplicates,
        "batch_id": str(batch.id),
    }


@router.get("/review-queue")
async def get_review_queue(
    batch_id: Optional[str] = None,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return flat list of transactions flagged needs_review (sorted by confidence asc)."""
    q = select(Transaction).where(Transaction.needs_review == True)
    if batch_id:
        try:
            q = q.where(Transaction.import_batch_id == uuid.UUID(batch_id))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid batch_id")

    q = q.order_by(Transaction.ai_confidence.asc().nullsfirst(), Transaction.date.desc())
    result = await db.execute(q)
    txns = result.scalars().all()

    return [
        {
            "id": str(t.id),
            "date": t.date.isoformat(),
            "description": t.description,
            "amount": float(t.amount),
            "direction": t.direction,
            # Return confidence as 0-100 for frontend
            "ai_confidence": round(float(t.ai_confidence) * 100) if t.ai_confidence is not None else None,
            "ai_category": t.ai_category,
            "ai_subcategory": t.ai_subcategory,
            "category": t.category,
            "subcategory": t.subcategory,
            "merchant": t.merchant,
            "ai_flags": t.ai_flags or [],
            "batch_id": str(t.import_batch_id) if t.import_batch_id else None,
        }
        for t in txns
    ]


@router.post("/review-queue/{transaction_id}")
async def review_queue_action(
    transaction_id: str,
    body: dict = Body(...),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Accept, edit, or reject a single transaction in the review queue."""
    try:
        txn_uuid = uuid.UUID(transaction_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid transaction_id")

    result = await db.execute(select(Transaction).where(Transaction.id == txn_uuid))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Transaction not found")

    action = body.get("action", "accept")
    category = body.get("category")

    if action == "reject":
        await db.delete(t)
        await db.commit()
        return {"status": "deleted", "id": transaction_id}

    if action in ("accept", "edit"):
        if action == "edit" and category:
            t.category = category
            t.subcategory = body.get("subcategory") or t.ai_subcategory
            if body.get("merchant_clean"):
                t.merchant = body["merchant_clean"]
            if body.get("need_want_savings"):
                t.need_want_savings = body["need_want_savings"]

            # Learn: save correction as merchant rule
            if t.description:
                from services.ai.rules_engine import RulesEngine
                await RulesEngine().record_correction(
                    description=t.description,
                    category=category,
                    subcategory=body.get("subcategory") or "",
                    merchant_clean=body.get("merchant_clean") or "",
                    db=db,
                    need_want_savings=body.get("need_want_savings"),
                )
        else:
            # Accept: apply AI suggestion
            if t.ai_category:
                t.category = t.ai_category
            if t.ai_subcategory:
                t.subcategory = t.ai_subcategory

        t.needs_review = False
        t.ai_reviewed = True
        t.updated_at = datetime.utcnow()
        await db.commit()
        return {"status": "updated", "id": transaction_id}

    raise HTTPException(status_code=400, detail=f"Unknown action: {action}")


@router.post("/bulk-accept")
async def bulk_accept(
    body: dict = Body(...),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Accept all review-queue transactions (optionally scoped to a batch)."""
    batch_id = body.get("batch_id")
    q = select(Transaction).where(Transaction.needs_review == True)
    if batch_id:
        try:
            q = q.where(Transaction.import_batch_id == uuid.UUID(batch_id))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid batch_id")

    result = await db.execute(q)
    txns = result.scalars().all()
    updated = 0
    for t in txns:
        if t.ai_category:
            t.category = t.ai_category
        if t.ai_subcategory:
            t.subcategory = t.ai_subcategory
        t.needs_review = False
        t.ai_reviewed = True
        t.updated_at = datetime.utcnow()
        updated += 1

    await db.commit()
    return {"accepted": updated}


@router.get("/history")
async def import_history(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ImportBatch).order_by(ImportBatch.imported_at.desc()).limit(100)
    )
    batches = result.scalars().all()
    return [
        {
            "id": str(b.id),
            "filename": b.filename,
            "source_type": b.source_type,
            "institution": b.institution,
            "total_transactions": b.total_transactions,
            "imported_transactions": b.imported_transactions,
            "skipped_duplicates": b.skipped_duplicates,
            "needs_review_count": b.needs_review_count,
            "status": b.status,
            "imported_at": b.imported_at.isoformat() if b.imported_at else None,
        }
        for b in batches
    ]
