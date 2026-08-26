"""Portfolio REST endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.db import get_connection
from app.market import PriceCache
from app.portfolio.schemas import PortfolioResponse, TradeRequest
from app.portfolio.service import (
    InsufficientCashError,
    InsufficientSharesError,
    TradeError,
    UnknownTickerError,
    execute_trade,
    get_history,
    get_portfolio,
)

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("", response_model=PortfolioResponse)
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


@router.post("/trade", response_model=PortfolioResponse)
def trade(request: Request, trade: TradeRequest) -> dict:
    """Execute a market buy or sell order and return the updated portfolio.

    Domain validation failures map to HTTP errors: an unknown ticker or a
    missing price returns 404, and insufficient cash (buy) or shares (sell)
    returns 400. Structural body violations are rejected by pydantic (422).
    """
    db_path: str = request.app.state.db_path
    price_cache: PriceCache = request.app.state.price_cache

    conn = get_connection(db_path)
    try:
        return execute_trade(conn, price_cache, trade)
    except UnknownTickerError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (InsufficientCashError, InsufficientSharesError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except TradeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        conn.close()


@router.get("/history")
def portfolio_history(request: Request) -> dict:
    """Return portfolio value snapshots in ascending recorded_at order.

    The P&L chart data: one entry every 30 seconds from the background loop
    plus one immediately after each trade.
    """
    db_path: str = request.app.state.db_path

    conn = get_connection(db_path)
    try:
        return get_history(conn)
    finally:
        conn.close()
