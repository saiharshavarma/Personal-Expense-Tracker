import csv
import io
from typing import List, Optional

from services.parsers.base_parser import (
    BaseParser, ParsedTransaction,
    parse_date_dayfirst, parse_amount,
    extract_tables_best_effort, parse_text_transactions,
)

# Rows that contain these strings are header/summary lines, not transactions
_SKIP_KEYWORDS = {
    "transaction date", "value date", "description", "withdrawal",
    "deposit", "balance", "opening balance", "closing balance",
    "s no", "s.no", "ref no", "cheque", "total",
}


def _is_skip_row(cells: list[str]) -> bool:
    joined = " ".join(cells).lower()
    return any(kw in joined for kw in _SKIP_KEYWORDS)


class ICICIParser(BaseParser):
    institution_name = "ICICI Bank"
    # CSV columns: Transaction Date, Value Date, Description,
    #              Ref No./Cheque No., Debit, Credit, Balance
    # PDF columns: Date | Transaction Remarks | Chq/Ref No. |
    #              Withdrawal Amt.(INR) | Deposit Amt.(INR) | Balance(INR)
    # Date format:  DD/MM/YYYY
    # Sign convention: Debit/Withdrawal = expense, Credit/Deposit = income

    def parse(self, file_bytes: bytes, filename: str) -> List[ParsedTransaction]:
        if filename.lower().endswith(".csv"):
            return self._parse_csv(file_bytes)
        return self._parse_pdf(file_bytes)

    # ── CSV ───────────────────────────────────────────────────────────────────

    def _parse_csv(self, file_bytes: bytes) -> List[ParsedTransaction]:
        # ICICI CSV may be UTF-8 or latin-1
        for enc in ("utf-8-sig", "utf-8", "latin-1"):
            try:
                text = file_bytes.decode(enc, errors="strict")
                break
            except UnicodeDecodeError:
                continue
        else:
            text = file_bytes.decode("utf-8", errors="replace")

        reader = csv.DictReader(io.StringIO(text))
        results = []
        for row in reader:
            try:
                keys = {k.strip().lower(): v.strip() for k, v in row.items() if k}
                date_str = keys.get("transaction date") or keys.get("date") or ""
                desc = keys.get("description") or keys.get("transaction remarks") or ""
                debit_str = keys.get("debit") or keys.get("withdrawal amt.(inr)") or ""
                credit_str = keys.get("credit") or keys.get("deposit amt.(inr)") or ""

                if not date_str or not desc:
                    continue
                # Skip header echo rows (ICICI sometimes repeats headers mid-file)
                if "transaction date" in date_str.lower():
                    continue

                txn_date = parse_date_dayfirst(date_str)
                if not txn_date:
                    continue

                if debit_str:
                    amount = parse_amount(debit_str)
                    if amount and amount > 0:
                        results.append(ParsedTransaction(
                            date=txn_date,
                            description=desc,
                            amount=amount,
                            direction="debit",
                            raw_text=str(row),
                        ))
                        continue
                if credit_str:
                    amount = parse_amount(credit_str)
                    if amount and amount > 0:
                        results.append(ParsedTransaction(
                            date=txn_date,
                            description=desc,
                            amount=amount,
                            direction="credit",
                            raw_text=str(row),
                        ))
            except Exception:
                continue
        return results

    # ── PDF ───────────────────────────────────────────────────────────────────

    def _parse_pdf(self, file_bytes: bytes) -> List[ParsedTransaction]:
        try:
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

                    # Text fallback scoped to this page
                    if not page_results:
                        text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                        # ICICI uses positive debit = expense (same as BofA sign convention)
                        page_results.extend(parse_text_transactions(text, debit_positive=False, dayfirst=True))

                    results.extend(page_results)

            return results
        except Exception:
            return []

    def _parse_table_row(self, row: list) -> Optional[ParsedTransaction]:
        """
        ICICI table layouts:
          Format A (6 cols):  Date | Remarks | Ref | Withdrawal | Deposit | Balance
          Format B (7 cols):  S.No | Date | Remarks | Ref | Withdrawal | Deposit | Balance
        """
        try:
            cells = [str(c or "").strip() for c in row]
            if len(cells) < 4:
                return None

            if _is_skip_row(cells):
                return None

            # Detect whether S.No. column is present
            txn_date = parse_date_dayfirst(cells[0])
            if txn_date:
                # Format A — Date in cells[0]
                desc_idx, ref_idx, wd_idx, dep_idx = 1, 2, 3, 4
            elif len(cells) >= 5:
                # Format B — try Date in cells[1]
                txn_date = parse_date_dayfirst(cells[1])
                if not txn_date:
                    return None
                desc_idx, ref_idx, wd_idx, dep_idx = 2, 3, 4, 5
            else:
                return None

            description = cells[desc_idx] if len(cells) > desc_idx else ""
            if not description:
                return None

            # Withdrawal
            if len(cells) > wd_idx and cells[wd_idx]:
                amount = parse_amount(cells[wd_idx])
                if amount and amount > 0:
                    return ParsedTransaction(
                        date=txn_date,
                        description=description,
                        amount=amount,
                        direction="debit",
                    )

            # Deposit
            if len(cells) > dep_idx and cells[dep_idx]:
                amount = parse_amount(cells[dep_idx])
                if amount and amount > 0:
                    return ParsedTransaction(
                        date=txn_date,
                        description=description,
                        amount=amount,
                        direction="credit",
                    )

            return None
        except Exception:
            return None

    # ── Detection ─────────────────────────────────────────────────────────────

    @classmethod
    def detect(cls, file_bytes: bytes, filename: str) -> float:
        name_lower = filename.lower()
        if name_lower.endswith(".csv"):
            try:
                text = file_bytes[:2000].decode("utf-8", errors="ignore").lower()
                # Strong signal: both date columns present
                if "transaction date" in text and "value date" in text:
                    return 0.9
                # Moderate: ICICI branding in the CSV itself
                if "icici" in text:
                    return 0.75
            except Exception:
                pass
            return 0.0

        # PDF detection
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                text = " ".join(
                    p.extract_text() or "" for p in pdf.pages[:3]
                ).upper()
                if "ICICI BANK" in text:
                    return 0.92
                if "ICICI" in text and ("WITHDRAWAL" in text or "DEPOSIT" in text):
                    return 0.75
        except Exception:
            pass
        return 0.0
