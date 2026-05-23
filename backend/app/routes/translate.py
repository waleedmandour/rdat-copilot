"""Route: /translate — SSE streaming and REST translation endpoints."""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.db import get_db
from app.ollama_client import ollama_translate
from app.orchestrator import translate_stream, validate_translation

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

    Implements the full Retrieve → Suggest → Validate pipeline and streams
    results back as Server-Sent Events (text/event-stream).

    **Pipeline stages:**
    1. **Retrieve**: Search Translation Memory (FTS5) + Glossary lookup
    2. **Suggest**: If TM score < 0.85, call Ollama LLM with glossary-aware prompt
    3. **Validate**: Quality checks on the final translation

    **SSE Event Format:**
    - `data: {"channel": "glossary", "terms": [...]}` — Glossary terms found in source
    - `data: {"channel": "tm", "text": "...", "score": 0.9}` — TM match result
    - `data: {"channel": "llm", "text": "token"}` — LLM token (one per event)
    - `data: {"channel": "validate", "is_valid": true, ...}` — Validation result
    - `data: [DONE]` — Stream complete

    **Behavior:**
    - If TM score >= 0.85, LLM is skipped and the TM result is returned immediately
    - If TM score < 0.85, both TM and LLM results are sent
    - Glossary terms are always sent first if found in the source text
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

    Returns the complete translation as a JSON response. Optionally runs
    validation checks if `validate=true`.

    **When to use:**
    - Translating full paragraphs or documents (not per-keystroke)
    - When SSE streaming is not needed
    - For batch processing or API integrations

    **Response includes:**
    - `translation`: The Arabic translation text
    - `channel`: The source channel ("llm" for Ollama)
    - `model`: The model used ("ollama")
    - `glossary`: Matched glossary terms (if any)
    - `validation`: Quality check results (if validate=true)
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
