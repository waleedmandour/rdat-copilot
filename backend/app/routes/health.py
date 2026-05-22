"""Route: /health — Backend health check endpoint."""

from fastapi import APIRouter
from app.ollama_client import check_ollama_available, get_loaded_model
from app.db import get_db

router = APIRouter()


@router.get("/health")
async def health_check():
    """
    Return backend health status including Ollama and SQLite state.
    The frontend polls this endpoint every 15 seconds.
    """
    # Check Ollama
    ollama_ok = await check_ollama_available()
    model_name = await get_loaded_model() if ollama_ok else None

    # Check SQLite
    sqlite_ok = False
    try:
        db = await get_db()
        cursor = await db.execute("SELECT COUNT(*) as cnt FROM tm_entries")
        row = await cursor.fetchone()
        sqlite_ok = row is not None
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
        "version": "0.1.0",
    }
