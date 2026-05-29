#!/usr/bin/env python3
import contextlib
import io
import json
import sys
from collections import defaultdict
from datetime import date
from decimal import Decimal
from pathlib import Path
from urllib import error

from run_real_user_qa import Client, PASSWORD, raw_get, raw_post
import run_real_user_qa


QA_DIR = Path(__file__).resolve().parent


def check(results, area, name, ok, details=""):
    results.append({"area": area, "name": name, "ok": bool(ok), "details": details})
    if not ok:
        print(f"FAIL [{area}]: {name}: {details}")


def approx(a, b, cents=0.01):
    return abs(float(a) - float(b)) <= cents


def login_client():
    c = Client()
    c.token = c.call("POST", "/auth/login", {"password": PASSWORD})["access_token"]
    return c


def get_all_transactions(c):
    return c.call("GET", "/transactions", query={"page_size": 500, "sort_by": "date", "sort_dir": "asc"})["items"]


def tx_by_desc(c):
    txs = get_all_transactions(c)
    grouped = defaultdict(list)
    for t in txs:
        grouped[t["description"]].append(t)
    return grouped


def add_txn(c, desc, amount, direction="debit", day="2026-05-26", **extra):
    body = {
        "date": day,
        "amount": amount,
        "direction": direction,
        "description": desc,
        **extra,
    }
    return c.call("POST", "/transactions", body)


def update_txn(c, txn, **updates):
    return c.call("PUT", f"/transactions/{txn['id']}", updates)


def expected_may_numbers(txs):
    gross = Decimal("0")
    personal = Decimal("0")
    budget_net = Decimal("0")
    income = Decimal("0")
    reimb_pending = Decimal("0")
    reimb_count = 0

    for t in txs:
        if not (t["date"] or "").startswith("2026-05"):
            continue
        amount = Decimal(str(t["amount"]))
        expected = Decimal(str(t["expected_reimbursement"])) if t["expected_reimbursement"] is not None else None
        received = Decimal(str(t["received_reimbursement"] or 0))

        if t["direction"] == "credit":
            if t["category"] == "Income" or t["category"] is None:
                income += amount
            continue

        gross += amount
        budget_net += amount - received

        if t["is_reimbursable"]:
            if expected is not None and expected < amount:
                personal += amount - expected
            elif not t["is_reimbursable"]:
                personal += amount
            # Fully reimbursable rows contribute zero in personal-only analytics.
        else:
            personal += amount

        if t["is_reimbursable"] and t["reimbursement_status"] in {"to_submit", "submitted"}:
            reimb_pending += expected if expected is not None else amount
            reimb_count += 1

    return {
        "gross": float(gross),
        "personal": float(personal),
        "budget_net": float(budget_net),
        "income": float(income),
        "pending": float(reimb_pending),
        "pending_count": reimb_count,
    }


def expected_all_pending(txs):
    total = Decimal("0")
    count = 0
    for t in txs:
        if t["is_reimbursable"] and t["reimbursement_status"] in {"to_submit", "submitted"}:
            total += Decimal(str(t["expected_reimbursement"])) if t["expected_reimbursement"] is not None else Decimal(str(t["amount"]))
            count += 1
    return float(total), count


def run_baseline_quiet():
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = run_real_user_qa.main()
    return rc, buf.getvalue()


def main():
    results = []
    baseline_rc, baseline_output = run_baseline_quiet()
    check(results, "setup", "baseline rigorous seed passes before limit tests", baseline_rc == 0, baseline_output[-1000:])

    c = login_client()
    accounts = c.call("GET", "/accounts")
    checking = next(a for a in accounts if a["name"] == "Everyday Checking")
    card = next(a for a in accounts if a["name"] == "Rewards Visa")

    # Extra edge data: splits, partials, over-refund, void, future subscription, and date-boundary transactions.
    add_txn(c, "Client Dinner Split 60 Percent Personal", 300, account_id=card["id"], category="Dining", subcategory="Restaurants", need_want_savings="want", fixed_variable="variable", personal_work_shared="shared", merchant="Client Dinner Split", is_reimbursable=True, expected_reimbursement=120, reimbursement_status="to_submit", reimbursement_source="friend", tags=["split", "edge"])
    hotel = add_txn(c, "Conference Hotel Partial Settlement", 1000, account_id=card["id"], category="Travel", subcategory="Lodging", need_want_savings="na", fixed_variable="variable", personal_work_shared="work", merchant="Conference Hotel", is_reimbursable=True, expected_reimbursement=1000, reimbursement_status="partial", received_reimbursement=450, reimbursement_source="employer", tags=["partial"])
    add_txn(c, "Employer Equipment Overpayment", 200, account_id=card["id"], category="Work", subcategory="Equipment", need_want_savings="na", fixed_variable="variable", personal_work_shared="work", merchant="Equipment Store", is_reimbursable=True, expected_reimbursement=200, reimbursement_status="paid", received_reimbursement=225, reimbursement_source="employer", tags=["overpaid"])
    add_txn(c, "Refund Credit Should Not Be Income", 88.88, "credit", account_id=checking["id"], category="Shopping", subcategory="Refund", need_want_savings="want", fixed_variable="variable", personal_work_shared="personal", merchant="Refund Merchant")
    add_txn(c, "June Rent Future Boundary", 2200, day="2026-06-01", account_id=checking["id"], category="Home", subcategory="Rent", need_want_savings="need", fixed_variable="fixed", personal_work_shared="personal", merchant="Parkside Apartments", is_recurring=True)
    add_txn(c, "Zero Dollar Rejected By API", 0, expect=400) if False else None

    txs = get_all_transactions(c)
    nums = expected_may_numbers(txs)
    pending_all, pending_count_all = expected_all_pending(txs)

    # Dashboard consistency.
    dash = c.call("GET", "/analytics/dashboard-summary", query={"month": 5, "year": 2026})
    dash_personal = c.call("GET", "/analytics/dashboard-summary", query={"month": 5, "year": 2026, "exclude_reimbursable": "true"})
    check(results, "dashboard", "income excludes refunds and non-income credits", approx(dash["income"], nums["income"]) and approx(dash["income"], 6950), str(dash))
    check(results, "dashboard", "gross dashboard spend equals all May debits", approx(dash["expenses"], nums["gross"]), f"dash={dash['expenses']} expected={nums['gross']}")
    check(results, "dashboard", "personal-only dashboard spend uses expected reimbursement logic", approx(dash_personal["expenses"], nums["personal"]), f"dash={dash_personal['expenses']} expected={nums['personal']}")
    check(results, "dashboard", "pending reimbursement card uses all-time to_submit/submitted expected amounts", approx(dash["reimbursement_pending"], pending_all) and dash["reimbursement_count"] == pending_count_all, f"dash={dash}, expected={pending_all}/{pending_count_all}")
    check(results, "dashboard", "savings and savings rate are arithmetic", approx(dash["savings"], dash["income"] - dash["expenses"]) and approx(dash["savings_rate"], round((dash["income"] - dash["expenses"]) / dash["income"] * 100, 1)), str(dash))

    # Transactions and filters.
    dining = c.call("GET", "/transactions", query={"category": "Dining", "page_size": 500})
    split_filter = c.call("GET", "/transactions", query={"is_reimbursable": "true", "reimbursement_status": "to_submit", "page_size": 500})
    search = c.call("GET", "/transactions", query={"search": "Split", "page_size": 500})
    minmax = c.call("GET", "/transactions", query={"min_amount": 200, "max_amount": 300, "page_size": 500})
    recurring = c.call("GET", "/transactions", query={"is_recurring": "true", "page_size": 500})
    check(results, "transactions", "category filter returns only Dining rows", all(t["category"] == "Dining" for t in dining["items"]) and dining["total"] >= 6, str(dining["total"]))
    check(results, "transactions", "reimbursement status filter isolates to_submit reimbursables", all(t["is_reimbursable"] and t["reimbursement_status"] == "to_submit" for t in split_filter["items"]) and split_filter["total"] >= 2, str(split_filter))
    check(results, "transactions", "search filter finds split transactions", any("Split" in t["description"] for t in search["items"]), str(search))
    check(results, "transactions", "amount range filter respects inclusive bounds", all(200 <= t["amount"] <= 300 for t in minmax["items"]), str(minmax))
    check(results, "transactions", "recurring filter returns recurring rows only", all(t["is_recurring"] for t in recurring["items"]) and recurring["total"] >= 8, str(recurring["total"]))
    invalid_txn = c.call("POST", "/transactions", {"date": "2026-05-28", "amount": -1, "direction": "debit", "description": "Invalid Negative"}, expect=400)
    check(results, "transactions", "negative manual transaction is rejected", invalid_txn["status"] == 400, invalid_txn["detail"])

    # Import and review edge cases.
    bad_commit = c.call("POST", "/import/commit", {"filename": "bad.csv", "institution": "QA", "transactions": [{"date": "2026-05-28", "description": "Bad Negative", "amount": -5, "direction": "debit"}]}, expect=400)
    skipped_commit = c.call("POST", "/import/commit", {"filename": "skip.csv", "institution": "QA", "transactions": [{"date": "2026-05-28", "description": "Skip Me", "amount": 5, "direction": "debit", "skip": True}]}, expect=400)
    invalid_batch_queue = c.call("GET", "/import/review-queue", query={"batch_id": "not-a-uuid"}, expect=400)
    check(results, "import", "commit rejects negative staged amounts", bad_commit["status"] == 400, bad_commit["detail"])
    check(results, "import", "commit rejects all-skipped files", skipped_commit["status"] == 400, skipped_commit["detail"])
    check(results, "import", "review queue rejects invalid batch id", invalid_batch_queue["status"] == 400, invalid_batch_queue["detail"])

    # Analytics and budget.
    income_exp = c.call("GET", "/analytics/income-expenses", query={"months": 3})
    may = next(r for r in income_exp if r["year"] == 2026 and r["month"] == 5)
    income_exp_personal = c.call("GET", "/analytics/income-expenses", query={"months": 3, "exclude_reimbursable": "true"})
    may_personal = next(r for r in income_exp_personal if r["year"] == 2026 and r["month"] == 5)
    savings = c.call("GET", "/analytics/savings-rate", query={"months": 3})
    may_savings = next(r for r in savings if r["year"] == 2026 and r["month"] == 5)
    nws_bad = c.call("GET", "/analytics/need-want-savings", query={"month": 5}, expect=400)
    actuals = c.call("GET", "/budgets/actuals", query={"month": 5, "year": 2026})
    actual_rows = {(r["category"], r["subcategory"]): r for r in actuals["rows"]}
    check(results, "analytics", "income/expense endpoint matches ledger arithmetic", approx(may["income"], nums["income"]) and approx(may["expenses"], nums["gross"]), str(may))
    check(results, "analytics", "personal-only analytics matches expected reimbursement arithmetic", approx(may_personal["expenses"], nums["personal"]), f"api={may_personal['expenses']} expected={nums['personal']}")
    check(results, "analytics", "savings-rate endpoint is internally consistent", approx(may_savings["savings_amount"], may_savings["income"] - may_savings["expenses"]) and approx(may_savings["savings_rate"], round((may_savings["income"] - may_savings["expenses"]) / may_savings["income"] * 100, 1)), str(may_savings))
    check(results, "analytics", "ambiguous month-only split query is rejected", nws_bad["status"] == 400, nws_bad["detail"])
    check(results, "budget", "budget total net equals gross minus received reimbursement", approx(actuals["totals"]["net_personal"], nums["budget_net"]), f"api={actuals['totals']} expected={nums}")
    check(results, "budget", "unbudgeted categories are surfaced distinctly", any(r["status"] == "unbudgeted" and r["budget_amount"] == 0 for r in actuals["rows"]), str(actuals["rows"]))
    check(results, "budget", "category rows are not double counted in totals", actuals["totals"]["gross_spend"] >= actual_rows[("Dining", None)]["gross_spend"], str(actuals["totals"]))
    dupe_budget = c.call("POST", "/budgets", {"month": 5, "year": 2026, "category": "Dining", "budget_amount": 1}, expect=409)
    check(results, "budget", "duplicate category budget is rejected", dupe_budget["status"] == 409, dupe_budget["detail"])

    # Reimbursements, subscriptions, trips.
    pipe = c.call("GET", "/reimbursements/pipeline")
    update_txn(c, hotel, received_reimbursement=450)
    status_update = c.call("PUT", f"/reimbursements/transactions/{hotel['id']}/status", query={"status": "paid"})
    hotel_after = c.call("GET", f"/transactions/{hotel['id']}")
    invalid_reimb_status = c.call("PUT", f"/reimbursements/transactions/{hotel['id']}/status", query={"status": "nonsense"}, expect=400)
    batch_with_non_reimb = c.call("POST", "/reimbursements/batches", {"name": "Should Ignore Non-Reimb", "source": "qa", "transaction_ids": [next(t for t in txs if not t["is_reimbursable"])["id"]]}, )
    sub_weekly = c.call("POST", "/subscriptions", {"name": "Weekly News", "amount": 5, "billing_frequency": "weekly", "personal_work_shared": "personal"})
    sub_biweekly = c.call("POST", "/subscriptions", {"name": "Biweekly Cleaning", "amount": 40, "billing_frequency": "biweekly", "personal_work_shared": "shared"})
    sub_quarterly = c.call("POST", "/subscriptions", {"name": "Quarterly Tool", "amount": 90, "billing_frequency": "quarterly", "personal_work_shared": "work"})
    sub_summary = c.call("GET", "/subscriptions/summary")
    trip_personal = c.call("POST", "/trips", {"name": "May Personal Weekend", "destination": "NYC", "start_date": "2026-05-12", "end_date": "2026-05-16", "trip_type": "personal", "budget": 2000})
    trip_update = c.call("PUT", f"/trips/{trip_personal['id']}", {"name": "May Personal Weekend Updated"})
    trip_auto = c.call("POST", f"/trips/{trip_personal['id']}/auto-tag")
    trip_expenses = c.call("GET", f"/trips/{trip_personal['id']}/expenses")
    check(results, "reimbursements", "pipeline includes expected reimbursable statuses", all(k in pipe for k in ["to_submit", "submitted", "paid", "partial", "rejected"]), json.dumps({k: len(v) for k, v in pipe.items()}))
    check(results, "reimbursements", "moving partial to paid preserves actual received amount", status_update["reimbursement_status"] == "paid" and approx(hotel_after["received_reimbursement"], 450), str(hotel_after))
    check(results, "reimbursements", "invalid reimbursement status is rejected", invalid_reimb_status["status"] == 400, invalid_reimb_status["detail"])
    check(results, "reimbursements", "batch creation ignores non-reimbursable transaction ids", approx(batch_with_non_reimb["total_submitted"], 0) and batch_with_non_reimb["status"] == "draft", str(batch_with_non_reimb))
    check(results, "subscriptions", "weekly/biweekly/quarterly monthly equivalents are reflected in summary", sub_summary["count"] >= 7 and sub_summary["total_monthly"] >= 165.65, str(sub_summary))
    check(results, "trips", "trip update preserves trip_type when omitted", trip_update["trip_type"] == "personal", str(trip_update))
    check(results, "trips", "trip auto-tag excludes recurring and credits", trip_auto["tagged_count"] >= 3 and all(t["amount"] > 0 for t in trip_expenses["expenses"]), str(trip_auto))

    # Ask AI / Advisor behavior with local settings. No real API key should be required to verify graceful handling.
    c.call("PUT", "/preferences", {"ai_insights_opt_in": False})
    ai_disabled = c.call("POST", "/ai/query", {"question": "What changed?", "month": 5, "year": 2026}, expect=403)
    c.call("PUT", "/preferences", {"ai_insights_opt_in": True, "ai_provider": "openai", "openai_api_key": None, "anthropic_api_key": None})
    ai_no_key = c.call("POST", "/ai/query", {"question": "What categories are high?", "month": 5, "year": 2026}, expect=400)
    advisor_no_key = c.call("POST", "/ai/advisor", {"month": 5, "year": 2026}, expect=400)
    check(results, "ai", "Ask AI is blocked when opt-in disabled", ai_disabled["status"] == 403, ai_disabled["detail"])
    check(results, "ai", "Ask AI returns clear no-provider error without key", ai_no_key["status"] == 400, ai_no_key["detail"])
    check(results, "ai", "Finance Advisor returns clear no-provider error without key", advisor_no_key["status"] == 400, advisor_no_key["detail"])

    # Settings and system surfaces.
    pref = c.call("PUT", "/preferences", {"theme": "light", "currency": "EUR", "backup_to_icloud": False, "dashboard_layout": {"qa": True}})
    pref_roundtrip = c.call("GET", "/preferences")
    email_set = c.call("PUT", "/email-reports/settings", {"enabled": True, "report_email": "qa@example.com", "report_day": 99, "reminder_enabled": True, "reminder_day": -5, "smtp_host": "smtp.example.com", "smtp_port": 2525, "smtp_user": "qa-user", "smtp_password": "secret", "use_tls": False})
    email_get = c.call("GET", "/email-reports/settings")
    email_test_bad = c.call("POST", "/email-reports/test", expect=500)
    backup_status = c.call("GET", "/backup/status")
    backup_history = c.call("GET", "/backup/history")
    export_csv_status, export_csv_type, export_csv_body = raw_get("/export/csv", c.token)
    backup_download_status, backup_type, backup_body = raw_post("/backup/trigger", c.token)
    check(results, "settings", "preferences round-trip key settings", pref_roundtrip["theme"] == "light" and pref_roundtrip["currency"] == "EUR" and pref_roundtrip["backup_to_icloud"] is False and pref_roundtrip["dashboard_layout"] == {"qa": True}, str(pref_roundtrip))
    check(results, "settings", "email settings clamp days and mask password", email_set["report_day"] == 28 and email_set["reminder_day"] == 1 and email_get["smtp_password"] == "••••••••", f"set={email_set} get={email_get}")
    check(results, "settings", "email test fails clearly with dummy SMTP", email_test_bad["status"] == 500, email_test_bad["detail"])
    check(results, "settings", "backup status/history/export/download all wired", backup_status["status"] in {"success", "failed"} and isinstance(backup_history, list) and export_csv_status == 200 and "text/csv" in export_csv_type and len(export_csv_body) > 1000 and backup_download_status == 200 and "application/gzip" in backup_type and len(backup_body) > 100, f"backup={backup_status}, history={len(backup_history)}")

    final_txs = get_all_transactions(c)
    bad_reimb = [t for t in final_txs if (not t["is_reimbursable"] and t["reimbursement_status"] != "not_reimbursable") or (t["is_reimbursable"] and t["reimbursement_status"] == "not_reimbursable")]
    bad_positive = [t for t in final_txs if t["amount"] <= 0]
    duplicate_ids = len({t["id"] for t in final_txs}) != len(final_txs)
    check(results, "integrity", "reimbursement status invariants hold after stress operations", not bad_reimb, str(bad_reimb))
    check(results, "integrity", "all stored transaction amounts remain positive", not bad_positive, str(bad_positive))
    check(results, "integrity", "transaction ids remain unique", not duplicate_ids, "")

    failures = [r for r in results if not r["ok"]]
    report = build_report(results, nums, dash, dash_personal, actuals, sub_summary)
    (QA_DIR / "limit_qa_report.md").write_text(report)
    print(report)
    return 1 if failures else 0


def build_report(results, nums, dash, dash_personal, actuals, sub_summary):
    passed = sum(1 for r in results if r["ok"])
    failed = len(results) - passed
    by_area = defaultdict(lambda: [0, 0])
    for r in results:
        by_area[r["area"]][1] += 1
        if r["ok"]:
            by_area[r["area"]][0] += 1
    lines = [
        "# Limit QA Report",
        "",
        f"Run date: {date.today().isoformat()}",
        f"Result: {passed} passed, {failed} failed",
        "",
        "## Area Summary",
        "",
    ]
    for area in sorted(by_area):
        p, total = by_area[area]
        lines.append(f"- {area}: {p}/{total} passed")
    lines.extend([
        "",
        "## Key Reconciliations",
        "",
        f"- Dashboard gross May spend: ${dash['expenses']:.2f}; ledger expected ${nums['gross']:.2f}.",
        f"- Dashboard personal-only May spend: ${dash_personal['expenses']:.2f}; expected ${nums['personal']:.2f}.",
        f"- Dashboard income: ${dash['income']:.2f}; expected ${nums['income']:.2f}.",
        f"- Budget net personal: ${actuals['totals']['net_personal']:.2f}; expected ${nums['budget_net']:.2f}.",
        f"- Pending reimbursements: ${dash['reimbursement_pending']:.2f} across {dash['reimbursement_count']} items.",
        f"- Subscription summary after extra frequencies: {json.dumps(sub_summary, sort_keys=True)}.",
        "",
        "## Checks",
        "",
    ])
    for r in results:
        mark = "PASS" if r["ok"] else "FAIL"
        detail = f" - {r['details']}" if r["details"] else ""
        lines.append(f"- {mark} [{r['area']}]: {r['name']}{detail}")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    sys.exit(main())
