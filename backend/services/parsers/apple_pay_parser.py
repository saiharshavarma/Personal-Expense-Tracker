from typing import List
import csv
import io
from decimal import Decimal
from datetime import datetime

from services.parsers.base_parser import BaseParser, ParsedTransaction


class ApplePayParser(BaseParser):
    institution_name = "Apple Pay (iOS Shortcut)"
    # Columns: Date, Time, Merchant, Amount, Payment Method
    # All amounts are debits, amount always positive

    def parse(self, file_bytes: bytes, filename: str) -> List[ParsedTransaction]:
        raise NotImplementedError("Apple Pay CSV parser implemented in Phase 3")

    @classmethod
    def detect(cls, file_bytes: bytes, filename: str) -> float:
        try:
            text = file_bytes.decode("utf-8", errors="replace")
            reader = csv.DictReader(io.StringIO(text))
            headers = {h.strip().lower() for h in (reader.fieldnames or [])}
            if {"date", "merchant", "amount", "payment method"}.issubset(headers):
                return 0.95
        except Exception:
            pass
        return 0.0
