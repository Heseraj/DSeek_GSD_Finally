"""Chat REST endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response

from app.chat.schemas import ChatRequest, ChatResponse
from app.chat.service import process_message
from app.market import MarketDataSource, PriceCache

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(request: Request, payload: ChatRequest, response: Response) -> ChatResponse:
    """Process a user chat message and execute any proposed actions (CHAT-01).

    Reads db_path/price_cache/market_source from app.state (no module
    singletons) and hands them to process_message, which awaits the async
    watchlist mutators — so this handler must be async (RESEARCH Pitfall 4).

    Locked error contract (RESEARCH A5 / Open Question 3, planner decision):
    any ChatResponse whose top-level error is set is returned with HTTP 503 and
    the ChatResponse object as the body — never 500, never a bare detail. The
    Phase 3 frontend renders this without special-casing. Per-action failures
    do NOT set the top-level error and keep HTTP 200.
    """
    db_path: str = request.app.state.db_path
    price_cache: PriceCache = request.app.state.price_cache
    market_source: MarketDataSource = request.app.state.market_source

    result = await process_message(db_path, price_cache, market_source, payload.message)
    if result.error is not None:
        response.status_code = 503
    return result
