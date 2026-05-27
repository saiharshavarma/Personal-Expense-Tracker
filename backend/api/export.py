from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import date

from api.auth import get_current_user
from db.database import get_db

router = APIRouter(tags=["export"])


@router.get("/csv")
async def export_csv(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    category: Optional[str] = None,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Phase 12: Export filtered transactions as CSV."""
    raise HTTPException(status_code=501, detail="CSV export implemented in Phase 12")


@router.get("/pdf")
async def export_pdf(
    report_type: str = Query("monthly_summary"),
    month: Optional[int] = None,
    year: Optional[int] = None,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Phase 12: Export formatted PDF report."""
    raise HTTPException(status_code=501, detail="PDF export implemented in Phase 12")


@router.get("/json")
async def export_json(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Phase 12: Export all data as JSON."""
    raise HTTPException(status_code=501, detail="JSON export implemented in Phase 12")


@router.get("/excel")
async def export_excel(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Phase 12: Export transactions and budgets as Excel workbook."""
    raise HTTPException(status_code=501, detail="Excel export implemented in Phase 12")
