import hashlib
from datetime import date
from decimal import Decimal


def compute_duplicate_hash(txn_date: date, amount: Decimal, description: str) -> str:
    """SHA256(date + amount + description) for deduplication."""
    raw = f"{txn_date.isoformat()}|{amount:.2f}|{description.strip().upper()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
