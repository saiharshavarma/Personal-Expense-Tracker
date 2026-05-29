import asyncio
import os
import subprocess
from datetime import datetime
from typing import Any

from fastapi import BackgroundTasks, FastAPI, HTTPException


REPO_PATH = os.environ.get("REPO_PATH", "/workspace")
REMOTE = "origin"
REMOTE_BRANCH = "main"

app = FastAPI(title="Finance Dashboard Updater", version="1.0.0")

job: dict[str, Any] = {
    "running": False,
    "status": "idle",
    "started_at": None,
    "finished_at": None,
    "error": None,
    "log": [],
}
job_lock = asyncio.Lock()


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _run(args: list[str], *, timeout: int = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=REPO_PATH,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
        check=False,
    )


def _must_run(args: list[str], *, timeout: int = 120) -> str:
    result = _run(args, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(f"{' '.join(args)} failed:\n{result.stdout.strip()}")
    return result.stdout.strip()


def _append_log(line: str) -> None:
    job["log"].append(f"{_now()} {line}")
    job["log"] = job["log"][-80:]


def _ensure_repo_allowed() -> None:
    _run(["git", "config", "--global", "--add", "safe.directory", REPO_PATH], timeout=10)


def _status(fetch: bool = True) -> dict[str, Any]:
    _ensure_repo_allowed()

    if fetch:
        fetch_result = _run(["git", "fetch", REMOTE, REMOTE_BRANCH], timeout=180)
        remote_reachable = fetch_result.returncode == 0
        fetch_error = None if remote_reachable else fetch_result.stdout.strip()
    else:
        remote_reachable = True
        fetch_error = None

    branch = _must_run(["git", "branch", "--show-current"], timeout=10) or "detached"
    local_sha = _must_run(["git", "rev-parse", "HEAD"], timeout=10)

    remote_ref = f"{REMOTE}/{REMOTE_BRANCH}"
    remote_result = _run(["git", "rev-parse", remote_ref], timeout=10)
    remote_sha = remote_result.stdout.strip() if remote_result.returncode == 0 else None

    dirty_output = _must_run(["git", "status", "--porcelain"], timeout=10)
    dirty_files = [line for line in dirty_output.splitlines() if line.strip()]
    dirty = len(dirty_files) > 0

    ahead = 0
    behind = 0
    diverged = False
    if remote_sha:
        counts = _must_run(["git", "rev-list", "--left-right", "--count", f"HEAD...{remote_ref}"], timeout=10)
        parts = counts.split()
        if len(parts) == 2:
            ahead = int(parts[0])
            behind = int(parts[1])
            diverged = ahead > 0 and behind > 0

    update_available = remote_reachable and bool(remote_sha) and behind > 0 and ahead == 0 and not dirty
    blocked_reason = None
    if not remote_reachable:
        blocked_reason = "Could not reach GitHub to check for updates."
    elif not remote_sha:
        blocked_reason = "Could not find origin/main."
    elif dirty:
        blocked_reason = "Local code changes are present. Commit or stash them before updating."
    elif ahead > 0 and behind > 0:
        blocked_reason = "Local code has diverged from origin/main."
    elif ahead > 0:
        blocked_reason = "Local code has commits that are not on origin/main."

    return {
        "branch": branch,
        "remote": REMOTE,
        "remote_branch": REMOTE_BRANCH,
        "local_sha": local_sha,
        "remote_sha": remote_sha,
        "dirty": dirty,
        "dirty_count": len(dirty_files),
        "ahead": ahead,
        "behind": behind,
        "diverged": diverged,
        "remote_reachable": remote_reachable,
        "fetch_error": fetch_error,
        "update_available": update_available,
        "blocked_reason": blocked_reason,
        "checked_at": _now(),
    }


def _run_update() -> None:
    try:
        job["status"] = "running"
        _append_log("Checking repository state.")
        current = _status(fetch=True)

        if current["blocked_reason"]:
            raise RuntimeError(current["blocked_reason"])
        if not current["update_available"]:
            job["status"] = "complete"
            _append_log("Application is already up to date.")
            return

        _append_log(f"Pulling {REMOTE}/{REMOTE_BRANCH}.")
        _must_run(["git", "pull", "--ff-only", REMOTE, REMOTE_BRANCH], timeout=240)

        _append_log("Rebuilding and restarting application containers.")
        _must_run(["docker", "compose", "up", "-d", "--build", "postgres", "backend", "frontend"], timeout=1800)

        job["status"] = "complete"
        _append_log("Update complete.")
    except Exception as exc:
        job["status"] = "failed"
        job["error"] = str(exc)
        _append_log(f"Update failed: {exc}")
    finally:
        job["running"] = False
        job["finished_at"] = _now()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/update/status")
async def update_status() -> dict[str, Any]:
    try:
        return _status(fetch=True)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/update")
async def start_update(background_tasks: BackgroundTasks) -> dict[str, Any]:
    async with job_lock:
        if job["running"]:
            raise HTTPException(status_code=409, detail="Update already running.")
        job.update({
            "running": True,
            "status": "queued",
            "started_at": _now(),
            "finished_at": None,
            "error": None,
            "log": [],
        })
        background_tasks.add_task(_run_update)
        return job


@app.get("/update/job")
async def update_job() -> dict[str, Any]:
    return job
