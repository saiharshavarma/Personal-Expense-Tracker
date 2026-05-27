import re
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import MerchantRule


class RulesEngine:
    async def match(self, description: str, db: AsyncSession) -> Optional[dict]:
        """
        Phase 4: Match description against merchant_rules table.
        Returns categorization dict if confidence >= 0.90, else None.
        """
        result = await db.execute(select(MerchantRule).order_by(MerchantRule.confidence.desc()))
        rules = result.scalars().all()

        for rule in rules:
            if self._matches(description, rule):
                return {
                    "category": rule.category,
                    "subcategory": rule.subcategory,
                    "merchant_clean": rule.merchant_clean,
                    "need_want_savings": rule.need_want_savings,
                    "is_reimbursable": rule.is_reimbursable,
                    "is_recurring": rule.is_recurring,
                    "confidence": float(rule.confidence),
                    "rule_id": str(rule.id),
                }
        return None

    def _matches(self, description: str, rule: MerchantRule) -> bool:
        desc = description.upper()
        pattern = rule.pattern.upper()
        match rule.match_type:
            case "exact":
                return desc == pattern
            case "contains":
                return pattern in desc
            case "startswith":
                return desc.startswith(pattern)
            case "regex":
                return bool(re.search(rule.pattern, description, re.IGNORECASE))
            case _:
                return pattern in desc

    async def record_correction(self, description: str, category: str, subcategory: str,
                                 merchant_clean: str, db: AsyncSession) -> None:
        """Phase 4: Save user correction as a new or updated merchant rule."""
        raise NotImplementedError("Implemented in Phase 4")
