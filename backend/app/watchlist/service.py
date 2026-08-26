"""Watchlist read service."""

from __future__ import annotations

import sqlite3

from app.market import PriceCache


def get_watchlist(conn: sqlite3.Connection, price_cache: PriceCache) -> dict:
    """Return the user's watchlist tickers in insertion order.

    Each ticker carries its latest price fields (price, previous_price,
    direction, change, change_percent, timestamp) from the cache when a price
    is available; tickers without a cache entry are returned with just their
    ticker symbol so the price is absent rather than stale.
    """
    rows = conn.execute(
        "SELECT ticker FROM watchlist WHERE user_id = ? ORDER BY added_at, rowid",
        ("default",),
    ).fetchall()

    tickers = []
    for row in rows:
        ticker = row["ticker"]
        update = price_cache.get(ticker)
        tickers.append(update.to_dict() if update is not None else {"ticker": ticker})

    return {"tickers": tickers}
