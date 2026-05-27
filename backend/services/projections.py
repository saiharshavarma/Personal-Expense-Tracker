from datetime import date
from decimal import Decimal
from typing import List
import calendar


def calculate_month_end_projection(
    daily_spend: List[dict],  # [{"date": date, "amount": Decimal}]
    target_month: int,
    target_year: int,
) -> dict:
    """
    Linear extrapolation — no AI.
    Uses average daily spend so far this month to project EOM total.
    """
    today = date.today()
    days_in_month = calendar.monthrange(target_year, target_month)[1]

    spent_so_far = sum(d["amount"] for d in daily_spend)
    days_elapsed = len(daily_spend) if daily_spend else max(today.day, 1)

    if days_elapsed == 0:
        avg_daily = Decimal("0")
    else:
        avg_daily = Decimal(str(spent_so_far)) / Decimal(str(days_elapsed))

    days_remaining = days_in_month - days_elapsed
    projected_remaining = avg_daily * Decimal(str(max(days_remaining, 0)))
    projected_total = Decimal(str(spent_so_far)) + projected_remaining

    return {
        "spent_so_far": float(spent_so_far),
        "projected_total": float(projected_total),
        "avg_daily_spend": float(avg_daily),
        "days_elapsed": days_elapsed,
        "days_remaining": days_remaining,
        "days_in_month": days_in_month,
    }
