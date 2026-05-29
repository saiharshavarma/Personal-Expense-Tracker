import io
import re
from decimal import Decimal, InvalidOperation
from typing import List, Optional

from services.parsers.base_parser import (
    BaseParser, ParsedTransaction,
    parse_date, parse_amount,
    extract_tables_best_effort, parse_text_transactions,
)


class ChaseParser(BaseParser):
    institution_name = "Chase"
    # PDF columns: Transaction Date, Post Date, Description, Category, Type, Amount, Memo
    # Amount: negative = debit, positive = credit

    def parse(self, file_bytes: bytes, filename: str) -> List[ParsedTransaction]:
        if filename.lower().endswith(".csv"):
            return self._parse_csv(file_bytes)
        return self._parse_pdf(file_bytes)

    # ── CSV ──────────────────────────────────────────────────────────────────

    def _parse_csv(self, file_bytes: bytes) -> List[ParsedTransaction]:
        import csv, io as sio
        text = file_bytes.decode("utf-8", errors="replace")
        reader = csv.DictReader(sio.StringIO(text))
        results = []
        for row in reader:
            try:
                keys = {k.strip().lower(): v for k, v in row.items()}
                date_str = keys.get("transaction date") or keys.get("date") or ""
                desc = keys.get("description") or keys.get("details") or ""
                amount_str = keys.get("amount") or "0"
                txn_date = parse_date(date_str)
                if not txn_date or not desc:
                    continue
                amount = parse_amount(amount_str)
                if amount is None:
                    continue
                direction = "credit" if amount > 0 else "debit"
                posted = parse_date(keys.get("post date", ""))
                results.append(ParsedTransaction(
                    date=txn_date,
                    posted_date=posted,
                    description=desc.strip(),
                    amount=abs(amount),
                    direction=direction,
                    source_category=keys.get("category", ""),
                ))
            except Exception:
                continue
        return results

    # ── PDF ──────────────────────────────────────────────────────────────────

    def _parse_pdf(self, file_bytes: bytes) -> List[ParsedTransaction]:
        import pdfplumber
        results: List[ParsedTransaction] = []
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                page_results: List[ParsedTransaction] = []

                # Try table extraction with multiple strategies
                tables = extract_tables_best_effort(page)
                for table in tables:
                    for row in table:
                        parsed = self._parse_table_row(row)
                        if parsed:
                            page_results.append(parsed)

                # Text fallback scoped to THIS page only — not the global list
                if not page_results:
                    text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                    page_results.extend(parse_text_transactions(text, debit_positive=False))

                results.extend(page_results)
        return results

    def _parse_table_row(self, row: list) -> Optional[ParsedTransaction]:
        try:
            cells = [str(c or "").strip() for c in row]
            # Need at least: date, post_date, description, <something>, amount
            if len(cells) < 3:
                return None

            txn_date = parse_date(cells[0])
            if not txn_date:
                return None

            description = cells[2] if len(cells) > 2 else cells[1]
            if not description:
                return None

            # Amount: scan from the right for the first parseable non-balance value.
            # Chase PDFs typically have: Date|PostDate|Desc|Category|Type|Amount|Memo
            # but format varies — don't hardcode index 5.
            amount = None
            for cell in reversed(cells[3:]):
                candidate = parse_amount(cell)
                if candidate is not None and abs(candidate) > 0:
                    amount = candidate
                    break

            if amount is None:
                return None

            direction = "credit" if amount > 0 else "debit"
            posted = parse_date(cells[1]) if len(cells) > 1 else None
            return ParsedTransaction(
                date=txn_date,
                posted_date=posted,
                description=description,
                amount=abs(amount),
                direction=direction,
                source_category=cells[3] if len(cells) > 3 else "",
            )
        except Exception:
            return None

    # ── Detection ─────────────────────────────────────────────────────────────

    @classmethod
    def detect(cls, file_bytes: bytes, filename: str) -> float:
        if filename.lower().endswith(".csv"):
            try:
                text = file_bytes[:2000].decode("utf-8", errors="ignore").lower()
                if "transaction date" in text and "post date" in text:
                    return 0.85
            except Exception:
                pass
            return 0.0
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                text = " ".join(p.extract_text() or "" for p in pdf.pages[:2]).upper()
                if "CHASE" in text and ("TRANSACTION DATE" in text or "POST DATE" in text):
                    return 0.9
                if "JPMORGAN" in text or "CHASE BANK" in text:
                    return 0.7
        except Exception:
            pass
        return 0.0
