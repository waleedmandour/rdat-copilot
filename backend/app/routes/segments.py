"""Route: /segments — Translation segment CRUD endpoints."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from app.db import get_db

router = APIRouter()


class SegmentCreate(BaseModel):
    """Create a new segment."""
    source: str
    target: str = ""
    source_lang: str = "en"
    target_lang: str = "ar"
    status: str = "draft"  # draft | confirmed | rejected | locked
    score: float = 0.0
    source_file: str | None = None
    segment_index: int | None = None


class SegmentUpdate(BaseModel):
    """Update an existing segment."""
    target: str | None = None
    status: str | None = None
    score: float | None = None


class SegmentBulkCreate(BaseModel):
    """Bulk create segments from a source file."""
    segments: List[SegmentCreate]
    source_file: str | None = None


@router.post("/segments")
async def create_segment(seg: SegmentCreate):
    """Create a new translation segment."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "INSERT INTO segments (source, target, source_lang, target_lang, status, score, source_file, segment_index) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (seg.source, seg.target, seg.source_lang, seg.target_lang,
             seg.status, seg.score, seg.source_file, seg.segment_index),
        )
        await db.commit()
        return {"status": "ok", "id": cursor.lastrowid, "message": "Segment created"}
    finally:
        await db.close()


@router.post("/segments/bulk")
async def bulk_create_segments(req: SegmentBulkCreate):
    """Bulk create segments from a source file."""
    if not req.segments:
        raise HTTPException(status_code=400, detail="No segments provided")

    db = await get_db()
    try:
        created = 0
        for i, seg in enumerate(req.segments):
            source_file = seg.source_file or req.source_file
            segment_index = seg.segment_index if seg.segment_index is not None else i
            await db.execute(
                "INSERT INTO segments (source, target, source_lang, target_lang, status, score, source_file, segment_index) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (seg.source, seg.target, seg.source_lang, seg.target_lang,
                 seg.status, seg.score, source_file, segment_index),
            )
            created += 1
        await db.commit()
        return {"status": "ok", "created": created, "message": f"Created {created} segments"}
    finally:
        await db.close()


@router.get("/segments")
async def list_segments(
    limit: int = 100,
    offset: int = 0,
    status: str | None = None,
    source_file: str | None = None,
):
    """List segments with optional filtering by status and source file."""
    db = await get_db()
    try:
        query = (
            "SELECT id, source, target, source_lang, target_lang, status, score, "
            "source_file, segment_index, created_at, updated_at "
            "FROM segments"
        )
        conditions = []
        params: list = []

        if status:
            conditions.append("status = ?")
            params.append(status)
        if source_file:
            conditions.append("source_file = ?")
            params.append(source_file)

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY id ASC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()
        return {"segments": [dict(r) for r in rows], "count": len(rows)}
    finally:
        await db.close()


@router.get("/segments/{segment_id}")
async def get_segment(segment_id: int):
    """Get a single segment by ID."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, source, target, source_lang, target_lang, status, score, "
            "source_file, segment_index, created_at, updated_at "
            "FROM segments WHERE id = ?",
            (segment_id,),
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Segment not found")
        return dict(row)
    finally:
        await db.close()


@router.put("/segments/{segment_id}")
async def update_segment(segment_id: int, update: SegmentUpdate):
    """Update a segment (target text, status, or score)."""
    db = await get_db()
    try:
        fields = []
        values = []
        for field, value in update.model_dump(exclude_none=True).items():
            fields.append(f"{field} = ?")
            values.append(value)

        if not fields:
            raise HTTPException(status_code=400, detail="No fields to update")

        values.append(segment_id)
        await db.execute(
            f"UPDATE segments SET {', '.join(fields)} WHERE id = ?",
            values,
        )
        await db.commit()
        return {"status": "ok", "message": "Segment updated"}
    finally:
        await db.close()


@router.delete("/segments/{segment_id}")
async def delete_segment(segment_id: int):
    """Delete a segment."""
    db = await get_db()
    try:
        cursor = await db.execute("DELETE FROM segments WHERE id = ?", (segment_id,))
        await db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Segment not found")
        return {"status": "ok", "message": "Segment deleted"}
    finally:
        await db.close()


@router.get("/segments/count")
async def segment_count(status: str | None = None):
    """Get segment count, optionally filtered by status."""
    db = await get_db()
    try:
        if status:
            cursor = await db.execute(
                "SELECT COUNT(*) as cnt FROM segments WHERE status = ?",
                (status,),
            )
        else:
            cursor = await db.execute("SELECT COUNT(*) as cnt FROM segments")
        row = await cursor.fetchone()
        return {"count": row["cnt"] if row else 0}
    finally:
        await db.close()
