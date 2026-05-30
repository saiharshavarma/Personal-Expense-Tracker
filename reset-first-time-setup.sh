#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-finance-postgres}"
DB_USER="${DB_USER:-financeuser}"
DB_NAME="${DB_NAME:-finance_dashboard}"

usage() {
  cat <<'EOF'
Usage:
  ./reset-first-time-setup.sh --yes

Resets the local app back to the first-time setup screen by clearing only:
  - onboarding_complete
  - password_hash
  - recovery_token_hash
  - webauthn_credential

It does not delete accounts, transactions, budgets, imports, subscriptions,
trips, reimbursements, rules, backups, or other finance data.

Environment overrides:
  COMPOSE_FILE=docker-compose.yml
  POSTGRES_CONTAINER=finance-postgres
  DB_USER=financeuser
  DB_NAME=finance_dashboard
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "${1:-}" != "--yes" ]]; then
  usage
  echo
  echo "Refusing to run without --yes."
  exit 2
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but was not found in PATH." >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$POSTGRES_CONTAINER"; then
  echo "Postgres container '$POSTGRES_CONTAINER' is not running. Starting the database..." >&2
  docker compose -f "$COMPOSE_FILE" up -d postgres
fi

echo "Resetting local auth/setup state. Finance data will be preserved."

docker exec "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO user_preferences (id, onboarding_complete)
VALUES (1, false)
ON CONFLICT (id) DO UPDATE
SET
  onboarding_complete = false,
  password_hash = NULL,
  recovery_token_hash = NULL,
  webauthn_credential = NULL,
  updated_at = NOW();
SQL

echo
echo "Done. Reload http://localhost:3000 and the first-time setup screen should appear."
echo "After creating a new password, save the newly displayed recovery token."
