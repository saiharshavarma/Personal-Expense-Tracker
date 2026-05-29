import re
from abc import ABC, abstractmethod
from typing import List, Optional
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation


@dataclass
class ParsedTransaction:
    date: date
    description: str
    amount: Decimal
    direction: str  # "debit" or "credit"
    posted_date: date = None
    raw_text: str = ""
    source_category: str = ""


# ── Shared date parsing ───────────────────────────────────────────────────────

_DATE_FORMATS = [
    "%m/%d/%Y", "%m/%d/%y",          # 01/15/2024, 01/15/24  (US)
    "%m-%d-%Y", "%m-%d-%y",          # 01-15-2024            (US dashed)
    "%Y-%m-%d",                       # 2024-01-15            (ISO)
    "%d/%m/%Y", "%d-%m-%Y",          # 15/01/2024            (Indian / European 4-digit)
    "%d/%m/%y", "%d-%m-%y",          # 15/01/24              (HDFC and other Indian banks)
    "%b %d, %Y", "%b %d %Y",         # Jan 15, 2024 / Jan 15 2024
    "%B %d, %Y", "%B %d %Y",         # January 15, 2024
    "%d %b %Y", "%d %B %Y",          # 15 Jan 2024
    "%b. %d, %Y",                     # Jan. 15, 2024 (some Amex)
]

_DATE_FORMATS_DAY_FIRST = [
    "%d/%m/%Y", "%d-%m-%Y",          # 15/01/2024
    "%d/%m/%y", "%d-%m-%y",          # 15/01/24
    "%Y-%m-%d",                       # 2024-01-15
    "%m/%d/%Y", "%m/%d/%y",          # US fallback for unambiguous mixed exports
    "%m-%d-%Y", "%m-%d-%y",
    "%b %d, %Y", "%b %d %Y",
    "%B %d, %Y", "%B %d %Y",
    "%d %b %Y", "%d %B %Y",
    "%b. %d, %Y",
]

# Short "MM/DD" patterns that appear in some statements (assume current year)
_SHORT_DATE_PAT = re.compile(r"^\d{1,2}/\d{1,2}$")


def _parse_date_with_formats(s: str, formats: list[str], *, short_day_first: bool = False) -> Optional[date]:
    s = s.strip()
    if not s:
        return None
    for fmt in formats:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    # ISO with time
    if "T" in s:
        try:
            return datetime.fromisoformat(s.split("T")[0]).date()
        except ValueError:
            pass
    # Short MM/DD — assume current year
    if _SHORT_DATE_PAT.match(s):
        try:
            parts = s.split("/")
            if short_day_first:
                return date(datetime.today().year, int(parts[1]), int(parts[0]))
            return date(datetime.today().year, int(parts[0]), int(parts[1]))
        except Exception:
            pass
    return None


def parse_date(s: str) -> Optional[date]:
    """Try all known date formats. Returns None if none match."""
    return _parse_date_with_formats(s, _DATE_FORMATS)


def parse_date_dayfirst(s: str) -> Optional[date]:
    """Parse DD/MM-style bank statement dates before US-style fallbacks."""
    return _parse_date_with_formats(s, _DATE_FORMATS_DAY_FIRST, short_day_first=True)


def parse_amount(s: str) -> Optional[Decimal]:
    """Strip currency symbols and parse to Decimal. Returns None on failure."""
    s = re.sub(r"[,$€£¥₹\s]", "", s).strip()
    # Handle parentheses as negative: (123.45) → -123.45
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]
    try:
        return Decimal(s)
    except (InvalidOperation, Exception):
        return None


# ── Shared PDF table extraction ───────────────────────────────────────────────

# pdfplumber settings to try in order, from most precise to most permissive.
# Many bank PDFs don't have actual border lines — text-strategy works better for those.
_TABLE_SETTINGS = [
    {"vertical_strategy": "lines",       "horizontal_strategy": "lines"},
    {"vertical_strategy": "lines_strict","horizontal_strategy": "lines_strict"},
    {"vertical_strategy": "text",        "horizontal_strategy": "lines", "snap_tolerance": 3},
    {"vertical_strategy": "text",        "horizontal_strategy": "text",  "snap_tolerance": 3},
    {},  # pdfplumber defaults
]


def extract_tables_best_effort(page) -> list:
    """
    Try multiple pdfplumber table-extraction strategies and return results from
    the first strategy that yields non-empty tables.  Falls back to an empty
    list if all strategies produce nothing.
    """
    for settings in _TABLE_SETTINGS:
        try:
            tables = page.extract_tables(settings) if settings else page.extract_tables()
            # A strategy is "successful" if at least one table has a non-header row
            # with at least 2 non-empty cells.
            has_data = any(
                sum(1 for c in row if c and str(c).strip()) >= 2
                for table in tables
                for row in (table or [])
            )
            if has_data:
                return tables
        except Exception:
            continue
    return []


# ── Shared multi-line-aware text transaction extractor ────────────────────────

# Matches a date at the start of a line (with optional leading whitespace)
_LINE_DATE_PAT = re.compile(
    r"^\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}"          # MM/DD/YYYY variants
    r"|[A-Z][a-z]{2}\.?\s+\d{1,2},?\s+\d{4}"         # Jan 15, 2024
    r"|\d{4}-\d{2}-\d{2})"                            # 2024-01-15
)

# Matches a dollar amount anywhere in the string
_AMOUNT_PAT = re.compile(r"(-?\(?\$?[\d,]+\.\d{2}\)?)")


def parse_text_transactions(
    text: str,
    direction_from_sign: bool = True,
    debit_positive: bool = False,
    dayfirst: bool = False,
) -> List[ParsedTransaction]:
    """
    Multi-line-aware transaction extractor for plain text extracted from PDFs.

    Algorithm:
    1. Identify "transaction-start" lines — those that begin with a recognisable date.
    2. Collect continuation lines (lines without a leading date) into the same block.
    3. Extract amount from the last dollar-amount match in the block.
    4. Extract description from the text between the dates and the amount.

    Args:
        direction_from_sign:  True → negative = debit. False → positive = debit (Amex).
        debit_positive:       True → positive values are debits (Amex convention).
    """
    results: List[ParsedTransaction] = []
    lines = text.splitlines()

    # Group lines into transaction blocks
    blocks: list[str] = []
    for line in lines:
        if _LINE_DATE_PAT.match(line):
            blocks.append(line)
        elif blocks and line.strip():
            # Continuation line — append to most recent block
            blocks[-1] += " " + line.strip()

    for block in blocks:
        try:
            all_dates = re.findall(
                r"\b(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}"
                r"|[A-Z][a-z]{2}\.?\s+\d{1,2},?\s+\d{4}"
                r"|\d{4}-\d{2}-\d{2})\b",
                block,
            )
            amounts = _AMOUNT_PAT.findall(block)
            if not all_dates or not amounts:
                continue

            txn_date = parse_date_dayfirst(all_dates[0]) if dayfirst else parse_date(all_dates[0])
            if not txn_date:
                continue

            # Use the LAST amount in the block — avoids picking up a running balance
            # that appears in the middle of the line (e.g. "Prev bal $1,234.56  -$45.00")
            raw_amount_str = amounts[-1]
            raw_amount = parse_amount(raw_amount_str)
            if raw_amount is None:
                continue

            if debit_positive:
                direction = "debit" if raw_amount > 0 else "credit"
            else:
                direction = "credit" if raw_amount > 0 else "debit"

            # Description: between the last date token and the last amount token
            last_date_str = all_dates[-1]
            last_date_pos = block.rfind(last_date_str) + len(last_date_str)
            last_amount_pos = block.rfind(raw_amount_str)
            if last_amount_pos > last_date_pos:
                description = block[last_date_pos:last_amount_pos].strip(" |-–—\t")
            else:
                # Amount comes before or at the date — use everything after last date
                description = block[last_date_pos:].strip(" |-–—\t")
                # Strip the amount from the end if present
                description = re.sub(r"\s*" + re.escape(raw_amount_str) + r"\s*$", "", description).strip()

            # Skip header rows, totals, and blank descriptions
            if not description:
                continue
            low = description.lower()
            if any(skip in low for skip in ("total", "balance", "payment due", "minimum payment", "opening balance")):
                continue

            results.append(ParsedTransaction(
                date=txn_date,
                description=description,
                amount=abs(raw_amount),
                direction=direction,
            ))
        except Exception:
            continue

    return results


class BaseParser(ABC):
    institution_name: str = "Unknown"

    @abstractmethod
    def parse(self, file_bytes: bytes, filename: str) -> List[ParsedTransaction]:
        """Parse file bytes and return list of parsed transactions."""
        ...

    @classmethod
    def detect(cls, file_bytes: bytes, filename: str) -> float:
        """Return confidence 0-1 that this parser handles the given file."""
        return 0.0
