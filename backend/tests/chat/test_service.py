"""Tests for the chat service schemas, prompts, and the live LLM branch."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from litellm.exceptions import APIConnectionError
from pydantic import ValidationError

from app.chat.prompts import SYSTEM_PROMPT, build_context
from app.chat.schemas import (
    ChatProposal,
    ChatRequest,
    ChatResponse,
    TradeAction,
    WatchlistChange,
)
from app.chat.service import _mock_response, generate_assistant_response, process_message
from app.db import get_connection, init_db
from app.market import PriceCache


class MockMarketSource:
    """Minimal MarketDataSource stand-in recording add/remove calls.

    Mirrors the real simulator's contract: add_ticker seeds the price cache so
    the ticker gains a price, remove_ticker clears it from the cache. (Copied
    from tests/watchlist/test_mutation.py via tests/chat/test_execution.py —
    the repo's established pattern for chat execution tests.)
    """

    def __init__(self) -> None:
        self.tracked: set[str] = set()
        self.cache = PriceCache()

    async def add_ticker(self, ticker: str) -> None:
        self.tracked.add(ticker)
        self.cache.update(ticker=ticker, price=100.0)

    async def remove_ticker(self, ticker: str) -> None:
        self.tracked.discard(ticker)
        self.cache.remove(ticker)

    def get_tickers(self) -> list[str]:
        return sorted(self.tracked)


def _make_db(tmp_path) -> str:
    """Create a fresh seeded database and return its path."""
    db_path = str(tmp_path / "test.db")
    init_db(db_path)
    return db_path


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


class TestLiveLiteLLMBranch:
    """The 02-03 live branch: acompletion kwargs, key pre-check, tolerant error mapping."""

    @staticmethod
    def _stub_response(content: str) -> SimpleNamespace:
        """Build the minimal acompletion return shape: .choices[0].message.content."""
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])

    async def test_live_branch_calls_acompletion_with_expected_kwargs(self, monkeypatch):
        """The live branch calls litellm.acompletion with spec §9 kwargs exactly."""
        recorded: dict = {}

        async def fake_acompletion(**kwargs):
            recorded.update(kwargs)
            return self._stub_response('{"message":"ok","trades":[],"watchlist_changes":[]}')

        monkeypatch.setattr("litellm.acompletion", fake_acompletion)
        monkeypatch.delenv("LLM_MOCK", raising=False)
        monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

        content = await generate_assistant_response([{"role": "user", "content": "hi"}])

        assert recorded["model"] == "openrouter/openai/gpt-oss-120b"
        assert recorded["messages"] == [{"role": "user", "content": "hi"}]
        assert recorded["response_format"]["type"] == "json_schema"
        assert "properties" in recorded["response_format"]["json_schema"]["schema"]
        assert recorded["extra_body"] == {
            "provider": {"order": ["cerebras"], "allow_fallbacks": False}
        }
        assert recorded["force_timeout"] == 60
        assert content == '{"message":"ok","trades":[],"watchlist_changes":[]}'

    async def test_no_key_returns_error_chat_response(self, tmp_path, monkeypatch):
        """Missing OPENROUTER_API_KEY with mock off yields an error ChatResponse and no LLM call."""
        monkeypatch.delenv("LLM_MOCK", raising=False)
        monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

        async def fail_if_called(**kwargs):
            raise AssertionError("litellm.acompletion must not be called when the key is missing")

        monkeypatch.setattr("litellm.acompletion", fail_if_called)

        db_path = _make_db(tmp_path)
        response = await process_message(db_path, PriceCache(), MockMarketSource(), "hi")

        assert response.error
        assert response.trades == []
        assert response.watchlist_changes == []

    async def test_llm_backend_error_returns_error_chat_response(self, tmp_path, monkeypatch):
        """A litellm backend failure maps to an error ChatResponse, never a raise."""
        monkeypatch.delenv("LLM_MOCK", raising=False)
        monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

        async def boom(**kwargs):
            raise APIConnectionError("boom", "openrouter", "openrouter/openai/gpt-oss-120b")

        monkeypatch.setattr("litellm.acompletion", boom)

        db_path = _make_db(tmp_path)
        response = await process_message(db_path, PriceCache(), MockMarketSource(), "hi")

        assert "unavailable" in response.error
        assert response.trades == []
        assert response.watchlist_changes == []

    async def test_malformed_output_is_tolerated(self, tmp_path, monkeypatch):
        """Schema-violating LLM output yields an error ChatResponse; nothing persists."""
        monkeypatch.setenv("LLM_MOCK", "true")
        monkeypatch.setattr(
            "app.chat.service._mock_response",
            lambda msg: {"message": "ok", "trades": "not-a-list", "watchlist_changes": []},
        )

        db_path = _make_db(tmp_path)
        response = await process_message(db_path, PriceCache(), MockMarketSource(), "hi")

        assert response.error
        assert response.trades == []
        assert response.watchlist_changes == []

        conn = get_connection(db_path)
        try:
            chat_rows = conn.execute("SELECT COUNT(*) AS n FROM chat_messages").fetchone()["n"]
            trade_rows = conn.execute("SELECT COUNT(*) AS n FROM trades").fetchone()["n"]
        finally:
            conn.close()
        assert chat_rows == 0
        assert trade_rows == 0

    async def test_supports_response_schema_false_uses_json_object(self, monkeypatch):
        """json_object is the fallback when the provider lacks response-schema support."""
        recorded: dict = {}

        async def fake_acompletion(**kwargs):
            recorded.update(kwargs)
            return self._stub_response('{"message":"ok"}')

        monkeypatch.setattr("litellm.supports_response_schema", lambda model: False)
        monkeypatch.setattr("litellm.acompletion", fake_acompletion)
        monkeypatch.delenv("LLM_MOCK", raising=False)
        monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

        await generate_assistant_response([{"role": "user", "content": "hi"}])

        assert recorded["response_format"] == {"type": "json_object"}

    async def test_mock_mode_returns_canned_dict(self, monkeypatch):
        """CHAT-05 determinism at unit level: mock returns the canned dict exactly."""
        monkeypatch.setenv("LLM_MOCK", "true")
        content = await generate_assistant_response([{"role": "user", "content": "Buy Apple"}])
        assert json.loads(content) == _mock_response("Buy Apple")

    async def test_mock_false_is_not_truthy_live_branch_runs(self, monkeypatch):
        """CR-01 regression: LLM_MOCK=false (the .env.example default) must NOT enable mock.

        With a key present, `LLM_MOCK=false` must reach the live branch
        (acompletion), never short-circuit to the canned mock response.
        """
        recorded: dict = {}

        async def fake_acompletion(**kwargs):
            recorded.update(kwargs)
            return self._stub_response('{"message":"ok"}')

        monkeypatch.setenv("LLM_MOCK", "false")
        monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
        monkeypatch.setattr("litellm.acompletion", fake_acompletion)

        content = await generate_assistant_response([{"role": "user", "content": "hi"}])

        assert recorded["model"] == "openrouter/openai/gpt-oss-120b"
        assert content == '{"message":"ok"}'

    async def test_mock_false_without_key_returns_error_not_mock(self, tmp_path, monkeypatch):
        """CR-01 regression: LLM_MOCK=false must not bypass the 503 key guard.

        The no-key path must return an error ChatResponse (HTTP 503 at the
        router), not a canned 200 mock response.
        """
        monkeypatch.setenv("LLM_MOCK", "false")
        monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

        async def fail_if_called(**kwargs):
            raise AssertionError("litellm.acompletion must not be called without a key")

        monkeypatch.setattr("litellm.acompletion", fail_if_called)

        db_path = _make_db(tmp_path)
        response = await process_message(db_path, PriceCache(), MockMarketSource(), "hi")

        assert response.error == "OPENROUTER_API_KEY is not set"
        assert response.message
        assert response.trades == []
        assert response.watchlist_changes == []

    async def test_rate_limit_error_maps_to_error_response_not_500(self, tmp_path, monkeypatch):
        """CR-02 regression: RateLimitError (an APIError subclass) must map to an error
        ChatResponse — the locked contract, never a raw 500."""
        from litellm.exceptions import RateLimitError

        monkeypatch.delenv("LLM_MOCK", raising=False)
        monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

        async def boom(**kwargs):
            raise RateLimitError("rate limited", "openrouter", "openrouter/openai/gpt-oss-120b")

        monkeypatch.setattr("litellm.acompletion", boom)

        db_path = _make_db(tmp_path)
        response = await process_message(db_path, PriceCache(), MockMarketSource(), "hi")

        assert response.error
        assert "unavailable" in response.error
        assert response.trades == []
        assert response.watchlist_changes == []

    async def test_unexpected_exception_in_one_trade_does_not_abort_batch(
        self, tmp_path, monkeypatch
    ):
        """CR-02 regression: a non-TradeError in one proposed trade marks it failed and the
        rest of the batch still executes — never a raw 500 and never a partial raise."""
        monkeypatch.setenv("LLM_MOCK", "true")
        monkeypatch.setattr(
            "app.chat.service._mock_response",
            lambda msg: {
                "message": "ok",
                "trades": [
                    {"ticker": "BROKEN", "side": "buy", "quantity": 1},
                    {"ticker": "AAPL", "side": "buy", "quantity": 1},
                ],
                "watchlist_changes": [],
            },
        )

        db_path = _make_db(tmp_path)
        cache = PriceCache()
        cache.update(ticker="AAPL", price=190.0)
        cache.update(ticker="BROKEN", price=50.0)

        import app.chat.service as service

        _real_execute_trade = service.execute_trade

        def exploding_execute_trade(conn, price_cache, trade):
            if trade.ticker == "BROKEN":
                raise RuntimeError("boom — unexpected non-TradeError")
            return _real_execute_trade(conn, price_cache, trade)

        monkeypatch.setattr("app.chat.service.execute_trade", exploding_execute_trade)

        response = await process_message(db_path, cache, MockMarketSource(), "hi")

        assert response.error is None
        assert len(response.trades) == 2
        assert response.trades[0].status == "failed"
        assert response.trades[0].error == "Trade failed: boom — unexpected non-TradeError"
        assert response.trades[1].status == "executed"
