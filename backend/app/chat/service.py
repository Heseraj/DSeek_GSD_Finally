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

import litellm  # noqa: F401  # used by the live branch
from openai import APIError as OpenAIAPIError
from pydantic import ValidationError

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


def _mock_enabled() -> bool:
    """True only when LLM_MOCK parses as a truthy boolean.

    Any value other than a truthy token (true/1/yes, case-insensitive) leaves
    mock mode OFF — notably ``false``, the value .env.example ships, must NOT
    activate the mock branch (CR-01). Read at call time so tests can
    monkeypatch.setenv without a process restart.
    """
    return os.environ.get("LLM_MOCK", "").strip().lower() in {"true", "1", "yes"}


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

    The live branch (spec §9, RESEARCH code example) calls LiteLLM -> OpenRouter
    with gpt-oss-120b pinned to Cerebras and structured outputs. The
    cerebras-inference skill named by the spec does not exist locally; the §9
    pattern is encoded directly (RESEARCH finding 3 / assumption A6).
    """
    if _mock_enabled():
        return json.dumps(_mock_response(messages[-1]["content"]))

    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "chat_response",
            "schema": ChatProposal.model_json_schema(),
            "strict": True,
        },
    }
    # RESEARCH Pitfall 2: providers that ignore json_schema silently return
    # plain text; fall back to json_object when the model does not advertise
    # response-schema support.
    if not litellm.supports_response_schema(model="openrouter/openai/gpt-oss-120b"):
        response_format = {"type": "json_object"}

    response = await litellm.acompletion(
        model="openrouter/openai/gpt-oss-120b",
        messages=messages,
        response_format=response_format,
        extra_body={"provider": {"order": ["cerebras"], "allow_fallbacks": False}},
        force_timeout=60,
    )
    return response.choices[0].message.content


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
            (
                str(uuid.uuid4()),
                "default",
                "assistant",
                assistant_message,
                json.dumps(actions),
                now,
            ),
        )


def _execute_trade(conn: sqlite3.Connection, price_cache: PriceCache, proposal: dict) -> dict:
    """Execute one LLM-proposed trade through the same validation as manual trades.

    Per-action error capture (spec §9): any error in this single action — the
    TradeError hierarchy (insufficient cash/shares, unknown ticker) OR an
    unexpected exception (e.g. sqlite3.OperationalError) — marks THIS action
    failed with a human-readable error and is never re-raised, so the batch
    continues and the response is never a raw 500 (CR-02).
    """
    trade = TradeRequest(**proposal)
    try:
        execute_trade(conn, price_cache, trade)
        return {**proposal, "status": "executed"}
    except TradeError as exc:
        return {**proposal, "status": "failed", "error": str(exc)}
    except Exception as exc:  # noqa: BLE001  # per-action isolation, never abort the batch
        return {**proposal, "status": "failed", "error": f"Trade failed: {exc}"}


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

        # Key pre-check (threat T-02-02): without OPENROUTER_API_KEY and mock
        # off, return a locked error ChatResponse before any LLM call — nothing
        # executed, nothing persisted. The key is read at call time so tests can
        # monkeypatch.setenv without a process restart.
        if not _mock_enabled() and not os.environ.get("OPENROUTER_API_KEY"):
            return ChatResponse(
                message=(
                    "The AI backend is not configured. Set OPENROUTER_API_KEY "
                    "in .env or run with LLM_MOCK=true."
                ),
                error="OPENROUTER_API_KEY is not set",
            )

        # Tolerant parse (threat T-02-04): a backend failure or schema-violating
        # proposal becomes an error ChatResponse — never re-raised, and never
        # reaching _save_messages or the executor (persistence and execution
        # happen only for successfully parsed turns). OpenAIAPIError is the
        # common base of the LiteLLM/OpenAI exception hierarchy (AuthenticationError,
        # APIConnectionError, RateLimitError, BadRequestError,
        # ContextWindowExceededError, Timeout, InternalServerError, …), so
        # catching it enforces the locked "never 500" contract across the whole
        # live branch (CR-02).
        try:
            content = await generate_assistant_response(messages)
            proposal = ChatProposal.model_validate_json(content)
        except (OpenAIAPIError, ValidationError) as exc:
            return ChatResponse(
                message="The AI backend could not produce a valid response. Please try again.",
                error=f"LLM backend unavailable: {exc}",
            )

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
