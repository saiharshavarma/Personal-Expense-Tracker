import uuid
from typing import Optional
from decimal import Decimal
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, and_, func, extract
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth import get_current_user
from db.database import get_db
from db.models import Budget, Transaction, UserPreferences

router = APIRouter(tags=["budgets"])


class BudgetCreate(BaseModel):
    month: int
    year: int
    category: str
    subcategory: Optional[str] = None
    budget_amount: Decimal
    needs_pct: Optional[Decimal] = None
    wants_pct: Optional[Decimal] = None
    savings_pct: Optional[Decimal] = None


class BudgetUpdate(BaseModel):
    budget_amount: Optional[Decimal] = None
    needs_pct: Optional[Decimal] = None
    wants_pct: Optional[Decimal] = None
    savings_pct: Optional[Decimal] = None


def _serialize(b: Budget) -> dict:
    return {
        "id": str(b.id),
        "month": b.month,
        "year": b.year,
        "category": b.category,
        "subcategory": b.subcategory,
        "budget_amount": float(b.budget_amount),
        "needs_pct": float(b.needs_pct) if b.needs_pct else None,
        "wants_pct": float(b.wants_pct) if b.wants_pct else None,
        "savings_pct": float(b.savings_pct) if b.savings_pct else None,
    }


@router.get("")
async def list_budgets(
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Budget)
    if month:
        q = q.where(Budget.month == month)
    if year:
        q = q.where(Budget.year == year)
    result = await db.execute(q.order_by(Budget.category, Budget.subcategory))
    return [_serialize(b) for b in result.scalars().all()]


@router.post("", status_code=201)
async def create_budget(
    body: BudgetCreate,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Explicit duplicate check (handles NULL subcategory case where DB constraint may not fire)
    q = select(Budget).where(
        and_(
            Budget.month == body.month,
            Budget.year == body.year,
            Budget.category == body.category,
            Budget.subcategory == body.subcategory if body.subcategory else Budget.subcategory.is_(None),
        )
    )
    existing = await db.execute(q)
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail=f"Budget for {body.category}"
                   + (f" › {body.subcategory}" if body.subcategory else "")
                   + " already exists for this month",
        )
    b = Budget(**body.model_dump())
    db.add(b)
    try:
        await db.commit()
        await db.refresh(b)
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Budget already exists for this month/year/category")
    return _serialize(b)


@router.put("/preferences")
async def update_budget_preferences(
    body: dict,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the 50/30/20 rule percentages stored in user_preferences."""
    from datetime import datetime
    needs = body.get("needs", 50)
    wants = body.get("wants", 30)
    savings = body.get("savings", 20)
    if abs(needs + wants + savings - 100) > 0.1:
        raise HTTPException(status_code=400, detail="needs + wants + savings must equal 100")

    result = await db.execute(select(UserPreferences).where(UserPreferences.id == 1))
    prefs = result.scalar_one_or_none()
    if prefs:
        prefs.default_budget_rule = {"needs": needs, "wants": wants, "savings": savings}
        prefs.updated_at = datetime.utcnow()
        await db.commit()
    return {"needs": needs, "wants": wants, "savings": savings}


@router.put("/{budget_id}")
async def update_budget(
    budget_id: uuid.UUID,
    body: BudgetUpdate,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    b = await db.get(Budget, budget_id)
    if not b:
        raise HTTPException(status_code=404, detail="Budget not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(b, k, v)
    await db.commit()
    await db.refresh(b)
    return _serialize(b)


@router.delete("/{budget_id}", status_code=204)
async def delete_budget(
    budget_id: uuid.UUID,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    b = await db.get(Budget, budget_id)
    if not b:
        raise HTTPException(status_code=404, detail="Budget not found")
    await db.delete(b)
    await db.commit()


@router.post("/copy-previous-month")
async def copy_previous_month(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(...),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    prev_month = month - 1 if month > 1 else 12
    prev_year = year if month > 1 else year - 1

    result = await db.execute(
        select(Budget).where(and_(Budget.month == prev_month, Budget.year == prev_year))
    )
    source_budgets = result.scalars().all()
    if not source_budgets:
        raise HTTPException(status_code=404, detail="No budgets found for previous month")

    created = 0
    for src in source_budgets:
        # Check if this (category, subcategory) already exists for target month
        sub_filter = (
            Budget.subcategory == src.subcategory
            if src.subcategory
            else Budget.subcategory.is_(None)
        )
        exists = await db.execute(
            select(Budget).where(
                and_(Budget.month == month, Budget.year == year,
                     Budget.category == src.category, sub_filter)
            )
        )
        if exists.scalar_one_or_none():
            continue
        new_budget = Budget(
            month=month, year=year, category=src.category, subcategory=src.subcategory,
            budget_amount=src.budget_amount,
            needs_pct=src.needs_pct, wants_pct=src.wants_pct, savings_pct=src.savings_pct,
        )
        db.add(new_budget)
        created += 1

    await db.commit()
    return {"created": created, "month": month, "year": year}


@router.get("/actuals")
async def get_actuals(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(...),
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return budget vs actual spending for each budget row in the given month.
    Category-level budgets compare against total category spending.
    Subcategory-level budgets compare against spending in that specific subcategory.
    Also returns 50/30/20 rule summary using user's custom percentages.
    """
    # ── Fetch all budgets for this month ──────────────────────────────────────
    budget_result = await db.execute(
        select(Budget).where(and_(Budget.month == month, Budget.year == year))
    )
    all_budgets = budget_result.scalars().all()

    # ── Aggregate spending by (category, subcategory) ────────────────────────
    spending_result = await db.execute(
        select(
            Transaction.category,
            Transaction.subcategory,
            func.sum(Transaction.amount).label("gross_spend"),
            func.sum(Transaction.received_reimbursement).label("total_reimbursed"),
        )
        .where(
            and_(
                extract("month", Transaction.date) == month,
                extract("year", Transaction.date) == year,
                Transaction.direction == "debit",
                Transaction.category.isnot(None),
                Transaction.category != "",
            )
        )
        .group_by(Transaction.category, Transaction.subcategory)
    )

    # Build two lookups: by (cat, sub) and by cat only (summed across all subcategories)
    spending_by_cat_sub: dict[tuple, dict] = {}
    spending_by_cat: dict[str, dict] = {}

    for row in spending_result:
        cat = row.category
        sub = row.subcategory
        amt = float(row.gross_spend or 0)
        reimb = float(row.total_reimbursed or 0)

        spending_by_cat_sub[(cat, sub)] = {"gross": amt, "reimbursed": reimb}

        if cat not in spending_by_cat:
            spending_by_cat[cat] = {"gross": 0.0, "reimbursed": 0.0}
        spending_by_cat[cat]["gross"] += amt
        spending_by_cat[cat]["reimbursed"] += reimb

    # ── Build rows ────────────────────────────────────────────────────────────
    rows = []
    seen_pairs: set[tuple] = set()
    total_budget = 0.0
    total_gross = 0.0
    total_reimbursed = 0.0

    # Rows from budgets (category-level and subcategory-level)
    for b in all_budgets:
        cat = b.category
        sub = b.subcategory
        seen_pairs.add((cat, sub))

        if sub:
            actual = spending_by_cat_sub.get((cat, sub), {})
        else:
            actual = spending_by_cat.get(cat, {})

        gross = actual.get("gross", 0.0)
        reimbursed = actual.get("reimbursed", 0.0)
        net = gross - reimbursed
        budget_amount = float(b.budget_amount)
        remaining = budget_amount - net
        pct_used = (net / budget_amount * 100) if budget_amount > 0 else 0.0

        if pct_used >= 100:
            status = "over"
        elif pct_used >= 80:
            status = "watch"
        else:
            status = "safe"

        rows.append({
            "id": str(b.id),
            "category": cat,
            "subcategory": sub,
            "budget_amount": budget_amount,
            "gross_spend": round(gross, 2),
            "reimbursed": round(reimbursed, 2),
            "net_personal": round(net, 2),
            "remaining": round(remaining, 2),
            "pct_used": round(pct_used, 1),
            "status": status,
        })

        total_budget += budget_amount
        total_gross += gross
        total_reimbursed += reimbursed

    # Rows for unbudgeted categories (have spending but no category-level budget)
    for cat in sorted(spending_by_cat.keys()):
        if (cat, None) not in seen_pairs:
            actual = spending_by_cat[cat]
            gross = actual["gross"]
            reimbursed = actual["reimbursed"]
            net = gross - reimbursed
            rows.append({
                "id": None,
                "category": cat,
                "subcategory": None,
                "budget_amount": 0.0,
                "gross_spend": round(gross, 2),
                "reimbursed": round(reimbursed, 2),
                "net_personal": round(net, 2),
                "remaining": 0.0,
                "pct_used": 0.0,
                "status": "safe",
            })
            # Don't double-count in totals (already counted via budget rows if budgeted)
            total_gross += gross
            total_reimbursed += reimbursed

    # Sort: primary = category, secondary = subcategory (None first = category row before sub-rows)
    rows.sort(key=lambda r: (r["category"], r["subcategory"] or ""))

    total_net = total_gross - total_reimbursed

    # ── Income for this month ─────────────────────────────────────────────────
    # Income = credit-direction transactions excluding inter-account transfers.
    # This is the denominator for the 50/30/20 rule (% of take-home pay).
    # Priority: transactions tagged as Income category; fall back to all credits.

    # 1) Try Income-categorised credits first
    income_cat_result = await db.execute(
        select(func.sum(Transaction.amount).label("total"))
        .where(
            and_(
                extract("month", Transaction.date) == month,
                extract("year", Transaction.date) == year,
                Transaction.direction == "credit",
                Transaction.category == "Income",
            )
        )
    )
    income_tagged = float(income_cat_result.scalar() or 0)

    # 2) Fall back to all credit transactions that aren't transfers
    income_all_result = await db.execute(
        select(func.sum(Transaction.amount).label("total"))
        .where(
            and_(
                extract("month", Transaction.date) == month,
                extract("year", Transaction.date) == year,
                Transaction.direction == "credit",
                Transaction.category.notin_(["Transfer", "Financial"]),
            )
        )
    )
    income_all = float(income_all_result.scalar() or 0)

    income_this_month = income_tagged if income_tagged > 0 else income_all
    income_source = (
        "income_category" if income_tagged > 0
        else "all_credits" if income_all > 0
        else "none"
    )

    # ── 50/30/20 breakdown ────────────────────────────────────────────────────
    nws_result = await db.execute(
        select(
            Transaction.need_want_savings,
            func.sum(Transaction.amount).label("total"),
        )
        .where(
            and_(
                extract("month", Transaction.date) == month,
                extract("year", Transaction.date) == year,
                Transaction.direction == "debit",
                Transaction.need_want_savings.isnot(None),
            )
        )
        .group_by(Transaction.need_want_savings)
    )
    nws_map = {row.need_want_savings: float(row.total or 0) for row in nws_result}

    # Get user's custom budget rule targets
    prefs_result = await db.execute(select(UserPreferences).where(UserPreferences.id == 1))
    prefs = prefs_result.scalar_one_or_none()
    budget_rule = (prefs.default_budget_rule or {}) if prefs else {}
    needs_target = float(budget_rule.get("needs", 50))
    wants_target = float(budget_rule.get("wants", 30))
    savings_target = float(budget_rule.get("savings", 20))

    # Target amounts in dollars: target_pct % of income
    def target_amt(pct: float) -> float:
        return round(income_this_month * pct / 100, 2) if income_this_month > 0 else 0.0

    nws_summary = {
        "income": round(income_this_month, 2),
        "income_source": income_source,  # "income_category" | "all_credits" | "none"
        "needs": {
            "spent": round(nws_map.get("need", 0.0), 2),
            "target_pct": needs_target,
            "target_amount": target_amt(needs_target),
        },
        "wants": {
            "spent": round(nws_map.get("want", 0.0), 2),
            "target_pct": wants_target,
            "target_amount": target_amt(wants_target),
        },
        "savings": {
            "spent": round(nws_map.get("savings", 0.0), 2),
            "target_pct": savings_target,
            "target_amount": target_amt(savings_target),
        },
    }

    return {
        "month": month,
        "year": year,
        "rows": rows,
        "totals": {
            "budget": round(total_budget, 2),
            "gross_spend": round(total_gross, 2),
            "reimbursed": round(total_reimbursed, 2),
            "net_personal": round(total_net, 2),
            "remaining": round(total_budget - total_net, 2),
        },
        "nws_summary": nws_summary,
    }
