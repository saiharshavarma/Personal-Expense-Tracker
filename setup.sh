#!/usr/bin/env bash
# ============================================================
#  Finance Dashboard — First-time setup
#  OS-agnostic: macOS, Linux, Windows (WSL2)
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${BLUE}▸${RESET} $*"; }
success() { echo -e "${GREEN}✔${RESET} $*"; }
warn()    { echo -e "${YELLOW}⚠${RESET}  $*"; }
error()   { echo -e "${RED}✖${RESET} $*" >&2; }
step()    { echo -e "\n${BOLD}$*${RESET}"; }

# ── Detect OS ────────────────────────────────────────────────────────────────
detect_os() {
  case "$(uname -s)" in
    Darwin) echo "macos" ;;
    Linux)
      if grep -qi microsoft /proc/version 2>/dev/null; then
        echo "wsl"
      else
        echo "linux"
      fi
      ;;
    CYGWIN*|MINGW*|MSYS*) echo "windows" ;;
    *) echo "unknown" ;;
  esac
}

# ── Detect architecture ───────────────────────────────────────────────────────
detect_arch() {
  case "$(uname -m)" in
    arm64|aarch64) echo "arm64" ;;
    x86_64|amd64)  echo "amd64" ;;
    *)             echo "amd64" ;;  # fallback
  esac
}

OS=$(detect_os)
ARCH=$(detect_arch)

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║       Finance Dashboard — Setup              ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${RESET}"
echo ""
info "Detected OS: ${OS} | Architecture: ${ARCH}"

# ── Step 1: Check Docker ──────────────────────────────────────────────────────
step "Step 1/5 — Checking Docker"

install_docker_instructions() {
  error "Docker is not installed."
  echo ""
  case "$OS" in
    macos)
      echo "  Install Docker Desktop for Mac:"
      echo "  https://docs.docker.com/desktop/install/mac-install/"
      echo ""
      echo "  Or with Homebrew:  brew install --cask docker"
      ;;
    linux)
      echo "  Install Docker Engine:"
      echo "  https://docs.docker.com/engine/install/"
      echo ""
      echo "  Quick install (Ubuntu/Debian):"
      echo "    curl -fsSL https://get.docker.com | sh"
      echo "    sudo usermod -aG docker \$USER  # then log out and back in"
      ;;
    wsl)
      echo "  Install Docker Desktop for Windows with WSL2 backend:"
      echo "  https://docs.docker.com/desktop/install/windows-install/"
      echo ""
      echo "  Make sure 'Use the WSL 2 based engine' is enabled in Docker Desktop settings."
      ;;
    *)
      echo "  https://docs.docker.com/get-docker/"
      ;;
  esac
  echo ""
  exit 1
}

if ! command -v docker &>/dev/null; then
  install_docker_instructions
fi
success "Docker CLI found: $(docker --version 2>&1 | head -1)"

# ── Step 2: Start Docker daemon ───────────────────────────────────────────────
step "Step 2/5 — Ensuring Docker daemon is running"

start_docker_daemon() {
  case "$OS" in
    macos)
      info "Starting Docker Desktop…"
      open -a Docker 2>/dev/null || true
      ;;
    linux)
      if command -v systemctl &>/dev/null; then
        info "Starting Docker via systemctl…"
        sudo systemctl start docker 2>/dev/null || true
      fi
      ;;
    wsl)
      info "Please make sure Docker Desktop is running on Windows."
      ;;
  esac
}

open_browser() {
  case "$OS" in
    macos)   open "$1" ;;
    linux)   xdg-open "$1" 2>/dev/null || true ;;
    wsl)     cmd.exe /c start "$1" 2>/dev/null || true ;;
    *)       info "Open your browser at: $1" ;;
  esac
}

if ! docker info &>/dev/null; then
  start_docker_daemon
  info "Waiting for Docker to become ready (up to 60 s)…"
  for i in $(seq 1 30); do
    sleep 2
    if docker info &>/dev/null; then
      success "Docker is ready."
      break
    fi
    printf "."
    if [ "$i" -eq 30 ]; then
      echo ""
      error "Docker did not start within 60 seconds."
      echo "  Please start Docker manually and re-run this script."
      exit 1
    fi
  done
else
  success "Docker daemon is running."
fi

# ── Step 3: Create .env ───────────────────────────────────────────────────────
step "Step 3/5 — Environment configuration"

if [ -f .env ]; then
  success ".env already exists — skipping."
else
  cp .env.example .env

  # Generate a cryptographically random SECRET_KEY
  if command -v openssl &>/dev/null; then
    GENERATED_KEY="$(openssl rand -hex 32)"
  elif command -v python3 &>/dev/null; then
    GENERATED_KEY="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  else
    GENERATED_KEY="fintrack-$(date +%s)-$(hostname)-please-change-me-in-production"
  fi

  # Portable sed: works on macOS (BSD sed) and Linux (GNU sed)
  if [[ "$OS" == "macos" ]]; then
    sed -i '' "s|change-this-secret-key-in-production-minimum-32-characters|${GENERATED_KEY}|g" .env
  else
    sed -i "s|change-this-secret-key-in-production-minimum-32-characters|${GENERATED_KEY}|g" .env
  fi

  success "Created .env with a fresh SECRET_KEY."
  echo ""
  warn "Optional: edit .env to add your AI API key(s) for smart categorization:"
  echo "    ANTHROPIC_API_KEY=sk-ant-...   (Claude — recommended)"
  echo "    OPENAI_API_KEY=sk-...          (OpenAI — alternative)"
  echo ""
fi

# ── Step 4: Set DOCKER_PLATFORM in .env ──────────────────────────────────────
step "Step 4/5 — Platform configuration"

PLATFORM_VALUE="linux/${ARCH}"
if grep -q "^DOCKER_PLATFORM=" .env 2>/dev/null; then
  # Update existing entry
  if [[ "$OS" == "macos" ]]; then
    sed -i '' "s|^DOCKER_PLATFORM=.*|DOCKER_PLATFORM=${PLATFORM_VALUE}|" .env
  else
    sed -i "s|^DOCKER_PLATFORM=.*|DOCKER_PLATFORM=${PLATFORM_VALUE}|" .env
  fi
else
  echo "DOCKER_PLATFORM=${PLATFORM_VALUE}" >> .env
fi
success "Docker platform set to: ${PLATFORM_VALUE}"

# ── Step 5: Build & start containers ─────────────────────────────────────────
step "Step 5/5 — Starting containers"

info "Building and starting Finance Dashboard (first build may take a few minutes)…"
docker compose up -d --build

echo ""
info "Waiting for the backend to become healthy…"
for i in $(seq 1 40); do
  sleep 3
  if curl -sf http://localhost:8000/health &>/dev/null; then
    success "Backend is healthy."
    break
  fi
  printf "."
  if [ "$i" -eq 40 ]; then
    echo ""
    warn "Backend is taking longer than expected — opening browser anyway."
  fi
done

echo ""
open_browser "http://localhost:3000"

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║   Finance Dashboard is up and running! 🎉    ║${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  Frontend  →  ${BOLD}http://localhost:3000${RESET}"
echo -e "  Backend   →  ${BOLD}http://localhost:8000${RESET}"
echo -e "  API docs  →  ${BOLD}http://localhost:8000/docs${RESET}"
echo ""
echo -e "  ${BLUE}Next time, just run:${RESET} ${BOLD}./start.sh${RESET}"
echo -e "  ${BLUE}To stop:${RESET}           ${BOLD}./stop.sh${RESET}"
echo ""
