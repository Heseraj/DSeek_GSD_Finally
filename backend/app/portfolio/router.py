"""Portfolio REST endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.db import get_connection
from app.market import PriceCache
from app.portfolio.service import get_portfolio

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("")
def read_portfolio(request: Request) -> dict:
    """Return the current portfolio: cash, positions, total value, and unrealized P&L.

    Reads the database path and price cache from app.state so the router never
    depends on module-level singletons.
    """
    db_path: str = request.app.state.db_path
    price_cache: PriceCache = request.app.state.price_cache

    conn = get_connection(db_path)
    try:
        return get_portfolio(conn, price_cache)
    finally:
        conn.close()
