"""
Ollama LLM Client — Streaming Inference

Connects to a local Ollama instance (default: localhost:11434).
Supports SSE-style token streaming for low-latency ghost text.
Supports glossary-aware prompts for domain-specific translation.
"""

import json
import os
from collections.abc import AsyncGenerator

import httpx

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
DEFAULT_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b")

SYSTEM_PROMPT = (
    "You are a professional English-to-Arabic translator. "
    "Output ONLY the Arabic translation text, nothing else. "
    "No explanations, no romanization, no brackets. "
    "Translate naturally and fluently, preserving the original meaning and tone."
)


async def check_ollama_available() -> bool:
    """Check if Ollama is running and responsive."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            return resp.status_code == 200
    except (httpx.ConnectError, httpx.TimeoutException):
        return False


async def get_loaded_model() -> str | None:
    """Get the currently loaded model name from Ollama."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                models = data.get("models", [])
                if models:
                    return models[0].get("name", DEFAULT_MODEL)
            return None
    except (httpx.ConnectError, httpx.TimeoutException):
        return None


def _build_glossary_section(glossary_terms: list[dict]) -> str:
    """
    Build a glossary section for the prompt.
    Formats glossary terms as a reference table for the LLM.
    """
    if not glossary_terms:
        return ""

    lines = ["\n\nIMPORTANT — Use these glossary terms in your translation:"]
    for term in glossary_terms:
        pos_info = f" ({term['pos']})" if term.get("pos") else ""
        domain_info = f" [{term['domain']}]" if term.get("domain") else ""
        lines.append(f"  - {term['source_term']}{pos_info}{domain_info} → {term['target_term']}")
    lines.append("\nEnsure these terms are translated consistently with the glossary above.")
    return "\n".join(lines)


async def ollama_stream(
    source: str,
    prefix: str = "",
    max_tokens: int = 30,
    model: str | None = None,
    glossary_terms: list[dict] | None = None,
) -> AsyncGenerator[str, None]:
    """
    Stream tokens from Ollama for a translation request.

    The prompt instructs the model to continue from where the user
    left off (prefix), outputting only the remaining Arabic text.
    Glossary terms are injected into the prompt for consistency.
    """
    model = model or DEFAULT_MODEL

    user_prompt = f"Translate this English text to Arabic:\n\n{source}\n"
    if prefix:
        user_prompt += f'\nThe translator has already started typing: "{prefix}"\n'
        user_prompt += "Continue from where they left off. Output only the remaining Arabic text. "

    # Inject glossary terms if available
    if glossary_terms:
        user_prompt += _build_glossary_section(glossary_terms)

    user_prompt += f"\nOutput no more than {max_tokens} words."

    payload = {
        "model": model,
        "prompt": f"{SYSTEM_PROMPT}\n\n{user_prompt}",
        "stream": True,
        "options": {
            "temperature": 0.3,
            "top_p": 0.9,
            "num_predict": max_tokens * 3,
        },
    }

    try:
        async with (
            httpx.AsyncClient(timeout=30.0) as client,
            client.stream(
                "POST",
                f"{OLLAMA_BASE_URL}/api/generate",
                json=payload,
                headers={"Content-Type": "application/json"},
            ) as response,
        ):
            async for line in response.aiter_lines():
                if not line.strip():
                    continue
                try:
                    chunk = json.loads(line)
                    token = chunk.get("response", "")
                    if token:
                        yield token
                    if chunk.get("done", False):
                        break
                except json.JSONDecodeError:
                    continue
    except (httpx.ConnectError, httpx.TimeoutException) as e:
        print(f"[Ollama] Connection error: {e}")
        return


async def ollama_translate(
    source: str,
    max_tokens: int = 256,
    model: str | None = None,
    glossary_terms: list[dict] | None = None,
) -> str:
    """
    Non-streaming full translation via Ollama.
    Returns the complete translation as a single string.
    """
    model = model or DEFAULT_MODEL

    user_prompt = f"Translate this text to Arabic:\n\n{source}"
    if glossary_terms:
        user_prompt += _build_glossary_section(glossary_terms)

    payload = {
        "model": model,
        "prompt": f"{SYSTEM_PROMPT}\n\n{user_prompt}",
        "stream": False,
        "options": {
            "temperature": 0.3,
            "top_p": 0.9,
            "num_predict": max_tokens,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("response", "").strip()
            return ""
    except (httpx.ConnectError, httpx.TimeoutException):
        return ""
