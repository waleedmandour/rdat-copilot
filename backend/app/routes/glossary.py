"""Route: /glossary — Glossary CRUD, search, and sync endpoints."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from app.db import get_db

router = APIRouter()


class GlossaryEntryCreate(BaseModel):
    """Create a new glossary entry."""
    source_term: str
    target_term: str
    source_lang: str = "en"
    target_lang: str = "ar"
    pos: str | None = None
    domain: str | None = None
    notes: str | None = None


class GlossaryEntryUpdate(BaseModel):
    """Update an existing glossary entry."""
    source_term: str | None = None
    target_term: str | None = None
    source_lang: str | None = None
    target_lang: str | None = None
    pos: str | None = None
    domain: str | None = None
    notes: str | None = None


class GlossaryBulkImportRequest(BaseModel):
    """Bulk import glossary entries."""
    entries: List[GlossaryEntryCreate]


@router.get("/glossary/search")
async def search_glossary(q: str, limit: int = 20):
    """Search glossary by source or target term."""
    db = await get_db()
    try:
        # Use FTS5 for fast search
        safe_query = q.replace('"', '""')
        cursor = await db.execute(
            "SELECT g.id, g.source_term, g.target_term, g.source_lang, g.target_lang, "
            "  g.pos, g.domain, g.notes "
            "FROM glossary_fts "
            "JOIN glossary g ON g.id = glossary_fts.rowid "
            "WHERE glossary_fts MATCH ? "
            "LIMIT ?",
            (f'"{safe_query}"', limit),
        )
        fts_results = await cursor.fetchall()

        if fts_results:
            return {"entries": [dict(r) for r in fts_results], "count": len(fts_results)}

        # Fallback to LIKE search
        cursor = await db.execute(
            "SELECT id, source_term, target_term, source_lang, target_lang, pos, domain, notes "
            "FROM glossary "
            "WHERE source_term LIKE ? OR target_term LIKE ? "
            "LIMIT ?",
            (f"%{q}%", f"%{q}%", limit),
        )
        rows = await cursor.fetchall()
        return {"entries": [dict(r) for r in rows], "count": len(rows)}
    finally:
        await db.close()


@router.get("/glossary/lookup")
async def glossary_lookup_for_source(q: str):
    """
    Look up glossary terms that appear in the given source text.

    Unlike `/glossary/search` which finds entries matching a query,
    this endpoint finds glossary terms that are **contained within**
    the source text. Used by the orchestrator for glossary-aware prompts
    to ensure consistent terminology in LLM translations.
    """
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT source_term, target_term, pos, domain "
            "FROM glossary WHERE source_lang = 'en' AND target_lang = 'ar'"
        )
        all_terms = await cursor.fetchall()

        matched = []
        q_lower = q.lower()
        for term in all_terms:
            if term["source_term"].lower() in q_lower:
                matched.append(dict(term))

        return {"entries": matched, "count": len(matched)}
    finally:
        await db.close()


@router.post("/glossary/entries")
async def add_glossary_entry(entry: GlossaryEntryCreate):
    """Add a new glossary entry."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "INSERT INTO glossary (source_term, target_term, source_lang, target_lang, pos, domain, notes) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (entry.source_term, entry.target_term, entry.source_lang, entry.target_lang,
             entry.pos, entry.domain, entry.notes),
        )
        await db.commit()
        return {"status": "ok", "id": cursor.lastrowid, "message": "Glossary entry added"}
    finally:
        await db.close()


@router.post("/glossary/bulk-import")
async def bulk_import_glossary(req: GlossaryBulkImportRequest):
    """Bulk import glossary entries."""
    if not req.entries:
        raise HTTPException(status_code=400, detail="No entries provided")

    db = await get_db()
    try:
        imported = 0
        for entry in req.entries:
            await db.execute(
                "INSERT INTO glossary (source_term, target_term, source_lang, target_lang, pos, domain, notes) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (entry.source_term, entry.target_term, entry.source_lang, entry.target_lang,
                 entry.pos, entry.domain, entry.notes),
            )
            imported += 1
        await db.commit()
        return {"status": "ok", "imported": imported, "message": f"Imported {imported} glossary entries"}
    finally:
        await db.close()


@router.get("/glossary/entries")
async def list_glossary_entries(limit: int = 100, offset: int = 0):
    """List glossary entries with pagination."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, source_term, target_term, source_lang, target_lang, pos, domain, notes, created_at "
            "FROM glossary ORDER BY id DESC LIMIT ? OFFSET ?",
            (limit, offset),
        )
        rows = await cursor.fetchall()
        return {"entries": [dict(r) for r in rows], "count": len(rows)}
    finally:
        await db.close()


@router.get("/glossary/entries/{entry_id}")
async def get_glossary_entry(entry_id: int):
    """Get a single glossary entry by ID."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, source_term, target_term, source_lang, target_lang, pos, domain, notes, created_at "
            "FROM glossary WHERE id = ?",
            (entry_id,),
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Glossary entry not found")
        return dict(row)
    finally:
        await db.close()


@router.put("/glossary/entries/{entry_id}")
async def update_glossary_entry(entry_id: int, update: GlossaryEntryUpdate):
    """Update an existing glossary entry."""
    db = await get_db()
    try:
        fields = []
        values = []
        for field, value in update.model_dump(exclude_none=True).items():
            fields.append(f"{field} = ?")
            values.append(value)

        if not fields:
            raise HTTPException(status_code=400, detail="No fields to update")

        values.append(entry_id)
        await db.execute(
            f"UPDATE glossary SET {', '.join(fields)} WHERE id = ?",
            values,
        )
        await db.commit()
        return {"status": "ok", "message": "Glossary entry updated"}
    finally:
        await db.close()


@router.delete("/glossary/entries/{entry_id}")
async def delete_glossary_entry(entry_id: int):
    """Delete a glossary entry."""
    db = await get_db()
    try:
        cursor = await db.execute("DELETE FROM glossary WHERE id = ?", (entry_id,))
        await db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Glossary entry not found")
        return {"status": "ok", "message": "Glossary entry deleted"}
    finally:
        await db.close()


@router.get("/glossary/count")
async def glossary_count():
    """Get total glossary entry count."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT COUNT(*) as cnt FROM glossary")
        row = await cursor.fetchone()
        return {"count": row["cnt"] if row else 0}
    finally:
        await db.close()


@router.get("/sync/glossary")
async def sync_glossary(since: str | None = None):
    """
    Sync endpoint for the dual storage layer.

    Returns glossary entries created after the given timestamp.
    The frontend uses this to populate its local IndexedDB cache with
    incremental updates since the last sync.

    **Parameters:**
    - `since` (optional): ISO 8601 timestamp. If omitted, returns all entries.
    """
    db = await get_db()
    try:
        if since:
            cursor = await db.execute(
                "SELECT id, source_term, target_term, source_lang, target_lang, pos, domain, notes, created_at "
                "FROM glossary WHERE created_at > ? ORDER BY created_at",
                (since,),
            )
        else:
            cursor = await db.execute(
                "SELECT id, source_term, target_term, source_lang, target_lang, pos, domain, notes, created_at "
                "FROM glossary ORDER BY created_at"
            )
        rows = await cursor.fetchall()
        return {
            "entries": [dict(r) for r in rows],
            "count": len(rows),
        }
    finally:
        await db.close()
