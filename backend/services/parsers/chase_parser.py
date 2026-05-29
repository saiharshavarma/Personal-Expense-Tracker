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
            full_text_parts = []
            for page in pdf.pages:
                full_text_parts.append(page.extract_text(x_tolerance=3, y_tolerance=3) or "")
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

        text_results = self._parse_statement_text("\n".join(full_text_parts))
        if len(text_results) > len(results):
            return text_results
        return results

    def _statement_year(self, text: str) -> int:
        m = re.search(r"\bthrough\s+[A-Za-z]+\s+\d{1,2},\s+(\d{4})", text, re.IGNORECASE)
        if m:
            return int(m.group(1))
        m = re.search(r"\b(\d{4})\b", text)
        if m:
            return int(m.group(1))
        from datetime import datetime
        return datetime.today().year

    def _parse_short_date(self, mmdd: str, year: int):
        return parse_date(f"{mmdd}/{year}")

    def _parse_statement_text(self, text: str) -> List[ParsedTransaction]:
        year = self._statement_year(text)
        results: List[ParsedTransaction] = []
        section = None
        row_pat = re.compile(r"^(\d{2}/\d{2})\s+(.+?)\s+\$?([\d,]+\.\d{2})$")
        check_pat = re.compile(r"^(.+?)\s+(\d{2}/\d{2})\s+\$?([\d,]+\.\d{2})$")

        for raw_line in text.splitlines():
            line = " ".join(raw_line.split())
            upper = line.upper()
            if upper.startswith("DEPOSITS AND ADDITIONS"):
                section = "credit"
                continue
            if upper.startswith("OTHER WITHDRAWALS") or upper.startswith("CHECKS PAID"):
                section = "debit"
                continue
            if upper.startswith("DAILY ENDING BALANCE") or upper.startswith("SERVICE CHARGE"):
                section = None
                continue
            if not section or upper.startswith("DATE ") or upper.startswith("TOTAL "):
                continue

            match = row_pat.match(line)
            if match:
                date_str, desc, amount_str = match.groups()
            elif section == "debit":
                match = check_pat.match(line)
                if not match:
                    continue
                desc, date_str, amount_str = match.groups()
            else:
                continue

            txn_date = self._parse_short_date(date_str, year)
            amount = parse_amount(amount_str)
            if not txn_date or amount is None or amount == 0:
                continue
            results.append(ParsedTransaction(
                date=txn_date,
                description=desc.strip(),
                amount=abs(amount),
                direction=section,
            ))
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
