#!/usr/bin/env bash
# ============================================================
#  Finance Dashboard — Start (OS-agnostic)
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── OS detection ──────────────────────────────────────────────────────────────
detect_os() {
  case "$(uname -s)" in
    Darwin) echo "macos" ;;
    Linux)
      grep -qi microsoft /proc/version 2>/dev/null && echo "wsl" || echo "linux"
      ;;
    *) echo "other" ;;
  esac
}
OS=$(detect_os)

open_browser() {
  case "$OS" in
    macos)  open "$1" ;;
    linux)  xdg-open "$1" 2>/dev/null || true ;;
    wsl)    cmd.exe /c start "$1" 2>/dev/null || true ;;
    *)      echo "Open your browser at: $1" ;;
  esac
}

start_docker() {
  case "$OS" in
    macos)
      echo "Docker Desktop is not running. Starting it..."
      open -a Docker 2>/dev/null || true
      ;;
    linux)
      if command -v systemctl &>/dev/null; then
        sudo systemctl start docker 2>/dev/null || true
      fi
      ;;
    wsl)
      echo "Please make sure Docker Desktop is running on Windows, then press Enter."
      read -r
      ;;
  esac
}

# ─── 1. Ensure Docker is running ─────────────────────────────────────────────
if ! docker info > /dev/null 2>&1; then
  start_docker
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
      echo "ERROR: Docker did not start in time. Start it manually and re-run."
      exit 1
    fi
  done
else
  echo "Docker is running."
fi

# ─── 2. First-time check ─────────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "No .env found — running first-time setup…"
  bash setup.sh
  exit 0
fi

# ─── 3. Start containers ─────────────────────────────────────────────────────
echo "Starting Finance Dashboard…"
docker compose up -d --build

echo ""
echo "Waiting for backend to be ready…"

# ─── 4. Wait for backend health ───────────────────────────────────────────────
for i in $(seq 1 30); do
  sleep 2
  if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "Backend is ready."
    break
  fi
  echo -n "."
  if [ "$i" -eq 30 ]; then
    echo ""
    echo "WARNING: Backend is taking longer than expected — opening browser anyway."
  fi
done

# ─── 5. Open browser ──────────────────────────────────────────────────────────
sleep 1
open_browser "http://localhost:3000"

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
