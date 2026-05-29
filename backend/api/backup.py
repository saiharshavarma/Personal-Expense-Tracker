"""
Phase 12: Backup endpoints.
Creates a full JSON snapshot of all financial data and records it in BackupLog.
(pg_dump requires the postgres client binary inside the container; the JSON
 snapshot approach is simpler and fully portable across platforms.)
"""
import io
import json
import gzip
import logging
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from api.auth import get_current_user
from db.database import get_db
from db.models import (
    BackupLog, Transaction, Account, Budget, Subscription,
    Trip, UserPreferences, ReimbursementBatch, MerchantRule,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["backup"])


def _serial(v):
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return v


async def _build_snapshot(db: AsyncSession) -> dict:
    """Build a full JSON-serializable snapshot of all financial data."""
    def ser(obj):
        return {k: _serial(v) for k, v in obj.__dict__.items()
                if not k.startswith("_")}

    txs      = (await db.execute(select(Transaction).order_by(Transaction.date.desc()))).scalars().all()
    acts     = (await db.execute(select(Account))).scalars().all()
    bgts     = (await db.execute(select(Budget))).scalars().all()
    subs     = (await db.execute(select(Subscription))).scalars().all()
    trips    = (await db.execute(select(Trip))).scalars().all()
    batches  = (await db.execute(select(ReimbursementBatch))).scalars().all()
    rules    = (await db.execute(select(MerchantRule))).scalars().all()

    return {
        "backup_version": "1.1",
        "created_at": datetime.utcnow().isoformat(),
        "accounts":               [ser(a) for a in acts],
        "transactions":           [ser(t) for t in txs],
        "budgets":                [ser(b) for b in bgts],
        "subscriptions":          [ser(s) for s in subs],
        "trips":                  [ser(t) for t in trips],
        "reimbursement_batches":  [ser(b) for b in batches],
        "merchant_rules":         [ser(r) for r in rules],
    }


# ── Trigger ───────────────────────────────────────────────────────────────────

@router.post("/trigger")
async def trigger_backup(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Build a JSON snapshot of all data, gzip it, and stream it as a download.
    The browser receives a .json.gz file — no server file-system writes needed.
    Also logs the backup in BackupLog.
    """
    try:
        snapshot = await _build_snapshot(db)
        json_bytes = json.dumps(snapshot, indent=2).encode("utf-8")
        compressed = gzip.compress(json_bytes)
        size = len(compressed)

        # Record it
        log = BackupLog(
            backup_path="<browser-download>",
            backup_size_bytes=size,
            triggered_by="manual",
            status="success",
        )
        db.add(log)
        await db.commit()

        fname = f"finance_backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json.gz"
        return StreamingResponse(
            iter([compressed]),
            media_type="application/gzip",
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
    except Exception as exc:
        logger.error("Backup failed: %s", exc, exc_info=True)
        log = BackupLog(triggered_by="manual", status="failed")
        db.add(log)
        await db.commit()
        raise HTTPException(status_code=500, detail="Backup failed. Check server logs for details.")


# ── Status ────────────────────────────────────────────────────────────────────

@router.get("/status")
async def backup_status(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BackupLog).order_by(BackupLog.created_at.desc()).limit(1)
    )
    last = result.scalar_one_or_none()
    if not last:
        return {"last_backup": None, "status": "never"}
    return {
        "last_backup": last.created_at.isoformat(),
        "status": last.status,
        "backup_path": last.backup_path,
        "size_bytes": last.backup_size_bytes,
    }


# ── History ───────────────────────────────────────────────────────────────────

@router.get("/history")
async def backup_history(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(BackupLog).order_by(BackupLog.created_at.desc()).limit(30)
    )
    backups = result.scalars().all()
    return [
        {
            "id":           str(b.id),
            "backup_path":  b.backup_path,
            "size_bytes":   b.backup_size_bytes,
            "triggered_by": b.triggered_by,
            "status":       b.status,
            "created_at":   b.created_at.isoformat(),
        }
        for b in backups
    ]
