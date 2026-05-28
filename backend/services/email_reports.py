"""
Email Reports Service
---------------------
Sends monthly spending summaries and expense-upload reminders.
Email settings are stored in user_preferences.dashboard_layout under key "email_reports".

Schema:
{
  "email_reports": {
    "enabled": true,
    "report_email": "you@example.com",
    "report_day": 1,         # day of month to send monthly summary
    "reminder_enabled": true,
    "reminder_day": 28,      # day of month to remind uploading expenses
    "smtp_host": "smtp.gmail.com",
    "smtp_port": 587,
    "smtp_user": "you@gmail.com",
    "smtp_password": "xxxx",  # Use an App Password for Gmail
    "use_tls": true,
    "last_report_month": null,  # "2026-05" — prevents double-sending
    "last_reminder_month": null,
  }
}
"""

import asyncio
import smtplib
import logging
from datetime import datetime, date
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

from sqlalchemy import select, func, extract, and_
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from config import settings as app_settings

logger = logging.getLogger(__name__)

_SCHEDULER_RUNNING = False


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_email_settings(prefs) -> Optional[dict]:
    """Extract email_reports dict from dashboard_layout JSON."""
    if not prefs or not prefs.dashboard_layout:
        return None
    return prefs.dashboard_layout.get("email_reports")


def _month_key(dt: date) -> str:
    return f"{dt.year}-{dt.month:02d}"


def _send_smtp(cfg: dict, subject: str, body_html: str, body_text: str) -> None:
    """Blocking SMTP send — run in executor."""
    host = cfg.get("smtp_host", "")
    port = int(cfg.get("smtp_port", 587))
    user = cfg.get("smtp_user", "")
    password = cfg.get("smtp_password", "")
    use_tls = cfg.get("use_tls", True)
    to_addr = cfg.get("report_email", "")

    if not all([host, user, password, to_addr]):
        raise ValueError("Incomplete SMTP configuration")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Fintrack <{user}>"
    msg["To"] = to_addr

    msg.attach(MIMEText(body_text, "plain"))
    msg.attach(MIMEText(body_html, "html"))

    with smtplib.SMTP(host, port, timeout=15) as smtp:
        smtp.ehlo()
        if use_tls:
            smtp.starttls()
            smtp.ehlo()
        smtp.login(user, password)
        smtp.sendmail(user, [to_addr], msg.as_string())


# ── Email templates ───────────────────────────────────────────────────────────

def _report_html(month_name: str, year: int, rows: list, totals: dict) -> str:
    rows_html = ""
    for row in rows[:15]:  # cap at 15 categories
        pct = row.get("pct_used", 0)
        color = "#ef4444" if pct >= 100 else "#f59e0b" if pct >= 80 else "#22c55e"
        rows_html += f"""
        <tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">{row['category']}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">${row['net_personal']:,.2f}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">${row['budget_amount']:,.2f}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:center;color:{color};font-weight:600;">{pct:.0f}%</td>
        </tr>"""

    return f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#3b82f6,#6366f1);padding:32px 32px 24px;">
      <div style="font-size:32px;margin-bottom:8px;">🪙</div>
      <h1 style="margin:0;color:white;font-size:22px;font-weight:700;">
        {month_name} {year} — Finance Summary
      </h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Your monthly spending report from Fintrack</p>
    </div>

    <!-- Totals -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#f3f4f6;border-bottom:1px solid #f3f4f6;">
      <div style="background:white;padding:20px 24px;">
        <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Total Budget</div>
        <div style="font-size:22px;font-weight:700;color:#111827;">${totals.get('budget',0):,.2f}</div>
      </div>
      <div style="background:white;padding:20px 24px;">
        <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Net Spent</div>
        <div style="font-size:22px;font-weight:700;color:{'#ef4444' if totals.get('net_personal',0)>totals.get('budget',0) else '#111827'};">${totals.get('net_personal',0):,.2f}</div>
      </div>
      <div style="background:white;padding:20px 24px;">
        <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Reimbursed</div>
        <div style="font-size:22px;font-weight:700;color:#6b7280;">${totals.get('reimbursed',0):,.2f}</div>
      </div>
      <div style="background:white;padding:20px 24px;">
        <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Remaining</div>
        <div style="font-size:22px;font-weight:700;color:{'#22c55e' if totals.get('remaining',0)>=0 else '#ef4444'};">${totals.get('remaining',0):,.2f}</div>
      </div>
    </div>

    <!-- Category table -->
    <div style="padding:24px 0;">
      <h2 style="margin:0 24px 12px;font-size:16px;font-weight:600;color:#111827;">Category Breakdown</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:600;">Category</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:600;">Spent</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:600;">Budget</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6b7280;text-transform:uppercase;font-weight:600;">Used</th>
          </tr>
        </thead>
        <tbody>{rows_html}</tbody>
      </table>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;padding:20px 32px;text-align:center;border-top:1px solid #f3f4f6;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">
        Sent by <strong>Fintrack</strong> — your local finance dashboard 🪙<br>
        All data stays on your machine. <a href="http://localhost:3000" style="color:#6366f1;">Open Dashboard →</a>
      </p>
    </div>
  </div>
</body>
</html>"""


def _reminder_html(month_name: str, year: int) -> str:
    return f"""
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#f59e0b,#f97316);padding:32px;">
      <div style="font-size:40px;margin-bottom:8px;">📥</div>
      <h1 style="margin:0;color:white;font-size:20px;font-weight:700;">Time to upload expenses!</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">
        {month_name} is wrapping up — don't forget to import your bank statements.
      </p>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 16px;color:#374151;font-size:15px;">Here's what to do:</p>
      <ol style="margin:0;padding-left:20px;color:#374151;font-size:14px;line-height:1.8;">
        <li>Download your bank/credit card statements as PDFs</li>
        <li>Open Fintrack → <strong>Import</strong></li>
        <li>Drop the files in and let AI handle the rest</li>
      </ol>
      <div style="margin-top:24px;text-align:center;">
        <a href="http://localhost:3000/import"
           style="display:inline-block;background:#f59e0b;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
          Go to Import →
        </a>
      </div>
    </div>
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #f3f4f6;text-align:center;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">Fintrack — your local finance dashboard 🪙</p>
    </div>
  </div>
</body>
</html>"""


# ── Data fetching ─────────────────────────────────────────────────────────────

async def _fetch_report_data(db: AsyncSession, month: int, year: int) -> tuple[list, dict]:
    """Fetch budget vs actual data for the report email."""
    from db.models import Budget, Transaction

    budget_result = await db.execute(
        select(Budget).where(and_(Budget.month == month, Budget.year == year))
    )
    budgets = {b.category: b for b in budget_result.scalars().all()}

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
            )
        )
        .group_by(Transaction.category)
    )
    actuals = {}
    for row in spending_result:
        actuals[row.category] = {
            "gross": float(row.gross_spend or 0),
            "reimbursed": float(row.total_reimbursed or 0),
        }

    all_cats = sorted(set(list(budgets.keys()) + list(actuals.keys())))
    rows = []
    total_budget = total_gross = total_reimb = 0.0

    for cat in all_cats:
        budget_amt = float(budgets[cat].budget_amount) if cat in budgets else 0.0
        gross = actuals.get(cat, {}).get("gross", 0.0)
        reimb = actuals.get(cat, {}).get("reimbursed", 0.0)
        net = gross - reimb
        pct = (net / budget_amt * 100) if budget_amt > 0 else 0
        rows.append({
            "category": cat,
            "budget_amount": budget_amt,
            "gross_spend": gross,
            "reimbursed": reimb,
            "net_personal": net,
            "pct_used": pct,
        })
        total_budget += budget_amt
        total_gross += gross
        total_reimb += reimb

    totals = {
        "budget": total_budget,
        "gross_spend": total_gross,
        "reimbursed": total_reimb,
        "net_personal": total_gross - total_reimb,
        "remaining": total_budget - (total_gross - total_reimb),
    }
    rows.sort(key=lambda r: r["net_personal"], reverse=True)
    return rows, totals


# ── Send functions ────────────────────────────────────────────────────────────

async def send_monthly_report(db: AsyncSession, cfg: dict, month: int, year: int) -> None:
    """Build and send the monthly report."""
    month_names = ["", "January","February","March","April","May","June",
                   "July","August","September","October","November","December"]
    mname = month_names[month]

    rows, totals = await _fetch_report_data(db, month, year)

    subject = f"Fintrack — {mname} {year} Finance Report"
    body_html = _report_html(mname, year, rows, totals)
    body_text = (
        f"Fintrack Monthly Report — {mname} {year}\n\n"
        f"Total Budget: ${totals['budget']:,.2f}\n"
        f"Net Spent:    ${totals['net_personal']:,.2f}\n"
        f"Remaining:    ${totals['remaining']:,.2f}\n\n"
        "Open your dashboard for the full breakdown: http://localhost:3000/budget"
    )

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _send_smtp, cfg, subject, body_html, body_text)
    logger.info(f"Monthly report sent to {cfg.get('report_email')} for {mname} {year}")


async def send_reminder(cfg: dict, month: int, year: int) -> None:
    """Send the expense upload reminder."""
    month_names = ["", "January","February","March","April","May","June",
                   "July","August","September","October","November","December"]
    mname = month_names[month]

    subject = f"Fintrack — Time to upload your {mname} expenses!"
    body_html = _reminder_html(mname, year)
    body_text = (
        f"Hey! Don't forget to upload your {mname} bank statements to Fintrack.\n\n"
        "Go to: http://localhost:3000/import"
    )

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _send_smtp, cfg, subject, body_html, body_text)
    logger.info(f"Reminder sent to {cfg.get('report_email')} for {mname} {year}")


# ── Daily scheduler ───────────────────────────────────────────────────────────

async def _scheduler_loop():
    """Runs daily, checks if any email should be sent today."""
    global _SCHEDULER_RUNNING
    _SCHEDULER_RUNNING = True
    logger.info("Email report scheduler started.")

    from db.database import get_db as _get_db
    from db.models import UserPreferences

    # Create a dedicated engine/session for the background task
    engine = create_async_engine(app_settings.database_url, pool_pre_ping=True)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    while _SCHEDULER_RUNNING:
        try:
            today = date.today()
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(UserPreferences).where(UserPreferences.id == 1)
                )
                prefs = result.scalar_one_or_none()
                cfg = _get_email_settings(prefs) if prefs else None

                if cfg and cfg.get("enabled") and cfg.get("smtp_host"):
                    month, year = today.month, today.year

                    # Monthly report
                    if cfg.get("report_day") == today.day:
                        key = _month_key(today)
                        if cfg.get("last_report_month") != key:
                            try:
                                await send_monthly_report(session, cfg, month, year)
                                # Update last_report_month in prefs
                                layout = dict(prefs.dashboard_layout or {})
                                layout["email_reports"] = {**cfg, "last_report_month": key}
                                prefs.dashboard_layout = layout
                                await session.commit()
                            except Exception as exc:
                                logger.error(f"Failed to send monthly report: {exc}")

                    # Upload reminder
                    if cfg.get("reminder_enabled") and cfg.get("reminder_day") == today.day:
                        key = _month_key(today)
                        if cfg.get("last_reminder_month") != key:
                            try:
                                await send_reminder(cfg, month, year)
                                layout = dict(prefs.dashboard_layout or {})
                                layout["email_reports"] = {**cfg, "last_reminder_month": key}
                                prefs.dashboard_layout = layout
                                await session.commit()
                            except Exception as exc:
                                logger.error(f"Failed to send reminder: {exc}")

        except Exception as exc:
            logger.error(f"Scheduler loop error: {exc}")

        # Sleep until same time tomorrow (check every hour is sufficient)
        await asyncio.sleep(3600)

    await engine.dispose()
    logger.info("Email report scheduler stopped.")


def start_scheduler():
    """Call from FastAPI lifespan to start background scheduler."""
    asyncio.create_task(_scheduler_loop())


def stop_scheduler():
    """Signal the scheduler to exit."""
    global _SCHEDULER_RUNNING
    _SCHEDULER_RUNNING = False
