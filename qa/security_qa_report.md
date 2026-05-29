# Security QA Report

Result: 8 passed, 0 failed; critical failures: 0

## Checks

- PASS [critical]: protected API routes reject anonymous requests - {"/api/analytics/dashboard-summary?month=5&year=2026": 401, "/api/backup/status": 401, "/api/export/json": 401, "/api/preferences": 401, "/api/transactions": 401}
- PASS [critical]: production compose requires explicit SECRET_KEY
- PASS [warn]: backend warns on default SECRET_KEY
- PASS [critical]: production compose does not mount Docker socket
- PASS [warn]: production compose requires explicit CORS/WebAuthn origins
- PASS [warn]: JWT expiry is finite
- PASS [warn]: password hashing is present
- PASS [warn]: no obvious secret values committed in qa csv files

## Production Interpretation

The local compose file remains convenient for development. Use docker-compose.prod.yml for production-style deployment because it requires explicit secrets/origins and does not mount the Docker socket.
