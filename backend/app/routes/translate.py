"""Route: /translate — SSE streaming and REST translation endpoints."""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.orchestrator import translate_stream
from app.ollama_client import ollama_translate

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


@router.post("/translate/stream")
async def translate_stream_endpoint(req: TranslateRequest):
    """
    SSE streaming translation endpoint.

    Pipeline: Retrieve (TM) → Suggest (Ollama) → stream back.
    Returns text/event-stream with JSON data events.

    Event format:
        data: {"channel": "tm", "text": "..."}
        data: {"channel": "llm", "text": "token"}
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
    """
    translation = await ollama_translate(
        source=req.source,
        max_tokens=req.max_tokens,
    )
    return {
        "translation": translation,
        "channel": "llm",
        "model": "ollama",
    }
