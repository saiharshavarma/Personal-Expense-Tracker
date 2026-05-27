import json
from typing import List

from services.ai.provider import AIProvider, AICategorizationResult, AIInsightResult


class AnthropicProvider(AIProvider):
    def __init__(self, api_key: str, categorization_model: str, insights_model: str):
        self.api_key = api_key
        self.categorization_model = categorization_model
        self.insights_model = insights_model
        self._client = None

    def _get_client(self):
        if self._client is None:
            import anthropic
            self._client = anthropic.AsyncAnthropic(api_key=self.api_key)
        return self._client

    async def categorize(self, transactions: List[dict]) -> List[AICategorizationResult]:
        # Implemented in Phase 4
        raise NotImplementedError("AI categorization implemented in Phase 4")

    async def query(self, question: str, context: dict) -> AIInsightResult:
        # Implemented in Phase 11
        raise NotImplementedError("AI insights implemented in Phase 11")
