from typing import List

from services.parsers.base_parser import BaseParser, ParsedTransaction


class GenericParser(BaseParser):
    institution_name = "Generic"

    def parse(self, file_bytes: bytes, filename: str) -> List[ParsedTransaction]:
        """
        Phase 3: Auto-detect column headers and parse.
        Falls back to Claude Haiku for table structure detection.
        All results marked needs_review=True.
        """
        raise NotImplementedError("Generic parser implemented in Phase 3")

    @classmethod
    def detect(cls, file_bytes: bytes, filename: str) -> float:
        return 0.1  # Always last resort
