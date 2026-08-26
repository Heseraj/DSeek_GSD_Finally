"""HTTP tests for POST /api/chat (CHAT-01, CHAT-04, CHAT-05)."""

from __future__ import annotations

import json
import sqlite3


class TestChatEndpoint:
    """End-to-end chat over HTTP: mock LLM -> execute -> persist -> respond."""

    def test_chat_mock_happy_path_executes_trade_and_persists(
        self, client, mock_llm, tmp_path
    ):
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
            trade_row = conn.execute(
                "SELECT ticker, side, quantity FROM trades"
            ).fetchone()
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
