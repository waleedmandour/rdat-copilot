#!/usr/bin/env bash
# ── RDAT Copilot — Deploy Frontend to GitHub Pages ────────────────
#
# Builds the Next.js static export and deploys to GitHub Pages.
# This script is for manual deployment. CI/CD handles automatic deploys.
#
# Usage:
#   ./scripts/deploy-pages.sh
#
# Prerequisites:
#   - Node.js 20+
#   - npm
#   - Git
#
# Phase 3: CI/CD & Deployment

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
log_err()  { echo -e "${RED}[ERROR]${NC} $1"; }

cd "$PROJECT_DIR"

# ── Pre-flight checks ─────────────────────────────────────────────
log_info "Running pre-flight checks..."

if ! command -v node &>/dev/null; then
    log_err "Node.js is not installed. Please install Node.js 20+."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    log_err "Node.js 20+ required. Current: $(node -v)"
    exit 1
fi
log_ok "Node.js $(node -v)"

# ── Install dependencies ──────────────────────────────────────────
log_info "Installing npm dependencies..."
npm ci
log_ok "Dependencies installed"

# ── Run quality checks ────────────────────────────────────────────
log_info "Running linter..."
npm run lint
log_ok "Lint passed"

log_info "Running tests..."
npm run test:run
log_ok "Tests passed"

# ── Build static export ───────────────────────────────────────────
log_info "Building static export for GitHub Pages..."
NEXT_PUBLIC_LOCAL_BACKEND_URL=http://localhost:8000 npm run build
log_ok "Static export built to ./out"

# ── Verify output ─────────────────────────────────────────────────
if [ ! -d "out" ]; then
    log_err "Build output directory 'out' not found. Check next.config.mjs has output: 'export'."
    exit 1
fi

FILE_COUNT=$(find out -type f | wc -l)
log_ok "Built $FILE_COUNT files"

# ── Deploy ────────────────────────────────────────────────────────
log_info "To deploy to GitHub Pages:"
log_info "  1. Push to main branch (automatic CI/CD deployment)"
log_info "  2. Or manually: copy ./out contents to gh-pages branch"
log_info ""
log_info "The GitHub Actions workflow (.github/workflows/deploy.yml) handles"
log_info "automatic deployment on every push to the main branch."
