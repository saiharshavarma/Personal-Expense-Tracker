from typing import List

from services.ai.provider import AIProvider, AICategorizationResult, AIInsightResult


class OpenAIProvider(AIProvider):
    def __init__(self, api_key: str, categorization_model: str = "gpt-4o-mini", insights_model: str = "gpt-4o"):
        self.api_key = api_key
        self.categorization_model = categorization_model
        self.insights_model = insights_model
        self._client = None

    def _get_client(self):
        if self._client is None:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(api_key=self.api_key)
        return self._client

    async def categorize(self, transactions: List[dict]) -> List[AICategorizationResult]:
        raise NotImplementedError("OpenAI categorization implemented in Phase 4")

    async def query(self, question: str, context: dict) -> AIInsightResult:
        raise NotImplementedError("OpenAI insights implemented in Phase 11")
