"""
RDAT Copilot — Local-First FastAPI Backend

Provides SSE streaming translation via Ollama LLM + SQLite TM.
Run: uvicorn app.main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import translate, health, tm

app = FastAPI(
    title="RDAT Copilot — Local Backend",
    version="0.1.0",
    description="Local-first translation backend with Ollama LLM + SQLite TM",
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


@app.on_event("startup")
async def startup():
    """Initialize database and verify Ollama connection on startup."""
    from app.db import init_db
    await init_db()
