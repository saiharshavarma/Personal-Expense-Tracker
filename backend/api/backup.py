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
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy import Date, DateTime, Numeric

from api.auth import get_current_user
from db.database import get_db
from db.models import (
    BackupLog, Transaction, Account, Budget, Subscription,
    Trip, UserPreferences, ReimbursementBatch, MerchantRule,
    ImportBatch, IncomeSchedule,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["backup"])

RESTORE_KEYS = {
    "accounts",
    "transactions",
    "import_batches",
    "budgets",
    "income_schedules",
    "subscriptions",
    "trips",
    "reimbursement_batches",
    "merchant_rules",
    "user_preferences",
}


def _serial(v):
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return v


_PREFS_REDACT = {
    "password_hash",
    "recovery_token_hash",
    "webauthn_credential",
    "anthropic_api_key",
    "openai_api_key",
}


def _redact_email_smtp(layout: Optional[dict]) -> Optional[dict]:
    """Return dashboard_layout with smtp_password stripped from the email_reports block."""
    if not layout:
        return layout
    result = dict(layout)
    if "email_reports" in result and isinstance(result["email_reports"], dict):
        er = dict(result["email_reports"])
        er.pop("smtp_password", None)
        result["email_reports"] = er
    return result


async def _build_snapshot(db: AsyncSession) -> dict:
    """Build a full JSON-serializable snapshot of all financial data."""
    def ser(obj):
        return {k: _serial(v) for k, v in obj.__dict__.items()
                if not k.startswith("_") and k not in {"net_personal_cost"}}

    def ser_prefs(obj):
        row = {k: _serial(v) for k, v in obj.__dict__.items()
               if not k.startswith("_") and k not in _PREFS_REDACT}
        if "dashboard_layout" in row:
            row["dashboard_layout"] = _redact_email_smtp(row["dashboard_layout"])
        return row

    txs      = (await db.execute(select(Transaction).order_by(Transaction.date.desc()))).scalars().all()
    acts     = (await db.execute(select(Account))).scalars().all()
    bgts     = (await db.execute(select(Budget))).scalars().all()
    subs     = (await db.execute(select(Subscription))).scalars().all()
    trips    = (await db.execute(select(Trip))).scalars().all()
    batches  = (await db.execute(select(ReimbursementBatch))).scalars().all()
    rules    = (await db.execute(select(MerchantRule))).scalars().all()
    imports  = (await db.execute(select(ImportBatch))).scalars().all()
    income   = (await db.execute(select(IncomeSchedule))).scalars().all()
    prefs    = (await db.execute(select(UserPreferences))).scalars().all()

    return {
        "backup_version": "1.1",
        "created_at": datetime.utcnow().isoformat(),
        "accounts":               [ser(a) for a in acts],
        "transactions":           [ser(t) for t in txs],
        "import_batches":         [ser(b) for b in imports],
        "budgets":                [ser(b) for b in bgts],
        "income_schedules":       [ser(s) for s in income],
        "subscriptions":          [ser(s) for s in subs],
        "trips":                  [ser(t) for t in trips],
        "reimbursement_batches":  [ser(b) for b in batches],
        "merchant_rules":         [ser(r) for r in rules],
        "user_preferences":       [ser_prefs(p) for p in prefs],
    }


def _coerce_value(column, value):
    if value is None:
        return None
    typ = column.type
    if isinstance(typ, PgUUID):
        return uuid.UUID(str(value))
    if isinstance(typ, Numeric):
        return Decimal(str(value))
    if isinstance(typ, DateTime):
        return datetime.fromisoformat(str(value))
    if isinstance(typ, Date):
        return date.fromisoformat(str(value))
    return value


def _row_for_model(model, row: dict) -> dict:
    columns = model.__table__.columns
    out = {}
    for column in columns:
        if column.computed is not None:
            continue
        if column.name in row:
            out[column.name] = _coerce_value(column, row[column.name])
    return out


def _load_snapshot(raw: bytes) -> dict:
    try:
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        snapshot = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid backup file. Upload a .json or .json.gz backup from this app.") from exc

    if not isinstance(snapshot, dict):
        raise HTTPException(status_code=400, detail="Invalid backup file: top-level JSON must be an object.")
    if snapshot.get("backup_version") != "1.1":
        raise HTTPException(status_code=400, detail=f"Unsupported backup version: {snapshot.get('backup_version')!r}.")
    missing = sorted(RESTORE_KEYS - set(snapshot))
    if missing:
        raise HTTPException(status_code=400, detail=f"Backup is missing required sections: {', '.join(missing)}.")
    for key in RESTORE_KEYS:
        if not isinstance(snapshot.get(key), list):
            raise HTTPException(status_code=400, detail=f"Backup section {key} must be a list.")
    return snapshot


async def _restore_snapshot(db: AsyncSession, snapshot: dict) -> dict:
    current_prefs = (await db.execute(select(UserPreferences).limit(1))).scalar_one_or_none()
    preserved_auth = {}
    if current_prefs:
        preserved_auth = {
            "password_hash": current_prefs.password_hash,
            "recovery_token_hash": current_prefs.recovery_token_hash,
            "webauthn_credential": current_prefs.webauthn_credential,
            "anthropic_api_key": current_prefs.anthropic_api_key,
            "openai_api_key": current_prefs.openai_api_key,
        }

    for model in [
        Transaction,
        Subscription,
        IncomeSchedule,
        ImportBatch,
        Budget,
        MerchantRule,
        ReimbursementBatch,
        Trip,
        Account,
        UserPreferences,
        BackupLog,
    ]:
        await db.execute(delete(model))

    counts = {}

    async def add_many(key: str, model, rows: list[dict]):
        objects = [model(**_row_for_model(model, row)) for row in rows]
        db.add_all(objects)
        counts[key] = len(objects)

    await add_many("accounts", Account, snapshot["accounts"])
    await add_many("trips", Trip, snapshot["trips"])
    await add_many("reimbursement_batches", ReimbursementBatch, snapshot["reimbursement_batches"])
    await add_many("import_batches", ImportBatch, snapshot["import_batches"])
    await add_many("subscriptions", Subscription, snapshot["subscriptions"])
    await add_many("budgets", Budget, snapshot["budgets"])
    await add_many("income_schedules", IncomeSchedule, snapshot["income_schedules"])
    await add_many("merchant_rules", MerchantRule, snapshot["merchant_rules"])

    pref_rows = snapshot["user_preferences"] or [{"id": 1, "onboarding_complete": True}]
    restored_prefs = []
    for row in pref_rows:
        merged = dict(row)
        for key, value in preserved_auth.items():
            if value is not None:
                merged[key] = value
        merged["onboarding_complete"] = True
        restored_prefs.append(merged)
    await add_many("user_preferences", UserPreferences, restored_prefs)

    await add_many("transactions", Transaction, snapshot["transactions"])

    log = BackupLog(
        backup_path="<browser-upload>",
        backup_size_bytes=None,
        triggered_by="restore",
        status="success",
    )
    db.add(log)
    await db.commit()
    return counts


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


# ── Restore ───────────────────────────────────────────────────────────────────

@router.post("/restore")
async def restore_backup(
    confirm_restore: bool = Query(False),
    file: UploadFile = File(...),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not confirm_restore:
        raise HTTPException(status_code=400, detail="Restore requires confirm_restore=true.")
    raw = await file.read()
    if len(raw) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Backup file is too large.")
    snapshot = _load_snapshot(raw)
    try:
        counts = await _restore_snapshot(db, snapshot)
        return {
            "status": "success",
            "backup_version": snapshot.get("backup_version"),
            "created_at": snapshot.get("created_at"),
            "restored": counts,
        }
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        logger.error("Restore failed: %s", exc, exc_info=True)
        log = BackupLog(triggered_by="restore", status="failed")
        db.add(log)
        await db.commit()
        raise HTTPException(status_code=500, detail="Restore failed. Check server logs for details.") from exc


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
