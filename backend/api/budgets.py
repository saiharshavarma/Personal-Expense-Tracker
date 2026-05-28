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
    result = await db.execute(q.order_by(Budget.category))
    return [_serialize(b) for b in result.scalars().all()]


@router.post("", status_code=201)
async def create_budget(
    body: BudgetCreate,
    _user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    b = Budget(**body.model_dump())
    db.add(b)
    try:
        await db.commit()
        await db.refresh(b)
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Budget for this month/year/category already exists")
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
        exists = await db.execute(
            select(Budget).where(and_(Budget.month == month, Budget.year == year, Budget.category == src.category))
        )
        if exists.scalar_one_or_none():
            continue
        new_budget = Budget(
            month=month, year=year, category=src.category,
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
    Return budget vs actual spending for each category in the given month.
    Also returns 50/30/20 rule summary using user's custom percentages.
    """
    # Fetch budgets for this month
    budget_result = await db.execute(
        select(Budget).where(and_(Budget.month == month, Budget.year == year))
    )
    budgets = {b.category: b for b in budget_result.scalars().all()}

    # Aggregate actual spending by category for this month
    spending_result = await db.execute(
        select(
            Transaction.category,
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
        .group_by(Transaction.category)
    )
    actuals: dict[str, dict] = {}
    for row in spending_result:
        actuals[row.category] = {
            "gross_spend": float(row.gross_spend or 0),
            "reimbursed": float(row.total_reimbursed or 0),
        }

    # Merge budgets + actuals — include all categories from either source
    all_categories = sorted(set(list(budgets.keys()) + list(actuals.keys())))
    rows = []
    total_budget = 0.0
    total_gross = 0.0
    total_reimbursed = 0.0

    for cat in all_categories:
        budget_amount = float(budgets[cat].budget_amount) if cat in budgets else 0.0
        gross = actuals.get(cat, {}).get("gross_spend", 0.0)
        reimbursed = actuals.get(cat, {}).get("reimbursed", 0.0)
        net = gross - reimbursed
        remaining = budget_amount - net
        pct_used = (net / budget_amount * 100) if budget_amount > 0 else 0.0

        if pct_used >= 100:
            status = "over"
        elif pct_used >= 80:
            status = "watch"
        else:
            status = "safe"

        rows.append({
            "id": str(budgets[cat].id) if cat in budgets else None,
            "category": cat,
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

    total_net = total_gross - total_reimbursed

    # 50/30/20 breakdown: sum by need_want_savings
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

    total_income_est = total_net  # fallback; ideally from income_schedules
    nws_summary = {
        "needs": {
            "spent": round(nws_map.get("need", 0.0), 2),
            "target_pct": needs_target,
        },
        "wants": {
            "spent": round(nws_map.get("want", 0.0), 2),
            "target_pct": wants_target,
        },
        "savings": {
            "spent": round(nws_map.get("savings", 0.0), 2),
            "target_pct": savings_target,
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
