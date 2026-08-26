"""Watchlist read and mutation services."""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone

from app.market import MarketDataSource, PriceCache


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


async def add_ticker(
    conn: sqlite3.Connection, market_source: MarketDataSource, ticker: str
) -> tuple[str, bool]:
    """Add a ticker to the watchlist and start streaming it (WATCH-02).

    Normalizes the ticker to uppercase-stripped before inserting. The
    UNIQUE(user_id, ticker) constraint is the backstop against duplicate rows:
    when the ticker is already watched, no row is written, the market source
    is left untouched (it is already tracking it), and the existing ticker is
    returned with created=False.

    Returns (normalized_ticker, created) so the router can map a duplicate to
    a conflict status without raising.
    """
    ticker = ticker.strip().upper()
    now = datetime.now(timezone.utc).isoformat()
    try:
        with conn:
            conn.execute(
                "INSERT INTO watchlist (id, user_id, ticker, added_at) VALUES (?, ?, ?, ?)",
                (str(uuid.uuid4()), "default", ticker, now),
            )
    except sqlite3.IntegrityError:
        return ticker, False

    await market_source.add_ticker(ticker)
    return ticker, True


async def remove_ticker(
    conn: sqlite3.Connection, market_source: MarketDataSource, ticker: str
) -> bool:
    """Remove a ticker from the watchlist and stop tracking it (WATCH-03).

    Normalizes the ticker, deletes the matching row, and — only when a row was
    actually deleted — calls market_source.remove_ticker, which also clears the
    ticker from the price cache. Returns True when a row was removed, False
    when the ticker was not watched (source and cache left untouched).
    """
    ticker = ticker.strip().upper()
    with conn:
        cursor = conn.execute(
            "DELETE FROM watchlist WHERE user_id = ? AND ticker = ?",
            ("default", ticker),
        )
    if cursor.rowcount == 0:
        return False

    await market_source.remove_ticker(ticker)
    return True
