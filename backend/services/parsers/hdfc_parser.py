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
    "date", "narration", "chq", "withdrawal", "deposit", "balance",
    "opening balance", "closing balance", "total", "value dt",
}


def _is_skip_row(cells: list[str]) -> bool:
    joined = " ".join(cells).lower()
    return any(kw in joined for kw in _SKIP_KEYWORDS)


class HDFCParser(BaseParser):
    institution_name = "HDFC Bank"
    # CSV columns: Date, Narration, Chq./Ref.No., Value Dt,
    #              Withdrawal Amt.(INR), Deposit Amt.(INR), Closing Balance(INR)
    # PDF columns: Date | Narration | Chq./Ref No. | Value Dt |
    #              Withdrawal Amt. | Deposit Amt. | Closing Balance
    # Date format:  DD/MM/YY  (HDFC uses 2-digit years in CSV/PDF)
    # Sign convention: Withdrawal = debit, Deposit = credit

    def parse(self, file_bytes: bytes, filename: str) -> List[ParsedTransaction]:
        if filename.lower().endswith(".csv"):
            return self._parse_csv(file_bytes)
        return self._parse_pdf(file_bytes)

    # ── CSV ───────────────────────────────────────────────────────────────────

    def _parse_csv(self, file_bytes: bytes) -> List[ParsedTransaction]:
        for enc in ("utf-8-sig", "utf-8", "latin-1"):
            try:
                text = file_bytes.decode(enc, errors="strict")
                break
            except UnicodeDecodeError:
                continue
        else:
            text = file_bytes.decode("utf-8", errors="replace")

        # HDFC CSVs sometimes start with a couple of summary lines before the
        # actual header row — skip lines until we find the header.
        lines = text.splitlines()
        header_idx = None
        for i, line in enumerate(lines):
            low = line.lower()
            if "narration" in low and ("withdrawal" in low or "deposit" in low):
                header_idx = i
                break

        if header_idx is None:
            return []

        csv_text = "\n".join(lines[header_idx:])
        reader = csv.DictReader(io.StringIO(csv_text))
        results = []

        for row in reader:
            try:
                keys = {k.strip().lower(): v.strip() for k, v in row.items() if k}
                date_str = keys.get("date") or ""
                desc = (
                    keys.get("narration")
                    or keys.get("transaction remarks")
                    or keys.get("description")
                    or ""
                )
                # HDFC column names have trailing spaces in some exports
                wd_str = next(
                    (v for k, v in keys.items() if "withdrawal" in k), ""
                )
                dep_str = next(
                    (v for k, v in keys.items() if "deposit" in k), ""
                )

                if not date_str or not desc:
                    continue
                # Skip echoed header rows
                if "date" in date_str.lower():
                    continue

                txn_date = parse_date_dayfirst(date_str)
                if not txn_date:
                    continue

                if wd_str:
                    amount = parse_amount(wd_str)
                    if amount and amount > 0:
                        results.append(ParsedTransaction(
                            date=txn_date,
                            description=desc,
                            amount=amount,
                            direction="debit",
                            raw_text=str(row),
                        ))
                        continue
                if dep_str:
                    amount = parse_amount(dep_str)
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
                            packed = self._parse_packed_table_row(row)
                            if packed:
                                page_results.extend(packed)
                                continue
                            parsed = self._parse_table_row(row)
                            if parsed:
                                page_results.append(parsed)

                    # Text fallback scoped to this page
                    if not page_results:
                        text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                        page_results.extend(parse_text_transactions(text, debit_positive=False, dayfirst=True))

                    results.extend(page_results)

            return results
        except Exception:
            return []

    def _split_narrations(self, text: str, expected_count: int) -> list[str]:
        lines = [line.strip() for line in (text or "").splitlines() if line and line.strip()]
        starts = (
            "UPI-", "NEFT", "IMPS", "MMT/", "BIL/", "ACH", "POS", "ATM",
            "NWD", "EAW", "RTGS", "CHQ", "CHEQUE", "CASH", "SALARY",
            "INTEREST", "REVERSAL", "REFUND",
        )
        chunks: list[str] = []
        current: list[str] = []
        for line in lines:
            normalized = line.upper()
            is_start = normalized.startswith(starts)
            if normalized == "R":
                continue
            if is_start and current:
                chunks.append(" ".join(current))
                current = [line]
            else:
                current.append(line)
        if current:
            chunks.append(" ".join(current))
        if len(chunks) == expected_count:
            return chunks
        return [f"HDFC transaction {i + 1}" for i in range(expected_count)]

    def _parse_packed_table_row(self, row: list) -> List[ParsedTransaction]:
        """
        Some HDFC PDFs extract as one table row where each column contains all
        page values separated by newlines. Re-split those columns positionally
        so we do not mistake Closing Balance values for transaction amounts.
        """
        try:
            cells = [str(c or "").strip() for c in row]
            if len(cells) < 7:
                return []

            dates = [d.strip() for d in cells[0].splitlines() if parse_date_dayfirst(d.strip())]
            if len(dates) < 2:
                return []

            withdrawals = [parse_amount(v) for v in cells[4].splitlines() if v.strip()]
            deposits = [parse_amount(v) for v in cells[5].splitlines() if v.strip()]
            descriptions = self._split_narrations(cells[1], len(dates))
            results: List[ParsedTransaction] = []

            for i, date_str in enumerate(dates):
                withdrawal = withdrawals[i] if i < len(withdrawals) else None
                deposit = deposits[i] if i < len(deposits) else None
                if withdrawal is not None and withdrawal > 0:
                    amount = withdrawal
                    direction = "debit"
                elif deposit is not None and deposit > 0:
                    amount = deposit
                    direction = "credit"
                else:
                    continue
                txn_date = parse_date_dayfirst(date_str)
                if not txn_date:
                    continue
                results.append(ParsedTransaction(
                    date=txn_date,
                    description=descriptions[i] if i < len(descriptions) else f"HDFC transaction {i + 1}",
                    amount=amount,
                    direction=direction,
                ))
            return results
        except Exception:
            return []

    def _parse_table_row(self, row: list) -> Optional[ParsedTransaction]:
        """
        HDFC table layout (7 cols):
          Date | Narration | Chq./Ref No. | Value Dt | Withdrawal Amt. | Deposit Amt. | Balance
        """
        try:
            cells = [str(c or "").strip() for c in row]
            if len(cells) < 5:
                return None

            if _is_skip_row(cells):
                return None

            txn_date = parse_date_dayfirst(cells[0])
            if not txn_date:
                return None

            description = cells[1] if len(cells) > 1 else ""
            if not description:
                return None

            # Standard layout:
            # cells[2] = Chq/Ref  (skip)
            # cells[3] = Value Dt (skip)
            # cells[4] = Withdrawal
            # cells[5] = Deposit
            # cells[6] = Balance  (ignore)

            wd_idx, dep_idx = 4, 5

            # Fallback: if the row has only 5-6 columns (some PDFs omit Value Dt),
            # right-scan from cells[2] onwards for withdrawal/deposit.
            if len(cells) < 6:
                wd_idx, dep_idx = 2, 3

            if len(cells) > wd_idx and cells[wd_idx]:
                amount = parse_amount(cells[wd_idx])
                if amount and amount > 0:
                    return ParsedTransaction(
                        date=txn_date,
                        description=description,
                        amount=amount,
                        direction="debit",
                    )

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
                text = file_bytes[:3000].decode("utf-8", errors="ignore").lower()
                # Strong signal: HDFC-specific column name
                if "narration" in text and ("withdrawal amt" in text or "deposit amt" in text):
                    return 0.92
                if "hdfc" in text:
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
                if "HDFC BANK" in text:
                    return 0.92
                if "HDFC" in text and ("NARRATION" in text or "WITHDRAWAL" in text):
                    return 0.78
        except Exception:
            pass
        return 0.0
