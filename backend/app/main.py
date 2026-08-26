"""FastAPI application entry point for FinAlly."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import init_db
from app.market import PriceCache, create_market_data_source, create_stream_router
from app.market.seed_prices import SEED_PRICES
from app.portfolio import router as portfolio_router
from app.watchlist import router as watchlist_router

logger = logging.getLogger(__name__)

# Location of the SQLite database file (relative to the working directory).
# Tests override this module attribute before booting the app.
DB_PATH: str = "db/finally.db"

# The default universe of tickers; shared by the market data source and the DB seed.
DEFAULT_TICKERS: list[str] = list(SEED_PRICES.keys())

# Single shared price cache: the market source writes here, and the SSE router,
# portfolio router, and watchlist router all read from it.
price_cache = PriceCache()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Boot the market data source and initialize the database.

    The data source starts with the seed ticker list so live prices are
    available immediately; the SQLite file is created and seeded on first boot.
    """
    source = create_market_data_source(price_cache)
    await source.start(DEFAULT_TICKERS)
    init_db(DB_PATH)

    app.state.price_cache = price_cache
    app.state.market_source = source
    app.state.db_path = DB_PATH

    logger.info("FinAlly backend started with %d tickers", len(DEFAULT_TICKERS))
    try:
        yield
    finally:
        await source.stop()


app = FastAPI(title="FinAlly", version="0.1.0", lifespan=lifespan)

app.include_router(create_stream_router(price_cache))
app.include_router(portfolio_router)
app.include_router(watchlist_router)


@app.get("/api/health")
def health() -> dict:
    """Health check endpoint for Docker/uptime monitoring."""
    return {"status": "healthy"}
