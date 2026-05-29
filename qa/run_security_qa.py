#!/usr/bin/env python3
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QA_DIR = ROOT / "qa"


def check(results, severity, name, ok, details=""):
    results.append({"severity": severity, "name": name, "ok": bool(ok), "details": details})
    if not ok:
        print(f"{severity.upper()}: {name}: {details}")


def http_get(path, headers=None):
    req = urllib.request.Request(f"http://localhost:8000{path}", headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=8) as res:
            return res.status, res.read(200).decode("utf-8", "ignore"), dict(res.headers)
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read(200).decode("utf-8", "ignore"), dict(exc.headers)


def main():
    results = []
    compose = (ROOT / "docker-compose.yml").read_text()
    prod_compose = (ROOT / "docker-compose.prod.yml").read_text()
    config = (ROOT / "backend" / "config.py").read_text()
    auth = (ROOT / "backend" / "api" / "auth.py").read_text()

    protected = [
        "/api/transactions",
        "/api/analytics/dashboard-summary?month=5&year=2026",
        "/api/preferences",
        "/api/backup/status",
        "/api/export/json",
    ]
    unauthorized = {path: http_get(path)[0] for path in protected}
    check(results, "critical", "protected API routes reject anonymous requests", all(code in (401, 403) for code in unauthorized.values()), json.dumps(unauthorized, sort_keys=True))

    bad_secret_default = "change-this-secret-key-in-production-minimum-32-characters"
    check(results, "critical", "production compose requires explicit SECRET_KEY", "SECRET_KEY:?Set a strong SECRET_KEY for production" in prod_compose and bad_secret_default not in prod_compose, "")
    check(results, "warn", "backend warns on default SECRET_KEY", "SECURITY WARNING" in config and bad_secret_default in config, "")
    check(results, "critical", "production compose does not mount Docker socket", "/var/run/docker.sock" not in prod_compose and "updater:" not in prod_compose, "")
    check(results, "warn", "production compose requires explicit CORS/WebAuthn origins", "CORS_ORIGINS: ${CORS_ORIGINS:?Set production frontend origin}" in prod_compose and "WEBAUTHN_ORIGIN: ${WEBAUTHN_ORIGIN:?Set production frontend origin}" in prod_compose, "")
    check(results, "warn", "JWT expiry is finite", "access_token_expire_hours: int = 24" in config, "")
    check(results, "warn", "password hashing is present", "bcrypt" in auth and "verify_password" in auth, "")
    csv_text = "\n".join(p.read_text(errors="ignore") for p in QA_DIR.glob("*.csv"))
    check(results, "warn", "no obvious secret values committed in qa csv files", not re.search(r"(sk-[A-Za-z0-9]{20,}|ANTHROPIC_API_KEY=|OPENAI_API_KEY=)", csv_text), "")

    report = build_report(results)
    (QA_DIR / "security_qa_report.md").write_text(report)
    print(report)
    return 1 if any(not r["ok"] and r["severity"] == "critical" for r in results) else 0


def build_report(results):
    passed = sum(1 for r in results if r["ok"])
    failed = len(results) - passed
    critical_failed = sum(1 for r in results if not r["ok"] and r["severity"] == "critical")
    lines = [
        "# Security QA Report",
        "",
        f"Result: {passed} passed, {failed} failed; critical failures: {critical_failed}",
        "",
        "## Checks",
        "",
    ]
    for r in results:
        mark = "PASS" if r["ok"] else "FAIL"
        detail = f" - {r['details']}" if r["details"] else ""
        lines.append(f"- {mark} [{r['severity']}]: {r['name']}{detail}")
    lines.extend([
        "",
        "## Production Interpretation",
        "",
        "The local compose file remains convenient for development. Use docker-compose.prod.yml for production-style deployment because it requires explicit secrets/origins and does not mount the Docker socket.",
    ])
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    sys.exit(main())
