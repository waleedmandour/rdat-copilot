"""Route: /validate — Translation quality validation endpoint."""

from fastapi import APIRouter
from pydantic import BaseModel
from app.orchestrator import validate_translation

router = APIRouter()


class ValidateRequest(BaseModel):
    """Request body for translation validation."""
    source: str
    target: str


@router.post("/validate")
async def validate_endpoint(req: ValidateRequest):
    """
    Run quality validation checks on a translation pair.

    Returns a structured validation result with an overall pass/fail,
    a quality score, and lists of warnings and errors.

    **Checks performed:**
    1. **Length ratio** — Target shouldn't be much shorter (<30%) or longer (>300%) than source
    2. **Number preservation** — All numbers in source must appear in target
    3. **Arabic character detection** — Target must contain Arabic characters
    4. **Untranslated segments** — Detects suspicious English words in Arabic text
    5. **Empty target** — Target text must not be empty

    **Score calculation:**
    Each check contributes 0.0 (fail), 0.5 (warning), or 1.0 (pass).
    The overall score is the average of all check scores.
    """
    result = validate_translation(req.source, req.target)
    return result
