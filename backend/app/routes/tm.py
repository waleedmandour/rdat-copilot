"""Route: /tm — Translation Memory CRUD, search, sync, and bulk import endpoints."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from app.db import get_db
from app.orchestrator import tm_search, tm_search_fts5

router = APIRouter()


class TMEntryCreate(BaseModel):
    """Create a new TM entry."""
    source: str
    target: str
    source_lang: str = "en"
    target_lang: str = "ar"
    domain: str | None = None


class TMEntryUpdate(BaseModel):
    """Update an existing TM entry."""
    source: str | None = None
    target: str | None = None
    source_lang: str | None = None
    target_lang: str | None = None
    domain: str | None = None


class TMBulkImportRequest(BaseModel):
    """Bulk import TM entries."""
    entries: List[TMEntryCreate]


class TMSearchRequest(BaseModel):
    """Search TM by source text."""
    query: str
    limit: int = 5


@router.get("/tm/search")
async def search_tm(q: str, limit: int = 5):
    """Search Translation Memory by source text using FTS5."""
    results = await tm_search(q, limit=limit)
    return {"results": results, "count": len(results)}


@router.post("/tm/search")
async def search_tm_post(req: TMSearchRequest):
    """Search TM by source text (POST variant for complex queries)."""
    results = await tm_search_fts5(req.query, limit=req.limit)
    return {"results": results, "count": len(results)}


@router.post("/tm/entries")
async def add_tm_entry(entry: TMEntryCreate):
    """Add a new Translation Memory entry."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "INSERT INTO tm_entries (source, target, source_lang, target_lang, domain) "
            "VALUES (?, ?, ?, ?, ?)",
            (entry.source, entry.target, entry.source_lang, entry.target_lang, entry.domain),
        )
        await db.commit()
        return {"status": "ok", "id": cursor.lastrowid, "message": "Entry added"}
    finally:
        await db.close()


@router.post("/tm/bulk-import")
async def bulk_import_tm(req: TMBulkImportRequest):
    """Bulk import TM entries. Returns count of imported entries."""
    if not req.entries:
        raise HTTPException(status_code=400, detail="No entries provided")

    db = await get_db()
    try:
        imported = 0
        for entry in req.entries:
            await db.execute(
                "INSERT INTO tm_entries (source, target, source_lang, target_lang, domain) "
                "VALUES (?, ?, ?, ?, ?)",
                (entry.source, entry.target, entry.source_lang, entry.target_lang, entry.domain),
            )
            imported += 1
        await db.commit()
        return {"status": "ok", "imported": imported, "message": f"Imported {imported} entries"}
    finally:
        await db.close()


@router.get("/tm/entries")
async def list_tm_entries(limit: int = 100, offset: int = 0):
    """List TM entries with pagination."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, source, target, source_lang, target_lang, domain, created_at, updated_at "
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


@router.get("/tm/entries/{entry_id}")
async def get_tm_entry(entry_id: int):
    """Get a single TM entry by ID."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, source, target, source_lang, target_lang, domain, created_at, updated_at "
            "FROM tm_entries WHERE id = ?",
            (entry_id,),
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Entry not found")
        return dict(row)
    finally:
        await db.close()


@router.put("/tm/entries/{entry_id}")
async def update_tm_entry(entry_id: int, update: TMEntryUpdate):
    """Update an existing TM entry."""
    db = await get_db()
    try:
        # Build dynamic UPDATE query from non-None fields
        fields = []
        values = []
        for field, value in update.model_dump(exclude_none=True).items():
            fields.append(f"{field} = ?")
            values.append(value)

        if not fields:
            raise HTTPException(status_code=400, detail="No fields to update")

        values.append(entry_id)
        await db.execute(
            f"UPDATE tm_entries SET {', '.join(fields)} WHERE id = ?",
            values,
        )
        await db.commit()
        return {"status": "ok", "message": "Entry updated"}
    finally:
        await db.close()


@router.delete("/tm/entries/{entry_id}")
async def delete_tm_entry(entry_id: int):
    """Delete a TM entry."""
    db = await get_db()
    try:
        cursor = await db.execute("DELETE FROM tm_entries WHERE id = ?", (entry_id,))
        await db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Entry not found")
        return {"status": "ok", "message": "Entry deleted"}
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
