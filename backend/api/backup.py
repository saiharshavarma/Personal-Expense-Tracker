from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from api.auth import get_current_user
from db.database import get_db
from db.models import BackupLog, UserPreferences

router = APIRouter(tags=["backup"])


@router.post("/trigger")
async def trigger_backup(
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Phase 12: pg_dump → gzip → save to configured path."""
    raise HTTPException(status_code=501, detail="Backup system implemented in Phase 12")


@router.get("/status")
async def backup_status(_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
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


@router.get("/history")
async def backup_history(_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BackupLog).order_by(BackupLog.created_at.desc()).limit(30)
    )
    backups = result.scalars().all()
    return [
        {
            "id": str(b.id),
            "backup_path": b.backup_path,
            "size_bytes": b.backup_size_bytes,
            "triggered_by": b.triggered_by,
            "status": b.status,
            "created_at": b.created_at.isoformat(),
        }
        for b in backups
    ]
