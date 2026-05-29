import csv
import io
import re
from decimal import Decimal, InvalidOperation
from typing import List, Optional, Dict

from services.parsers.base_parser import (
    BaseParser, ParsedTransaction,
    parse_date, parse_amount,
    extract_tables_best_effort, parse_text_transactions,
    _AMOUNT_PAT,
)


# Common column name sets for CSV header detection
_DATE_COLS = {"date", "transaction date", "txn date", "posted date", "posting date", "trans date", "value date"}
_DESC_COLS = {"description", "merchant", "payee", "details", "memo", "narrative", "transaction description", "particulars"}
_AMOUNT_COLS = {"amount", "transaction amount", "charge", "payment"}
_DEBIT_COLS = {"debit", "withdrawals", "withdrawal", "dr", "debit amount"}
_CREDIT_COLS = {"credit", "deposits", "deposit", "cr", "credit amount"}


def _detect_columns(fieldnames: List[str]) -> Dict[str, str]:
    """Map raw CSV column names to semantic roles."""
    mapping: Dict[str, str] = {}
    for raw in fieldnames:
        norm = raw.strip().lower()
        if norm in _DATE_COLS and "date" not in mapping:
            mapping["date"] = raw
        elif norm in _DESC_COLS and "description" not in mapping:
            mapping["description"] = raw
        elif norm in _DEBIT_COLS and "debit" not in mapping:
            mapping["debit"] = raw
        elif norm in _CREDIT_COLS and "credit" not in mapping:
            mapping["credit"] = raw
        elif norm in _AMOUNT_COLS and "amount" not in mapping:
            mapping["amount"] = raw
    return mapping


class GenericParser(BaseParser):
    institution_name = "Unknown Institution"

    def parse(self, file_bytes: bytes, filename: str) -> List[ParsedTransaction]:
        if filename.lower().endswith(".pdf"):
            return self._parse_pdf(file_bytes)
        return self._parse_csv(file_bytes)

    # ── CSV ──────────────────────────────────────────────────────────────────

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
                date_str = row.get(cols["date"], "").strip()
                desc = row.get(cols["description"], "").strip()
                if not date_str or not desc:
                    continue

                txn_date = parse_date(date_str)
                if not txn_date:
                    continue

                # Prefer split debit/credit columns over a single signed amount
                if "debit" in cols and "credit" in cols:
                    debit_str = row.get(cols["debit"], "").strip()
                    credit_str = row.get(cols["credit"], "").strip()
                    if debit_str:
                        amount = parse_amount(debit_str)
                        direction = "debit"
                    elif credit_str:
                        amount = parse_amount(credit_str)
                        direction = "credit"
                    else:
                        continue
                elif "amount" in cols:
                    raw = parse_amount(row.get(cols["amount"], "0"))
                    if raw is None:
                        continue
                    amount = abs(raw)
                    direction = "credit" if raw > 0 else "debit"
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

        return results

    # ── PDF ──────────────────────────────────────────────────────────────────

    def _parse_pdf(self, file_bytes: bytes) -> List[ParsedTransaction]:
        try:
            import pdfplumber
            results: List[ParsedTransaction] = []

            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                for page in pdf.pages:
                    page_results: List[ParsedTransaction] = []

                    # Table extraction with multiple strategies
                    tables = extract_tables_best_effort(page)
                    for table in tables:
                        for row in table:
                            parsed = self._parse_table_row(row)
                            if parsed:
                                page_results.append(parsed)

                    # Text fallback scoped to THIS page only
                    if not page_results:
                        text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                        page_results.extend(parse_text_transactions(text))

                    results.extend(page_results)

            return results
        except Exception:
            return []

    def _parse_table_row(self, row: list) -> Optional[ParsedTransaction]:
        """
        Generic table row parser: tries to find a date in the first few cells
        and an amount in the last few cells.
        """
        try:
            cells = [str(c or "").strip() for c in row]
            if len(cells) < 3:
                return None

            # Find the first cell that parses as a date
            txn_date = None
            date_idx = -1
            for i, cell in enumerate(cells[:3]):
                txn_date = parse_date(cell)
                if txn_date:
                    date_idx = i
                    break
            if not txn_date:
                return None

            # Description: the cell right after the date (skip a possible post-date cell)
            desc = ""
            for i in range(date_idx + 1, min(date_idx + 3, len(cells))):
                candidate = cells[i]
                if candidate and not parse_date(candidate):
                    desc = candidate
                    break
            if not desc:
                return None

            # Amount: scan from the right, skip running balances by taking the last
            # parseable non-zero amount
            amount = None
            for cell in reversed(cells):
                candidate = parse_amount(cell)
                if candidate is not None and abs(candidate) > 0:
                    amount = candidate
                    break
            if amount is None:
                return None

            direction = "credit" if amount > 0 else "debit"
            return ParsedTransaction(
                date=txn_date,
                description=desc,
                amount=abs(amount),
                direction=direction,
            )
        except Exception:
            return None

    @classmethod
    def detect(cls, file_bytes: bytes, filename: str) -> float:
        # Always last resort — used only when no other parser matches
        return 0.1
