"""Tests for the watchlist read service."""

from __future__ import annotations

from app.db import get_connection, init_db
from app.market import PriceCache
from app.watchlist.service import get_watchlist


class TestGetWatchlist:
    """Tests for the get_watchlist service function."""

    def test_fresh_watchlist_returns_ten_seeded_tickers(self, tmp_path):
        """Test that a fresh watchlist returns the ten seeded tickers in order."""
        db_path = str(tmp_path / "test.db")
        init_db(db_path)
        conn = get_connection(db_path)
        try:
            result = get_watchlist(conn, PriceCache())
        finally:
            conn.close()

        tickers = [item["ticker"] for item in result["tickers"]]
        assert tickers == [
            "AAPL",
            "GOOGL",
            "MSFT",
            "AMZN",
            "TSLA",
            "NVDA",
            "META",
            "JPM",
            "V",
            "NFLX",
        ]
        # No cache entries -> prices absent, only ticker symbols present
        assert all("price" not in item for item in result["tickers"])

    def test_ticker_with_cached_price(self, tmp_path):
        """Test that a cached ticker carries its latest price fields."""
        db_path = str(tmp_path / "test.db")
        init_db(db_path)
        conn = get_connection(db_path)
        try:
            cache = PriceCache()
            cache.update("AAPL", 190.50, timestamp=1234567890.0)

            result = get_watchlist(conn, cache)
        finally:
            conn.close()

        aapl = next(item for item in result["tickers"] if item["ticker"] == "AAPL")
        assert aapl["price"] == 190.5
        assert aapl["previous_price"] == 190.5
        assert aapl["direction"] == "flat"
        assert aapl["change"] == 0.0
        assert aapl["change_percent"] == 0.0
        assert aapl["timestamp"] == 1234567890.0

        others = [item for item in result["tickers"] if item["ticker"] != "AAPL"]
        assert len(others) == 9
        assert all("price" not in item for item in others)
