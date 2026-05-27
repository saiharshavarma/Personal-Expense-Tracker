import json
from typing import List

from services.ai.provider import AIProvider, AICategorizationResult, AIInsightResult

CATEGORIES = [
    "Food & Dining", "Groceries", "Transportation", "Gas & Fuel",
    "Shopping", "Entertainment", "Health & Medical", "Utilities",
    "Housing & Rent", "Insurance", "Travel", "Subscriptions & Software",
    "Education", "Personal Care", "Business & Work", "Investments",
    "Income", "Transfers", "Fees & Charges", "Other",
]

SUBCATEGORY_MAP = {
    "Food & Dining": ["Restaurants", "Fast Food", "Coffee Shops", "Bars & Nightlife", "Food Delivery"],
    "Groceries": ["Supermarket", "Wholesale Club", "Specialty Food"],
    "Transportation": ["Rideshare", "Parking", "Public Transit", "Taxi", "Car Rental"],
    "Gas & Fuel": ["Gas Station", "EV Charging"],
    "Shopping": ["Clothing", "Electronics", "Home & Garden", "Online Shopping", "Department Store"],
    "Entertainment": ["Movies & Streaming", "Music", "Games", "Sports & Recreation", "Arts & Culture"],
    "Health & Medical": ["Doctor", "Pharmacy", "Dental", "Vision", "Fitness & Gym"],
    "Utilities": ["Electricity", "Water", "Internet", "Phone", "Gas"],
    "Housing & Rent": ["Rent", "Mortgage", "Home Maintenance", "Furniture"],
    "Insurance": ["Health Insurance", "Auto Insurance", "Life Insurance", "Home Insurance"],
    "Travel": ["Flights", "Hotels", "Vacation Rentals", "Travel Activities"],
    "Subscriptions & Software": ["Streaming", "Software", "Membership", "News & Media"],
    "Education": ["Tuition", "Books & Supplies", "Online Courses", "Tutoring"],
    "Personal Care": ["Haircut", "Spa & Beauty", "Clothing Care"],
    "Business & Work": ["Office Supplies", "Business Travel", "Professional Services"],
    "Investments": ["Stocks", "Crypto", "Real Estate", "Retirement"],
    "Income": ["Salary", "Freelance", "Interest", "Dividend", "Refund"],
    "Transfers": ["Bank Transfer", "P2P Payment", "Savings Transfer"],
    "Fees & Charges": ["Bank Fee", "Late Fee", "ATM Fee", "Service Charge"],
    "Other": ["Miscellaneous"],
}

SYSTEM_PROMPT = """You are a personal finance transaction categorizer. You will receive a JSON array of transactions with sanitized fields only (no account info, no full names).

For each transaction, return a JSON array with the same number of elements in the same order. Each element must have:
- "id": the transaction id (copy from input)
- "category": one of the provided categories
- "subcategory": a relevant subcategory
- "merchant_clean": a clean, normalized merchant name (e.g. "Starbucks" not "STARBUCKS #1234 CARD 4321")
- "need_want_savings": "need", "want", or "savings"
- "confidence": float 0.0-1.0 (your confidence in this categorization)
- "flags": array of strings, any of: ["recurring", "reimbursable", "work_expense", "large_amount", "unusual"]

Rules:
- needs = rent, groceries, utilities, health, insurance, transportation to work
- wants = dining out, entertainment, shopping, subscriptions, travel
- savings = investments, savings transfers, retirement contributions
- Be conservative with confidence. Use <0.75 if description is ambiguous.
- Use "needs_review" flag if the transaction is unusual or ambiguous.

Respond with ONLY valid JSON, no markdown, no explanation."""


class AnthropicProvider(AIProvider):
    def __init__(self, api_key: str, categorization_model: str = "claude-haiku-4-5-20251001",
                 insights_model: str = "claude-sonnet-4-5"):
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
        if not transactions:
            return []

        client = self._get_client()
        categories_str = ", ".join(f'"{c}"' for c in CATEGORIES)
        user_content = f"Categories: [{categories_str}]\n\nTransactions:\n{json.dumps(transactions, default=str)}"

        message = await client.messages.create(
            model=self.categorization_model,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )

        raw = message.content[0].text.strip()
        # Strip markdown code block if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        results_raw = json.loads(raw)
        results = []
        for item in results_raw:
            results.append(AICategorizationResult(
                transaction_id=str(item.get("id", "")),
                category=item.get("category", "Other"),
                subcategory=item.get("subcategory", ""),
                merchant_clean=item.get("merchant_clean", ""),
                need_want_savings=item.get("need_want_savings", "want"),
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

        message = await client.messages.create(
            model=self.insights_model,
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": user_content}],
        )

        answer = message.content[0].text.strip()
        return AIInsightResult(answer=answer, data_points=[])
