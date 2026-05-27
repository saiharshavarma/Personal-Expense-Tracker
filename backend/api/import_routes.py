from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import uuid

from api.auth import get_current_user
from db.database import get_db

router = APIRouter(tags=["import"])


@router.post("/upload-pdf")
async def upload_pdf(
    file: UploadFile = File(...),
    account_id: Optional[str] = Form(None),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Phase 3: Parse bank PDF, detect institution, dedup, AI categorize."""
    raise HTTPException(status_code=501, detail="PDF import implemented in Phase 3")


@router.post("/upload-csv")
async def upload_csv(
    file: UploadFile = File(...),
    account_id: Optional[str] = Form(None),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Phase 3: Parse Apple Pay CSV, dedup, AI categorize."""
    raise HTTPException(status_code=501, detail="CSV import implemented in Phase 3")


@router.get("/review-queue")
async def get_review_queue(
    batch_id: Optional[str] = None,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Phase 3: Return transactions needing review after import."""
    raise HTTPException(status_code=501, detail="Review queue implemented in Phase 3")


@router.post("/confirm")
async def confirm_import(
    body: dict,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Phase 3: Accept/reject AI categorizations and finalize import."""
    raise HTTPException(status_code=501, detail="Import confirmation implemented in Phase 3")


@router.get("/history")
async def import_history(_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Phase 3: List past import batches."""
    from sqlalchemy import select
    from db.models import ImportBatch
    result = await db.execute(select(ImportBatch).order_by(ImportBatch.imported_at.desc()).limit(50))
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
            "status": b.status,
            "imported_at": b.imported_at.isoformat() if b.imported_at else None,
        }
        for b in batches
    ]
