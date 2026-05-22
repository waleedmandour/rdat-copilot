#!/usr/bin/env bash
# ── RDAT Copilot — Backend Startup Script ─────────────────────────
#
# Starts the FastAPI backend with proper environment setup.
# Supports both local and Docker-based startup.
#
# Usage:
#   ./scripts/start-backend.sh           # Local (venv)
#   ./scripts/start-backend.sh --docker  # Docker
#
# Phase 3: CI/CD & Deployment

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_err()  { echo -e "${RED}[ERROR]${NC} $1"; }

# ── Load .env if present ──────────────────────────────────────────
if [ -f "$BACKEND_DIR/.env" ]; then
    set -a
    source "$BACKEND_DIR/.env"
    set +a
    log_ok "Loaded .env from $BACKEND_DIR/.env"
fi

# Defaults
export RDAT_DB_PATH="${RDAT_DB_PATH:-rdat_copilot.db}"
export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"
export OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:7b}"
export UVICORN_HOST="${UVICORN_HOST:-0.0.0.0}"
export UVICORN_PORT="${UVICORN_PORT:-8000}"
export UVICORN_WORKERS="${UVICORN_WORKERS:-1}"

# ── Docker mode ───────────────────────────────────────────────────
if [ "${1:-}" = "--docker" ]; then
    log_info "Starting backend in Docker mode..."

    if ! command -v docker &>/dev/null; then
        log_err "Docker is not installed. Please install Docker first."
        exit 1
    fi

    if ! docker compose version &>/dev/null; then
        log_err "Docker Compose V2 is not available. Please install Docker Compose."
        exit 1
    fi

    cd "$PROJECT_DIR"
    docker compose up -d --build
    log_ok "Backend started in Docker on http://localhost:$UVICORN_PORT"
    log_info "View logs: docker compose logs -f"
    log_info "Stop: docker compose down"
    exit 0
fi

# ── Local mode ────────────────────────────────────────────────────
log_info "Starting backend locally..."

cd "$BACKEND_DIR"

# Check Python
if ! command -v python3 &>/dev/null; then
    log_err "Python 3 is not installed. Please install Python 3.12+."
    exit 1
fi

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
log_info "Python version: $PYTHON_VERSION"

# Create venv if needed
VENV_DIR="$BACKEND_DIR/.venv"
if [ ! -d "$VENV_DIR" ]; then
    log_info "Creating Python virtual environment..."
    python3 -m venv "$VENV_DIR"
    log_ok "Virtual environment created"
fi

# Activate venv
source "$VENV_DIR/bin/activate"

# Install dependencies
log_info "Installing Python dependencies..."
pip install -q -r requirements.txt
log_ok "Dependencies installed"

# Check Ollama
log_info "Checking Ollama at $OLLAMA_BASE_URL..."
if curl -sf "${OLLAMA_BASE_URL}/api/tags" >/dev/null 2>&1; then
    log_ok "Ollama is running"
else
    log_warn "Ollama is not reachable at $OLLAMA_BASE_URL"
    log_warn "Install Ollama: https://ollama.com"
    log_warn "Pull model: ollama pull $OLLAMA_MODEL"
fi

# Start uvicorn
log_info "Starting FastAPI backend on http://${UVICORN_HOST}:${UVICORN_PORT}"
log_info "Press Ctrl+C to stop"

exec uvicorn app.main:app \
    --host "$UVICORN_HOST" \
    --port "$UVICORN_PORT" \
    --workers "$UVICORN_WORKERS" \
    --reload
