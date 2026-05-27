from typing import List

from services.parsers.base_parser import BaseParser, ParsedTransaction


class AmexParser(BaseParser):
    institution_name = "American Express"
    # Columns: Date, Description, Amount
    # Amount: positive = charge (debit), negative = credit/refund

    def parse(self, file_bytes: bytes, filename: str) -> List[ParsedTransaction]:
        raise NotImplementedError("Amex PDF parser implemented in Phase 3")

    @classmethod
    def detect(cls, file_bytes: bytes, filename: str) -> float:
        try:
            import pdfplumber
            import io
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                text = " ".join(p.extract_text() or "" for p in pdf.pages[:2]).upper()
                if "AMERICAN EXPRESS" in text or "AMEX" in text:
                    return 0.85
        except Exception:
            pass
        return 0.0
