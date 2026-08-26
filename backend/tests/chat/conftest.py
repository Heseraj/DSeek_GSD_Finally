"""Shared fixtures for chat tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch) -> TestClient:
    """TestClient whose lifespan writes the database to a temp file."""
    monkeypatch.setattr("app.main.DB_PATH", str(tmp_path / "finally.db"))
    with TestClient(app) as c:
        yield c


@pytest.fixture
def mock_llm(monkeypatch) -> None:
    """Force the deterministic mock LLM branch (LLM_MOCK=true, no API key)."""
    monkeypatch.setenv("LLM_MOCK", "true")


@pytest.fixture
def mock_llm_proposal(monkeypatch):
    """Set LLM_MOCK=true and drive arbitrary proposals through the pipeline.

    Usage: mock_llm_proposal({"message": "...", "trades": [...], "watchlist_changes": [...]})
    patches ``app.chat.service._mock_response`` so every proposal flows through
    the same parse -> TradeRequest/execute_trade -> add_ticker/remove_ticker
    pipeline as the endpoint (CHAT-05).
    """

    def _use(proposal: dict) -> dict:
        monkeypatch.setenv("LLM_MOCK", "true")
        monkeypatch.setattr("app.chat.service._mock_response", lambda msg: proposal)
        return proposal

    return _use
