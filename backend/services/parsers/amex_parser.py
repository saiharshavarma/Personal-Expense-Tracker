import io
import re
from decimal import Decimal, InvalidOperation
from typing import List, Optional

from services.parsers.base_parser import (
    BaseParser, ParsedTransaction,
    parse_date, parse_amount,
    extract_tables_best_effort, parse_text_transactions,
)


class AmexParser(BaseParser):
    institution_name = "American Express"
    # PDF/CSV columns: Date, Description, Amount
    # Amex sign convention: positive = charge (debit), negative = credit/refund
    # (opposite of Chase / BofA)

    def parse(self, file_bytes: bytes, filename: str) -> List[ParsedTransaction]:
        if filename.lower().endswith(".csv"):
            return self._parse_csv(file_bytes)
        return self._parse_pdf(file_bytes, filename)

    # ── CSV ──────────────────────────────────────────────────────────────────

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
                amount_str = keys.get("amount") or "0"
                txn_date = parse_date(date_str)
                if not txn_date or not desc:
                    continue
                amount = parse_amount(amount_str)
                if amount is None:
                    continue
                # Amex: positive = charge (debit), negative = credit
                direction = "debit" if amount > 0 else "credit"
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

    def _parse_pdf(self, file_bytes: bytes, filename: str) -> List[ParsedTransaction]:
        import pdfplumber
        results: List[ParsedTransaction] = []
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            text_parts = []
            for page in pdf.pages:
                text_parts.append(page.extract_text(x_tolerance=3, y_tolerance=3) or "")
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
                    # debit_positive=True because Amex uses positive = charge
                    page_results.extend(
                        parse_text_transactions(text, debit_positive=True)
                    )

                results.extend(page_results)
            text_results = self._parse_amex_text("\n".join(text_parts), filename)
            if len(text_results) > len(results):
                return text_results
        return results

    def _statement_year(self, text: str, filename: str) -> str:
        for pattern in (
            r"(\d{2})[./](\d{2})[./](\d{4})",
            r"\b(?:20|19)\d{2}\b",
        ):
            m = re.search(pattern, text)
            if m:
                return m.group(3) if len(m.groups()) >= 3 else m.group(0)
        file_match = re.search(r"'(\d{2})", filename)
        if file_match:
            return f"20{file_match.group(1)}"
        return str(__import__("datetime").datetime.today().year)

    def _parse_amex_text(self, text: str, filename: str) -> List[ParsedTransaction]:
        """Parse Amex text rows when pdfplumber does not expose clean tables."""
        year = self._statement_year(text, filename)
        dot_row_pat = re.compile(
            r"^(\d{1,2})[./](\d{1,2})[./]\d{1,4}\s+(.+?)\s+((?:[$€£¥₹]?\(?[\d,]+(?:\.\d{2})?\)?\s*)+)$"
        )
        month_row_pat = re.compile(
            r"^([A-Z][a-z]{2,8}\.?\s+\d{1,2})(?:,\s*(\d{4}))?\s+(.+?)\s+(-?\(?[$€£¥₹]?[\d,]+\.\d{2}\)?)$"
        )
        amount_pat = re.compile(r"[\d,]+(?:\.\d{2})?")
        results: List[ParsedTransaction] = []
        seen: set[tuple] = set()
        for raw_line in text.splitlines():
            line = " ".join(raw_line.split())
            if self._skip_text_row(line):
                continue

            match = dot_row_pat.match(line)
            if match:
                day, month, desc, amounts_text = match.groups()
                amounts = amount_pat.findall(amounts_text)
                if not amounts:
                    continue
                amount = parse_amount(amounts[-1])
                txn_date = parse_date(f"{month}/{day}/{year}")
            else:
                match = month_row_pat.match(line)
                if not match:
                    continue
                date_text, explicit_year, desc, amount_text = match.groups()
                amount = parse_amount(amount_text)
                txn_date = parse_date(f"{date_text} {explicit_year or year}")

            if not txn_date or amount is None or amount == 0:
                continue
            direction = self._direction_for_description(desc, amount)
            key = (txn_date, desc.strip(), abs(amount), direction)
            if key in seen:
                continue
            seen.add(key)
            results.append(ParsedTransaction(
                date=txn_date,
                description=desc.strip(),
                amount=abs(amount),
                direction=direction,
            ))
        return results

    def _skip_text_row(self, line: str) -> bool:
        upper = line.upper()
        return (
            not line
            or "TOTAL OF NEW TRANSACTIONS" in upper
            or upper.startswith("STATEMENT ")
            or upper.startswith("PAYMENT DUE")
            or upper.startswith("MINIMUM PAYMENT")
            or upper.startswith("OPENING BALANCE")
            or upper.startswith("CLOSING BALANCE")
        )

    def _direction_for_description(self, description: str, amount: Decimal) -> str:
        upper = description.upper()
        if amount < 0 or upper.startswith(("REFUND", "REVERSAL", "PAYMENT RECEIVED", "THANK YOU")):
            return "credit"
        return "debit"

    def _parse_table_row(self, row: list) -> Optional[ParsedTransaction]:
        try:
            cells = [str(c or "").strip() for c in row]
            if len(cells) < 3:
                return None

            # Some Amex PDFs have a reference number in cells[0] before the date
            txn_date = parse_date(cells[0])
            desc_idx = 1
            if not txn_date and len(cells) >= 4:
                # Try shifting one cell right (reference number present)
                txn_date = parse_date(cells[1])
                desc_idx = 2

            if not txn_date:
                return None

            description = cells[desc_idx] if len(cells) > desc_idx else ""
            if not description:
                return None

            # Amount is always the last cell in Amex PDFs
            amount = parse_amount(cells[-1])
            if amount is None:
                # Try second-to-last if last cell is empty
                if len(cells) >= 2:
                    amount = parse_amount(cells[-2])
            if amount is None:
                return None

            # Amex: positive = debit (charge), negative = credit (refund/payment)
            direction = "debit" if amount > 0 else "credit"
            return ParsedTransaction(
                date=txn_date,
                description=description,
                amount=abs(amount),
                direction=direction,
            )
        except Exception:
            return None

    # ── Detection ─────────────────────────────────────────────────────────────

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
                # Only use the first page header area to identify the issuer.
                # Checking all pages risks matching "AMERICAN EXPRESS" appearing
                # in a transaction description (e.g. an Amex card payment in a
                # checking account statement).
                first_page = (pdf.pages[0].extract_text() or "").upper() if pdf.pages else ""
                # Strong signal: "AMERICAN EXPRESS" in the top portion of page 1
                # PLUS at least one other Amex-specific structural marker.
                _AMEX_MARKERS = (
                    "CARD MEMBER", "CARDMEMBER", "MEMBERSHIP REWARDS",
                    "CENTURION", "GOLD CARD", "PLATINUM CARD", "GREEN CARD",
                    "BLUE CARD", "REWARDS SUMMARY", "MINIMUM PAYMENT DUE",
                    "NEW CHARGES",
                )
                has_amex_name = "AMERICAN EXPRESS" in first_page[:1000]
                has_marker = any(m in first_page for m in _AMEX_MARKERS)
                if has_amex_name and has_marker:
                    return 0.92
                if has_amex_name:
                    # Name present but no structural marker — lower confidence
                    # to avoid mis-detecting checking statements that mention
                    # an Amex payment in the first transaction.
                    return 0.6
                if "AMEX" in first_page[:500] and has_marker:
                    return 0.75
        except Exception:
            pass
        return 0.0
