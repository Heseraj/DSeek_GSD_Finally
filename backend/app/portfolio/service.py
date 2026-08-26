"""Portfolio valuation service."""

from __future__ import annotations

import sqlite3

from app.market import PriceCache


def get_portfolio(conn: sqlite3.Connection, price_cache: PriceCache) -> dict:
    """Compute the portfolio snapshot from the database and live prices.

    Returns cash_balance, total_value, unrealized_pnl, and a positions list
    where each position carries ticker, quantity, avg_cost, current_price,
    market_value, unrealized_pnl, and unrealized_pnl_percent. A position with
    no cache price uses 0.0 as the current price and contributes zero value.
    """
    profile = conn.execute(
        "SELECT cash_balance FROM users_profile WHERE id = ?", ("default",)
    ).fetchone()
    cash_balance = float(profile["cash_balance"]) if profile else 0.0

    rows = conn.execute(
        "SELECT ticker, quantity, avg_cost FROM positions WHERE user_id = ? ORDER BY ticker",
        ("default",),
    ).fetchall()

    positions = []
    total_value = cash_balance
    total_unrealized_pnl = 0.0

    for row in rows:
        ticker = row["ticker"]
        quantity = float(row["quantity"])
        avg_cost = float(row["avg_cost"])
        current_price = price_cache.get_price(ticker) or 0.0

        market_value = round(quantity * current_price, 2)
        unrealized_pnl = round((current_price - avg_cost) * quantity, 2)
        unrealized_pnl_percent = (
            round((current_price - avg_cost) / avg_cost * 100, 4) if avg_cost else 0.0
        )

        positions.append(
            {
                "ticker": ticker,
                "quantity": quantity,
                "avg_cost": avg_cost,
                "current_price": current_price,
                "market_value": market_value,
                "unrealized_pnl": unrealized_pnl,
                "unrealized_pnl_percent": unrealized_pnl_percent,
            }
        )
        total_value = round(total_value + market_value, 2)
        total_unrealized_pnl = round(total_unrealized_pnl + unrealized_pnl, 2)

    return {
        "cash_balance": cash_balance,
        "positions": positions,
        "total_value": total_value,
        "unrealized_pnl": total_unrealized_pnl,
    }
