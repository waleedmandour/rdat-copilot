"""
RDAT Copilot — Local-First FastAPI Backend

Provides SSE streaming translation via Ollama LLM + SQLite TM.
Run: uvicorn app.main:app --reload --port 8000

Interactive API docs:
  - Swagger UI: http://localhost:8000/docs
  - ReDoc:      http://localhost:8000/redoc
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import translate, health, tm, glossary, segments, validate

app = FastAPI(
    title="RDAT Copilot — Local Backend",
    version="0.2.0",
    description=(
        "# RDAT Copilot Backend API\n\n"
        "Local-first translation backend with Ollama LLM + SQLite TM + FTS5.\n\n"
        "## Core Features\n"
        "- **SSE Streaming Translation**: Real-time ghost text via `/translate/stream`\n"
        "- **Translation Memory**: FTS5 full-text search with BM25 ranking\n"
        "- **Glossary Management**: Terminology consistency with domain-aware prompts\n"
        "- **Quality Validation**: Automated checks for length, numbers, Arabic detection\n"
        "- **Dual Storage Sync**: Incremental sync endpoints for IndexedDB cache\n\n"
        "## Pipeline\n"
        "1. **Retrieve**: Search TM (FTS5) + Glossary lookup\n"
        "2. **Suggest**: Ollama LLM inference (streaming or REST)\n"
        "3. **Validate**: Quality checks on the final translation\n\n"
        "## Prerequisites\n"
        "- Ollama running at `localhost:11434` with `qwen2.5:7b` model\n"
        "- SQLite database (auto-created on startup with seed data)\n"
    ),
    contact={
        "name": "RDAT Copilot",
        "url": "https://github.com/waleedmandour/rdat-copilot",
    },
    license_info={
        "name": "MIT",
        "url": "https://opensource.org/licenses/MIT",
    },
)

# CORS: Allow GitHub Pages + localhost dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://waleedmandour.github.io",
        "https://waleedmandour.github.io/rdat-copilot/",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(translate.router, tags=["Translation"])
app.include_router(health.router, tags=["Health"])
app.include_router(tm.router, tags=["Translation Memory"])
app.include_router(glossary.router, tags=["Glossary"])
app.include_router(segments.router, tags=["Segments"])
app.include_router(validate.router, tags=["Validation"])


@app.on_event("startup")
async def startup():
    """Initialize database and verify Ollama connection on startup."""
    from app.db import init_db
    await init_db()
