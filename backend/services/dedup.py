import hashlib
from datetime import date
from decimal import Decimal


def compute_duplicate_hash(
    txn_date: date,
    amount: Decimal,
    description: str,
    direction: str = "",
) -> str:
    """SHA256(direction + date + amount + description) for deduplication.

    ``direction`` is included so that a same-day refund (credit) with the same
    amount and merchant as the original charge (debit) is NOT treated as a
    duplicate and silently dropped on import.
    """
    raw = f"{direction}|{txn_date.isoformat()}|{amount:.2f}|{description.strip().upper()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
