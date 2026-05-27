from typing import List

from services.parsers.base_parser import BaseParser, ParsedTransaction


class BankOfAmericaParser(BaseParser):
    institution_name = "Bank of America"
    # Columns: Date, Description, Amount, Running Bal.
    # Amount: negative = withdrawal (debit), positive = deposit (credit)

    def parse(self, file_bytes: bytes, filename: str) -> List[ParsedTransaction]:
        raise NotImplementedError("Bank of America PDF parser implemented in Phase 3")

    @classmethod
    def detect(cls, file_bytes: bytes, filename: str) -> float:
        try:
            import pdfplumber
            import io
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                text = " ".join(p.extract_text() or "" for p in pdf.pages[:2]).upper()
                if ("BANK OF AMERICA" in text or "BANKOFAMERICA" in text) and "RUNNING BAL" in text:
                    return 0.9
        except Exception:
            pass
        return 0.0
