# ── RDAT Copilot — Backend Dockerfile ──────────────────────────────
#
# Multi-stage build for the FastAPI backend.
# Stage 1: Install Python dependencies
# Stage 2: Production image with minimal footprint
#
# Usage:
#   docker build -t rdat-copilot-backend .
#   docker run -p 8000:8000 -v rdat-data:/data rdat-copilot-backend
#
# Phase 3: CI/CD & Deployment

# ── Stage 1: Builder ─────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: Production ──────────────────────────────────────────
FROM python:3.12-slim AS production

LABEL maintainer="RDAT Copilot"
LABEL description="Local-first translation backend with Ollama LLM + SQLite TM + FTS5"

# Create non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser

WORKDIR /app

# Copy installed dependencies from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY backend/app ./app

# Create data directory for SQLite database
RUN mkdir -p /data && chown appuser:appuser /data

# Environment variables
ENV RDAT_DB_PATH=/data/rdat_copilot.db
ENV OLLAMA_BASE_URL=http://host.docker.internal:11434
ENV OLLAMA_MODEL=qwen2.5:7b
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Switch to non-root user
USER appuser

# Expose FastAPI port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import httpx; r = httpx.get('http://localhost:8000/health'); r.raise_for_status()" || exit 1

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
