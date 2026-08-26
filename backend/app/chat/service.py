"""Chat orchestration service: context assembly, LLM seam, auto-execution, persistence.

The chat layer is a thin orchestrator over Phase 1 primitives: it never
re-implements trade math (execute_trade), source sync (add_ticker /
remove_ticker), or validation (TradeRequest / WatchlistChange). It assembles
the prompt, calls the LLM through a call-time mock/live seam, parses the
structured proposal with Pydantic, executes every proposed action with
per-action error capture (a failed action never aborts the batch), persists
the exchange to chat_messages, and returns the enriched ChatResponse.
"""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone

import litellm  # noqa: F401  # used by the live branch in 02-03

from app.chat.prompts import SYSTEM_PROMPT, build_context
from app.chat.schemas import (
    ChatProposal,
    ChatResponse,
    TradeActionResult,
    WatchlistChangeResult,
)
from app.db import get_connection
from app.market import MarketDataSource, PriceCache
from app.portfolio.schemas import TradeRequest
from app.portfolio.service import TradeError, execute_trade, get_portfolio
from app.watchlist.service import add_ticker, get_watchlist, remove_ticker


def _mock_response(user_message: str) -> dict:
    """Deterministic canned response for mock mode (CHAT-05).

    Module-level so tests can monkeypatch ``app.chat.service._mock_response``
    to drive arbitrary proposals through the same parse-to-execute pipeline.
    """
    return {
        "message": f"[mock] Acknowledged: {user_message}",
        "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 1}],
        "watchlist_changes": [],
    }


def _load_history(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    """Load up to 20 prior turns for the default user, oldest first.

    The query is newest-first with a cost guard; the result is reversed so the
    LLM sees the conversation in chronological order (CHAT-04).
    """
    rows = conn.execute(
        "SELECT role, content, actions FROM chat_messages "
        "WHERE user_id = 'default' ORDER BY created_at DESC LIMIT 20"
    ).fetchall()
    return list(reversed(rows))


def build_messages(
    user_message: str,
    portfolio: dict,
    watchlist: dict,
    history: list[sqlite3.Row],
) -> list[dict]:
    """Assemble the chat message list: system prompt + context + history + user."""
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": build_context(portfolio, watchlist)},
        *[{"role": r["role"], "content": r["content"]} for r in history],
        {"role": "user", "content": user_message},
    ]


async def generate_assistant_response(messages: list[dict]) -> str:
    """Return the assistant's structured JSON response as a string.

    The LLM_MOCK env var is read at call time (never import time) so tests can
    monkeypatch.setenv it. In mock mode the canned proposal is returned through
    the same JSON-string shape as the live branch, keeping the caller's
    parse-to-execute path identical (CHAT-05).
    """
    if os.environ.get("LLM_MOCK"):
        return json.dumps(_mock_response(messages[-1]["content"]))
    # Live LiteLLM branch lands in 02-03 Task 1; unreachable in mock-mode tests.
    raise NotImplementedError("Live LLM branch arrives in 02-03")


def _save_messages(
    conn: sqlite3.Connection,
    user_message: str,
    assistant_message: str,
    actions: dict,
) -> None:
    """Persist the user and assistant rows in one transaction (CHAT-04).

    The user row carries NULL actions; the assistant row carries the
    JSON-encoded executed-action results so later turns can see what ran.
    """
    now = datetime.now(timezone.utc).isoformat()
    with conn:
        conn.execute(
            "INSERT INTO chat_messages (id, user_id, role, content, actions, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), "default", "user", user_message, None, now),
        )
        conn.execute(
            "INSERT INTO chat_messages (id, user_id, role, content, actions, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), "default", "assistant", assistant_message, json.dumps(actions), now),
        )


def _execute_trade(conn: sqlite3.Connection, price_cache: PriceCache, proposal: dict) -> dict:
    """Execute one LLM-proposed trade through the same validation as manual trades.

    Per-action error capture (spec §9): a TradeError marks this action failed
    with a human-readable error and is never re-raised, so the batch continues.
    """
    trade = TradeRequest(**proposal)
    try:
        execute_trade(conn, price_cache, trade)
        return {**proposal, "status": "executed"}
    except TradeError as exc:
        return {**proposal, "status": "failed", "error": str(exc)}


async def _apply_watchlist_change(
    conn: sqlite3.Connection,
    market_source: MarketDataSource,
    change: dict,
) -> dict:
    """Apply one LLM-proposed watchlist change via add_ticker/remove_ticker (CHAT-03)."""
    action = change["action"]
    if action == "add":
        _, created = await add_ticker(conn, market_source, change["ticker"])
        if created:
            return {**change, "status": "executed"}
        return {**change, "status": "failed", "error": "Ticker already on watchlist"}

    removed = await remove_ticker(conn, market_source, change["ticker"])
    if removed:
        return {**change, "status": "executed"}
    return {**change, "status": "failed", "error": "Ticker not on watchlist"}


async def process_message(
    db_path: str,
    price_cache: PriceCache,
    market_source: MarketDataSource,
    user_message: str,
) -> ChatResponse:
    """Process one chat turn end-to-end: context -> LLM -> execute -> persist -> respond.

    Opens its own connection for the full turn; every side effect (trades,
    watchlist changes, chat_messages rows) commits through it before the
    response is returned.
    """
    conn = get_connection(db_path)
    try:
        portfolio = get_portfolio(conn, price_cache)
        watchlist = get_watchlist(conn, price_cache)
        history = _load_history(conn)
        messages = build_messages(user_message, portfolio, watchlist, history)

        content = await generate_assistant_response(messages)
        proposal = ChatProposal.model_validate_json(content)

        trade_results = [
            _execute_trade(conn, price_cache, trade.model_dump()) for trade in proposal.trades
        ]
        change_results = [
            await _apply_watchlist_change(conn, market_source, change.model_dump())
            for change in proposal.watchlist_changes
        ]

        _save_messages(
            conn,
            user_message,
            proposal.message,
            {"trades": trade_results, "watchlist_changes": change_results},
        )

        return ChatResponse(
            message=proposal.message,
            trades=[TradeActionResult(**result) for result in trade_results],
            watchlist_changes=[WatchlistChangeResult(**result) for result in change_results],
        )
    finally:
        conn.close()
