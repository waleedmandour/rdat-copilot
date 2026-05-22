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

    Checks:
      1. Length ratio (target shouldn't be way shorter or longer)
      2. Number preservation (numbers in source must appear in target)
      3. Arabic character detection (target must contain Arabic)
      4. Untranslated segments (English words that shouldn't be there)

    Returns:
      - is_valid: bool — overall pass/fail
      - warnings: list[str] — non-blocking issues
      - errors: list[str] — blocking issues
      - score: float — 0-1 quality score
    """
    result = validate_translation(req.source, req.target)
    return result
