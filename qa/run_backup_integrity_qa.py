#!/usr/bin/env python3
import contextlib
import gzip
import io
import json
import sys
from pathlib import Path

import run_real_user_qa
from run_real_user_qa import Client, PASSWORD, raw_post


QA_DIR = Path(__file__).resolve().parent


EXPECTED_KEYS = {
    "backup_version",
    "created_at",
    "accounts",
    "transactions",
    "import_batches",
    "budgets",
    "income_schedules",
    "subscriptions",
    "trips",
    "reimbursement_batches",
    "merchant_rules",
    "user_preferences",
}


def check(results, name, ok, details=""):
    results.append({"name": name, "ok": bool(ok), "details": details})
    if not ok:
        print(f"FAIL: {name}: {details}")


def seed_baseline():
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = run_real_user_qa.main()
    return rc, buf.getvalue()


def login_client():
    c = Client()
    c.token = c.call("POST", "/auth/login", {"password": PASSWORD})["access_token"]
    return c


def main():
    results = []
    rc, output = seed_baseline()
    check(results, "baseline seed passes before backup integrity test", rc == 0, output[-1000:])

    c = login_client()
    status, content_type, backup_bytes = raw_post("/backup/trigger", c.token)
    check(results, "backup endpoint returns gzip download", status == 200 and "application/gzip" in content_type and len(backup_bytes) > 100, f"{status} {content_type} {len(backup_bytes)} bytes")

    snapshot = json.loads(gzip.decompress(backup_bytes).decode("utf-8"))
    missing = sorted(EXPECTED_KEYS - set(snapshot))
    check(results, "snapshot contains all production restore domains", not missing, f"missing={missing}")
    check(results, "snapshot version is current", snapshot.get("backup_version") == "1.1", str(snapshot.get("backup_version")))

    txs = c.call("GET", "/transactions", query={"page_size": 500})
    accounts = c.call("GET", "/accounts")
    budgets = c.call("GET", "/budgets", query={"month": 5, "year": 2026})
    subs = c.call("GET", "/subscriptions")
    trips = c.call("GET", "/trips")
    rules = c.call("GET", "/rules")
    prefs = c.call("GET", "/preferences")
    batches = c.call("GET", "/reimbursements/batches")

    check(results, "transaction count matches snapshot", len(snapshot["transactions"]) == txs["total"], f"snapshot={len(snapshot['transactions'])} api={txs['total']}")
    check(results, "account count matches snapshot", len(snapshot["accounts"]) == len(accounts), f"snapshot={len(snapshot['accounts'])} api={len(accounts)}")
    check(results, "budget count covers API budgets", len(snapshot["budgets"]) >= len(budgets), f"snapshot={len(snapshot['budgets'])} api={len(budgets)}")
    check(results, "subscription count matches snapshot", len(snapshot["subscriptions"]) == len(subs), f"snapshot={len(snapshot['subscriptions'])} api={len(subs)}")
    check(results, "trip count matches snapshot", len(snapshot["trips"]) == len(trips), f"snapshot={len(snapshot['trips'])} api={len(trips)}")
    check(results, "merchant rules count matches snapshot", len(snapshot["merchant_rules"]) == len(rules), f"snapshot={len(snapshot['merchant_rules'])} api={len(rules)}")
    check(results, "reimbursement batch count matches snapshot", len(snapshot["reimbursement_batches"]) == len(batches), f"snapshot={len(snapshot['reimbursement_batches'])} api={len(batches)}")
    check(results, "preferences are included and masked enough for restore metadata", len(snapshot["user_preferences"]) == 1 and snapshot["user_preferences"][0]["currency"] == prefs["currency"], str(snapshot["user_preferences"]))
    check(results, "import batches are included", len(snapshot["import_batches"]) >= 2, str(len(snapshot["import_batches"])))

    ids = [t["id"] for t in snapshot["transactions"]]
    hashes = [t.get("duplicate_hash") for t in snapshot["transactions"] if t.get("duplicate_hash")]
    check(results, "snapshot transaction ids are unique", len(ids) == len(set(ids)), "")
    check(results, "snapshot duplicate hashes are unique", len(hashes) == len(set(hashes)), "")
    check(results, "snapshot contains no generated net_personal_cost field", all("net_personal_cost" not in t for t in snapshot["transactions"]), "")

    report = build_report(results, snapshot)
    (QA_DIR / "backup_integrity_qa_report.md").write_text(report)
    print(report)
    return 1 if any(not r["ok"] for r in results) else 0


def build_report(results, snapshot):
    passed = sum(1 for r in results if r["ok"])
    failed = len(results) - passed
    counts = {
        key: len(snapshot.get(key, []))
        for key in EXPECTED_KEYS
        if isinstance(snapshot.get(key), list)
    }
    lines = [
        "# Backup Integrity QA Report",
        "",
        f"Result: {passed} passed, {failed} failed",
        "",
        "## Snapshot Counts",
        "",
        json.dumps(counts, indent=2, sort_keys=True),
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
        "## Restore Note",
        "",
        "This validates that the backup artifact contains the domains required for restore. A restore endpoint/CLI is still not implemented, so a destructive automated restore round-trip cannot be claimed yet.",
    ])
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    sys.exit(main())
