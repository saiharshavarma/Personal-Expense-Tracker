import asyncio
import gzip
import os
import shutil
from datetime import datetime
from pathlib import Path


async def trigger_backup(db_url: str, backup_dir: str = "~/Finance/Backups", to_icloud: bool = True) -> dict:
    """
    Phase 12: pg_dump → gzip → save to backup_dir (+ iCloud if available).
    Filename format: YYYY-MM-DD-HH.sql.gz
    Same day + no changes since last backup → skip.
    """
    raise NotImplementedError("Backup system implemented in Phase 12")


async def get_backup_status() -> dict:
    """Phase 12: Return last backup time and size."""
    raise NotImplementedError("Implemented in Phase 12")
