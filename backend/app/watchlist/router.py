"""Watchlist REST endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.db import get_connection
from app.market import PriceCache
from app.watchlist.service import get_watchlist

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


@router.get("")
def read_watchlist(request: Request) -> dict:
    """Return the user's watchlist tickers with their latest prices.

    Reads the database path and price cache from app.state so the router never
    depends on module-level singletons.
    """
    db_path: str = request.app.state.db_path
    price_cache: PriceCache = request.app.state.price_cache

    conn = get_connection(db_path)
    try:
        return get_watchlist(conn, price_cache)
    finally:
        conn.close()
