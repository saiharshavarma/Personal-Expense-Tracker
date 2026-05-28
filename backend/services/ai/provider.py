from abc import ABC, abstractmethod
from typing import List, Optional
from dataclasses import dataclass, field


@dataclass
class AICategorizationResult:
    transaction_id: str
    category: str
    subcategory: str
    merchant_clean: str
    need_want_savings: str
    confidence: float
    flags: List[str]
    # Extended AI-filled fields
    fixed_variable: Optional[str] = None          # "fixed" | "variable"
    personal_work_shared: Optional[str] = None    # "personal" | "work" | "shared"
    is_reimbursable: bool = False
    is_recurring: bool = False
    suggested_tags: List[str] = field(default_factory=list)


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
