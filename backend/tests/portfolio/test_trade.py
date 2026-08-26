"""Tests for market-order trade execution (buy and sell)."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.db import get_connection, init_db
from app.main import app
from app.market import PriceCache
from app.portfolio.schemas import TradeRequest
from app.portfolio.service import InsufficientCashError, execute_trade


def _make_db(tmp_path):
    """Create a fresh seeded database and return (path, connection)."""
    db_path = str(tmp_path / "test.db")
    init_db(db_path)
    return db_path, get_connection(db_path)


def _trade(ticker: str = "AAPL", quantity: float = 10.0, side: str = "buy") -> TradeRequest:
    return TradeRequest(ticker=ticker, quantity=quantity, side=side)


def _http_client(tmp_path, monkeypatch) -> TestClient:
    """Build a TestClient whose lifespan writes the database to a temp file."""
    monkeypatch.setattr("app.main.DB_PATH", str(tmp_path / "finally.db"))
    return TestClient(app)


class TestTradeRequestSchema:
    """TradeRequest validation and normalization."""

    def test_ticker_normalized_to_uppercase_stripped(self):
        """Test that '  aapl  ' normalizes to 'AAPL'."""
        trade = TradeRequest(ticker="  aapl  ", quantity=1.0, side="buy")
        assert trade.ticker == "AAPL"


class TestExecuteTradeBuy:
    """Buy-side execution: cash deduction and weighted-average position math."""

    def test_buy_creates_position_and_deducts_cash(self, tmp_path):
        """Test that a buy of 10 @ 190.0 leaves 8100.0 cash and one position."""
        _, conn = _make_db(tmp_path)
        cache = PriceCache()
        cache.update("AAPL", 190.0)
        try:
            result = execute_trade(conn, cache, _trade(quantity=10.0))
        finally:
            conn.close()

        assert result["cash_balance"] == 8100.0
        assert len(result["positions"]) == 1
        pos = result["positions"][0]
        assert pos["ticker"] == "AAPL"
        assert pos["quantity"] == 10.0
        assert pos["avg_cost"] == 190.0

    def test_second_buy_recomputes_weighted_average_cost(self, tmp_path):
        """Test that buying 10 @ 190 then 10 @ 200 yields qty 20, avg 195."""
        _, conn = _make_db(tmp_path)
        cache = PriceCache()
        cache.update("AAPL", 190.0)
        try:
            execute_trade(conn, cache, _trade(quantity=10.0))
            cache.update("AAPL", 200.0)
            result = execute_trade(conn, cache, _trade(quantity=10.0))
        finally:
            conn.close()

        assert result["cash_balance"] == 6100.0
        pos = result["positions"][0]
        assert pos["quantity"] == 20.0
        assert pos["avg_cost"] == 195.0

    def test_buy_appends_trade_row(self, tmp_path):
        """Test that a successful buy logs one trades row with the fill price."""
        db_path, conn = _make_db(tmp_path)
        cache = PriceCache()
        cache.update("AAPL", 190.0)
        try:
            execute_trade(conn, cache, _trade(quantity=10.0))
        finally:
            conn.close()

        verify = get_connection(db_path)
        try:
            rows = verify.execute("SELECT ticker, side, quantity, price FROM trades").fetchall()
        finally:
            verify.close()

        assert len(rows) == 1
        row = rows[0]
        assert row["ticker"] == "AAPL"
        assert row["side"] == "buy"
        assert row["quantity"] == 10.0
        assert row["price"] == 190.0

    def test_buy_exceeding_cash_raises_and_leaves_state_untouched(self, tmp_path):
        """Test that an unaffordable buy raises and changes no rows."""
        db_path, conn = _make_db(tmp_path)
        cache = PriceCache()
        cache.update("AAPL", 190.0)
        try:
            with pytest.raises(InsufficientCashError):
                execute_trade(conn, cache, _trade(quantity=100.0))
        finally:
            conn.close()

        verify = get_connection(db_path)
        try:
            cash = verify.execute(
                "SELECT cash_balance FROM users_profile WHERE id = ?", ("default",)
            ).fetchone()["cash_balance"]
            positions = verify.execute("SELECT COUNT(*) AS n FROM positions").fetchone()["n"]
            trades = verify.execute("SELECT COUNT(*) AS n FROM trades").fetchone()["n"]
        finally:
            verify.close()

        assert cash == 10000.0
        assert positions == 0
        assert trades == 0


class TestTradeEndpoint:
    """HTTP-level behavior of POST /api/portfolio/trade."""

    def test_buy_returns_updated_portfolio(self, tmp_path, monkeypatch):
        """Test that POST /trade with a valid buy returns the new portfolio."""
        client = _http_client(tmp_path, monkeypatch)
        with client:
            client.app.state.price_cache.update("IBM", 190.0)
            resp = client.post(
                "/api/portfolio/trade",
                json={"ticker": "IBM", "quantity": 10, "side": "buy"},
            )
            assert resp.status_code == 200
            body = resp.json()
            assert body["cash_balance"] == 8100.0
            assert body["positions"] == [
                {
                    "ticker": "IBM",
                    "quantity": 10.0,
                    "avg_cost": 190.0,
                    "current_price": 190.0,
                    "market_value": 1900.0,
                    "unrealized_pnl": 0.0,
                    "unrealized_pnl_percent": 0.0,
                }
            ]
            assert body["total_value"] == 10000.0
            assert body["unrealized_pnl"] == 0.0

    def test_buy_insufficient_cash_returns_400_and_leaves_cash(self, tmp_path, monkeypatch):
        """Test that an unaffordable buy returns 400 without changing cash."""
        client = _http_client(tmp_path, monkeypatch)
        with client:
            client.app.state.price_cache.update("ORCL", 190.0)
            resp = client.post(
                "/api/portfolio/trade",
                json={"ticker": "ORCL", "quantity": 1000, "side": "buy"},
            )
            assert resp.status_code == 400

            portfolio = client.get("/api/portfolio").json()
            assert portfolio["cash_balance"] == 10000.0
            assert portfolio["positions"] == []

    def test_unknown_ticker_returns_404(self, tmp_path, monkeypatch):
        """Test that a ticker with no price returns 404."""
        client = _http_client(tmp_path, monkeypatch)
        with client:
            resp = client.post(
                "/api/portfolio/trade",
                json={"ticker": "ZZZZ", "quantity": 1, "side": "buy"},
            )
            assert resp.status_code == 404
            assert resp.json()["detail"]
