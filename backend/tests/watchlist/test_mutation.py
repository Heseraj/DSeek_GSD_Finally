"""Tests for watchlist mutation: add and remove tickers (WATCH-02, WATCH-03).

RED state: this file intentionally references modules/functions that do not
exist yet (app/watchlist/schemas.py, add_ticker, remove_ticker) so the first
commit fails at collection — the repo-established TDD gate from 01-01/01-02.
"""

from __future__ import annotations

import sqlite3

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.db import get_connection, init_db
from app.main import app
from app.market import PriceCache
from app.watchlist.schemas import WatchlistAddRequest
from app.watchlist.service import add_ticker, remove_ticker


class MockMarketSource:
    """Minimal MarketDataSource stand-in recording add/remove calls.

    Mirrors the real simulator's contract: add_ticker seeds the price cache
    so the ticker gains a price, remove_ticker clears it from the cache.
    """

    def __init__(self) -> None:
        self.tracked: set[str] = set()
        self.cache = PriceCache()

    async def add_ticker(self, ticker: str) -> None:
        self.tracked.add(ticker)
        self.cache.update(ticker=ticker, price=100.0)

    async def remove_ticker(self, ticker: str) -> None:
        self.tracked.discard(ticker)
        self.cache.remove(ticker)

    def get_tickers(self) -> list[str]:
        return sorted(self.tracked)


def _count_tickers(db_path: str, ticker: str) -> int:
    """Count watchlist rows for one ticker (duplicate-row detection)."""
    conn = sqlite3.connect(db_path)
    try:
        row = conn.execute(
            "SELECT COUNT(*) FROM watchlist WHERE user_id = 'default' AND ticker = ?",
            (ticker,),
        ).fetchone()
        return int(row[0])
    finally:
        conn.close()


def _watchlist_total(db_path: str) -> int:
    conn = sqlite3.connect(db_path)
    try:
        row = conn.execute("SELECT COUNT(*) FROM watchlist").fetchone()
        return int(row[0])
    finally:
        conn.close()


class TestWatchlistAddRequest:
    """Schema-level validation for POST /api/watchlist bodies."""

    def test_normalizes_ticker_to_uppercase_stripped(self):
        req = WatchlistAddRequest(ticker="  aapl  ")
        assert req.ticker == "AAPL"

    def test_whitespace_only_ticker_rejected(self):
        with pytest.raises(ValidationError):
            WatchlistAddRequest(ticker="   ")

    def test_empty_ticker_rejected(self):
        with pytest.raises(ValidationError):
            WatchlistAddRequest(ticker="")

    def test_overlong_ticker_rejected(self):
        with pytest.raises(ValidationError):
            WatchlistAddRequest(ticker="TOOLONGSYMBOL")


class TestAddTickerService:
    """add_ticker(conn, market_source, ticker) service behavior (WATCH-02)."""

    async def test_add_normalizes_persists_and_starts_streaming(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        init_db(db_path)
        conn = get_connection(db_path)
        source = MockMarketSource()
        try:
            ticker, created = await add_ticker(conn, source, "  pypl  ")
        finally:
            conn.close()

        assert ticker == "PYPL"
        assert created is True
        assert _count_tickers(db_path, "PYPL") == 1
        assert source.tracked == {"PYPL"}
        assert source.cache.get_price("PYPL") == 100.0

    async def test_add_existing_ticker_returns_existing_without_duplicate_row(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        init_db(db_path)
        conn = get_connection(db_path)
        source = MockMarketSource()
        try:
            ticker, created = await add_ticker(conn, source, "aapl")
        finally:
            conn.close()

        assert ticker == "AAPL"
        assert created is False
        assert _count_tickers(db_path, "AAPL") == 1
        assert source.tracked == set()


class TestAddTickerEndpoint:
    """POST /api/watchlist over the real app with the real market source."""

    @staticmethod
    def _client(tmp_path, monkeypatch) -> TestClient:
        monkeypatch.setattr("app.main.DB_PATH", str(tmp_path / "finally.db"))
        return TestClient(app)

    def test_add_persists_row_and_starts_streaming(self, tmp_path, monkeypatch):
        client = self._client(tmp_path, monkeypatch)
        with client:
            resp = client.post("/api/watchlist", json={"ticker": "pypl"})
            assert resp.status_code == 200
            assert resp.json() == {"ticker": "PYPL"}

            db_path = str(tmp_path / "finally.db")
            assert _count_tickers(db_path, "PYPL") == 1
            assert "PYPL" in client.app.state.market_source.get_tickers()
            assert "PYPL" in client.app.state.price_cache

    def test_add_duplicate_returns_conflict_without_second_row(self, tmp_path, monkeypatch):
        client = self._client(tmp_path, monkeypatch)
        with client:
            resp = client.post("/api/watchlist", json={"ticker": "AAPL"})
            assert resp.status_code == 409
            assert _count_tickers(str(tmp_path / "finally.db"), "AAPL") == 1

    def test_add_whitespace_rejected_and_nothing_written(self, tmp_path, monkeypatch):
        client = self._client(tmp_path, monkeypatch)
        with client:
            resp = client.post("/api/watchlist", json={"ticker": "   "})
            assert resp.status_code == 422
            assert _watchlist_total(str(tmp_path / "finally.db")) == 10


class TestRemoveTickerService:
    """remove_ticker(conn, market_source, ticker) service behavior (WATCH-03)."""

    async def test_remove_existing_deletes_row_and_stops_source(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        init_db(db_path)
        conn = get_connection(db_path)
        source = MockMarketSource()
        try:
            await add_ticker(conn, source, "PYPL")
            removed = await remove_ticker(conn, source, "  pypl  ")
        finally:
            conn.close()

        assert removed is True
        assert _count_tickers(db_path, "PYPL") == 0
        assert source.tracked == set()
        assert "PYPL" not in source.cache

    async def test_remove_unknown_ticker_returns_false_and_leaves_source(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        init_db(db_path)
        conn = get_connection(db_path)
        source = MockMarketSource()
        try:
            removed = await remove_ticker(conn, source, "ZZZZ")
        finally:
            conn.close()

        assert removed is False
        assert source.tracked == set()
        assert "ZZZZ" not in source.cache


class TestRemoveTickerEndpoint:
    """DELETE /api/watchlist/{ticker} over the real app."""

    @staticmethod
    def _client(tmp_path, monkeypatch) -> TestClient:
        monkeypatch.setattr("app.main.DB_PATH", str(tmp_path / "finally.db"))
        return TestClient(app)

    def test_remove_existing_deletes_row_and_clears_cache(self, tmp_path, monkeypatch):
        client = self._client(tmp_path, monkeypatch)
        with client:
            add_resp = client.post("/api/watchlist", json={"ticker": "PYPL"})
            assert add_resp.status_code == 200
            assert "PYPL" in client.app.state.market_source.get_tickers()
            assert "PYPL" in client.app.state.price_cache

            resp = client.delete("/api/watchlist/pypl")
            assert resp.status_code == 204

            assert _count_tickers(str(tmp_path / "finally.db"), "PYPL") == 0
            assert "PYPL" not in client.app.state.market_source.get_tickers()
            assert "PYPL" not in client.app.state.price_cache

    def test_remove_unknown_ticker_returns_not_found(self, tmp_path, monkeypatch):
        client = self._client(tmp_path, monkeypatch)
        with client:
            resp = client.delete("/api/watchlist/ZZZZ")
            assert resp.status_code == 404
