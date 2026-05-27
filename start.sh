#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ─── 1. Ensure Docker Desktop is running ────────────────────────────────────
if ! docker info > /dev/null 2>&1; then
  echo "Docker Desktop is not running. Starting it..."
  open -a "Docker"
  echo -n "Waiting for Docker to become ready"
  for i in $(seq 1 30); do
    sleep 2
    if docker info > /dev/null 2>&1; then
      echo " ready."
      break
    fi
    echo -n "."
    if [ "$i" -eq 30 ]; then
      echo ""
      echo "ERROR: Docker Desktop failed to start after 60 seconds."
      echo "Please start Docker Desktop manually and re-run this script."
      exit 1
    fi
  done
else
  echo "Docker Desktop is running."
fi

# ─── 2. Create .env if it doesn't exist ─────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
  echo ""
  echo "NOTE: Edit .env to set your ANTHROPIC_API_KEY and/or OPENAI_API_KEY"
  echo "      if you want AI-powered categorization and insights."
  echo ""
fi

# ─── 3. Start containers ────────────────────────────────────────────────────
echo "Starting Finance Dashboard containers..."
docker compose up -d --build

echo ""
echo "Containers starting. Waiting for backend to be ready..."

# ─── 4. Wait for backend health endpoint ────────────────────────────────────
for i in $(seq 1 30); do
  sleep 2
  if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "Backend is ready."
    break
  fi
  echo -n "."
  if [ "$i" -eq 30 ]; then
    echo ""
    echo "WARNING: Backend is taking longer than expected to start."
    echo "         Opening browser anyway — it may need another moment."
  fi
done

# ─── 5. Open browser ────────────────────────────────────────────────────────
sleep 1
open http://localhost:3000

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║         Finance Dashboard is running          ║"
echo "║                                               ║"
echo "║  Frontend:  http://localhost:3000             ║"
echo "║  Backend:   http://localhost:8000             ║"
echo "║  API docs:  http://localhost:8000/docs        ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""
echo "Run ./stop.sh to shut down."
