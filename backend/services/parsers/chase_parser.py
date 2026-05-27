from typing import List
from decimal import Decimal
from datetime import datetime

from services.parsers.base_parser import BaseParser, ParsedTransaction


class ChaseParser(BaseParser):
    institution_name = "Chase"
    # Columns: Transaction Date, Post Date, Description, Category, Type, Amount, Memo
    # Amount: negative = debit, positive = credit

    def parse(self, file_bytes: bytes, filename: str) -> List[ParsedTransaction]:
        raise NotImplementedError("Chase PDF parser implemented in Phase 3")

    @classmethod
    def detect(cls, file_bytes: bytes, filename: str) -> float:
        try:
            import pdfplumber
            import io
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                text = " ".join(p.extract_text() or "" for p in pdf.pages[:2]).upper()
                if "CHASE" in text and ("TRANSACTION DATE" in text or "POST DATE" in text):
                    return 0.9
        except Exception:
            pass
        return 0.0
