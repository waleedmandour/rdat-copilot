"""
Orchestrator — Retrieve → Suggest → Validate Pipeline

Three-phase translation pipeline:
  1. Retrieve: Search SQLite TM for exact/FTS5 fuzzy matches + Glossary lookup
  2. Suggest: Call Ollama LLM for neural translation (streaming),
              injecting glossary terms into the prompt for domain accuracy
  3. Validate: Quality checks (length ratio, number preservation,
              Arabic character detection, glossary consistency)

Yields SSE events for each phase result so the frontend
can show TM matches immediately while LLM streams in.
"""

import json
import re
from typing import AsyncGenerator
from app.db import get_db
from app.ollama_client import ollama_stream


# ── Phase 1: Retrieve ────────────────────────────────────────────

async def tm_search_fts5(source: str, limit: int = 5) -> list[dict]:
    """
    Search Translation Memory using FTS5 full-text search.
    Falls back to LIKE matching if FTS5 yields no results.
    Returns results ranked by FTS5 rank (BM25) with normalized scores.
    """
    db = await get_db()
    try:
        # Exact match first (highest confidence)
        cursor = await db.execute(
            "SELECT id, source, target, source_lang, target_lang FROM tm_entries "
            "WHERE source_lang = 'en' AND target_lang = 'ar' AND source = ?",
            (source.strip(),),
        )
        exact = await cursor.fetchall()
        if exact:
            return [{"id": r["id"], "source": r["source"], "target": r["target"], "score": 1.0, "match_type": "exact"}]

        # FTS5 full-text search with BM25 ranking
        # Escape double quotes in the query for FTS5
        safe_query = source.strip().replace('"', '""')
        cursor = await db.execute(
            "SELECT tm.id, tm.source, tm.target, tm.source_lang, tm.target_lang, "
            "  tm_fts.rank AS fts_rank "
            "FROM tm_fts "
            "JOIN tm_entries tm ON tm.id = tm_fts.rowid "
            "WHERE tm_fts MATCH ? AND tm.source_lang = 'en' AND tm.target_lang = 'ar' "
            "ORDER BY fts_rank "
            "LIMIT ?",
            (f'"{safe_query}"', limit),
        )
        fts_results = await cursor.fetchall()

        if fts_results:
            # Normalize BM25 scores to 0-1 range
            max_rank = abs(fts_results[0]["fts_rank"]) if fts_results else 1
            return [
                {
                    "id": r["id"],
                    "source": r["source"],
                    "target": r["target"],
                    "score": min(0.95, 0.5 + 0.45 * (abs(r["fts_rank"]) / max(max_rank, 0.001))),
                    "match_type": "fts5",
                }
                for r in fts_results
            ]

        # Fallback: LIKE-based partial matching (for short or special queries)
        cursor = await db.execute(
            "SELECT id, source, target, source_lang, target_lang FROM tm_entries "
            "WHERE source_lang = 'en' AND target_lang = 'ar' AND "
            "(source LIKE ? OR ? LIKE '%' || source || '%') "
            "ORDER BY LENGTH(source) DESC LIMIT ?",
            (f"%{source.strip()[:60]}%", source.strip()[:60], limit),
        )
        partial = await cursor.fetchall()
        return [
            {
                "id": r["id"],
                "source": r["source"],
                "target": r["target"],
                "score": 0.7,
                "match_type": "like",
            }
            for r in partial
        ]
    finally:
        await db.close()


async def glossary_lookup(source: str) -> list[dict]:
    """
    Look up glossary terms that appear in the source text.
    Returns list of {source_term, target_term, pos, domain} for all
    glossary entries whose source_term is found in the source text.
    """
    db = await get_db()
    try:
        # Get all glossary entries and filter in Python
        # (simpler than building dynamic FTS5 queries with OR)
        cursor = await db.execute(
            "SELECT source_term, target_term, pos, domain FROM glossary "
            "WHERE source_lang = 'en' AND target_lang = 'ar'"
        )
        all_terms = await cursor.fetchall()

        matched = []
        source_lower = source.lower()
        for term in all_terms:
            if term["source_term"].lower() in source_lower:
                matched.append({
                    "source_term": term["source_term"],
                    "target_term": term["target_term"],
                    "pos": term["pos"],
                    "domain": term["domain"],
                })
        return matched
    finally:
        await db.close()


async def tm_search(source: str, limit: int = 3) -> list[dict]:
    """
    Backward-compatible TM search (used by /tm/search endpoint).
    Delegates to tm_search_fts5 and strips internal fields.
    """
    results = await tm_search_fts5(source, limit=limit)
    return [{"source": r["source"], "target": r["target"], "score": r["score"]} for r in results]


# ── Phase 3: Validate ────────────────────────────────────────────

def validate_translation(source: str, target: str) -> dict:
    """
    Run quality validation checks on a translation pair.
    Returns a dict with:
      - is_valid: bool — overall pass/fail
      - warnings: list[str] — non-blocking issues
      - errors: list[str] — blocking issues
      - score: float — 0-1 quality score

    Checks performed:
      1. Length ratio (target shouldn't be way shorter or longer)
      2. Number preservation (numbers in source must appear in target)
      3. Arabic character detection (target must contain Arabic)
      4. Untranslated segments (English words that shouldn't be there)
    """
    warnings = []
    errors = []
    score_components = []

    # Check 1: Length ratio
    # Arabic text is typically 80-150% of English length (char count)
    source_len = len(source.strip())
    target_len = len(target.strip())
    if source_len > 0 and target_len > 0:
        ratio = target_len / source_len
        if ratio < 0.3:
            errors.append(f"Target text is suspiciously short (ratio: {ratio:.2f})")
            score_components.append(0.0)
        elif ratio > 3.0:
            warnings.append(f"Target text is much longer than source (ratio: {ratio:.2f})")
            score_components.append(0.5)
        else:
            score_components.append(1.0)

    # Check 2: Number preservation
    source_numbers = re.findall(r'\d+', source)
    if source_numbers:
        target_numbers = re.findall(r'\d+', target)
        missing_numbers = [n for n in source_numbers if n not in target_numbers]
        if missing_numbers:
            errors.append(f"Numbers missing in translation: {', '.join(missing_numbers)}")
            score_components.append(0.0)
        else:
            score_components.append(1.0)

    # Check 3: Arabic character detection
    arabic_chars = len(re.findall(r'[\u0600-\u06FF]', target))
    total_chars = len(target.strip())
    if total_chars > 0:
        arabic_ratio = arabic_chars / total_chars
        if arabic_ratio < 0.1 and target_len > 10:
            errors.append("Target text contains very few Arabic characters — possibly untranslated")
            score_components.append(0.0)
        elif arabic_ratio < 0.3 and target_len > 10:
            warnings.append("Target text has low Arabic character ratio")
            score_components.append(0.5)
        else:
            score_components.append(1.0)

    # Check 4: Untranslated English words (basic check for long English segments)
    # Only check if the target is long enough to be meaningful
    if target_len > 20:
        english_words_in_target = re.findall(r'\b[A-Za-z]{4,}\b', target)
        # Filter out common abbreviations and proper nouns
        allowed_english = {'AI', 'API', 'URL', 'HTML', 'CSS', 'Web', 'GPU', 'CPU', 'LLM', 'RAG', 'TM', 'GTR'}
        suspicious = [w for w in english_words_in_target if w not in allowed_english and w.lower() not in allowed_english]
        if len(suspicious) > 3:
            warnings.append(f"Possible untranslated English words: {', '.join(suspicious[:5])}")
            score_components.append(0.5)
        else:
            score_components.append(1.0)

    # Check 5: Empty translation
    if not target.strip():
        errors.append("Target text is empty")
        score_components.append(0.0)

    # Calculate overall score
    overall_score = sum(score_components) / max(len(score_components), 1) if score_components else 0.5

    return {
        "is_valid": len(errors) == 0,
        "warnings": warnings,
        "errors": errors,
        "score": round(overall_score, 3),
    }


# ── Full Pipeline ────────────────────────────────────────────────

async def translate_stream(
    source: str,
    prefix: str = "",
    max_tokens: int = 30,
) -> AsyncGenerator[str, None]:
    """
    Orchestrated translation pipeline with SSE output.

    Yields JSON strings formatted as SSE data events:
      data: {"channel": "tm", "text": "...", "score": 0.9}
      data: {"channel": "glossary", "terms": [...]}
      data: {"channel": "llm", "text": "token"}
      data: {"channel": "validate", "is_valid": true, "score": 0.95, "warnings": [], "errors": []}
      data: [DONE]
    """
    # Phase 1: Retrieve from TM (FTS5) + Glossary lookup
    tm_results = await tm_search_fts5(source, limit=1)
    glossary_terms = await glossary_lookup(source)

    # Send glossary terms immediately (useful for UI hints)
    if glossary_terms:
        yield json.dumps({"channel": "glossary", "terms": glossary_terms})

    # High-confidence TM match — send immediately, skip LLM
    if tm_results and tm_results[0]["score"] >= 0.85:
        result = tm_results[0]
        # Run validation on the TM match
        validation = validate_translation(source, result["target"])
        yield json.dumps({
            "channel": "tm",
            "text": result["target"],
            "score": result["score"],
            "match_type": result.get("match_type", "exact"),
        })
        yield json.dumps({"channel": "validate", **validation})
        yield "[DONE]"
        return

    # Lower-confidence TM match — send but continue to LLM
    if tm_results:
        yield json.dumps({
            "channel": "tm",
            "text": tm_results[0]["target"],
            "score": tm_results[0]["score"],
            "match_type": tm_results[0].get("match_type", "partial"),
        })

    # Phase 2: Ollama LLM inference (streaming tokens)
    # Build glossary-aware prompt if we have glossary matches
    llm_text = ""
    async for token in ollama_stream(source, prefix, max_tokens, glossary_terms=glossary_terms):
        llm_text += token
        yield json.dumps({"channel": "llm", "text": token})

    # Phase 3: Validate the LLM output
    if llm_text.strip():
        validation = validate_translation(source, llm_text)
        yield json.dumps({"channel": "validate", **validation})

    yield "[DONE]"
