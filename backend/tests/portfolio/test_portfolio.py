"""Tests for the portfolio valuation service."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.db import get_connection, init_db
from app.market import PriceCache
from app.portfolio.service import get_portfolio


def _seed_position(conn, ticker: str, quantity: float, avg_cost: float) -> None:
    """Insert a position row for the default user."""
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO positions (id, user_id, ticker, quantity, avg_cost, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), "default", ticker, quantity, avg_cost, now),
    )
    conn.commit()


class TestGetPortfolio:
    """Tests for the get_portfolio service function."""

    def test_fresh_portfolio(self, tmp_path):
        """Test that a fresh seeded portfolio has $10k cash and no positions."""
        db_path = str(tmp_path / "test.db")
        init_db(db_path)
        conn = get_connection(db_path)
        try:
            result = get_portfolio(conn, PriceCache())
        finally:
            conn.close()

        assert result["cash_balance"] == 10000.0
        assert result["positions"] == []
        assert result["total_value"] == 10000.0
        assert result["unrealized_pnl"] == 0.0

    def test_portfolio_with_position_valuations(self, tmp_path):
        """Test that a position is valued from the cache price."""
        db_path = str(tmp_path / "test.db")
        init_db(db_path)
        conn = get_connection(db_path)
        try:
            _seed_position(conn, "AAPL", 10.0, 150.0)
            cache = PriceCache()
            cache.update("AAPL", 200.0)

            result = get_portfolio(conn, cache)
        finally:
            conn.close()

        assert result["cash_balance"] == 10000.0
        assert len(result["positions"]) == 1

        pos = result["positions"][0]
        assert pos["ticker"] == "AAPL"
        assert pos["quantity"] == 10.0
        assert pos["avg_cost"] == 150.0
        assert pos["current_price"] == 200.0
        assert pos["market_value"] == 2000.0
        assert pos["unrealized_pnl"] == 500.0
        assert pos["unrealized_pnl_percent"] == 33.3333
        assert result["total_value"] == 12000.0
        assert result["unrealized_pnl"] == 500.0

    def test_missing_cache_price_contributes_zero(self, tmp_path):
        """Test that a position without a cache price values at zero."""
        db_path = str(tmp_path / "test.db")
        init_db(db_path)
        conn = get_connection(db_path)
        try:
            _seed_position(conn, "TSLA", 5.0, 100.0)
            result = get_portfolio(conn, PriceCache())
        finally:
            conn.close()

        assert len(result["positions"]) == 1
        pos = result["positions"][0]
        assert pos["current_price"] == 0.0
        assert pos["market_value"] == 0.0
        assert pos["unrealized_pnl"] == -500.0
        assert result["total_value"] == 10000.0
        assert result["unrealized_pnl"] == -500.0
