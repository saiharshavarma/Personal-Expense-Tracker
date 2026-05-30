# Production Readiness QA Report

Date: 2026-05-29

## Result

Much closer, but not a final production sign-off yet. Backend/data-integrity, responsiveness, backup/restore integrity, load/performance, health, auth-blocking, and production-compose security checks now pass. A real Playwright E2E suite has been added and discovered, but the actual browser run was blocked by the local approval/usage gate in this session.

## Passed

- Backend/data-integrity stress suite: 40/40 passed.
- Responsive browser sweep: 44/44 passed across 11 routes and 4 viewport sizes.
- Backup and restore integrity suite: 21/21 passed.
- Load/performance suite: 18/18 passed with 5,000 generated transactions.
- Security readiness suite: 8/8 passed against `docker-compose.prod.yml` and protected API routes.
- Frontend production build: passed.
- Docker production-like stack: running, backend and Postgres healthy.
- Local health checks:
  - `http://localhost:8000/health`: 200 in about 13 ms.
  - `http://localhost:3000/`: 200 in about 2 ms.
- Unauthorized API checks: protected API routes returned 401.
- UI route smoke: 11/11 primary routes rendered without app errors or document-level overflow.
- UI interactions verified by browser clicks/inspection:
  - Settings tabs clickable.
  - Accounts modal opens and missing-name validation appears.
  - Budget copy/add-category controls open without crashes.
  - Reimbursements create-batch modal opens without crashes.
  - Subscriptions audit mode toggles.
  - Mobile bottom navigation works.
  - Ask AI and Finance Advisor render stable no-provider/disabled states.
- Accessibility heuristic on Settings after patch:
  - Visible buttons have accessible names.
  - No visible button target below 24x24 px.
- Playwright E2E suite added and discoverable:
  - Accounts modal validation/create.
  - Manual transaction validation/create.
  - CSV upload/stage/commit.
  - Subscription create and audit toggle.
  - Trip create.

## Fixes Applied During This Pass

- Added accessible names to icon-only sidebar controls:
  - Collapse/expand sidebar.
  - Theme toggle.
  - Lock app.
- Expanded backup snapshot coverage:
  - Import batches.
  - Income schedules.
  - User preferences.
- Removed generated `net_personal_cost` from backup snapshots so the artifact is safer for future restore tooling.
- Added restore support:
  - Backend `POST /api/backup/restore?confirm_restore=true`.
  - Settings → Backup & Export restore upload UI.
  - Restore preserves current login credentials while replacing finance data.
  - Restore round-trip QA mutates the database after backup, restores from the backup, and verifies the mutation is gone.
- Added `docker-compose.prod.yml` with explicit required production secrets/origins and no updater Docker-socket mount.
- Added repeatable QA scripts:
  - `qa/run_backup_integrity_qa.py`
  - `qa/run_load_qa.py`
  - `qa/run_security_qa.py`
- Added Playwright E2E scaffold:
  - `frontend/playwright.config.ts`
  - `frontend/e2e/production-flows.spec.ts`

## Remaining Blocker For Production Confidence

The remaining blocker is executing the Playwright suite in an environment where Chromium can run and Docker reset permission is available. The suite was added and listed successfully, but `pnpm --dir frontend exec playwright test` was blocked by the local approval/usage gate during this session.

## Production Recommendation

Do not call this 100% production-ready until the new Playwright suite is executed successfully in a normal local/CI environment.

Minimum remaining actions:

- Run `pnpm --dir frontend exec playwright test`.
- If needed, first run `pnpm --dir frontend exec playwright install chromium`.
- Add CI wiring for `qa/run_limit_qa.py`, `qa/run_backup_integrity_qa.py`, `qa/run_load_qa.py`, `qa/run_security_qa.py`, `qa/run_production_readiness_checks.py`, and Playwright.

## Existing Caveats

- Vite reports a large bundle warning. It does not break functionality, but should be addressed before a polished production release.
- Budget actuals subtract received reimbursements, while analytics personal-only uses expected reimbursement. This is internally consistent but should be made explicit in product copy.
- Refund credits are not netted against budget category spend. This matches current backend behavior, but may surprise users.
