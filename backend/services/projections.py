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

    # Use calendar days elapsed, not the count of distinct spending days.
    # Counting only days-with-transactions understates the elapsed period and
    # inflates the average daily rate (e.g. 12 spending days in a 20-day month
    # would produce a rate 1.67× too high, badly overestimating the projection).
    if target_year == today.year and target_month == today.month:
        days_elapsed = today.day          # current month: days elapsed so far
    else:
        days_elapsed = days_in_month      # past month: full month length

    if days_elapsed == 0:
        avg_daily = Decimal("0")
    else:
        avg_daily = Decimal(str(spent_so_far)) / Decimal(str(days_elapsed))

    days_remaining = days_in_month - days_elapsed
    projected_remaining = avg_daily * Decimal(str(max(days_remaining, 0)))
    projected_total = Decimal(str(spent_so_far)) + projected_remaining

    # A projection based on 1–2 days of data is extremely volatile — a single
    # atypical transaction can swing it by 30×.  Flag it as unreliable so the
    # UI can show a gentler message instead of a misleading dollar figure.
    is_current_month = (target_year == today.year and target_month == today.month)
    projection_reliable = not is_current_month or days_elapsed >= 3

    return {
        "spent_so_far": float(spent_so_far),
        "projected_total": float(projected_total),
        "avg_daily_spend": float(avg_daily),
        "days_elapsed": days_elapsed,
        "days_remaining": days_remaining,
        "days_in_month": days_in_month,
        "projection_reliable": projection_reliable,
    }
