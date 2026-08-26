"""Tests for portfolio value snapshots and history retrieval."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.db import get_connection, init_db
from app.main import app
from app.market import PriceCache
from app.portfolio.schemas import TradeRequest
from app.portfolio.service import InsufficientCashError, execute_trade, get_portfolio
from app.portfolio.snapshots import record_snapshot, start_snapshot_loop


def _make_db(tmp_path):
    """Create a fresh seeded database and return (path, connection)."""
    db_path = str(tmp_path / "test.db")
    init_db(db_path)
    return db_path, get_connection(db_path)


def _seed_position(conn, ticker: str, quantity: float, avg_cost: float) -> None:
    """Insert a position row for the default user."""
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO positions (id, user_id, ticker, quantity, avg_cost, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), "default", ticker, quantity, avg_cost, now),
    )
    conn.commit()


def _http_client(tmp_path, monkeypatch) -> TestClient:
    """Build a TestClient whose lifespan writes the database to a temp file."""
    monkeypatch.setattr("app.main.DB_PATH", str(tmp_path / "finally.db"))
    return TestClient(app)


class TestRecordSnapshot:
    """record_snapshot(conn, price_cache) computes and stores total_value."""

    def test_fresh_portfolio_snapshot_is_10000(self, tmp_path):
        """Test that a seeded portfolio without positions snapshots at $10k."""
        _, conn = _make_db(tmp_path)
        try:
            record_snapshot(conn, PriceCache())
            row = conn.execute("SELECT total_value FROM portfolio_snapshots").fetchone()
        finally:
            conn.close()

        assert row is not None
        assert row["total_value"] == 10000.0

    def test_snapshot_includes_position_market_value(self, tmp_path):
        """Test that a 10-share position at 200.0 values the portfolio at $12k."""
        _, conn = _make_db(tmp_path)
        _seed_position(conn, "AAPL", 10.0, 150.0)
        cache = PriceCache()
        cache.update("AAPL", 200.0)
        try:
            record_snapshot(conn, cache)
            row = conn.execute("SELECT total_value FROM portfolio_snapshots").fetchone()
        finally:
            conn.close()

        assert row["total_value"] == 12000.0  # 10000 cash + 10 * 200.0

    def test_snapshot_matches_portfolio_total_value(self, tmp_path):
        """Test that the snapshot total_value agrees with get_portfolio."""
        _, conn = _make_db(tmp_path)
        _seed_position(conn, "AAPL", 10.0, 150.0)
        _seed_position(conn, "MSFT", 4.0, 100.0)
        cache = PriceCache()
        cache.update("AAPL", 190.5)
        cache.update("MSFT", 220.25)
        try:
            record_snapshot(conn, cache)
            expected = get_portfolio(conn, cache)["total_value"]
            row = conn.execute("SELECT total_value FROM portfolio_snapshots").fetchone()
        finally:
            conn.close()

        assert row["total_value"] == expected


class TestTradeRecordsSnapshot:
    """A successful trade records a post-trade snapshot in the same transaction."""

    def test_successful_trade_records_snapshot(self, tmp_path):
        """Test that a buy leaves exactly one snapshot with the post-trade value."""
        _, conn = _make_db(tmp_path)
        cache = PriceCache()
        cache.update("AAPL", 190.0)
        try:
            execute_trade(conn, cache, TradeRequest(ticker="AAPL", quantity=10.0, side="buy"))
            rows = conn.execute(
                "SELECT total_value FROM portfolio_snapshots ORDER BY recorded_at"
            ).fetchall()
        finally:
            conn.close()

        assert len(rows) == 1
        # cash 8100 + position 10 * 190.0 = 10000.0
        assert rows[0]["total_value"] == 10000.0

    def test_failed_trade_records_no_snapshot(self, tmp_path):
        """Test that a rejected trade leaves no snapshot row behind."""
        _, conn = _make_db(tmp_path)
        cache = PriceCache()
        cache.update("AAPL", 190.0)
        try:
            with pytest.raises(InsufficientCashError):
                execute_trade(conn, cache, TradeRequest(ticker="AAPL", quantity=100.0, side="buy"))
            row = conn.execute(
                "SELECT COUNT(*) AS n FROM portfolio_snapshots"
            ).fetchone()
        finally:
            conn.close()

        assert row["n"] == 0


class TestHistoryEndpoint:
    """GET /api/portfolio/history returns snapshots oldest-first."""

    def test_history_returns_snapshots_in_ascending_order(self, tmp_path, monkeypatch):
        """Test that history returns recorded_at/total_value pairs ordered by time."""
        client = _http_client(tmp_path, monkeypatch)
        with client:
            client.app.state.price_cache.update("IBM", 190.0)
            client.post(
                "/api/portfolio/trade",
                json={"ticker": "IBM", "quantity": 10, "side": "buy"},
            )

            resp = client.get("/api/portfolio/history")
            assert resp.status_code == 200
            snapshots = resp.json()["snapshots"]
            assert len(snapshots) >= 1
            for snap in snapshots:
                assert set(snap) == {"recorded_at", "total_value"}
                assert isinstance(snap["total_value"], float)
            timestamps = [snap["recorded_at"] for snap in snapshots]
            assert timestamps == sorted(timestamps)


class TestSnapshotLoop:
    """The background snapshot loop records on an interval and cancels cleanly."""

    async def test_loop_records_snapshots_on_interval_and_cancels_cleanly(self, tmp_path):
        """Test that the loop writes rows repeatedly and exits on cancellation."""
        db_path = str(tmp_path / "test.db")
        init_db(db_path)
        cache = PriceCache()
        cache.update("AAPL", 190.0)

        task = asyncio.create_task(start_snapshot_loop(cache, db_path, interval=0.05))
        await asyncio.sleep(0.12)
        task.cancel()
        await task  # the loop absorbs CancelledError and returns normally

        conn = get_connection(db_path)
        try:
            rows = conn.execute("SELECT total_value FROM portfolio_snapshots").fetchall()
        finally:
            conn.close()

        assert len(rows) >= 2
        assert all(row["total_value"] == 10000.0 for row in rows)
