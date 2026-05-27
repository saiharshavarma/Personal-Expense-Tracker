from abc import ABC, abstractmethod
from typing import List
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal


@dataclass
class ParsedTransaction:
    date: date
    description: str
    amount: Decimal
    direction: str  # "debit" or "credit"
    posted_date: date = None
    raw_text: str = ""
    source_category: str = ""


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
