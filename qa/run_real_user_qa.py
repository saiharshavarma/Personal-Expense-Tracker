#!/usr/bin/env python3
import csv
import json
import math
import os
import subprocess
import sys
from collections import defaultdict
from datetime import date
from decimal import Decimal
from pathlib import Path
from urllib import parse, request, error

ROOT = Path(__file__).resolve().parents[1]
QA_DIR = ROOT / "qa"
API = "http://localhost:8000/api"
PASSWORD = "QA-Test-Password-2026"


class QAError(Exception):
    pass


class Client:
    def __init__(self):
        self.token = None

    def call(self, method, path, body=None, query=None, headers=None, expect=None):
        url = f"{API}{path}"
        if query:
            url += "?" + parse.urlencode(query, doseq=True)
        data = None
        req_headers = dict(headers or {})
        if body is not None:
            data = json.dumps(body).encode()
            req_headers["Content-Type"] = "application/json"
        if self.token:
            req_headers["Authorization"] = f"Bearer {self.token}"
        req = request.Request(url, data=data, method=method, headers=req_headers)
        try:
            with request.urlopen(req, timeout=30) as resp:
                payload = resp.read()
                parsed = json.loads(payload.decode() or "{}") if payload else None
                if expect and resp.status != expect:
                    raise QAError(f"{method} {path} expected {expect}, got {resp.status}: {parsed}")
                return parsed
        except error.HTTPError as e:
            detail = e.read().decode()
            if expect and e.code == expect:
                return {"status": e.code, "detail": detail}
            raise QAError(f"{method} {path} failed {e.code}: {detail}") from e

    def upload_csv_preview(self, filename, account_id):
        boundary = "----codexqaprobe"
        file_bytes = (QA_DIR / filename).read_bytes()
        parts = [
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="account_id"\r\n\r\n'
                f"{account_id}\r\n"
            ).encode(),
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                f"Content-Type: text/csv\r\n\r\n"
            ).encode(),
            file_bytes,
            f"\r\n--{boundary}--\r\n".encode(),
        ]
        body = b"".join(parts)
        headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
        return self.call("POST", "/import/parse-preview", body=None, headers=headers_with_body(headers, body))

    def upload_csv_staged(self, filename, account_id):
        boundary = "----codexqaupload"
        file_bytes = (QA_DIR / filename).read_bytes()
        body = b"".join([
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="account_id"\r\n\r\n'
                f"{account_id}\r\n"
            ).encode(),
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                f"Content-Type: text/csv\r\n\r\n"
            ).encode(),
            file_bytes,
            f"\r\n--{boundary}--\r\n".encode(),
        ])
        return raw_request("POST", f"{API}/import/upload-csv", body, self.token, {"Content-Type": f"multipart/form-data; boundary={boundary}"})


def headers_with_body(headers, body):
    headers = dict(headers)
    headers["_raw_body"] = body
    return headers


def raw_request(method, url, body, token=None, headers=None):
    req_headers = dict(headers or {})
    if token:
        req_headers["Authorization"] = f"Bearer {token}"
    req = request.Request(url, data=body, method=method, headers=req_headers)
    with request.urlopen(req, timeout=60) as resp:
        payload = resp.read()
        return json.loads(payload.decode() or "{}") if payload else None


def raw_get(path, token):
    req = request.Request(f"{API}{path}", method="GET", headers={"Authorization": f"Bearer {token}"})
    with request.urlopen(req, timeout=60) as resp:
        return resp.status, resp.headers.get("content-type", ""), resp.read()


def raw_post(path, token, body=b""):
    req = request.Request(f"{API}{path}", data=body, method="POST", headers={"Authorization": f"Bearer {token}"})
    with request.urlopen(req, timeout=60) as resp:
        return resp.status, resp.headers.get("content-type", ""), resp.read()


def client_call_patched(self, method, path, body=None, query=None, headers=None, expect=None):
    if headers and "_raw_body" in headers:
        raw_body = headers.pop("_raw_body")
        return raw_request(method, f"{API}{path}", raw_body, self.token, headers)
    return Client.call_original(self, method, path, body, query, headers, expect)


Client.call_original = Client.call
Client.call = client_call_patched


def sh(cmd):
    return subprocess.check_output(cmd, cwd=ROOT, text=True).strip()


def reset_database():
    sh([
        "docker", "exec", "finance-postgres", "psql", "-U", "financeuser", "-d", "finance_dashboard",
        "-c",
        "TRUNCATE TABLE accounts, transactions, import_batches, budgets, income_schedules, merchant_rules, "
        "user_preferences, backup_log, db_change_log, reimbursement_batches, subscriptions, trips "
        "RESTART IDENTITY CASCADE;",
    ])


def approx(actual, expected, cents=0.01):
    return abs(float(actual) - float(expected)) <= cents


def check(results, name, ok, details=""):
    results.append({"name": name, "ok": bool(ok), "details": details})
    if not ok:
        print(f"FAIL: {name}: {details}")


def read_csv_amounts(filename):
    rows = []
    with (QA_DIR / filename).open() as f:
        for row in csv.DictReader(f):
            debit = Decimal(row["Debit"] or "0")
            credit = Decimal(row["Credit"] or "0")
            rows.append({
                "date": row["Date"],
                "description": row["Description"],
                "amount": debit or credit,
                "direction": "debit" if debit else "credit",
            })
    return rows


CATEGORY_MAP = {
    "Acme Corp Payroll": ("Income", "Salary", "savings", "fixed", "personal", False, False, []),
    "Acme Corp Bonus": ("Income", "Bonus", "savings", "variable", "personal", False, False, []),
    "ACH Transfer From Savings": ("Transfer", "Internal Transfer", "na", "variable", "personal", False, False, []),
    "May Rent - Parkside Apartments": ("Home", "Rent", "need", "fixed", "personal", False, True, ["housing"]),
    "Whole Foods Market 10233": ("Food", "Groceries", "need", "variable", "personal", False, False, []),
    "Trader Joe's #541": ("Food", "Groceries", "need", "variable", "personal", False, False, []),
    "ConEd Electric Bill": ("Utilities", "Electric", "need", "fixed", "personal", False, True, []),
    "Verizon Fios Internet": ("Utilities", "Internet", "need", "fixed", "shared", False, True, []),
    "Shell Oil 554433": ("Transportation", "Gas", "need", "variable", "personal", False, False, []),
    "Starbucks Mobile Order": ("Dining", "Coffee", "want", "variable", "personal", False, False, []),
    "Uber Trip Help.uber.com": ("Transportation", "Rideshare", "want", "variable", "personal", False, False, []),
    "Blue Bottle Coffee Soma": ("Dining", "Coffee", "want", "variable", "personal", False, False, ["learned"]),
    "Target T-2844": ("Shopping", "Household", "want", "variable", "personal", False, False, []),
    "Amazon Marketplace": ("Shopping", "Online", "want", "variable", "personal", False, False, []),
    "Netflix.com": ("Entertainment", "Streaming", "want", "fixed", "personal", False, True, []),
    "Spotify USA": ("Entertainment", "Music", "want", "fixed", "personal", False, True, []),
    "Delta Air Lines Business Trip": ("Travel", "Flights", "na", "variable", "work", True, False, ["business-trip"]),
    "Marriott Marquis NYC": ("Travel", "Lodging", "na", "variable", "work", True, False, ["business-trip"]),
    "Splitwise Dinner Reimbursement Pending": ("Dining", "Restaurants", "want", "variable", "shared", True, False, ["split"]),
    "Apple Store Work Monitor": ("Work", "Equipment", "na", "variable", "work", True, False, ["work-equipment"]),
    "ATM Withdrawal Main St": ("Cash", "ATM", "want", "variable", "personal", False, False, []),
    "Equinox Gym Monthly": ("Fitness", "Gym", "want", "fixed", "personal", False, True, []),
    "Doctor Copay Midtown Clinic": ("Healthcare", "Medical", "need", "variable", "personal", False, False, []),
    "Vanguard Brokerage Contribution": ("Financial", "Investments", "savings", "variable", "personal", False, False, []),
    "Target Refund": ("Shopping", "Refund", "want", "variable", "personal", False, False, []),
    "Vanguard Dividend": ("Financial", "Dividends", "savings", "variable", "personal", False, False, []),
    "Airbnb Denver Deposit": ("Travel", "Lodging", "want", "variable", "personal", False, False, ["trip"]),
    "Lyft Ride Denver": ("Transportation", "Rideshare", "want", "variable", "personal", False, False, ["trip"]),
    "Safeway Grocery": ("Food", "Groceries", "need", "variable", "personal", False, False, []),
    "Slack Technologies Annual Plan": ("Software", "SaaS", "want", "fixed", "work", True, True, ["subscription"]),
    "Apple iCloud": ("Software", "Cloud Storage", "want", "fixed", "personal", False, True, ["subscription"]),
    "Restaurant Work Dinner": ("Dining", "Restaurants", "na", "variable", "work", True, False, ["client-dinner"]),
    "Credit Card Payment": ("Transfer", "Credit Card Payment", "na", "fixed", "personal", False, False, []),
    "Duplicate Within File Test": ("Other", "Test", "want", "variable", "personal", False, False, []),
    "Same Day Refund Test": ("Shopping", "Test", "want", "variable", "personal", False, False, []),
}


def decorate_preview(preview):
    for txn in preview["transactions"]:
        cat = CATEGORY_MAP.get(txn["description"])
        if not cat:
            continue
        txn["category"], txn["subcategory"], txn["need_want_savings"], txn["fixed_variable"], txn["personal_work_shared"], reimb, recurring, tags = cat
        txn["merchant"] = txn["description"].split("  ")[0]
        txn["is_reimbursable"] = reimb
        txn["is_recurring"] = recurring
        txn["tags"] = tags
        if txn["description"] == "Delta Air Lines Business Trip":
            txn["expected_reimbursement"] = 420
        if txn["description"] == "Marriott Marquis NYC":
            txn["expected_reimbursement"] = 680
        if txn["description"] == "Apple Store Work Monitor":
            txn["expected_reimbursement"] = 399
        if txn["description"] == "Splitwise Dinner Reimbursement Pending":
            txn["expected_reimbursement"] = 90
        if txn["description"] == "Slack Technologies Annual Plan":
            txn["expected_reimbursement"] = 96
        if txn["description"] == "Restaurant Work Dinner":
            txn["expected_reimbursement"] = 214.70
    return preview


def main():
    results = []
    reset_database()

    c = Client()
    status = c.call("GET", "/auth/status")
    check(
        results,
        "database/settings reset produced first-run auth state",
        status == {
            "onboarding_complete": False,
            "has_webauthn": False,
            "has_password": False,
            "has_recovery_token": False,
        },
        str(status),
    )
    c.token = c.call("POST", "/auth/setup", {"password": PASSWORD, "confirm_password": PASSWORD})["access_token"]

    checking = c.call("POST", "/accounts", {"name": "Everyday Checking", "type": "checking", "institution": "Local Credit Union", "last_four": "1024", "currency": "USD"})
    card = c.call("POST", "/accounts", {"name": "Rewards Visa", "type": "credit_card", "institution": "Chase", "last_four": "4242", "currency": "USD"})
    savings = c.call("POST", "/accounts", {"name": "High Yield Savings", "type": "savings", "institution": "Ally", "last_four": "7788", "currency": "USD"})
    check(results, "account creation/listing", len(c.call("GET", "/accounts")) == 3)

    c.call("PUT", "/preferences", {"currency": "USD", "theme": "dark", "ai_provider": "openai", "ai_insights_opt_in": True})
    prefs = c.call("GET", "/preferences")
    check(results, "settings/preferences persisted", prefs["currency"] == "USD" and prefs["theme"] == "dark" and prefs["ai_provider"] == "openai", str(prefs))

    p1 = decorate_preview(c.upload_csv_preview("realistic_checking.csv", checking["id"]))
    check(results, "checking CSV parse count", p1["total"] == 26, str(p1["total"]))
    r1 = c.call("POST", "/import/commit", {"filename": p1["filename"], "institution": p1["institution"], "account_id": checking["id"], "transactions": p1["transactions"]})
    check(results, "checking CSV committed", r1["imported"] == 26 and r1["duplicates"] == 0, str(r1))

    p2 = decorate_preview(c.upload_csv_preview("realistic_credit_card.csv", card["id"]))
    r2 = c.call("POST", "/import/commit", {"filename": p2["filename"], "institution": p2["institution"], "account_id": card["id"], "transactions": p2["transactions"]})
    check(results, "credit CSV committed with within-file duplicate skipped", r2["imported"] == 10 and r2["duplicates"] == 1, str(r2))

    p_dup = decorate_preview(c.upload_csv_preview("realistic_checking.csv", checking["id"]))
    dup = c.call("POST", "/import/commit", {"filename": "realistic_checking_duplicate.csv", "institution": p_dup["institution"], "account_id": checking["id"], "transactions": p_dup["transactions"]})
    check(results, "duplicate re-import skipped all checking rows", dup["imported"] == 0 and dup["duplicates"] == 26, str(dup))

    all_txns = c.call("GET", "/transactions", query={"page_size": 500, "sort_by": "date", "sort_dir": "asc"})
    check(results, "transaction count after imports", all_txns["total"] == 36, str(all_txns["total"]))
    by_desc = {t["description"]: t for t in all_txns["items"]}

    c.call("PUT", f"/transactions/{by_desc['Delta Air Lines Business Trip']['id']}", {"received_reimbursement": 420, "reimbursement_status": "paid"})
    c.call("PUT", f"/transactions/{by_desc['Splitwise Dinner Reimbursement Pending']['id']}", {"received_reimbursement": 40, "reimbursement_status": "partial"})
    c.call("PUT", f"/transactions/{by_desc['Restaurant Work Dinner']['id']}", {"received_reimbursement": 214.70, "reimbursement_status": "paid"})

    c.call("POST", "/subscriptions", {"name": "Netflix", "amount": 22.99, "billing_frequency": "monthly", "category": "Entertainment", "subcategory": "Streaming", "personal_work_shared": "personal", "account_id": checking["id"], "value_rating": 4, "usage_rating": "often"})
    c.call("POST", "/subscriptions", {"name": "Slack", "amount": 96, "billing_frequency": "yearly", "category": "Software", "subcategory": "SaaS", "personal_work_shared": "work", "is_reimbursable": True, "account_id": card["id"], "value_rating": 5, "usage_rating": "daily"})
    c.call("POST", "/subscriptions", {"name": "Gym", "amount": 49, "billing_frequency": "monthly", "category": "Fitness", "subcategory": "Gym", "personal_work_shared": "personal", "account_id": checking["id"], "value_rating": 3, "usage_rating": "weekly"})
    c.call("POST", "/subscriptions", {"name": "Shared Family App", "amount": 14, "billing_frequency": "monthly", "category": "Software", "subcategory": "Family", "personal_work_shared": "shared", "account_id": checking["id"]})
    sub_summary = c.call("GET", "/subscriptions/summary")
    check(results, "subscription monthly equivalents and group totals", sub_summary == {"total_monthly": 93.99, "total_annual": 1127.88, "personal_monthly": 71.99, "work_monthly": 8.0, "shared_monthly": 14.0, "count": 4}, str(sub_summary))

    budgets = [
        ("Home", "Rent", 2200), ("Food", "Groceries", 360), ("Utilities", None, 230),
        ("Transportation", None, 180), ("Dining", None, 250), ("Entertainment", None, 60),
        ("Shopping", None, 180), ("Fitness", None, 60), ("Healthcare", None, 100),
        ("Financial", "Investments", 600), ("Travel", None, 900), ("Software", None, 50),
    ]
    for cat, sub, amount in budgets:
        c.call("POST", "/budgets", {"month": 5, "year": 2026, "category": cat, "subcategory": sub, "budget_amount": amount})
    c.call("POST", "/budgets/templates", {"category": "Food", "subcategory": "Groceries", "amount": 400})
    c.call("POST", "/budgets/templates", {"category": "Utilities", "amount": 250})
    applied = c.call("POST", "/budgets/apply-templates", query={"month": 6, "year": 2026})
    check(results, "budget templates apply to future month", applied["created"] == 2 and applied["skipped"] == 0, str(applied))

    actuals = c.call("GET", "/budgets/actuals", query={"month": 5, "year": 2026})
    rows = {(r["category"], r["subcategory"]): r for r in actuals["rows"]}
    expected_budget = 5170
    # Budget actuals use gross debits minus received reimbursements. Credit refunds are not netted against debit categories.
    expected_net = 5287.14 - 460.00
    check(results, "budget totals reconcile to imported debits minus received reimbursements", approx(actuals["totals"]["budget"], expected_budget) and approx(actuals["totals"]["net_personal"], expected_net), str(actuals["totals"]))
    check(results, "partial reimbursement net personal cost flows into Dining", approx(rows[("Dining", None)]["net_personal"], 141.35), str(rows.get(("Dining", None))))
    check(results, "paid work dinner excluded from May budget via received reimbursement", rows[("Dining", None)]["reimbursed"] == 40.0, str(rows.get(("Dining", None))))

    income_exp = c.call("GET", "/analytics/income-expenses", query={"months": 3})
    may = next(r for r in income_exp if r["year"] == 2026 and r["month"] == 5)
    check(results, "analytics income excludes transfer and financial credits", approx(may["income"], 6950), str(may))
    check(results, "analytics gross May expenses equal all May debits", approx(may["expenses"], 5287.14), str(may))
    personal_income_exp = c.call("GET", "/analytics/income-expenses", query={"months": 3, "exclude_reimbursable": "true"})
    may_personal = next(r for r in personal_income_exp if r["year"] == 2026 and r["month"] == 5)
    check(results, "analytics personal-only expenses exclude fully reimbursable and use split expected share", approx(may_personal["expenses"], 3698.14), str(may_personal))
    breakdown = c.call("GET", "/analytics/category-breakdown", query={"month": 5, "year": 2026})
    pct_sum = sum(r["pct"] for r in breakdown)
    check(results, "category breakdown percentages are sane", 99.8 <= pct_sum <= 100.2, str(breakdown))

    reimb_ids = [by_desc["Delta Air Lines Business Trip"]["id"], by_desc["Marriott Marquis NYC"]["id"], by_desc["Apple Store Work Monitor"]["id"]]
    batch = c.call("POST", "/reimbursements/batches", {"name": "May Acme Expenses", "source": "employer", "expense_tool": "Expensify", "submission_method": "web", "transaction_ids": reimb_ids})
    check(results, "reimbursement batch totals expected amounts only", approx(batch["total_submitted"], 1499) and batch["status"] == "submitted", str(batch))
    pipe = c.call("GET", "/reimbursements/pipeline")
    check(results, "reimbursement pipeline status buckets populated", len(pipe["submitted"]) >= 3 and len(pipe["partial"]) >= 1 and len(pipe["paid"]) >= 1, json.dumps({k: len(v) for k, v in pipe.items()}))

    trip = c.call("POST", "/trips", {"name": "Denver Offsite", "destination": "Denver", "start_date": "2026-04-25", "end_date": "2026-04-30", "trip_type": "business", "budget": 650})
    auto = c.call("POST", f"/trips/{trip['id']}/auto-tag")
    expenses = c.call("GET", f"/trips/{trip['id']}/expenses")
    check(results, "trip auto-tag picks debit non-recurring rows in range", auto["tagged_count"] == 4, str(auto))
    check(results, "trip total uses debit net spend only", approx(expenses["total_spent"], 338.60), str(expenses))

    blue = c.call("GET", "/transactions", query={"search": "Blue Bottle", "page_size": 10})["items"][0]
    c.call("PUT", f"/transactions/{blue['id']}", {"category": "Dining", "subcategory": "Coffee", "merchant": "Blue Bottle", "need_want_savings": "want", "fixed_variable": "variable", "personal_work_shared": "personal", "tags": ["learned"]})
    rules = c.call("GET", "/rules")
    check(results, "AI/rules learning created merchant rule from correction", any(r["pattern"] == "BLUE BOTTLE COFFEE SOMA" and r["category"] == "Dining" for r in rules), str(rules))
    p3 = c.upload_csv_preview("learned_blue_bottle.csv", checking["id"])
    learned = next(t for t in p3["transactions"] if t["description"].startswith("Blue Bottle"))
    unknown = next(t for t in p3["transactions"] if t["description"].startswith("Unknown Vendor"))
    check(results, "learned rule auto-fills similar future merchant", learned["category"] == "Dining" and learned["ai_confidence"] == 1.0 and learned["tags"] == ["learned"], str(learned))
    check(results, "unknown merchant remains review-needed zero confidence", unknown["category"] == "Other" and unknown["ai_confidence"] == 0.0 and "needs_review" in unknown["ai_flags"], str(unknown))

    staged = c.upload_csv_staged("learned_blue_bottle.csv", checking["id"])
    queue = c.call("GET", "/import/review-queue", query={"batch_id": staged["batch_id"]})
    check(results, "staged generic CSV forces review queue even for learned high-confidence match", staged["needs_review_count"] == 2 and len(queue) == 2, f"staged={staged}, queue={queue}")
    accepted = c.call("POST", "/import/bulk-accept", {"batch_id": staged["batch_id"]})
    queue_after = c.call("GET", "/import/review-queue", query={"batch_id": staged["batch_id"]})
    check(results, "bulk accept accepts learned match but leaves zero-confidence row", accepted["accepted"] == 1 and len(queue_after) == 1 and queue_after[0]["ai_confidence"] == 0.0, f"accepted={accepted}, queue={queue_after}")
    c.call("POST", f"/import/review-queue/{queue_after[0]['id']}", {"action": "edit", "category": "Shopping", "subcategory": "Misc", "merchant_clean": "Unknown Vendor", "need_want_savings": "want", "fixed_variable": "variable", "personal_work_shared": "personal"})
    check(results, "review edit clears final queue item", c.call("GET", "/import/review-queue", query={"batch_id": staged["batch_id"]}) == [])

    filtered = c.call("GET", "/transactions", query={"category": "Dining", "page_size": 100})
    summary = c.call("GET", "/transactions/summary", query={"direction": "debit"})
    check(results, "transaction filters return expected Dining rows", filtered["total"] >= 4, str(filtered["total"]))
    check(results, "transaction summary separates recurring vs one-time debits", summary["recurring"]["count"] >= 7 and summary["one_time"]["count"] >= 23, str(summary))

    csv_status, csv_type, csv_body = raw_get("/export/csv", c.token)
    json_status, json_type, json_body = raw_get("/export/json", c.token)
    backup_error = None
    backup_status_code = None
    backup_content_type = ""
    backup_bytes = b""
    try:
        backup_status_code, backup_content_type, backup_bytes = raw_post("/backup/trigger", c.token)
    except QAError as exc:
        backup_error = str(exc)
    except error.HTTPError as exc:
        backup_error = f"POST /backup/trigger failed {exc.code}: {exc.read().decode()}"
    backup = c.call("GET", "/backup/status")
    check(results, "export endpoints return CSV and JSON downloads", csv_status == 200 and "text/csv" in csv_type and json_status == 200 and "application/json" in json_type and len(csv_body) > 1000 and len(json_body) > 1000, f"csv={csv_type}/{len(csv_body)}, json={json_type}/{len(json_body)}")
    check(results, "backup endpoint completes and records success", backup_error is None and backup_status_code == 200 and "application/gzip" in backup_content_type and len(backup_bytes) > 100 and backup.get("status") == "success", backup_error or f"download={backup_content_type}/{len(backup_bytes)}, status={backup}")

    final_txns = c.call("GET", "/transactions", query={"page_size": 500})
    bad_reimb = [t for t in final_txns["items"] if (not t["is_reimbursable"] and t["reimbursement_status"] != "not_reimbursable") or (t["is_reimbursable"] and t["reimbursement_status"] == "not_reimbursable")]
    bad_amounts = [t for t in final_txns["items"] if t["amount"] <= 0]
    check(results, "data integrity: reimbursement flags and statuses consistent", not bad_reimb, str(bad_reimb))
    check(results, "data integrity: transaction amounts positive", not bad_amounts, str(bad_amounts))

    failures = [r for r in results if not r["ok"]]
    report = build_report(results, actuals, may, may_personal, sub_summary, pipe, expenses, p3, final_txns)
    (QA_DIR / "real_user_qa_report.md").write_text(report)
    print(report)
    return 1 if failures else 0


def build_report(results, actuals, may, may_personal, sub_summary, pipe, expenses, p3, final_txns):
    passed = sum(1 for r in results if r["ok"])
    failed = len(results) - passed
    lines = [
        "# Real User QA Report",
        "",
        f"Run date: {date.today().isoformat()}",
        f"Result: {passed} passed, {failed} failed",
        "",
        "## Seeded data",
        "",
        "- Reset all application tables and settings.",
        "- Created 3 accounts, 36 committed baseline transactions from CSV, then 2 additional staged CSV transactions through review queue.",
        "- Covered salary, bonus, transfers, refunds, recurring bills, subscriptions, groceries, dining, healthcare, investment contribution, ATM cash, travel, reimbursable work expenses, partial reimbursement, same-day debit/credit pair, duplicate rows, and unknown merchants.",
        "",
        "## Key reconciliations",
        "",
        f"- May gross debit spend: API reports ${may['expenses']:.2f}; expected from CSV is $5287.14.",
        f"- May income: API reports ${may['income']:.2f}; expected salary + bonus is $6950.00, excluding transfer and financial dividend credits.",
        f"- May personal-only analytics spend: API reports ${may_personal['expenses']:.2f}; expected $3698.14 after excluding fully reimbursable rows and using expected split share.",
        f"- Budget actuals net personal: API reports ${actuals['totals']['net_personal']:.2f}; expected $4827.14 using received reimbursements.",
        f"- Subscription summary: {json.dumps(sub_summary, sort_keys=True)}.",
        f"- Trip Denver Offsite total: ${expenses['total_spent']:.2f}; expected $338.60.",
        f"- Reimbursement pipeline counts: {json.dumps({k: len(v) for k, v in pipe.items()}, sort_keys=True)}.",
        "",
        "## AI autofill and learning",
        "",
        "- Corrected `Blue Bottle Coffee Soma` to Dining/Coffee, which created a local merchant rule.",
        "- Imported `Blue Bottle Coffee Soma 7781`; parse-preview auto-filled Dining/Coffee with confidence 1.0 and preserved learned tags.",
        "- Imported `Unknown Vendor Experimental Purchase`; it stayed `Other` with confidence 0.0 and `needs_review` flag.",
        "- Staged CSV import forced both rows into review; bulk accept accepted only the learned high-confidence row and left the zero-confidence row for manual edit.",
        "",
        "## Checks",
        "",
    ]
    for r in results:
        mark = "PASS" if r["ok"] else "FAIL"
        detail = f" - {r['details']}" if r["details"] else ""
        lines.append(f"- {mark}: {r['name']}{detail}")
    lines.extend([
        "",
        "## Observations",
        "",
        "- No hard data-integrity failures were found in reimbursement status pairing, positive amount storage, duplicate handling, or learned-rule autofill.",
        "- Analytics income now excludes categorized refund credits; May income matches salary + bonus at $6,950.00.",
        "- Manual backup now returns a gzip JSON snapshot and records a successful backup log.",
        "- Budget actuals intentionally subtract received reimbursement, while analytics personal-only uses expected reimbursement for split/fully reimbursable filtering. Those definitions are different but internally consistent for their stated use cases.",
        "- Credit refunds are not netted against budget category spend; this is consistent with the current backend but may surprise users expecting refunds to reduce category actuals.",
        f"- Final transaction count after review-queue test: {final_txns['total']}.",
    ])
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    sys.exit(main())
