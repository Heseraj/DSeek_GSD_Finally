"""System prompt and context formatting for the FinAlly chat assistant."""

from __future__ import annotations

SYSTEM_PROMPT: str = """FinAlly, an AI trading assistant. You help users manage their simulated portfolio and watchlist.

Your responsibilities:
- Analyze the portfolio: composition, risk concentration, and unrealized P&L.
- Suggest trades with clear reasoning, and execute trades when the user asks or agrees.
- Manage the watchlist proactively (add or remove tickers when it helps the user).
- Be concise and data-driven; back every recommendation with numbers from the context.

You ALWAYS respond with valid JSON matching the envelope schema:
{"message": <str>, "trades": [{"ticker": <str>, "side": "buy"|"sell", "quantity": <float>}], "watchlist_changes": [{"ticker": <str>, "action": "add"|"remove"}]}
"""


def build_context(portfolio: dict, watchlist: dict) -> str:
    """Format portfolio and watchlist dicts into a compact text block for the LLM.

    Pure formatter with no DB or cache access: the caller passes the already-loaded
    dicts returned by get_portfolio() / get_watchlist().
    """
    lines = [
        f"Portfolio: cash_balance={portfolio.get('cash_balance', 0.0)}; "
        f"total_value={portfolio.get('total_value', 0.0)}; "
        f"unrealized_pnl={portfolio.get('unrealized_pnl', 0.0)}"
    ]
    for position in portfolio.get("positions", []):
        lines.append(
            f"POS {position.get('ticker')} qty={position.get('quantity')} "
            f"avg_cost={position.get('avg_cost')} price={position.get('current_price')} "
            f"pnl={position.get('unrealized_pnl')}"
        )
    tickers = [item.get("ticker") for item in watchlist.get("tickers", [])]
    lines.append(f"Watchlist: {', '.join(tickers)}")
    return "\n".join(lines)
