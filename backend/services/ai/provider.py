from abc import ABC, abstractmethod
from typing import List
from dataclasses import dataclass


@dataclass
class AICategorizationResult:
    transaction_id: str
    category: str
    subcategory: str
    merchant_clean: str
    need_want_savings: str
    confidence: float
    flags: List[str]


@dataclass
class AIInsightResult:
    answer: str
    data_points: List[dict]


class AIProvider(ABC):
    @abstractmethod
    async def categorize(self, transactions: List[dict]) -> List[AICategorizationResult]:
        """Categorize transactions. Only sanitized fields are passed — no PII."""
        ...

    @abstractmethod
    async def query(self, question: str, context: dict) -> AIInsightResult:
        """Answer a natural language question using only aggregated stats."""
        ...
