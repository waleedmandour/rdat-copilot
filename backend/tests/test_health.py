"""
Tests for the health check endpoint and database initialization.

Phase 3: CI/CD & Deployment
"""

import pytest
from httpx import AsyncClient, ASGITransport

# Set in-memory DB for testing
import os
os.environ["RDAT_DB_PATH"] = ":memory:"

from app.main import app
from app.db import init_db


@pytest.fixture(autouse=True)
async def setup_db():
    """Initialize the in-memory database before each test."""
    await init_db()


@pytest.mark.asyncio
async def test_health_check():
    """Test that the health endpoint returns a valid response."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    data = response.json()

    # Check required fields
    assert "status" in data
    assert "ollama" in data
    assert "sqlite" in data
    assert "version" in data
    assert "counts" in data

    # SQLite should always work (in-memory)
    assert data["sqlite"] is True

    # Version should be set
    assert data["version"] == "0.2.0"

    # Counts should include tm, glossary, segments
    counts = data["counts"]
    assert "tm" in counts
    assert "glossary" in counts
    assert "segments" in counts


@pytest.mark.asyncio
async def test_tm_search():
    """Test that the TM search endpoint returns results."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/tm/search",
            json={"source": "translation", "limit": 5},
        )

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_glossary_entries_list():
    """Test that the glossary entries endpoint returns results."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/glossary/entries")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_validate_endpoint():
    """Test that the validate endpoint returns validation results."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/validate",
            json={
                "source": "The future of translation technology",
                "target": "مستقبل تكنولوجيا الترجمة",
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert "is_valid" in data
    assert "score" in data
    assert "warnings" in data
    assert "errors" in data


@pytest.mark.asyncio
async def test_validate_empty_target():
    """Test validation with empty target text."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/validate",
            json={
                "source": "Hello world",
                "target": "",
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert data["is_valid"] is False
    assert any("empty" in e.lower() for e in data["errors"])
