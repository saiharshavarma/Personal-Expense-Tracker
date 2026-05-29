"""
Email Reports API
-----------------
GET  /api/email-reports/settings    — current email settings (passwords masked)
PUT  /api/email-reports/settings    — update email settings
POST /api/email-reports/test        — send a test email right now
POST /api/email-reports/send-report — manually trigger monthly report
"""
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.database import get_db
from db.models import UserPreferences

logger = logging.getLogger(__name__)

router = APIRouter(tags=["email_reports"])


class EmailSettings(BaseModel):
    enabled: bool = False
    report_email: str = ""
    report_day: int = 1          # 1–28
    reminder_enabled: bool = False
    reminder_day: int = 28       # 1–28
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: Optional[str] = None   # None = leave unchanged
    use_tls: bool = True


def _safe_cfg(cfg: dict) -> dict:
    """Return the settings dict with password masked."""
    c = dict(cfg)
    if c.get("smtp_password"):
        c["smtp_password"] = "••••••••"
    return c


async def _get_prefs(db: AsyncSession):
    result = await db.execute(select(UserPreferences).where(UserPreferences.id == 1))
    prefs = result.scalar_one_or_none()
    if not prefs:
        raise HTTPException(status_code=404, detail="Preferences not found")
    return prefs


@router.get("/settings")
async def get_email_settings(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    prefs = await _get_prefs(db)
    layout = prefs.dashboard_layout or {}
    cfg = layout.get("email_reports", {
        "enabled": False,
        "report_email": "",
        "report_day": 1,
        "reminder_enabled": False,
        "reminder_day": 28,
        "smtp_host": "",
        "smtp_port": 587,
        "smtp_user": "",
        "smtp_password": "",
        "use_tls": True,
    })
    return _safe_cfg(cfg)


@router.put("/settings")
async def update_email_settings(
    body: EmailSettings,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    prefs = await _get_prefs(db)
    layout = dict(prefs.dashboard_layout or {})
    existing = layout.get("email_reports", {})

    updated = {
        **existing,
        "enabled": body.enabled,
        "report_email": body.report_email,
        "report_day": max(1, min(28, body.report_day)),
        "reminder_enabled": body.reminder_enabled,
        "reminder_day": max(1, min(28, body.reminder_day)),
        "smtp_host": body.smtp_host,
        "smtp_port": body.smtp_port,
        "smtp_user": body.smtp_user,
        "use_tls": body.use_tls,
    }
    # Only overwrite password if a new one is supplied
    if body.smtp_password and body.smtp_password != "••••••••":
        updated["smtp_password"] = body.smtp_password
    elif "smtp_password" not in updated:
        updated["smtp_password"] = ""

    layout["email_reports"] = updated
    prefs.dashboard_layout = layout
    await db.commit()
    return _safe_cfg(updated)


@router.post("/test")
async def send_test_email(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a quick test email to verify SMTP settings."""
    prefs = await _get_prefs(db)
    layout = prefs.dashboard_layout or {}
    cfg = layout.get("email_reports", {})

    if not cfg.get("smtp_host") or not cfg.get("smtp_user") or not cfg.get("smtp_password"):
        raise HTTPException(status_code=400, detail="SMTP settings are not configured")
    if not cfg.get("report_email"):
        raise HTTPException(status_code=400, detail="No recipient email configured")

    from services.email_reports import send_reminder
    import asyncio

    test_cfg = {**cfg, "report_email": cfg["report_email"]}
    today = date.today()
    try:
        await send_reminder(test_cfg, today.month, today.year)
    except Exception as exc:
        logger.error("Test email failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to send test email. Check SMTP settings and server logs.")

    return {"status": "sent", "to": cfg["report_email"]}


@router.post("/send-report")
async def manual_send_report(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually send this month's report right now."""
    prefs = await _get_prefs(db)
    layout = prefs.dashboard_layout or {}
    cfg = layout.get("email_reports", {})

    if not cfg.get("smtp_host") or not cfg.get("smtp_password"):
        raise HTTPException(status_code=400, detail="SMTP settings are not configured")

    from services.email_reports import send_monthly_report
    today = date.today()
    try:
        await send_monthly_report(db, cfg, today.month, today.year)
    except Exception as exc:
        logger.error("Manual report send failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to send report. Check SMTP settings and server logs.")

    return {"status": "sent", "to": cfg.get("report_email"), "month": today.month, "year": today.year}
