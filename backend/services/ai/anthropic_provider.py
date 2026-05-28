import json
from typing import List

from services.ai.provider import AIProvider, AICategorizationResult, AIInsightResult

# ── Canonical taxonomy — must stay in sync with frontend/src/lib/categories.ts ──
# These are the ONLY valid category/subcategory values.  The AI must pick from
# exactly this list so stored values always match what the UI renders.

CATEGORY_MAP = {
    "Food & Dining":    ["Groceries", "Restaurants", "Fast Food", "Coffee & Tea", "Food Delivery", "Alcohol & Bars", "Specialty Food"],
    "Transportation":   ["Gas & Fuel", "Parking", "Rideshare / Taxi", "Public Transit", "Car Rental", "Auto Maintenance", "Auto Insurance", "Car Wash", "Tolls"],
    "Housing":          ["Rent / Mortgage", "Property Tax", "Home Insurance", "HOA Fees", "Furniture & Decor", "Home Improvement", "Cleaning & Maintenance", "Lawn & Garden"],
    "Utilities":        ["Electricity", "Gas / Heat", "Water", "Trash & Recycling", "Internet", "Mobile Phone", "Cable / Satellite"],
    "Entertainment":    ["Movies & Concerts", "Sports & Recreation", "Video Games", "Hobbies", "Books & Magazines", "Amusement Parks", "Night Out"],
    "Shopping":         ["Clothing & Apparel", "Electronics", "Home Goods", "Beauty & Personal Care", "Baby & Kids", "Gifts", "Online Shopping"],
    "Health & Medical": ["Doctor Visit", "Dentist", "Pharmacy", "Gym & Fitness", "Mental Health", "Eye Care", "Health Insurance", "Vitamins & Supplements"],
    "Travel":           ["Airfare", "Hotels & Lodging", "Vacation Rentals", "Car Rental", "Cruise", "Travel Insurance", "Baggage & Fees"],
    "Business & Work":  ["Office Supplies", "Software & SaaS", "Professional Services", "Business Travel", "Client Entertainment", "Conferences & Events", "Coworking"],
    "Education":        ["Tuition", "Books & Supplies", "Online Courses", "Tutoring", "School Fees"],
    "Subscriptions":    ["Streaming Video", "Streaming Music", "News & Media", "Cloud Storage", "Productivity Tools", "Security & VPN", "Other Subscription"],
    "Financial":        ["Bank Fees", "Interest Charges", "Life Insurance", "Investment Purchase", "Savings Transfer", "Taxes", "Loan Payment"],
    "Personal":         ["Donations & Charity", "Gifts Given", "Pet Care", "Child Care", "Haircut & Grooming", "Lottery / Gambling"],
    "Income":           ["Salary / Paycheck", "Freelance", "Investment Returns", "Refund", "Reimbursement Received", "Rental Income", "Other Income"],
    "Transfer":         ["Bank Transfer", "Credit Card Payment", "Peer Payment (Venmo etc)", "Internal Transfer"],
    "Other":            ["Miscellaneous", "Unknown"],
}

CATEGORIES = list(CATEGORY_MAP.keys())  # kept for OpenAI provider compat

# Build a readable taxonomy block for the system prompt
def _taxonomy_block() -> str:
    lines = ["Category → valid subcategories:"]
    for cat, subs in CATEGORY_MAP.items():
        lines.append(f'  "{cat}": {[s for s in subs]}')
    return "\n".join(lines)

SYSTEM_PROMPT = f"""You are a personal finance transaction categorizer. You will receive a JSON array of transactions with sanitized fields only (no account info, no full names).

For each transaction, return a JSON array with the same number of elements in the same order. Each element must have:
- "id": the transaction id (copy from input)
- "category": exactly one of the category names below
- "subcategory": exactly one of the valid subcategories for that category (see taxonomy — NEVER use a value not listed)
- "merchant_clean": a clean, normalized merchant name (e.g. "Netflix" not "NETFLIX.COM")
- "need_want_savings": "need", "want", or "savings"
- "fixed_variable": "fixed" if the amount is the same every period (rent, subscriptions, loan payments), "variable" otherwise
- "personal_work_shared": "work" if clearly a business expense, "personal" for personal spending, "shared" if it could be either
- "is_reimbursable": true if this looks like a work/business expense that should be reimbursed, false otherwise
- "is_recurring": true if this is a known recurring charge (subscriptions, utilities, rent, loan payments), false otherwise
- "tags": array of 0-3 short descriptive tags, e.g. ["subscription", "software"], ["travel", "work"], [] for none
- "confidence": float 0.0-1.0 (your confidence in this categorization)
- "flags": array of zero or more strings from: ["recurring", "reimbursable", "work_expense", "large_amount", "unusual"]

Taxonomy (you MUST pick category AND subcategory from these exact strings):
{_taxonomy_block()}

Classification rules:
- need = rent, groceries, utilities, health, insurance, commuting
- want = dining out, entertainment, shopping, subscriptions, travel, personal care
- savings = investments, savings transfers, retirement
- fixed = same amount each period: rent, mortgage, loan payments, most subscriptions, insurance
- variable = amount changes: groceries, dining, gas, shopping, entertainment
- Be conservative with confidence — use <0.75 if the description is ambiguous.
- Netflix/Spotify/Hulu → Subscriptions / Streaming Video, fixed, recurring=true
- Amazon/eBay/Walmart → Shopping / Online Shopping (unless clearly food/pharmacy)
- Uber/Lyft → Transportation / Rideshare / Taxi
- Airline/hotel/conference fees → personal_work_shared="work", is_reimbursable=true if description suggests business travel

Respond with ONLY a valid JSON array, no markdown, no explanation."""


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

        message = await client.messages.create(
            model=self.insights_model,
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": user_content}],
        )

        answer = message.content[0].text.strip()
        return AIInsightResult(answer=answer, data_points=[])
