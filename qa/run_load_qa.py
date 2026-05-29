#!/usr/bin/env python3
import json
import sys
import time
from datetime import date, timedelta
from pathlib import Path

from run_real_user_qa import Client, PASSWORD, reset_database


QA_DIR = Path(__file__).resolve().parent


def check(results, name, ok, details=""):
    results.append({"name": name, "ok": bool(ok), "details": details})
    if not ok:
        print(f"FAIL: {name}: {details}")


def timed(fn):
    start = time.perf_counter()
    value = fn()
    return value, round((time.perf_counter() - start) * 1000, 1)


def setup_client():
    reset_database()
    c = Client()
    c.token = c.call("POST", "/auth/setup", {"password": PASSWORD, "confirm_password": PASSWORD})["access_token"]
    account = c.call("POST", "/accounts", {
        "name": "Load Test Checking",
        "type": "checking",
        "institution": "QA Bank",
        "last_four": "9000",
        "currency": "USD",
    })
    return c, account


def txns(start_idx, count):
    base = date(2025, 1, 1)
    categories = [
        ("Food", "Groceries", "need"),
        ("Dining", "Coffee", "want"),
        ("Utilities", "Electric", "need"),
        ("Shopping", "Online", "want"),
        ("Transportation", "Rideshare", "want"),
        ("Travel", "Flights", "want"),
        ("Healthcare", "Medical", "need"),
        ("Financial", "Investments", "savings"),
    ]
    merchants = ["Whole Foods", "Blue Bottle", "ConEd", "Amazon", "Uber", "Delta", "Clinic", "Vanguard"]
    rows = []
    for i in range(start_idx, start_idx + count):
        day = base + timedelta(days=i % 520)
        if i % 19 == 0:
            rows.append({
                "date": day.isoformat(),
                "description": f"QA Payroll {i}",
                "merchant": "QA Payroll",
                "amount": 3200 + (i % 4) * 25,
                "direction": "credit",
                "category": "Income",
                "subcategory": "Salary",
                "need_want_savings": "savings",
                "fixed_variable": "fixed",
                "personal_work_shared": "personal",
            })
            continue
        cat, sub, nws = categories[i % len(categories)]
        reimb = i % 23 == 0
        rows.append({
            "date": day.isoformat(),
            "description": f"{merchants[i % len(merchants)]} Load Transaction {i}",
            "merchant": merchants[i % len(merchants)],
            "amount": round(5 + (i % 250) * 1.17, 2),
            "direction": "debit",
            "category": cat,
            "subcategory": sub,
            "need_want_savings": nws,
            "fixed_variable": "fixed" if i % 11 == 0 else "variable",
            "personal_work_shared": "work" if reimb else "personal",
            "is_reimbursable": reimb,
            "reimbursement_status": "submitted" if reimb else "not_reimbursable",
            "expected_reimbursement": round(5 + (i % 250) * 1.17, 2) if reimb else None,
            "is_recurring": i % 17 == 0,
            "tags": ["load", cat.lower()],
        })
    return rows


def main():
    results = []
    c, account = setup_client()
    total = 5000
    chunk = 500
    commit_times = []

    for start in range(0, total, chunk):
      payload = {
          "filename": f"load_{start}.csv",
          "institution": "QA Load",
          "account_id": account["id"],
          "transactions": txns(start, chunk),
      }
      result, ms = timed(lambda p=payload: c.call("POST", "/import/commit", p))
      commit_times.append(ms)
      check(results, f"import chunk {start // chunk + 1} committed", result["imported"] == chunk, f"result={result} ms={ms}")

    all_txns, tx_ms = timed(lambda: c.call("GET", "/transactions", query={"page_size": 100, "sort_by": "date", "sort_dir": "desc"}))
    dash, dash_ms = timed(lambda: c.call("GET", "/analytics/dashboard-summary", query={"month": 5, "year": 2026}))
    income, income_ms = timed(lambda: c.call("GET", "/analytics/income-expenses", query={"months": 18}))
    cats, cats_ms = timed(lambda: c.call("GET", "/analytics/category-breakdown", query={"month": 5, "year": 2026}))
    actuals, actuals_ms = timed(lambda: c.call("GET", "/budgets/actuals", query={"month": 5, "year": 2026}))
    backup, backup_ms = timed(lambda: c.call("GET", "/backup/status"))

    timings = {
        "commit_max_ms": max(commit_times),
        "commit_avg_ms": round(sum(commit_times) / len(commit_times), 1),
        "transactions_ms": tx_ms,
        "dashboard_ms": dash_ms,
        "income_expenses_ms": income_ms,
        "category_breakdown_ms": cats_ms,
        "budget_actuals_ms": actuals_ms,
        "backup_status_ms": backup_ms,
    }

    check(results, "all load transactions exist", all_txns["total"] == total, str(all_txns["total"]))
    check(results, "dashboard summary returns sane May numbers", dash["transaction_count"] > 0 and dash["income"] >= 0 and dash["expenses"] >= 0, str(dash))
    check(results, "income-expenses returns requested history", len(income) >= 18, str(len(income)))
    check(results, "category breakdown percentages are sane under load", not cats or 99.0 <= sum(r["pct"] for r in cats) <= 101.0, str(cats[:3]))
    check(results, "budget actuals endpoint stays structured under load", "totals" in actuals and "rows" in actuals, str(actuals.get("totals")))
    check(results, "hot endpoints respond within local threshold", max(tx_ms, dash_ms, income_ms, cats_ms, actuals_ms) < 5000, json.dumps(timings))
    check(results, "import chunks stay within local threshold", max(commit_times) < 30000, json.dumps(timings))
    check(results, "backup status remains available under load", backup.get("status") in {"never", "success", "failed"}, str(backup))

    report = build_report(results, timings, total)
    (QA_DIR / "load_qa_report.md").write_text(report)
    print(report)
    return 1 if any(not r["ok"] for r in results) else 0


def build_report(results, timings, total):
    passed = sum(1 for r in results if r["ok"])
    failed = len(results) - passed
    lines = [
        "# Load QA Report",
        "",
        f"Result: {passed} passed, {failed} failed",
        "",
        f"Generated transactions: {total}",
        "",
        "## Timings",
        "",
        json.dumps(timings, indent=2, sort_keys=True),
        "",
        "## Checks",
        "",
    ]
    for r in results:
        mark = "PASS" if r["ok"] else "FAIL"
        detail = f" - {r['details']}" if r["details"] else ""
        lines.append(f"- {mark}: {r['name']}{detail}")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    sys.exit(main())
