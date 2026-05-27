#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ─── 1. Trigger backup before shutdown ──────────────────────────────────────
echo "Triggering backup before shutdown..."
if curl -s -X POST http://localhost:8000/api/backup/trigger > /dev/null 2>&1; then
  echo "Backup triggered. Waiting 3 seconds..."
  sleep 3
else
  echo "Backup skipped (service unavailable or already stopped)."
fi

# ─── 2. Stop containers ─────────────────────────────────────────────────────
echo "Stopping Finance Dashboard containers..."
docker compose down

echo ""
echo "Finance Dashboard stopped."
echo "Your data is safely stored in the postgres_data Docker volume."
echo "Run ./start.sh to start again."
