"""Chat REST endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.chat.schemas import ChatRequest, ChatResponse
from app.chat.service import process_message
from app.db import get_connection
from app.market import MarketDataSource, PriceCache

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(request: Request, payload: ChatRequest) -> ChatResponse:
    """Process a user chat message and execute any proposed actions (CHAT-01).

    Reads db_path/price_cache/market_source from app.state (no module
    singletons) and hands them to process_message, which awaits the async
    watchlist mutators — so this handler must be async (RESEARCH Pitfall 4).
    """
    db_path: str = request.app.state.db_path
    price_cache: PriceCache = request.app.state.price_cache
    market_source: MarketDataSource = request.app.state.market_source

    conn = get_connection(db_path)
    try:
        return await process_message(db_path, price_cache, market_source, payload.message)
    finally:
        conn.close()
