# Contributing to RDAT Copilot

Thank you for your interest in contributing to RDAT Copilot! This guide will help you set up your development environment and understand the contribution workflow.

---

## Prerequisites

| Tool       | Version    | Purpose                              |
|-----------|------------|--------------------------------------|
| Node.js   | 20+        | Frontend build & development         |
| Python    | 3.12+      | Backend API server                   |
| Ollama    | Latest     | Local LLM inference engine           |
| Git       | 2.40+      | Version control                      |
| Docker    | Optional   | Containerized backend deployment     |

---

## Quick Setup

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/rdat-copilot.git
cd rdat-copilot
```

### 2. Frontend Setup

```bash
# Install Node.js dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to verify the frontend loads.

### 3. Backend Setup

```bash
# Install Ollama and pull the default model
ollama pull qwen2.5:7b

# Start the backend (creates venv automatically)
./scripts/start-backend.sh

# Or start with Docker
./scripts/start-backend.sh --docker
```

Verify the backend at [http://localhost:8000/health](http://localhost:8000/health).

### 4. Environment Variables

Copy the example environment files and customize if needed:

```bash
# Frontend (optional — defaults work for local dev)
cp .env.example .env.local

# Backend (optional — defaults work for local dev)
cp backend/.env.example backend/.env
```

---

## Development Workflow

### Branch Naming

| Branch Type    | Format                    | Example                          |
|---------------|---------------------------|----------------------------------|
| Feature       | `feat/description`        | `feat/glossary-import`          |
| Bug fix       | `fix/description`         | `fix/sse-timeout`               |
| Documentation | `docs/description`        | `docs/api-reference`            |
| Refactor      | `refactor/description`    | `refactor/dual-storage-sync`    |

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
feat: add glossary bulk import endpoint
fix: resolve SSE reconnection timeout
docs: update API reference for segments endpoint
refactor: simplify dual storage conflict resolution
test: add backend validation tests
chore: update Dockerfile to Python 3.12
```

### Making Changes

1. Create a feature branch from `main`
2. Make your changes with clear, focused commits
3. Run quality checks before pushing:
   ```bash
   # Frontend
   npm run lint
   npm run test:run
   npm run build

   # Backend
   cd backend
   ruff check app/
   ruff format --check app/
   python -m pytest tests/ -v
   ```
4. Push to your fork and open a Pull Request

---

## Project Structure

```
rdat-copilot/
├── src/                     # Frontend (Next.js 16 + React 19)
│   ├── app/                 # Next.js App Router pages
│   ├── components/          # React components
│   │   └── editors/         # Monaco editor components
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utility libraries
│   ├── stores/              # Zustand state stores
│   ├── workers/             # Web Workers (RAG)
│   ├── context/             # React contexts
│   └── i18n/                # Internationalization
├── backend/                 # Backend (FastAPI + SQLite)
│   ├── app/
│   │   ├── routes/          # API route handlers
│   │   ├── orchestrator.py  # Translation pipeline
│   │   ├── ollama_client.py # LLM client
│   │   └── db.py            # Database schema
│   ├── tests/               # Backend tests
│   └── requirements.txt     # Python dependencies
├── scripts/                 # Development & deployment scripts
├── docs/                    # Documentation
├── .github/workflows/       # CI/CD pipelines
├── Dockerfile               # Backend Docker image
└── docker-compose.yml       # Docker orchestration
```

---

## Frontend Development

### Adding a New Hook

Hooks in `src/hooks/` follow a consistent pattern:

1. Create `src/hooks/useYourFeature.ts`
2. Export a named function (not default export)
3. Return state and action functions
4. Add TypeScript types for all parameters and return values
5. Handle the "backend unreachable" case gracefully

### Adding a New Component

1. Create the component in the appropriate directory under `src/components/`
2. Use the `"use client"` directive for interactive components
3. Use Tailwind CSS for styling (no inline styles)
4. Support both light and dark themes via CSS variables
5. Use the `cn()` utility from `src/lib/utils.ts` for conditional classes

### Monaco Editor Integration

The Monaco editor is configured for:
- **Source editor**: LTR, read-only, line numbers, English text
- **Target editor**: RTL, editable, ghost text via `freeInlineCompletions` API, Arabic text

Important: Monaco 0.52.2 uses `freeInlineCompletions` (not `disposeInlineCompletions`). The target editor runs in uncontrolled mode (`defaultValue` + `resetKey` pattern).

### State Management

Use **Zustand** for global state that needs to persist across page navigations. Use **React hooks** for component-local state and data fetching. Never store derived state — compute it on the fly.

---

## Backend Development

### Adding a New Route

1. Create `backend/app/routes/your_route.py`
2. Define Pydantic models for request/response bodies
3. Create an `APIRouter()` instance with a descriptive tag
4. Register the router in `backend/app/main.py`
5. Add tests in `backend/tests/test_your_route.py`

### Route Pattern

```python
"""Route: /your-resource — Description."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.db import get_db

router = APIRouter()

class YourModelCreate(BaseModel):
    """Request body for creating a resource."""
    field: str

@router.post("/your-resource")
async def create_resource(data: YourModelCreate):
    """Create a new resource."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "INSERT INTO your_table (field) VALUES (?)",
            (data.field,),
        )
        await db.commit()
        return {"status": "ok", "id": cursor.lastrowid}
    finally:
        await db.close()
```

### Database Migrations

Since we use SQLite with a simple schema, migrations are handled via `CREATE TABLE IF NOT EXISTS` in `backend/app/db.py`. To add a new table:

1. Add the `CREATE TABLE IF NOT EXISTS` statement to the `init_db()` function
2. Add corresponding indexes and FTS5 virtual tables if full-text search is needed
3. Add FTS5 sync triggers to keep the search index in sync
4. Add seed data if appropriate

### Testing

Backend tests use `pytest-asyncio` with FastAPI's test client:

```python
import pytest
from httpx import AsyncClient, ASGITransport
import os

os.environ["RDAT_DB_PATH"] = ":memory:"

from app.main import app
from app.db import init_db

@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()

@pytest.mark.asyncio
async def test_your_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/your-resource")
    assert response.status_code == 200
```

---

## Testing

### Frontend Tests

```bash
# Run all tests
npm run test:run

# Watch mode
npm run test

# UI mode
npm run test:ui
```

Tests use **Vitest** with `jsdom` environment. Test files go in `src/__tests__/`.

### Backend Tests

```bash
cd backend

# Run all tests
python -m pytest tests/ -v

# Run with verbose output
python -m pytest tests/ -v -s

# Run specific test
python -m pytest tests/test_health.py -v
```

### Linting

```bash
# Frontend
npm run lint

# Backend
cd backend
ruff check app/
ruff format --check app/
```

---

## Code Style

### TypeScript / React

- Use TypeScript strict mode (no `any` types in new code)
- Prefer `interface` over `type` for object shapes
- Use arrow functions for React components
- Use named exports (not default exports)
- Single responsibility: one hook per file, one component per file

### Python

- Follow PEP 8 (enforced by ruff)
- Use type hints on all function signatures
- Use `async/await` for all database and HTTP operations
- Keep route handlers thin — business logic belongs in the orchestrator or separate modules
- Use Pydantic models for all request/response bodies

---

## Pull Request Process

1. **Ensure CI passes** — The GitHub Actions workflows run lint, tests, and build checks
2. **Update documentation** — If you add a feature, update the relevant docs
3. **Add tests** — New features should include test coverage
4. **Keep PRs focused** — One feature or fix per PR makes review easier
5. **Describe your changes** — Fill out the PR template with context and motivation

---

## Reporting Issues

When reporting a bug, please include:

1. **Environment**: Browser, OS, backend status (Docker/local), Ollama model
2. **Steps to reproduce**: Clear sequence of actions
3. **Expected behavior**: What should happen
4. **Actual behavior**: What actually happens
5. **Console output**: Browser console errors and/or backend logs

---

## License

By contributing to RDAT Copilot, you agree that your contributions will be licensed under the [MIT License](LICENSE).
