"""Tests for the chat service schemas and prompts."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.chat.prompts import SYSTEM_PROMPT, build_context
from app.chat.schemas import (
    ChatProposal,
    ChatRequest,
    ChatResponse,
    TradeAction,
    WatchlistChange,
)


class TestChatRequest:
    """Schema-level validation for POST /api/chat bodies."""

    def test_strips_whitespace_and_keeps_non_empty_message(self):
        req = ChatRequest(message="  buy AAPL  ")
        assert req.message == "buy AAPL"

    def test_rejects_whitespace_only_message(self):
        with pytest.raises(ValidationError):
            ChatRequest(message="   ")

    def test_rejects_empty_message(self):
        with pytest.raises(ValidationError):
            ChatRequest(message="")


class TestTradeAction:
    """Validation of LLM-proposed trades (reuses TradeRequest constraints)."""

    def test_normalizes_ticker_to_uppercase_stripped(self):
        action = TradeAction(ticker=" aapl ", side="buy", quantity=1)
        assert action.ticker == "AAPL"

    def test_rejects_non_positive_quantity(self):
        with pytest.raises(ValidationError):
            TradeAction(ticker="AAPL", side="buy", quantity=0)
        with pytest.raises(ValidationError):
            TradeAction(ticker="AAPL", side="buy", quantity=-1)

    def test_rejects_unknown_side(self):
        with pytest.raises(ValidationError):
            TradeAction(ticker="AAPL", side="hold", quantity=1)


class TestWatchlistChange:
    """Validation of LLM-proposed watchlist changes."""

    def test_parses_valid_add(self):
        change = WatchlistChange(ticker="PYPL", action="add")
        assert change.ticker == "PYPL"
        assert change.action == "add"

    def test_rejects_ticker_longer_than_12_chars(self):
        with pytest.raises(ValidationError):
            WatchlistChange(ticker="TOOLONGSYMBOL", action="add")

    def test_rejects_unknown_action(self):
        with pytest.raises(ValidationError):
            WatchlistChange(ticker="AAPL", action="delete")


class TestChatProposalParse:
    """Parsing of the LLM's structured JSON output envelope."""

    def test_parses_valid_json_with_trades(self):
        proposal = ChatProposal.model_validate_json(
            '{"message":"hi","trades":[{"ticker":"AAPL","side":"buy","quantity":1}],"watchlist_changes":[]}'
        )
        assert proposal.message == "hi"
        assert proposal.trades[0].ticker == "AAPL"

    def test_missing_trades_key_defaults_to_empty_list(self):
        proposal = ChatProposal.model_validate_json('{"message":"hi"}')
        assert proposal.trades == []
        assert proposal.watchlist_changes == []

    def test_rejects_missing_message(self):
        with pytest.raises(ValidationError):
            ChatProposal.model_validate_json('{"trades":[]}')


class TestChatResponseShape:
    """The HTTP response envelope, including the no-key 503-shaped body."""

    def test_validates_no_key_envelope(self):
        resp = ChatResponse.model_validate_json(
            '{"message":"LLM backend unavailable","trades":[],"watchlist_changes":[],'
            '"error":"OPENROUTER_API_KEY is not set"}'
        )
        assert resp.error == "OPENROUTER_API_KEY is not set"
        assert resp.trades == []
        assert resp.watchlist_changes == []

    def test_defaults_to_empty_arrays_and_none_error(self):
        resp = ChatResponse(message="ok")
        assert resp.trades == []
        assert resp.watchlist_changes == []
        assert resp.error is None

    def test_validates_executed_trade_result(self):
        resp = ChatResponse.model_validate_json(
            '{"message":"ok","trades":[{"ticker":"AAPL","side":"buy","quantity":1,'
            '"status":"executed"}]}'
        )
        assert resp.trades[0].status == "executed"


class TestSystemPrompt:
    """The chat system prompt contract."""

    def test_starts_with_finally_identity(self):
        assert SYSTEM_PROMPT.startswith("FinAlly, an AI trading assistant")


class TestBuildContext:
    """The pure portfolio/watchlist context formatter."""

    def test_formats_portfolio_and_watchlist(self):
        context = build_context(
            {
                "cash_balance": 9620.0,
                "total_value": 10000.0,
                "positions": [{"ticker": "AAPL", "quantity": 2.0, "avg_cost": 190.0}],
            },
            {"tickers": [{"ticker": "AAPL"}, {"ticker": "GOOGL"}]},
        )
        assert "AAPL" in context
        assert "9620.0" in context
        assert "Watchlist" in context

    def test_empty_inputs_return_non_empty_string(self):
        context = build_context({}, {})
        assert isinstance(context, str)
        assert context != ""
