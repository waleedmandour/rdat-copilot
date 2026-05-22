"""Route: /health — Backend health check endpoint."""

from fastapi import APIRouter
from app.ollama_client import check_ollama_available, get_loaded_model
from app.db import get_db

router = APIRouter()


@router.get("/health")
async def health_check():
    """
    Return backend health status including Ollama, SQLite, and data counts.

    The frontend polls this endpoint every 15 seconds to update the status bar.
    The response includes all information needed to display channel availability
    and data statistics.

    **Status values:**
    - `ok` — Both Ollama and SQLite are working. Full functionality available.
    - `degraded` — SQLite works but Ollama is unreachable. TM search works, but LLM translation is unavailable.
    - `down` — SQLite is not working. Critical error.
    """
    # Check Ollama
    ollama_ok = await check_ollama_available()
    model_name = await get_loaded_model() if ollama_ok else None

    # Check SQLite and get counts
    sqlite_ok = False
    tm_count = 0
    glossary_count = 0
    segment_count = 0

    try:
        db = await get_db()
        cursor = await db.execute("SELECT COUNT(*) as cnt FROM tm_entries")
        row = await cursor.fetchone()
        sqlite_ok = row is not None
        tm_count = row["cnt"] if row else 0

        cursor = await db.execute("SELECT COUNT(*) as cnt FROM glossary")
        row = await cursor.fetchone()
        glossary_count = row["cnt"] if row else 0

        cursor = await db.execute("SELECT COUNT(*) as cnt FROM segments")
        row = await cursor.fetchone()
        segment_count = row["cnt"] if row else 0

        await db.close()
    except Exception:
        pass

    # Overall status
    if ollama_ok and sqlite_ok:
        status = "ok"
    elif sqlite_ok:
        status = "degraded"  # DB works but no Ollama
    else:
        status = "down"

    return {
        "status": status,
        "ollama": ollama_ok,
        "sqlite": sqlite_ok,
        "model": model_name,
        "modelLoaded": ollama_ok and model_name is not None,
        "version": "0.2.0",
        "counts": {
            "tm": tm_count,
            "glossary": glossary_count,
            "segments": segment_count,
        },
    }
