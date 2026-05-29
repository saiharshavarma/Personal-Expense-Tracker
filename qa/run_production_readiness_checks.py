#!/usr/bin/env python3
import json
import time
import urllib.error
import urllib.request


def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    start = time.perf_counter()
    with urllib.request.urlopen(req, timeout=8) as res:
        body = res.read(300)
        return {
            "url": url,
            "status": res.status,
            "ms": round((time.perf_counter() - start) * 1000, 1),
            "sample": body[:120].decode("utf-8", "ignore"),
        }


def unauthorized_check(path):
    url = f"http://localhost:8000{path}"
    try:
        get(url)
        return {"path": path, "blocked": False, "status": 200}
    except urllib.error.HTTPError as exc:
        return {"path": path, "blocked": exc.code in (401, 403), "status": exc.code}


def main():
    checks = {
        "health": [
            get("http://localhost:8000/health"),
            get("http://localhost:3000/"),
        ],
        "unauthorized_api": [
            unauthorized_check("/api/transactions"),
            unauthorized_check("/api/analytics/dashboard-summary?month=5&year=2026"),
            unauthorized_check("/api/preferences"),
            unauthorized_check("/api/backup/status"),
        ],
    }
    print(json.dumps(checks, indent=2))
    failed = [
        c for c in checks["unauthorized_api"]
        if not c["blocked"]
    ]
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
