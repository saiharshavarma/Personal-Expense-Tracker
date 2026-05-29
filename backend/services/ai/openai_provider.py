import json
import logging
from typing import List

from services.ai.provider import AIProvider, AICategorizationResult, AIInsightResult
from services.ai.anthropic_provider import CATEGORIES, SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class OpenAIProvider(AIProvider):
    def __init__(self, api_key: str, categorization_model: str = "gpt-4o-mini",
                 insights_model: str = "gpt-4o"):
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
        if not transactions:
            return []

        client = self._get_client()
        categories_str = ", ".join(f'"{c}"' for c in CATEGORIES)
        user_content = f"Categories: [{categories_str}]\n\nTransactions:\n{json.dumps(transactions, default=str)}"

        response = await client.chat.completions.create(
            model=self.categorization_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            response_format={"type": "json_object"},
            max_tokens=4096,
        )

        raw = response.choices[0].message.content.strip()
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.warning("OpenAI categorize: failed to parse JSON response: %s | raw[:200]=%r", exc, raw[:200])
            return []

        # OpenAI json_object mode may wrap the array in a key
        if isinstance(parsed, dict):
            results_raw = (
                parsed.get("transactions")
                or parsed.get("results")
                or (list(parsed.values())[0] if parsed else [])
            )
        else:
            results_raw = parsed

        if not isinstance(results_raw, list):
            logger.warning("OpenAI categorize: unexpected JSON structure, keys=%s", list(parsed.keys()) if isinstance(parsed, dict) else type(parsed))
            return []

        results = []
        for item in results_raw:
            results.append(AICategorizationResult(
                transaction_id=str(item.get("id", "")),
                category=item.get("category", "Other"),
                subcategory=item.get("subcategory", ""),
                merchant_clean=item.get("merchant_clean", ""),
                need_want_savings=item.get("need_want_savings", "want"),
                fixed_variable=item.get("fixed_variable") or None,
                personal_work_shared=item.get("personal_work_shared") or None,
                is_reimbursable=bool(item.get("is_reimbursable", False)),
                is_recurring=bool(item.get("is_recurring", False)),
                suggested_tags=item.get("tags") or [],
                confidence=float(item.get("confidence", 0.5)),
                flags=item.get("flags", []),
            ))
        return results

    async def query(self, question: str, context: dict) -> AIInsightResult:
        client = self._get_client()

        system = """You are a personal finance assistant. You only have access to aggregated statistics —
category totals, percentages, and month-over-month trends. No individual transactions, no merchant names,
no account numbers. Answer the user's financial question based only on the provided context.
Be concise, specific, and actionable."""

        user_content = f"Financial context (aggregated stats only):\n{json.dumps(context, indent=2)}\n\nQuestion: {question}"

        response = await client.chat.completions.create(
            model=self.insights_model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
            max_tokens=1024,
        )

        answer = response.choices[0].message.content.strip()
        return AIInsightResult(answer=answer, data_points=[])
