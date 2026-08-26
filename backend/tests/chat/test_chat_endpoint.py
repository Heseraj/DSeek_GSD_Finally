"""HTTP tests for POST /api/chat (CHAT-01, CHAT-04, CHAT-05, error contract)."""

from __future__ import annotations

import json
import sqlite3

from litellm.exceptions import APIConnectionError

import app.chat.service as chat_service
from app.chat.schemas import ChatResponse


class TestChatEndpoint:
    """End-to-end chat over HTTP: mock LLM -> execute -> persist -> respond."""

    def test_chat_mock_happy_path_executes_trade_and_persists(self, client, mock_llm, tmp_path):
        """The tracer gate: a mock-mode turn returns the ChatResponse envelope,
        really executes the proposed AAPL buy (cash decreases, trade row written),
        and persists both chat_messages rows with JSON actions.
        """
        # Prime a deterministic fill price so the canned AAPL buy has a known cost.
        client.app.state.price_cache.update("AAPL", 190.0)

        resp = client.post("/api/chat", json={"message": "Buy Apple"})
        assert resp.status_code == 200
        body = resp.json()

        assert "[mock]" in body["message"]
        assert len(body["trades"]) == 1
        trade = body["trades"][0]
        assert trade["ticker"] == "AAPL"
        assert trade["side"] == "buy"
        assert trade["quantity"] == 1.0
        assert trade["status"] == "executed"
        assert body["watchlist_changes"] == []

        # Persistence: trade row written, cash decreased, exactly 2 chat rows.
        conn = sqlite3.connect(tmp_path / "finally.db")
        conn.row_factory = sqlite3.Row
        try:
            trade_row = conn.execute("SELECT ticker, side, quantity FROM trades").fetchone()
            profile = conn.execute(
                "SELECT cash_balance FROM users_profile WHERE id = ?", ("default",)
            ).fetchone()
            messages = conn.execute(
                "SELECT role, content, actions FROM chat_messages ORDER BY rowid"
            ).fetchall()
        finally:
            conn.close()

        assert trade_row is not None
        assert trade_row["ticker"] == "AAPL"
        assert trade_row["side"] == "buy"
        assert profile["cash_balance"] < 10000.0

        assert len(messages) == 2
        user_row, assistant_row = messages
        assert user_row["role"] == "user"
        assert user_row["content"] == "Buy Apple"
        assert user_row["actions"] is None
        assert assistant_row["role"] == "assistant"
        actions = json.loads(assistant_row["actions"])
        assert actions["trades"][0]["status"] == "executed"
        assert actions["trades"][0]["ticker"] == "AAPL"

    def test_no_key_returns_503_chat_response_shape(self, client, monkeypatch, tmp_path):
        """No key + mock off -> HTTP 503 with a valid ChatResponse body, nothing persisted."""
        monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
        monkeypatch.delenv("LLM_MOCK", raising=False)

        resp = client.post("/api/chat", json={"message": "hi"})
        assert resp.status_code == 503

        body = ChatResponse.model_validate(resp.json())
        assert body.message
        assert body.trades == []
        assert body.watchlist_changes == []
        assert body.error

        conn = sqlite3.connect(tmp_path / "finally.db")
        conn.row_factory = sqlite3.Row
        try:
            chat_rows = conn.execute("SELECT COUNT(*) AS n FROM chat_messages").fetchone()["n"]
            trade_rows = conn.execute("SELECT COUNT(*) AS n FROM trades").fetchone()["n"]
        finally:
            conn.close()
        assert chat_rows == 0
        assert trade_rows == 0

    def test_llm_backend_error_returns_503(self, client, monkeypatch, tmp_path):
        """A litellm backend failure -> 503 + error field; nothing executed or persisted."""

        async def boom(**kwargs):
            raise APIConnectionError("boom", "openrouter", "openrouter/openai/gpt-oss-120b")

        monkeypatch.setattr("litellm.acompletion", boom)
        monkeypatch.delenv("LLM_MOCK", raising=False)
        monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

        resp = client.post("/api/chat", json={"message": "hi"})
        assert resp.status_code == 503

        body = ChatResponse.model_validate(resp.json())
        assert body.message
        assert body.trades == []
        assert body.watchlist_changes == []
        assert body.error

        conn = sqlite3.connect(tmp_path / "finally.db")
        conn.row_factory = sqlite3.Row
        try:
            chat_rows = conn.execute("SELECT COUNT(*) AS n FROM chat_messages").fetchone()["n"]
            trade_rows = conn.execute("SELECT COUNT(*) AS n FROM trades").fetchone()["n"]
        finally:
            conn.close()
        assert chat_rows == 0
        assert trade_rows == 0

    def test_malformed_proposal_returns_503_and_executes_nothing(
        self, client, mock_llm_proposal, tmp_path
    ):
        """Schema-violating LLM output -> 503 with a valid ChatResponse, no side effects."""
        mock_llm_proposal({"message": "ok", "trades": "not-a-list", "watchlist_changes": []})

        resp = client.post("/api/chat", json={"message": "hi"})
        assert resp.status_code == 503

        body = ChatResponse.model_validate(resp.json())
        assert body.message
        assert body.trades == []
        assert body.watchlist_changes == []
        assert body.error

        conn = sqlite3.connect(tmp_path / "finally.db")
        conn.row_factory = sqlite3.Row
        try:
            chat_rows = conn.execute("SELECT COUNT(*) AS n FROM chat_messages").fetchone()["n"]
            trade_rows = conn.execute("SELECT COUNT(*) AS n FROM trades").fetchone()["n"]
        finally:
            conn.close()
        assert chat_rows == 0
        assert trade_rows == 0

    def test_history_persists_and_is_included_as_context(
        self, client, mock_llm, monkeypatch, tmp_path
    ):
        """CHAT-04: prior turns persist and reach the next request's LLM context."""
        # Prime a deterministic fill price so the canned AAPL buy executes.
        client.app.state.price_cache.update("AAPL", 190.0)

        first = client.post("/api/chat", json={"message": "hello"})
        assert first.status_code == 200

        conn = sqlite3.connect(tmp_path / "finally.db")
        conn.row_factory = sqlite3.Row
        try:
            messages = conn.execute(
                "SELECT role, content, actions FROM chat_messages ORDER BY rowid"
            ).fetchall()
        finally:
            conn.close()
        assert len(messages) == 2
        assert messages[1]["role"] == "assistant"
        assert json.loads(messages[1]["actions"])["trades"][0]["status"] == "executed"

        # Wrap the LLM call to capture the message list for the second turn.
        captured: list[list[dict]] = []
        real_fn = chat_service.generate_assistant_response

        async def recording(messages_arg):
            captured.append(messages_arg)
            return await real_fn(messages_arg)

        monkeypatch.setattr("app.chat.service.generate_assistant_response", recording)

        second = client.post("/api/chat", json={"message": "buy more"})
        assert second.status_code == 200

        conn = sqlite3.connect(tmp_path / "finally.db")
        conn.row_factory = sqlite3.Row
        try:
            messages = conn.execute(
                "SELECT role, content, actions FROM chat_messages ORDER BY rowid"
            ).fetchall()
        finally:
            conn.close()
        assert len(messages) == 4

        assert len(captured) == 1
        second_messages = captured[0]
        assert any(m["role"] == "user" and m["content"] == "hello" for m in second_messages)
        assert second_messages[-1] == {"role": "user", "content": "buy more"}

    def test_mock_deterministic_across_requests(self, client, mock_llm):
        """CHAT-05 at HTTP level: identical requests return byte-identical bodies."""
        client.app.state.price_cache.update("AAPL", 190.0)

        first = client.post("/api/chat", json={"message": "same message"})
        second = client.post("/api/chat", json={"message": "same message"})

        assert first.status_code == 200
        assert second.status_code == 200
        assert first.content == second.content
