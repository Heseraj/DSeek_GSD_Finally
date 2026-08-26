"""Portfolio value snapshot recording and the background snapshot loop."""

from __future__ import annotations

import asyncio
import logging
import sqlite3
import uuid
from datetime import datetime, timezone

from app.db import get_connection
from app.market import PriceCache

logger = logging.getLogger(__name__)


def record_snapshot(conn: sqlite3.Connection, price_cache: PriceCache) -> None:
    """Insert one portfolio value snapshot row for the default user.

    total_value is cash_balance plus each position's market value at the
    current cache price (positions without a price contribute zero). The math
    mirrors get_portfolio in service.py; test_history pins the two together so
    snapshots always agree with the live portfolio endpoint.
    """
    profile = conn.execute(
        "SELECT cash_balance FROM users_profile WHERE id = ?", ("default",)
    ).fetchone()
    total_value = float(profile["cash_balance"]) if profile else 0.0

    rows = conn.execute(
        "SELECT ticker, quantity FROM positions WHERE user_id = ?", ("default",)
    ).fetchall()
    for row in rows:
        price = price_cache.get_price(row["ticker"]) or 0.0
        market_value = round(float(row["quantity"]) * price, 2)
        total_value = round(total_value + market_value, 2)

    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at) "
        "VALUES (?, ?, ?, ?)",
        (str(uuid.uuid4()), "default", total_value, now),
    )


async def start_snapshot_loop(
    price_cache: PriceCache, db_path: str, interval: float = 30.0
) -> None:
    """Record a portfolio snapshot every `interval` seconds until cancelled.

    Each interval opens its own connection in a worker thread, so the loop
    never holds a transaction open while idle. Failures are logged and skipped
    so one bad snapshot does not kill the cadence. Cancellation is absorbed
    internally and the loop returns cleanly.
    """
    loop = asyncio.get_running_loop()
    while True:
        try:
            await loop.run_in_executor(None, _record_snapshot_to_db, db_path, price_cache)
        except asyncio.CancelledError:
            logger.info("Portfolio snapshot loop cancelled")
            return
        except Exception:
            logger.exception("Portfolio snapshot failed")
        try:
            await asyncio.sleep(interval)
        except asyncio.CancelledError:
            logger.info("Portfolio snapshot loop cancelled")
            return


def _record_snapshot_to_db(db_path: str, price_cache: PriceCache) -> None:
    """Record one snapshot using a dedicated connection (runs in a thread)."""
    conn = get_connection(db_path)
    try:
        with conn:
            record_snapshot(conn, price_cache)
    finally:
        conn.close()
