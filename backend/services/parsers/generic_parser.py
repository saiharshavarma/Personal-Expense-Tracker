import csv
import io
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import List, Optional, Dict

from services.parsers.base_parser import BaseParser, ParsedTransaction


# Common date column names
DATE_COLS = {"date", "transaction date", "txn date", "posted date", "posting date", "trans date"}
# Common description column names
DESC_COLS = {"description", "merchant", "payee", "details", "memo", "narrative", "transaction description"}
# Common amount column names
AMOUNT_COLS = {"amount", "transaction amount", "debit", "credit", "charge", "payment"}

DATE_FORMATS = [
    "%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%d/%m/%Y",
    "%d-%m-%Y", "%Y/%m/%d", "%B %d, %Y", "%b %d, %Y",
    "%d %B %Y", "%d %b %Y",
]


def _parse_date(s: str) -> Optional[object]:
    s = s.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except Exception:
            pass
    if "T" in s:
        try:
            return datetime.fromisoformat(s.split("T")[0]).date()
        except Exception:
            pass
    return None


def _parse_amount(s: str) -> Optional[Decimal]:
    s = s.replace("$", "").replace(",", "").strip()
    try:
        return Decimal(s)
    except (InvalidOperation, Exception):
        return None


def _detect_columns(fieldnames: List[str]) -> Dict[str, str]:
    """Map raw column names to semantic roles: date, description, amount, debit, credit."""
    mapping: Dict[str, str] = {}
    for raw in fieldnames:
        norm = raw.strip().lower()
        if norm in DATE_COLS and "date" not in mapping:
            mapping["date"] = raw
        elif norm in DESC_COLS and "description" not in mapping:
            mapping["description"] = raw
        elif norm == "debit" and "debit" not in mapping:
            mapping["debit"] = raw
        elif norm == "credit" and "credit" not in mapping:
            mapping["credit"] = raw
        elif norm in AMOUNT_COLS and "amount" not in mapping and norm not in {"debit", "credit"}:
            mapping["amount"] = raw
    return mapping


class GenericParser(BaseParser):
    institution_name = "Unknown Institution"

    def parse(self, file_bytes: bytes, filename: str) -> List[ParsedTransaction]:
        if filename.lower().endswith(".pdf"):
            return self._parse_pdf(file_bytes)
        return self._parse_csv(file_bytes)

    def _parse_csv(self, file_bytes: bytes) -> List[ParsedTransaction]:
        text = file_bytes.decode("utf-8", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            return []

        cols = _detect_columns(list(reader.fieldnames))
        if "date" not in cols or "description" not in cols:
            return []

        results = []
        for row in reader:
            try:
                keys = {k: v for k, v in row.items()}
                date_str = keys.get(cols["date"], "").strip()
                desc = keys.get(cols["description"], "").strip()
                if not date_str or not desc:
                    continue

                txn_date = _parse_date(date_str)
                if not txn_date:
                    continue

                # Prefer split debit/credit columns over combined amount
                if "debit" in cols and "credit" in cols:
                    debit_str = keys.get(cols["debit"], "").strip()
                    credit_str = keys.get(cols["credit"], "").strip()
                    if debit_str:
                        amount = _parse_amount(debit_str)
                        direction = "debit"
                    elif credit_str:
                        amount = _parse_amount(credit_str)
                        direction = "credit"
                    else:
                        continue
                elif "amount" in cols:
                    raw_amount = _parse_amount(keys.get(cols["amount"], "0"))
                    if raw_amount is None:
                        continue
                    amount = abs(raw_amount)
                    direction = "debit" if raw_amount >= 0 else "credit"
                else:
                    continue

                if amount is None or amount == 0:
                    continue

                results.append(ParsedTransaction(
                    date=txn_date,
                    description=desc,
                    amount=abs(amount),
                    direction=direction,
                    raw_text=str(row),
                ))
            except Exception:
                continue

        # Mark all results as needs_review — add a flag via raw_text sentinel
        # The import route will detect generic parser and set needs_review=True
        return results

    def _parse_pdf(self, file_bytes: bytes) -> List[ParsedTransaction]:
        """Best-effort text extraction from unknown PDF format."""
        try:
            import pdfplumber
            results = []
            date_pat = re.compile(r"\b(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})\b")
            amount_pat = re.compile(r"-?\$?[\d,]+\.\d{2}")

            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                for page in pdf.pages:
                    # Try tables first
                    tables = page.extract_tables()
                    for table in tables:
                        for row in table:
                            cells = [str(c or "").strip() for c in row]
                            if len(cells) < 3:
                                continue
                            txn_date = _parse_date(cells[0])
                            if not txn_date:
                                continue
                            desc = cells[1] if len(cells) > 1 else ""
                            if not desc:
                                continue
                            for cell in reversed(cells[2:]):
                                m = amount_pat.search(cell)
                                if m:
                                    raw_amount = _parse_amount(m.group())
                                    if raw_amount:
                                        results.append(ParsedTransaction(
                                            date=txn_date,
                                            description=desc,
                                            amount=abs(raw_amount),
                                            direction="debit" if raw_amount >= 0 else "credit",
                                        ))
                                    break

                    # Text fallback
                    if not results:
                        text = page.extract_text() or ""
                        for line in text.splitlines():
                            dates = date_pat.findall(line)
                            amounts = amount_pat.findall(line)
                            if not dates or not amounts:
                                continue
                            txn_date = _parse_date(dates[0])
                            if not txn_date:
                                continue
                            raw_amount = _parse_amount(amounts[-1])
                            if not raw_amount:
                                continue
                            # Description: everything between last date and first amount
                            desc_start = line.find(dates[-1]) + len(dates[-1])
                            desc_end = line.find(amounts[0])
                            desc = line[desc_start:desc_end].strip() if desc_end > desc_start else line[desc_start:].strip()
                            if not desc:
                                continue
                            results.append(ParsedTransaction(
                                date=txn_date,
                                description=desc,
                                amount=abs(raw_amount),
                                direction="debit" if raw_amount >= 0 else "credit",
                            ))
        except Exception:
            pass
        return results

    @classmethod
    def detect(cls, file_bytes: bytes, filename: str) -> float:
        # Always last resort — only used when no other parser matches
        return 0.1
