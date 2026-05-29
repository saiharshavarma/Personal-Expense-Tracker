import csv
import io
from typing import List

from services.parsers.base_parser import BaseParser, ParsedTransaction, parse_date, parse_amount


class ApplePayParser(BaseParser):
    institution_name = "Apple Pay"
    # CSV columns: Date, Time, Merchant, Amount, Payment Method
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
                amount_str = keys.get("amount") or "0"

                if not date_str or not merchant:
                    continue

                txn_date = parse_date(date_str)
                if not txn_date:
                    continue

                amount = parse_amount(amount_str)
                if amount is None:
                    continue

                # Apple Pay exports are always charges — strip any negative sign
                payment_method = keys.get("payment method", "").strip()
                results.append(ParsedTransaction(
                    date=txn_date,
                    description=merchant,
                    amount=abs(amount),
                    direction="debit",
                    raw_text=f"{date_str} | {merchant} | {amount_str} | {payment_method}",
                ))
            except Exception:
                continue
        return results

    @classmethod
    def detect(cls, file_bytes: bytes, filename: str) -> float:
        if not filename.lower().endswith(".csv"):
            return 0.0
        try:
            text = file_bytes[:2000].decode("utf-8", errors="ignore")
            reader = csv.DictReader(io.StringIO(text))
            headers = {h.strip().lower() for h in (reader.fieldnames or [])}
            if {"date", "merchant", "amount", "payment method"}.issubset(headers):
                return 0.95
            if "merchant" in headers and "amount" in headers and "running bal" not in headers:
                return 0.6
        except Exception:
            pass
        return 0.0
