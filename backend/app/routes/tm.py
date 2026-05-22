"""Route: /tm — Translation Memory CRUD and search endpoints."""

from fastapi import APIRouter
from pydantic import BaseModel
from app.db import get_db
from app.orchestrator import tm_search

router = APIRouter()


class TMEntryCreate(BaseModel):
    """Create a new TM entry."""
    source: str
    target: str
    source_lang: str = "en"
    target_lang: str = "ar"
    domain: str | None = None


class TMSearchRequest(BaseModel):
    """Search TM by source text."""
    query: str
    limit: int = 5


@router.get("/tm/search")
async def search_tm(q: str, limit: int = 5):
    """Search Translation Memory by source text."""
    results = await tm_search(q, limit=limit)
    return {"results": results, "count": len(results)}


@router.post("/tm/entries")
async def add_tm_entry(entry: TMEntryCreate):
    """Add a new Translation Memory entry."""
    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO tm_entries (source, target, source_lang, target_lang, domain) "
            "VALUES (?, ?, ?, ?, ?)",
            (entry.source, entry.target, entry.source_lang, entry.target_lang, entry.domain),
        )
        await db.commit()
        return {"status": "ok", "message": "Entry added"}
    finally:
        await db.close()


@router.get("/tm/entries")
async def list_tm_entries(limit: int = 100, offset: int = 0):
    """List TM entries with pagination."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, source, target, source_lang, target_lang, domain "
            "FROM tm_entries ORDER BY id DESC LIMIT ? OFFSET ?",
            (limit, offset),
        )
        rows = await cursor.fetchall()
        return {
            "entries": [dict(r) for r in rows],
            "count": len(rows),
        }
    finally:
        await db.close()


@router.get("/tm/count")
async def tm_count():
    """Get total TM entry count."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT COUNT(*) as cnt FROM tm_entries")
        row = await cursor.fetchone()
        return {"count": row["cnt"] if row else 0}
    finally:
        await db.close()


@router.get("/sync/tm")
async def sync_tm(since: str | None = None):
    """
    Sync endpoint: return TM entries created/updated after timestamp.
    Frontend uses this to populate its local IndexedDB cache.
    """
    db = await get_db()
    try:
        if since:
            cursor = await db.execute(
                "SELECT id, source, target, source_lang, target_lang, domain, updated_at "
                "FROM tm_entries WHERE updated_at > ? ORDER BY updated_at",
                (since,),
            )
        else:
            cursor = await db.execute(
                "SELECT id, source, target, source_lang, target_lang, domain, updated_at "
                "FROM tm_entries ORDER BY updated_at"
            )
        rows = await cursor.fetchall()
        return {
            "entries": [dict(r) for r in rows],
            "count": len(rows),
        }
    finally:
        await db.close()
