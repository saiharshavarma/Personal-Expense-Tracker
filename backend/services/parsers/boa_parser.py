import io
import re
from decimal import Decimal, InvalidOperation
from typing import List, Optional

from services.parsers.base_parser import (
    BaseParser, ParsedTransaction,
    parse_date, parse_amount,
    extract_tables_best_effort, parse_text_transactions,
)


class BankOfAmericaParser(BaseParser):
    institution_name = "Bank of America"
    # PDF columns: Date, Description, Amount, Running Bal.
    # Amount: negative = withdrawal (debit), positive = deposit (credit)
    # Some BofA PDFs use separate Withdrawals / Deposits columns instead of a
    # signed Amount column — both formats are handled here.

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
                date_str = keys.get("date") or keys.get("posted date") or ""
                desc = keys.get("description") or keys.get("payee") or ""
                amount_str = keys.get("amount") or "0"
                txn_date = parse_date(date_str)
                if not txn_date or not desc:
                    continue
                amount = parse_amount(amount_str)
                if amount is None:
                    continue
                direction = "credit" if amount > 0 else "debit"
                results.append(ParsedTransaction(
                    date=txn_date,
                    description=desc.strip(),
                    amount=abs(amount),
                    direction=direction,
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

                tables = extract_tables_best_effort(page)
                for table in tables:
                    for row in table:
                        parsed = self._parse_table_row(row)
                        if parsed:
                            page_results.append(parsed)

                # Text fallback scoped to THIS page only
                if not page_results:
                    text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                    page_results.extend(parse_text_transactions(text, debit_positive=False))

                results.extend(page_results)
        return results

    def _parse_table_row(self, row: list) -> Optional[ParsedTransaction]:
        try:
            cells = [str(c or "").strip() for c in row]
            if len(cells) < 3:
                return None

            txn_date = parse_date(cells[0])
            if not txn_date:
                return None

            description = cells[1]
            if not description:
                return None

            # BofA PDF format A: Date | Description | Amount | Running Balance
            # BofA PDF format B: Date | Description | Withdrawals | Deposits | Balance
            if len(cells) >= 5:
                # Separate withdrawals/deposits columns
                withdrawal = parse_amount(cells[2]) if cells[2] else None
                deposit    = parse_amount(cells[3]) if cells[3] else None
                if withdrawal and withdrawal > 0:
                    return ParsedTransaction(
                        date=txn_date, description=description,
                        amount=withdrawal, direction="debit",
                    )
                if deposit and deposit > 0:
                    return ParsedTransaction(
                        date=txn_date, description=description,
                        amount=deposit, direction="credit",
                    )
                # Fall through to generic scan below if neither parsed
            else:
                # Format A: Amount in cells[2], running balance in cells[3] — ignore cells[3]
                amount_str = cells[2]
                amount = parse_amount(amount_str)
                if amount is None:
                    return None
                direction = "credit" if amount > 0 else "debit"
                return ParsedTransaction(
                    date=txn_date, description=description,
                    amount=abs(amount), direction=direction,
                )

            # Generic fallback: scan cells from right for the first parseable amount
            for cell in reversed(cells[2:]):
                candidate = parse_amount(cell)
                if candidate is not None and abs(candidate) > 0:
                    direction = "credit" if candidate > 0 else "debit"
                    return ParsedTransaction(
                        date=txn_date, description=description,
                        amount=abs(candidate), direction=direction,
                    )
            return None
        except Exception:
            return None

    # ── Detection ─────────────────────────────────────────────────────────────

    @classmethod
    def detect(cls, file_bytes: bytes, filename: str) -> float:
        if filename.lower().endswith(".csv"):
            try:
                text = file_bytes[:2000].decode("utf-8", errors="ignore").lower()
                if ("bank of america" in text or "bofa" in text) and "running bal" in text:
                    return 0.85
            except Exception:
                pass
            return 0.0
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                text = " ".join(p.extract_text() or "" for p in pdf.pages[:2]).upper()
                if ("BANK OF AMERICA" in text or "BANKOFAMERICA" in text) and "RUNNING BAL" in text:
                    return 0.9
                if "BANK OF AMERICA" in text:
                    return 0.65
        except Exception:
            pass
        return 0.0
