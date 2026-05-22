# Deployment Guide

This guide covers all deployment scenarios for RDAT Copilot.

---

## Architecture Overview

RDAT Copilot uses a **split deployment** model:

| Component   | Where          | How                                    |
|------------|----------------|----------------------------------------|
| Frontend   | GitHub Pages   | Static export, auto-deployed via CI/CD |
| Backend    | User's machine | Docker or Python, connects to Ollama   |
| LLM        | User's machine | Ollama with qwen2.5:7b model          |

The frontend is a static site that makes HTTP/SSE requests to the backend running on `localhost:8000`. There is no cloud backend — all LLM inference happens locally via Ollama.

---

## Frontend: GitHub Pages

The frontend is automatically deployed to GitHub Pages via the `.github/workflows/deploy.yml` workflow on every push to the `main` branch.

### Initial Setup

1. Go to your repository on GitHub
2. Navigate to **Settings → Pages**
3. Under **Source**, select **GitHub Actions**
4. Push to `main` to trigger the first deployment

The site will be available at: `https://waleedmandour.github.io/rdat-copilot/`

### Manual Deployment

If you need to deploy manually (e.g., for testing):

```bash
# Build the static export
npm run build

# The output is in ./out — deploy this to any static hosting
```

### Configuration

The frontend is configured via environment variables at build time:

| Variable                          | Default                    | Description               |
|-----------------------------------|----------------------------|---------------------------|
| `NEXT_PUBLIC_LOCAL_BACKEND_URL`   | `http://localhost:8000`    | Backend URL for API calls |

Set these in `.env.local` for development or as GitHub Actions secrets for production builds.

### Build Configuration

The static export is configured in `next.config.mjs`:

```javascript
output: "export",           // Static HTML/JS/CSS output
basePath: "/rdat-copilot",  // GitHub Pages project path
assetPrefix: "/rdat-copilot/",
trailingSlash: true,        // GitHub Pages compatibility
images: { unoptimized: true } // Required for static export
```

---

## Backend: Docker (Recommended)

Docker is the recommended way to run the backend because it provides a consistent, reproducible environment with built-in health checks.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose V2
- [Ollama](https://ollama.com) installed and running on the host

### Quick Start

```bash
# 1. Start Ollama (if not already running)
ollama serve

# 2. Pull the default translation model
ollama pull qwen2.5:7b

# 3. Start the backend
./scripts/start-backend.sh --docker
```

The backend will be available at `http://localhost:8000`.

### Docker Compose

The `docker-compose.yml` provides:

- **Port mapping**: `8000:8000`
- **Persistent volume**: `rdat-data` for the SQLite database
- **Ollama connectivity**: `host.docker.internal` to reach the host's Ollama
- **Health check**: Every 30 seconds, verifies `/health` endpoint
- **Auto-restart**: Restarts unless explicitly stopped

```bash
# Start in background
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Rebuild after code changes
docker compose up -d --build
```

### Environment Variables

Configure via `backend/.env` or directly in `docker-compose.yml`:

| Variable           | Default                              | Description                    |
|-------------------|--------------------------------------|--------------------------------|
| `RDAT_DB_PATH`    | `/data/rdat_copilot.db` (Docker)     | SQLite database file path      |
| `OLLAMA_BASE_URL` | `http://host.docker.internal:11434`  | Ollama API URL                 |
| `OLLAMA_MODEL`    | `qwen2.5:7b`                         | Default LLM model              |

### Data Persistence

The SQLite database is stored in a Docker volume named `rdat-data`. This ensures your Translation Memory, glossary, and segments survive container restarts and updates.

```bash
# Inspect the volume
docker volume inspect rdat_copilot_rdat-data

# Backup the database
docker cp rdat-copilot-backend:/data/rdat_copilot.db ./backup.db
```

---

## Backend: Python (Direct)

For development or when Docker is not available, run the backend directly with Python.

### Prerequisites

- **Python 3.12+** with pip
- **Ollama** installed and running

### Quick Start

```bash
# 1. Start Ollama
ollama serve

# 2. Pull the model
ollama pull qwen2.5:7b

# 3. Start the backend (auto-creates venv)
./scripts/start-backend.sh
```

Or manually:

```bash
cd backend

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the server
uvicorn app.main:app --reload --port 8000
```

### Environment Variables

Create `backend/.env` from the example:

```bash
cp backend/.env.example backend/.env
```

| Variable           | Default                    | Description               |
|-------------------|----------------------------|---------------------------|
| `RDAT_DB_PATH`    | `rdat_copilot.db`          | SQLite database path      |
| `OLLAMA_BASE_URL` | `http://localhost:11434`   | Ollama API URL            |
| `OLLAMA_MODEL`    | `qwen2.5:7b`              | Default LLM model         |
| `UVICORN_HOST`    | `0.0.0.0`                 | Bind host                 |
| `UVICORN_PORT`    | `8000`                     | Bind port                 |
| `UVICORN_WORKERS` | `1`                        | Worker count              |

---

## Ollama Setup

Ollama is the LLM inference engine that powers Channel 2 (neural translation). It must be running on the same machine as the backend.

### Installation

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows
# Download from https://ollama.com/download/windows
```

### Model Management

```bash
# Pull the default model (recommended for Arabic translation)
ollama pull qwen2.5:7b

# Alternative models
ollama pull llama3.1:8b
ollama pull mistral:7b
ollama pull gemma2:9b

# List installed models
ollama list

# Start the server
ollama serve
```

### Why qwen2.5:7b?

The Qwen 2.5 7B model provides the best Arabic translation quality among 7B-class models. It has:
- Superior Arabic language understanding
- Strong instruction following for translation tasks
- Efficient inference on consumer hardware (8GB+ RAM)
- Good balance of quality and speed

---

## CI/CD Pipeline

### Frontend Deployment

The `.github/workflows/deploy.yml` workflow:

1. **Triggers**: Push to `main` (frontend paths only)
2. **Steps**: Install deps → lint → test → build static export → deploy to GitHub Pages
3. **Permissions**: Read repository, write Pages, ID token for deployment

### Backend CI

The `.github/workflows/backend-ci.yml` workflow:

1. **Triggers**: Push/PR to `main` (backend paths only)
2. **Steps**: Install Python deps → ruff lint → ruff format check → pytest
3. **Test database**: Uses in-memory SQLite (`:memory:`)

---

## Troubleshooting

### Backend Not Reachable

```bash
# Check if backend is running
curl http://localhost:8000/health

# Check Docker container status
docker compose ps

# Check Docker logs
docker compose logs backend

# Check if port 8000 is in use
lsof -i :8000
```

### Ollama Not Responding

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Restart Ollama
ollama serve

# Check model is available
ollama list
```

### GitHub Pages Not Deploying

1. Verify **Settings → Pages → Source** is set to "GitHub Actions"
2. Check the **Actions** tab for workflow errors
3. Ensure the `deploy.yml` workflow has `pages: write` permission

### SQLite Database Issues

```bash
# Check database file
ls -la rdat_copilot.db

# Inspect database (Python)
python3 -c "
import sqlite3
conn = sqlite3.connect('rdat_copilot.db')
cursor = conn.execute('SELECT COUNT(*) FROM tm_entries')
print(f'TM entries: {cursor.fetchone()[0]}')
conn.close()
"

# Reset database (WARNING: deletes all data)
rm rdat_copilot.db
# Backend will recreate on next startup
```

### CORS Errors

If the frontend cannot reach the backend, check:
1. The backend's CORS configuration includes your frontend origin
2. The `NEXT_PUBLIC_LOCAL_BACKEND_URL` is correctly set
3. The backend is actually running and accessible
