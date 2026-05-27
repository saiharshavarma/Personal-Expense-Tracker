import io
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import List, Optional

from services.parsers.base_parser import BaseParser, ParsedTransaction


class AmexParser(BaseParser):
    institution_name = "American Express"
    # PDF/CSV columns: Date, Description, Amount
    # Amount: positive = charge (debit), negative = credit/refund

    def parse(self, file_bytes: bytes, filename: str) -> List[ParsedTransaction]:
        if filename.lower().endswith(".csv"):
            return self._parse_csv(file_bytes)
        return self._parse_pdf(file_bytes)

    def _parse_csv(self, file_bytes: bytes) -> List[ParsedTransaction]:
        import csv, io as sio
        text = file_bytes.decode("utf-8", errors="replace")
        reader = csv.DictReader(sio.StringIO(text))
        results = []
        for row in reader:
            try:
                keys = {k.strip().lower(): v for k, v in row.items()}
                date_str = keys.get("date") or keys.get("transaction date") or ""
                desc = keys.get("description") or keys.get("merchant") or ""
                amount_str = (keys.get("amount") or "0").replace("$", "").replace(",", "").strip()
                txn_date = self._parse_date(date_str)
                if not txn_date or not desc:
                    continue
                amount = Decimal(amount_str)
                # Amex: positive = charge, negative = credit
                direction = "debit" if amount > 0 else "credit"
                results.append(ParsedTransaction(
                    date=txn_date, description=desc.strip(),
                    amount=abs(amount), direction=direction,
                ))
            except (InvalidOperation, Exception):
                continue
        return results

    def _parse_pdf(self, file_bytes: bytes) -> List[ParsedTransaction]:
        import pdfplumber
        results: List[ParsedTransaction] = []
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                for table in tables:
                    for row in table:
                        parsed = self._parse_table_row(row)
                        if parsed:
                            results.append(parsed)
                if not results:
                    text = page.extract_text() or ""
                    results.extend(self._parse_text_lines(text))
        return results

    def _parse_table_row(self, row: list) -> Optional[ParsedTransaction]:
        try:
            cells = [str(c or "").strip() for c in row]
            if len(cells) < 3:
                return None
            txn_date = self._parse_date(cells[0])
            if not txn_date:
                return None
            description = cells[1]
            amount_str = cells[-1].replace("$", "").replace(",", "").strip()
            if not amount_str or not description:
                return None
            amount = Decimal(amount_str)
            direction = "debit" if amount > 0 else "credit"
            return ParsedTransaction(
                date=txn_date, description=description,
                amount=abs(amount), direction=direction,
            )
        except Exception:
            return None

    def _parse_text_lines(self, text: str) -> List[ParsedTransaction]:
        results = []
        date_pat = re.compile(r"\b(\d{2}/\d{2}/\d{2,4})\b")
        amount_pat = re.compile(r"(-?\$?[\d,]+\.\d{2})\s*$")
        for line in text.splitlines():
            try:
                dates = date_pat.findall(line)
                m = amount_pat.search(line)
                if not dates or not m:
                    continue
                txn_date = self._parse_date(dates[0])
                amount_str = m.group(1).replace("$", "").replace(",", "")
                amount = Decimal(amount_str)
                direction = "debit" if amount > 0 else "credit"
                desc_start = line.find(dates[-1]) + len(dates[-1])
                description = line[desc_start:m.start()].strip()
                if not description or not txn_date:
                    continue
                results.append(ParsedTransaction(
                    date=txn_date, description=description,
                    amount=abs(amount), direction=direction,
                ))
            except Exception:
                continue
        return results

    def _parse_date(self, s: str) -> Optional[object]:
        for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d"):
            try:
                return datetime.strptime(s.strip(), fmt).date()
            except Exception:
                pass
        return None

    @classmethod
    def detect(cls, file_bytes: bytes, filename: str) -> float:
        if filename.lower().endswith(".csv"):
            try:
                text = file_bytes[:2000].decode("utf-8", errors="ignore").lower()
                if "american express" in text or "amex" in text:
                    return 0.8
            except Exception:
                pass
            return 0.0
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                text = " ".join(p.extract_text() or "" for p in pdf.pages[:2]).upper()
                if "AMERICAN EXPRESS" in text:
                    return 0.9
                if "AMEX" in text:
                    return 0.75
        except Exception:
            pass
        return 0.0
