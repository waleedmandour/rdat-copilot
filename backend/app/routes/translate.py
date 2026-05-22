"""Route: /translate — SSE streaming and REST translation endpoints."""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.orchestrator import translate_stream, validate_translation
from app.ollama_client import ollama_translate
from app.db import get_db

router = APIRouter()


class TranslateRequest(BaseModel):
    """Request body for translation endpoints."""
    source: str
    prefix: str = ""
    max_tokens: int = 30


class FullTranslateRequest(BaseModel):
    """Request body for full paragraph translation."""
    source: str
    max_tokens: int = 256
    validate: bool = False


@router.post("/translate/stream")
async def translate_stream_endpoint(req: TranslateRequest):
    """
    SSE streaming translation endpoint.

    Pipeline: Retrieve (TM + Glossary) → Suggest (Ollama) → Validate → stream back.
    Returns text/event-stream with JSON data events.

    Event format:
        data: {"channel": "tm", "text": "...", "score": 0.9}
        data: {"channel": "glossary", "terms": [...]}
        data: {"channel": "llm", "text": "token"}
        data: {"channel": "validate", "is_valid": true, "score": 0.95, ...}
        data: [DONE]
    """
    async def event_generator():
        async for data in translate_stream(
            source=req.source,
            prefix=req.prefix,
            max_tokens=req.max_tokens,
        ):
            yield f"data: {data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@router.post("/translate")
async def translate_full_endpoint(req: FullTranslateRequest):
    """
    Non-streaming full paragraph translation.
    Returns the complete translation as JSON.
    Optionally runs validation if validate=True.
    """
    # Look up glossary terms for context-aware translation
    glossary_terms = []
    try:
        db = await get_db()
        cursor = await db.execute(
            "SELECT source_term, target_term, pos, domain "
            "FROM glossary WHERE source_lang = 'en' AND target_lang = 'ar'"
        )
        all_terms = await cursor.fetchall()
        source_lower = req.source.lower()
        for term in all_terms:
            if term["source_term"].lower() in source_lower:
                glossary_terms.append(dict(term))
        await db.close()
    except Exception:
        pass

    translation = await ollama_translate(
        source=req.source,
        max_tokens=req.max_tokens,
        glossary_terms=glossary_terms if glossary_terms else None,
    )

    result = {
        "translation": translation,
        "channel": "llm",
        "model": "ollama",
    }

    # Add glossary terms if found
    if glossary_terms:
        result["glossary"] = glossary_terms

    # Add validation if requested
    if req.validate and translation:
        validation = validate_translation(req.source, translation)
        result["validation"] = validation

    return result
