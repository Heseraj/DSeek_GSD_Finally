"""Smoke tests for the FastAPI application entry point."""

from __future__ import annotations

import json
import sqlite3
import threading
import time

import httpx
import uvicorn
from fastapi.testclient import TestClient

from app.main import DEFAULT_TICKERS, app


def _make_client(tmp_path, monkeypatch) -> TestClient:
    """Build a TestClient whose lifespan writes the database to a temp file."""
    monkeypatch.setattr("app.main.DB_PATH", str(tmp_path / "finally.db"))
    return TestClient(app)


class TestAppSmoke:
    """End-to-end boot tests: lifespan, health, seeding, SSE."""

    def test_health_returns_healthy(self, tmp_path, monkeypatch):
        """Test that GET /api/health reports a healthy status."""
        client = _make_client(tmp_path, monkeypatch)
        with client:
            resp = client.get("/api/health")
            assert resp.status_code == 200
            assert resp.json()["status"] == "healthy"

    def test_startup_seeds_database(self, tmp_path, monkeypatch):
        """Test that booting the app seeds one $10k profile and ten tickers."""
        client = _make_client(tmp_path, monkeypatch)
        with client:
            conn = sqlite3.connect(tmp_path / "finally.db")
            conn.row_factory = sqlite3.Row
            try:
                profile = conn.execute("SELECT * FROM users_profile").fetchone()
                watchlist = conn.execute("SELECT * FROM watchlist").fetchall()
            finally:
                conn.close()

            assert profile is not None
            assert profile["cash_balance"] == 10000.0
            assert len(watchlist) == 10

    def test_price_cache_contains_aapl_after_startup(self, tmp_path, monkeypatch):
        """Test that the app state price cache holds seeded prices after boot."""
        client = _make_client(tmp_path, monkeypatch)
        with client:
            assert "AAPL" in client.app.state.price_cache

    def test_stream_prices_serves_sse_frames(self, tmp_path, monkeypatch):
        """Test that GET /api/stream/prices streams live price frames over HTTP.

        Uses a real uvicorn server instead of TestClient: httpx's ASGITransport
        buffers the entire response body, so an infinite SSE stream never
        returns through TestClient. A real HTTP connection streams properly.
        """
        monkeypatch.setattr("app.main.DB_PATH", str(tmp_path / "finally.db"))

        config = uvicorn.Config(app, host="127.0.0.1", port=0, log_level="error", access_log=False)
        server = uvicorn.Server(config)
        thread = threading.Thread(target=server.run, daemon=True)
        thread.start()
        try:
            # Wait for the server to bind and start accepting connections.
            for _ in range(100):
                if server.started:
                    break
                time.sleep(0.05)
            assert server.started, "uvicorn failed to start"
            port = server.servers[0].sockets[0].getsockname()[1]

            with httpx.Client(timeout=10.0) as client:
                with client.stream("GET", f"http://127.0.0.1:{port}/api/stream/prices") as response:
                    assert response.status_code == 200
                    assert "text/event-stream" in response.headers["content-type"]
                    for line in response.iter_lines():
                        if line.startswith("data: "):
                            payload = json.loads(line[len("data: ") :])
                            assert any(ticker in payload for ticker in DEFAULT_TICKERS)
                            update = payload[next(iter(payload))]
                            assert {"ticker", "price", "previous_price", "direction"} <= set(update)
                            break
        finally:
            server.should_exit = True
            thread.join(timeout=10)

    def test_db_path_reads_finally_db_path_env(self, tmp_path, monkeypatch):
        """Test that DB_PATH honors the FINALLY_DB_PATH environment variable."""
        import importlib

        monkeypatch.setenv("FINALLY_DB_PATH", str(tmp_path / "env.db"))
        import app.main as main

        main.DB_PATH = None  # or del attribute — force re-read path
        importlib.reload(main)
        assert main.DB_PATH == str(tmp_path / "env.db")
