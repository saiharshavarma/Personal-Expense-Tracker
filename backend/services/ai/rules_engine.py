import re
from decimal import Decimal
from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import MerchantRule


class RulesEngine:
    async def load_rules(self, db: AsyncSession) -> List[MerchantRule]:
        """
        Load all merchant rules from the DB once, ordered by confidence descending.
        Call this once per batch and pass the result to match_cached() to avoid
        an N×1 SELECT pattern when matching many transactions.
        """
        result = await db.execute(
            # Primary: confidence DESC (highest-confidence rules win).
            # Secondary: created_at ASC so that when two rules tie on confidence,
            # the older (typically user-created) rule fires first — deterministic.
            select(MerchantRule).order_by(
                MerchantRule.confidence.desc(),
                MerchantRule.created_at.asc(),
            )
        )
        return result.scalars().all()

    def match_cached(self, description: str, rules: List[MerchantRule]) -> Optional[dict]:
        """
        Match description against a pre-loaded list of rules (sync, no DB call).
        First match wins (rules ordered by confidence desc at load time).
        """
        for rule in rules:
            if self._matches(description, rule):
                return {
                    "category": rule.category,
                    "subcategory": rule.subcategory,
                    "merchant_clean": rule.merchant_clean,
                    "need_want_savings": rule.need_want_savings,
                    "fixed_variable": rule.fixed_variable,
                    "is_reimbursable": rule.is_reimbursable,
                    "personal_work_shared": rule.personal_work_shared,
                    "is_recurring": rule.is_recurring,
                    "tags": rule.tags or [],
                    "confidence": float(rule.confidence),
                    "rule_id": str(rule.id),
                }
        return None

    async def match(self, description: str, db: AsyncSession) -> Optional[dict]:
        """
        Single-transaction convenience wrapper — loads rules from DB then matches.
        For batch processing prefer load_rules() + match_cached() to avoid N×1 queries.
        """
        rules = await self.load_rules(db)
        return self.match_cached(description, rules)

    def _matches(self, description: str, rule: MerchantRule) -> bool:
        desc = description.upper()
        pattern = rule.pattern.upper()
        match_type = rule.match_type or "contains"
        match match_type:
            case "exact":
                return desc == pattern
            case "contains":
                return pattern in desc
            case "startswith":
                return desc.startswith(pattern)
            case "regex":
                try:
                    return bool(re.search(rule.pattern, description, re.IGNORECASE))
                except re.error:
                    # Invalid regex stored in DB — skip rather than crash
                    return False
            case _:
                return pattern in desc

    async def record_correction(
        self,
        description: str,
        category: str,
        subcategory: str,
        merchant_clean: str,
        db: AsyncSession,
        need_want_savings: Optional[str] = None,
        fixed_variable: Optional[str] = None,
        personal_work_shared: Optional[str] = None,
        is_reimbursable: bool = False,
        is_recurring: bool = False,
        tags: Optional[List[str]] = None,
    ) -> None:
        """
        Save a user correction as a merchant rule so future matches auto-apply.
        If a rule for this description already exists, update it.
        Otherwise create a new 'contains' rule with confidence=1.0.
        """
        from datetime import datetime

        # Normalise: use uppercase, strip common noise
        pattern = description.strip().upper()
        # Shorten to first meaningful chunk (before digits/card suffix)
        pattern = re.split(r"\s+\d{4,}", pattern)[0].strip()
        if not pattern:
            return

        # Check for existing rule with the same pattern
        result = await db.execute(
            select(MerchantRule).where(MerchantRule.pattern == pattern)
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.category = category
            existing.subcategory = subcategory
            existing.merchant_clean = merchant_clean
            if need_want_savings:
                existing.need_want_savings = need_want_savings
            if fixed_variable is not None:
                existing.fixed_variable = fixed_variable
            if personal_work_shared is not None:
                existing.personal_work_shared = personal_work_shared
            existing.is_reimbursable = is_reimbursable
            existing.is_recurring = is_recurring
            if tags is not None:
                existing.tags = tags
            existing.times_applied = (existing.times_applied or 0) + 1
            existing.confidence = Decimal("1.000")
            existing.updated_at = datetime.utcnow()
        else:
            new_rule = MerchantRule(
                pattern=pattern,
                match_type="contains",
                merchant_clean=merchant_clean,
                category=category,
                subcategory=subcategory,
                need_want_savings=need_want_savings,
                fixed_variable=fixed_variable,
                personal_work_shared=personal_work_shared,
                is_reimbursable=is_reimbursable,
                is_recurring=is_recurring,
                tags=tags or [],
                confidence=Decimal("1.000"),
                times_applied=1,
                times_overridden=0,
            )
            db.add(new_rule)

        await db.flush()
