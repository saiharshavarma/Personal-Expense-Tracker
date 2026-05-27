import csv
import io
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import List, Optional

from services.parsers.base_parser import BaseParser, ParsedTransaction


class ApplePayParser(BaseParser):
    institution_name = "Apple Pay"
    # CSV columns: Date, Time, Merchant, Amount, Payment Method
    # Exported from iOS Shortcuts or Screen Time data
    # All amounts are debits (payments/charges only)

    def parse(self, file_bytes: bytes, filename: str) -> List[ParsedTransaction]:
        return self._parse_csv(file_bytes)

    def _parse_csv(self, file_bytes: bytes) -> List[ParsedTransaction]:
        text = file_bytes.decode("utf-8", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        results = []
        for row in reader:
            try:
                keys = {k.strip().lower(): v for k, v in row.items()}
                date_str = keys.get("date") or ""
                merchant = (keys.get("merchant") or keys.get("description") or "").strip()
                amount_str = (keys.get("amount") or "0").replace("$", "").replace(",", "").strip()

                if not date_str or not merchant:
                    continue

                txn_date = self._parse_date(date_str)
                if not txn_date:
                    continue

                # Strip leading minus — Apple Pay exports are always charges
                amount_str = amount_str.lstrip("-")
                amount = Decimal(amount_str)

                payment_method = keys.get("payment method", "").strip()

                results.append(ParsedTransaction(
                    date=txn_date,
                    description=merchant,
                    amount=amount,
                    direction="debit",
                    raw_text=f"{date_str} | {merchant} | {amount_str} | {payment_method}",
                ))
            except (InvalidOperation, Exception):
                continue
        return results

    def _parse_date(self, s: str) -> Optional[object]:
        s = s.strip()
        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%B %d, %Y", "%b %d, %Y"):
            try:
                return datetime.strptime(s, fmt).date()
            except Exception:
                pass
        # Handle ISO datetime strings (e.g. "2024-01-15T14:32:00")
        if "T" in s:
            try:
                return datetime.fromisoformat(s.split("T")[0]).date()
            except Exception:
                pass
        return None

    @classmethod
    def detect(cls, file_bytes: bytes, filename: str) -> float:
        if not filename.lower().endswith(".csv"):
            return 0.0
        try:
            text = file_bytes[:2000].decode("utf-8", errors="ignore")
            reader = csv.DictReader(io.StringIO(text))
            headers = {h.strip().lower() for h in (reader.fieldnames or [])}
            # Strong signal: has "merchant" + "payment method"
            if {"date", "merchant", "amount", "payment method"}.issubset(headers):
                return 0.95
            # Weaker signal: has "merchant" but not typical bank columns
            if "merchant" in headers and "amount" in headers and "running bal" not in headers:
                return 0.6
        except Exception:
            pass
        return 0.0
