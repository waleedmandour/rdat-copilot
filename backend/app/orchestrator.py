"""
Orchestrator — Retrieve → Suggest → Validate Pipeline

Three-phase translation pipeline:
  1. Retrieve: Search SQLite TM for exact/fuzzy matches
  2. Suggest: Call Ollama LLM for neural translation (streaming)
  3. Validate: Basic quality checks (optional, non-blocking)

Yields SSE events for each phase result so the frontend
can show TM matches immediately while LLM streams in.
"""

import json
from typing import AsyncGenerator
from app.db import get_db
from app.ollama_client import ollama_stream


async def tm_search(source: str, limit: int = 3) -> list[dict]:
    """
    Search Translation Memory for matching source segments.
    Uses LIKE for fuzzy matching (Phase 2 will add FTS5).
    """
    db = await get_db()
    try:
        # Exact match
        cursor = await db.execute(
            "SELECT source, target, source_lang, target_lang FROM tm_entries "
            "WHERE source_lang = 'en' AND target_lang = 'ar' AND source = ?",
            (source.strip(),),
        )
        exact = await cursor.fetchall()
        if exact:
            return [{"source": r["source"], "target": r["target"], "score": 1.0} for r in exact]

        # Partial match (substring)
        cursor = await db.execute(
            "SELECT source, target, source_lang, target_lang FROM tm_entries "
            "WHERE source_lang = 'en' AND target_lang = 'ar' AND "
            "(source LIKE ? OR ? LIKE '%' || source || '%') "
            "ORDER BY LENGTH(source) DESC LIMIT ?",
            (f"%{source.strip()[:50]}%", source.strip()[:50], limit),
        )
        partial = await cursor.fetchall()
        return [
            {
                "source": r["source"],
                "target": r["target"],
                "score": 0.7,
            }
            for r in partial
        ]
    finally:
        await db.close()


async def translate_stream(
    source: str,
    prefix: str = "",
    max_tokens: int = 30,
) -> AsyncGenerator[str, None]:
    """
    Orchestrated translation pipeline with SSE output.

    Yields JSON strings formatted as SSE data events:
      data: {"channel": "tm", "text": "..."}
      data: {"channel": "llm", "text": "token"}
      data: [DONE]
    """
    # Phase 1: Retrieve from TM
    tm_results = await tm_search(source, limit=1)
    if tm_results and tm_results[0]["score"] >= 0.85:
        # High-confidence TM match — send immediately
        yield json.dumps({"channel": "tm", "text": tm_results[0]["target"]})
        yield "[DONE]"
        return

    # Phase 2: TM results available but not high-confidence — still send
    if tm_results:
        yield json.dumps({"channel": "tm", "text": tm_results[0]["target"]})

    # Phase 3: Ollama LLM inference (streaming tokens)
    async for token in ollama_stream(source, prefix, max_tokens):
        yield json.dumps({"channel": "llm", "text": token})

    yield "[DONE]"
