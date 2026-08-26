"""Watchlist REST endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response

from app.db import get_connection
from app.market import MarketDataSource, PriceCache
from app.watchlist.schemas import WatchlistAddRequest
from app.watchlist.service import add_ticker, get_watchlist, remove_ticker

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


@router.post("")
async def add_watchlist_ticker(request: Request, payload: WatchlistAddRequest) -> dict:
    """Add a ticker to the watchlist and start streaming it (WATCH-02).

    The ticker is normalized by the schema (uppercase, stripped). A ticker
    that is already watched returns 409 without writing a duplicate row; the
    UNIQUE(user_id, ticker) constraint is the backstop.
    """
    db_path: str = request.app.state.db_path
    market_source: MarketDataSource = request.app.state.market_source

    conn = get_connection(db_path)
    try:
        ticker, created = await add_ticker(conn, market_source, payload.ticker)
    finally:
        conn.close()

    if not created:
        raise HTTPException(status_code=409, detail=f"Ticker already on watchlist: {ticker}")
    return {"ticker": ticker}


@router.delete("/{ticker}")
async def remove_watchlist_ticker(ticker: str, request: Request) -> Response:
    """Remove a ticker from the watchlist and stop streaming it (WATCH-03).

    The path parameter is normalized by the service before the delete, so
    DELETE /api/watchlist/pypl removes PYPL. A ticker that is not watched
    returns 404 with the source and price cache untouched.
    """
    db_path: str = request.app.state.db_path
    market_source: MarketDataSource = request.app.state.market_source

    conn = get_connection(db_path)
    try:
        removed = await remove_ticker(conn, market_source, ticker)
    finally:
        conn.close()

    if not removed:
        raise HTTPException(status_code=404, detail=f"Ticker not on watchlist: {ticker}")
    return Response(status_code=204)
