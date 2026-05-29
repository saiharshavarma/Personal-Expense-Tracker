"""
Backup service stubs.

The active backup implementation lives in api/backup.py (_build_snapshot).
It creates a full JSON snapshot (transactions, accounts, budgets, subscriptions,
trips, reimbursement batches, merchant rules) and streams it as a gzip download.

These pg_dump-based stubs are retained as placeholders but are not called by
any active code path.
"""


async def trigger_backup(db_url: str, backup_dir: str = "~/Finance/Backups", to_icloud: bool = True) -> dict:
    """Placeholder — pg_dump approach not implemented. See api/backup.py."""
    raise NotImplementedError(
        "pg_dump backup not implemented. Use the JSON snapshot endpoint at POST /api/backup/trigger."
    )


async def get_backup_status() -> dict:
    """Placeholder — see GET /api/backup/status."""
    raise NotImplementedError(
        "Use GET /api/backup/status for backup status."
    )
