import logging
import uuid
from datetime import datetime, date as date_type
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
from services.ai.categorizer import categorize_transactions, confidence_to_color, YELLOW_THRESHOLD
from services.parsers.chase_parser import ChaseParser
from services.parsers.boa_parser import BankOfAmericaParser
from services.parsers.amex_parser import AmexParser
from services.parsers.apple_pay_parser import ApplePayParser
from services.parsers.icici_parser import ICICIParser
from services.parsers.hdfc_parser import HDFCParser
from services.parsers.generic_parser import GenericParser

logger = logging.getLogger(__name__)

router = APIRouter(tags=["import"])

ALL_PARSERS = [
    ChaseParser(),
    BankOfAmericaParser(),
    AmexParser(),
    ApplePayParser(),
    ICICIParser(),
    HDFCParser(),
    GenericParser(),  # always last — lowest confidence fallback
]

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
        cat_m = prefs.ai_model_categorization or "claude-haiku-4-5-20251001"
        ins_m = prefs.ai_model_insights or "claude-sonnet-4-5"
        if cat_m.startswith("gpt"): cat_m = "claude-haiku-4-5-20251001"
        if ins_m.startswith("gpt"): ins_m = "claude-sonnet-4-5"
        return AnthropicProvider(
            api_key=prefs.anthropic_api_key,
            categorization_model=cat_m,
            insights_model=ins_m,
        )
    elif provider_name == "openai" and prefs.openai_api_key:
        from services.ai.openai_provider import OpenAIProvider
        cat_m = prefs.ai_model_categorization or "gpt-4o-mini"
        ins_m = prefs.ai_model_insights or "gpt-4o"
        if cat_m.startswith("claude"): cat_m = "gpt-4o-mini"
        if ins_m.startswith("claude"): ins_m = "gpt-4o"
        return OpenAIProvider(
            api_key=prefs.openai_api_key,
            categorization_model=cat_m,
            insights_model=ins_m,
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
        logger.error("Parser error for %s: %s", filename, e)
        raise HTTPException(status_code=422, detail=f"Could not parse file: {e}")

    if not parsed_txns:
        raise HTTPException(status_code=422, detail="No transactions found in file.")

    account_uuid = uuid.UUID(account_id) if account_id else None

    # Dedup pass — single DB round-trip for the whole file
    new_txns = []
    seen_hashes: set = set()
    candidate_hashes: dict = {}  # hash → ParsedTransaction

    for txn in parsed_txns:
        h = compute_duplicate_hash(txn.date, txn.amount, txn.description, txn.direction)
        if h not in seen_hashes:
            seen_hashes.add(h)
            candidate_hashes[h] = txn

    # One query checks all hashes against the DB at once
    existing_result = await db.execute(
        select(Transaction.duplicate_hash).where(
            Transaction.duplicate_hash.in_(list(candidate_hashes.keys()))
        )
    )
    existing_hashes = {row[0] for row in existing_result.all()}

    # within-file dupes + DB dupes
    skipped = (len(parsed_txns) - len(candidate_hashes)) + sum(
        1 for h in candidate_hashes if h in existing_hashes
    )
    for h, txn in candidate_hashes.items():
        if h not in existing_hashes:
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
        import asyncio as _asyncio
        cat_results = await _asyncio.wait_for(
            categorize_transactions(txn_dicts, db, ai_provider),
            timeout=90.0,  # 90-second cap — prevents the import from hanging on LLM slowness
        )
    except _asyncio.TimeoutError:
        logger.warning("AI categorization timed out after 90s; all transactions marked for review")
    except Exception as e:
        logger.warning("AI categorization failed during import: %s", e)

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

            # Always apply extended fields so the review queue shows them pre-filled
            if r.fixed_variable:
                t.fixed_variable = r.fixed_variable
            if r.personal_work_shared:
                t.personal_work_shared = r.personal_work_shared
            if r.is_reimbursable:
                t.is_reimbursable = r.is_reimbursable
                t.reimbursement_status = "to_submit"
            if r.is_recurring:
                t.is_recurring = r.is_recurring
            if r.suggested_tags:
                t.tags = r.suggested_tags

            if r.confidence >= AUTO_THRESHOLD:
                # High confidence: auto-apply category fields, no review needed
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

        # Generic parser: always needs review regardless of AI confidence.
        # Only increment the count for items that weren't already counted above
        # (i.e. high-confidence items that were cleared — they now get forced back).
        if is_generic:
            t.needs_review = True
            if tid in cat_map and cat_map[tid].confidence >= AUTO_THRESHOLD:
                # Was auto-cleared above; force it into review and count it
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


# ── Two-phase import (parse-preview → commit) ─────────────────────────────────

class StagedTransaction(BaseModel):
    date: str
    description: str
    amount: float
    direction: str
    skip: bool = False
    # User-selected category (overrides AI suggestion when set)
    category: Optional[str] = None
    # AI fields passed through unchanged
    ai_category: Optional[str] = None
    ai_subcategory: Optional[str] = None
    ai_confidence: Optional[float] = None
    ai_flags: List[str] = []
    merchant: Optional[str] = None
    need_want_savings: Optional[str] = None
    fixed_variable: Optional[str] = None
    personal_work_shared: Optional[str] = None
    is_reimbursable: bool = False
    is_recurring: bool = False
    tags: List[str] = []


class CommitImportBody(BaseModel):
    filename: str
    institution: str
    account_id: Optional[str] = None
    transactions: List[StagedTransaction]


@router.post("/parse-preview")
async def parse_preview(
    file: UploadFile = File(...),
    account_id: Optional[str] = Form(None),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Phase 1 of the two-phase import workflow.
    Parses the uploaded file and runs AI categorisation but does NOT write
    anything to the database.  Returns all parsed transactions with AI
    suggestions so the client can let the user review/edit them before
    committing via POST /import/commit.
    """
    file_bytes = await file.read()
    if len(file_bytes) > 50_000_000:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB).")

    filename = file.filename
    if filename.lower().endswith(".pdf") and not file_bytes.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="File does not appear to be a valid PDF.")

    parser, _confidence = _detect_parser(file_bytes, filename)

    try:
        parsed_txns = parser.parse(file_bytes, filename)
    except Exception as e:
        logger.error("Parser error for %s: %s", filename, e)
        raise HTTPException(status_code=422, detail=f"Could not parse file: {e}")

    if not parsed_txns:
        raise HTTPException(status_code=422, detail="No transactions found in file.")

    # Assign temporary in-memory IDs so the AI categoriser can correlate results
    txn_dicts = [
        {
            "id": str(i),
            "date": t.date.isoformat(),
            "description": t.description,
            "amount": float(t.amount),
            "direction": t.direction,
        }
        for i, t in enumerate(parsed_txns)
    ]

    ai_provider = await _get_ai_provider(db)
    cat_results = []
    try:
        import asyncio as _asyncio
        cat_results = await _asyncio.wait_for(
            categorize_transactions(txn_dicts, db, ai_provider),
            timeout=90.0,
        )
    except _asyncio.TimeoutError:
        logger.warning("AI categorisation timed out during parse-preview")
    except Exception as e:
        logger.warning("AI categorisation failed during parse-preview: %s", e)

    cat_map = {r.transaction_id: r for r in cat_results}

    transactions = []
    for i, t in enumerate(parsed_txns):
        ai = cat_map.get(str(i))
        transactions.append({
            "temp_id": str(i),
            "date": t.date.isoformat(),
            "description": t.description,
            "amount": float(t.amount),
            "direction": t.direction,
            "ai_category": ai.category if ai else None,
            "ai_subcategory": ai.subcategory if ai else None,
            "ai_confidence": round(ai.confidence, 3) if ai else None,
            "ai_flags": ai.flags if ai else [],
            "merchant": ai.merchant_clean if ai else None,
            "need_want_savings": ai.need_want_savings if ai else None,
            "fixed_variable": ai.fixed_variable if ai else None,
            "personal_work_shared": ai.personal_work_shared if ai else None,
            "is_reimbursable": bool(ai.is_reimbursable) if ai else False,
            "is_recurring": bool(ai.is_recurring) if ai else False,
            "tags": ai.suggested_tags if ai else [],
            # Editable fields start equal to AI suggestion
            "category": ai.category if ai else None,
            "skip": False,
        })

    return {
        "institution": parser.institution_name,
        "filename": filename,
        "total": len(transactions),
        "transactions": transactions,
    }


@router.post("/commit")
async def commit_import(
    body: CommitImportBody,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Phase 2 of the two-phase import workflow.
    Saves the user-reviewed transactions to the database.
    Transactions with skip=True are silently excluded.
    All saved transactions are marked needs_review=False (user already reviewed).
    """
    include_txns = [t for t in body.transactions if not t.skip]
    if not include_txns:
        raise HTTPException(
            status_code=400,
            detail="No transactions to import — all were marked as skip.",
        )

    account_uuid = uuid.UUID(body.account_id) if body.account_id else None

    # Dedup pass — same logic as _ingest_file
    seen_hashes: set = set()
    candidate_hashes: dict = {}
    for txn in include_txns:
        try:
            txn_date = date_type.fromisoformat(txn.date)
            amount = Decimal(str(txn.amount))
        except Exception:
            continue
        h = compute_duplicate_hash(txn_date, amount, txn.description, txn.direction)
        if h not in seen_hashes:
            seen_hashes.add(h)
            candidate_hashes[h] = txn

    existing_result = await db.execute(
        select(Transaction.duplicate_hash).where(
            Transaction.duplicate_hash.in_(list(candidate_hashes.keys()))
        )
    )
    existing_hashes = {row[0] for row in existing_result.all()}

    within_file_dupes = len(include_txns) - len(candidate_hashes)
    db_dupes = sum(1 for h in candidate_hashes if h in existing_hashes)
    skipped = within_file_dupes + db_dupes
    new_txns = [(t, h) for h, t in candidate_hashes.items() if h not in existing_hashes]

    # Create ImportBatch with status="complete" — user already did the review
    source_type = "pdf" if body.filename.lower().endswith(".pdf") else "csv"
    batch = ImportBatch(
        filename=body.filename,
        source_type=source_type,
        institution=body.institution,
        account_id=account_uuid,
        total_transactions=len(include_txns),
        imported_transactions=0,
        skipped_duplicates=skipped,
        needs_review_count=0,
        status="complete",
        imported_at=datetime.utcnow(),
    )
    db.add(batch)
    await db.flush()

    for (txn, h) in new_txns:
        try:
            txn_date = date_type.fromisoformat(txn.date)
            amount = Decimal(str(txn.amount))
        except Exception:
            continue

        # User-chosen category wins; fall back to AI suggestion
        final_category = txn.category or txn.ai_category or None
        ai_conf = (
            Decimal(str(round(txn.ai_confidence, 3)))
            if txn.ai_confidence is not None
            else None
        )

        t = Transaction(
            date=txn_date,
            amount=amount,
            direction=txn.direction,
            description=txn.description,
            account_id=account_uuid,
            source="import",
            import_batch_id=batch.id,
            duplicate_hash=h,
            category=final_category,
            subcategory=txn.ai_subcategory or None,
            ai_category=txn.ai_category,
            ai_subcategory=txn.ai_subcategory,
            ai_confidence=ai_conf,
            ai_flags=txn.ai_flags or [],
            merchant=txn.merchant or None,
            need_want_savings=txn.need_want_savings or None,
            fixed_variable=txn.fixed_variable or None,
            personal_work_shared=txn.personal_work_shared or None,
            is_reimbursable=txn.is_reimbursable,
            is_recurring=txn.is_recurring,
            tags=txn.tags or [],
            reimbursement_status="to_submit" if txn.is_reimbursable else None,
            needs_review=False,
            ai_reviewed=True,
        )
        db.add(t)

    await db.flush()
    batch.imported_transactions = len(new_txns)
    await db.commit()
    await db.refresh(batch)

    return {
        "batch_id": str(batch.id),
        "institution": body.institution,
        "imported": batch.imported_transactions,
        "duplicates": skipped,
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
    if batch.status == "complete":
        raise HTTPException(status_code=409, detail="Batch has already been confirmed")

    if body.accept_all:
        # C-2: Use AUTO_THRESHOLD (0.90) not YELLOW_THRESHOLD (0.75) for bulk accept.
        # Yellow-band transactions (0.75–0.89) need human review; bulk-accepting them
        # would silently apply uncertain AI suggestions.
        txn_result = await db.execute(
            select(Transaction).where(
                Transaction.import_batch_id == batch_uuid,
                Transaction.needs_review == True,
                Transaction.ai_confidence >= Decimal(str(AUTO_THRESHOLD)),
            )
        )
        txns = txn_result.scalars().all()
        accepted = 0
        for t in txns:
            if t.ai_category:
                t.category = t.ai_category
            if t.ai_subcategory:
                t.subcategory = t.ai_subcategory
            t.needs_review = False
            t.ai_reviewed = True
            t.updated_at = datetime.utcnow()
            accepted += 1
        # H-10: Keep needs_review_count accurate
        if accepted > 0 and batch.needs_review_count > 0:
            batch.needs_review_count = max(0, batch.needs_review_count - accepted)

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
            # Return confidence as 0–1 float (same scale as GET /transactions)
            "ai_confidence": round(float(t.ai_confidence), 3) if t.ai_confidence is not None else None,
            "ai_category": t.ai_category,
            "ai_subcategory": t.ai_subcategory,
            "category": t.category,
            "subcategory": t.subcategory,
            "merchant": t.merchant,
            "ai_flags": t.ai_flags or [],
            "need_want_savings": t.need_want_savings,
            "fixed_variable": t.fixed_variable,
            "personal_work_shared": t.personal_work_shared,
            "is_reimbursable": t.is_reimbursable,
            "is_recurring": t.is_recurring,
            "tags": t.tags or [],
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
        if action == "edit":
            # Always apply all non-category fields regardless of whether category is provided
            if category:
                category_changed = t.category != category
                t.category = category
                if "subcategory" in body:
                    # Caller explicitly set (or cleared) the subcategory
                    t.subcategory = body.get("subcategory") or None
                elif category_changed:
                    # Category swapped but no subcategory supplied — clear any stale
                    # subcategory that belonged to the old category
                    t.subcategory = None
                else:
                    # Category unchanged and no subcategory in payload — keep existing
                    # value, or fall back to the AI suggestion if still blank
                    t.subcategory = t.subcategory or t.ai_subcategory or None
            if body.get("merchant_clean"):
                t.merchant = body["merchant_clean"]
            # H-14: Check key presence (not truthiness) so that an explicit empty string
            # or None value can be used to clear the field.
            if "need_want_savings" in body:
                t.need_want_savings = body["need_want_savings"] or None
            if body.get("fixed_variable") is not None:
                t.fixed_variable = body["fixed_variable"] or None
            if body.get("personal_work_shared") is not None:
                t.personal_work_shared = body["personal_work_shared"] or None
            if "is_reimbursable" in body:
                t.is_reimbursable = bool(body["is_reimbursable"])
                t.reimbursement_status = "to_submit" if t.is_reimbursable else "not_reimbursable"
            if "is_recurring" in body:
                t.is_recurring = bool(body["is_recurring"])
            if "tags" in body and isinstance(body["tags"], list):
                t.tags = body["tags"]

            # Learn: save correction as merchant rule only when a category was provided
            if category and t.description:
                from services.ai.rules_engine import RulesEngine
                await RulesEngine().record_correction(
                    description=t.description,
                    category=category,
                    subcategory=body.get("subcategory") or "",
                    merchant_clean=body.get("merchant_clean") or "",
                    db=db,
                    need_want_savings=body.get("need_want_savings"),
                    fixed_variable=body.get("fixed_variable") or None,
                    personal_work_shared=body.get("personal_work_shared") or None,
                    is_reimbursable=bool(body.get("is_reimbursable", False)),
                    is_recurring=bool(body.get("is_recurring", False)),
                    tags=body.get("tags") or [],
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
        # H-10: Decrement the batch's needs_review_count to keep it accurate
        if t.import_batch_id:
            batch_obj = await db.get(ImportBatch, t.import_batch_id)
            if batch_obj and batch_obj.needs_review_count > 0:
                batch_obj.needs_review_count = max(0, batch_obj.needs_review_count - 1)
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
    batch_decrements: dict[uuid.UUID, int] = {}
    for t in txns:
        # C-3: Skip zero-confidence transactions — they have no AI suggestion to apply.
        # They must be manually reviewed; silently writing "Other" would corrupt data.
        if t.ai_confidence is not None and float(t.ai_confidence) == 0.0:
            continue
        if t.ai_category:
            t.category = t.ai_category
        if t.ai_subcategory:
            t.subcategory = t.ai_subcategory
        t.needs_review = False
        t.ai_reviewed = True
        t.updated_at = datetime.utcnow()
        updated += 1
        # H-10: Track decrements per batch
        if t.import_batch_id:
            batch_decrements[t.import_batch_id] = batch_decrements.get(t.import_batch_id, 0) + 1

    # H-10: Apply batch needs_review_count decrements
    for bid, decrement in batch_decrements.items():
        batch_obj = await db.get(ImportBatch, bid)
        if batch_obj and batch_obj.needs_review_count > 0:
            batch_obj.needs_review_count = max(0, batch_obj.needs_review_count - decrement)

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
