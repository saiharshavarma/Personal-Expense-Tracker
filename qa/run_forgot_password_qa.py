#!/usr/bin/env python3
import contextlib
import io
import sys
from pathlib import Path

import run_real_user_qa
from run_real_user_qa import Client, PASSWORD


QA_DIR = Path(__file__).resolve().parent
NEW_PASSWORD = "QA-New-Reset-Password-2026"


def check(results, name, ok, details=""):
    results.append({"name": name, "ok": bool(ok), "details": details})
    if not ok:
        print(f"FAIL: {name}: {details}")


def seed_baseline():
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = run_real_user_qa.main()
    return rc, buf.getvalue()


def main():
    results = []
    rc, output = seed_baseline()
    check(
        results,
        "baseline seed passes before forgot-password test",
        rc == 0,
        "real-user QA seed completed" if rc == 0 else output[-1000:],
    )

    c = Client()
    c.token = c.call("POST", "/auth/login", {"password": PASSWORD})["access_token"]
    before = c.call("GET", "/transactions", query={"page_size": 500})
    check(results, "seed contains finance data before reset", before["total"] > 0, str(before["total"]))
    recovery = c.call("POST", "/auth/recovery-token/regenerate")
    recovery_token = recovery["recovery_token"]
    status_before = c.call("GET", "/auth/status")
    check(results, "recovery token is configured", status_before["has_recovery_token"], str(status_before))

    bad = c.call("POST", "/auth/forgot-password/reset", {
        "new_password": NEW_PASSWORD,
        "confirm_new_password": NEW_PASSWORD,
        "recovery_token": "FD-RECOVERY-wrong-token",
    }, expect=401)
    check(results, "bad recovery token is rejected", bad["status"] == 401, bad["detail"])

    reset = c.call("POST", "/auth/forgot-password/reset", {
        "new_password": NEW_PASSWORD,
        "confirm_new_password": NEW_PASSWORD,
        "recovery_token": recovery_token,
    })
    check(results, "reset returns a fresh token", bool(reset.get("access_token")) and reset["token_type"] == "bearer", str(reset))

    old_login = c.call("POST", "/auth/login", {"password": PASSWORD}, expect=401)
    check(results, "old password no longer works", old_login["status"] == 401, old_login["detail"])

    fresh = Client()
    fresh.token = fresh.call("POST", "/auth/login", {"password": NEW_PASSWORD})["access_token"]
    after = fresh.call("GET", "/transactions", query={"page_size": 500})
    status = fresh.call("GET", "/auth/status")
    prefs = fresh.call("GET", "/preferences")
    check(results, "new password logs in", bool(fresh.token), "")
    check(results, "reset preserves finance transactions", after["total"] == before["total"], str(after["total"]))
    check(results, "app remains onboarded after reset", status["onboarding_complete"] and status["has_password"] and status["has_recovery_token"], str(status))
    check(results, "preferences are preserved", prefs["currency"] == "USD" and prefs["theme"] == "dark", str(prefs))

    restore_rc, restore_output = seed_baseline()
    check(
        results,
        "baseline password is restored after forgot-password test",
        restore_rc == 0,
        "real-user QA seed completed" if restore_rc == 0 else restore_output[-1000:],
    )

    report = build_report(results)
    (QA_DIR / "forgot_password_qa_report.md").write_text(report)
    print(report)
    return 1 if any(not r["ok"] for r in results) else 0


def build_report(results):
    passed = sum(1 for r in results if r["ok"])
    failed = len(results) - passed
    lines = [
        "# Forgot Password QA Report",
        "",
        f"Result: {passed} passed, {failed} failed",
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
        "## Interpretation",
        "",
        "Forgot password is implemented as a recovery-token password reset. The old password cannot be recovered, but local finance data and settings are preserved when the saved recovery token is provided.",
    ])
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    sys.exit(main())
