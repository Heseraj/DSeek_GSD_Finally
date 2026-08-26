"""Portfolio valuation and trade execution service."""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone

from app.market import PriceCache


class TradeError(Exception):
    """Base class for trade validation failures."""


class UnknownTickerError(TradeError):
    """Raised when a trade references a ticker with no current price."""


class InsufficientCashError(TradeError):
    """Raised when a buy order costs more than the available cash."""


class InsufficientSharesError(TradeError):
    """Raised when a sell order exceeds the owned quantity."""


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


def execute_trade(conn: sqlite3.Connection, price_cache: PriceCache, trade) -> dict:
    """Execute a market order and return the updated portfolio.

    The full read-modify-write — cash update, position upsert, trade insert —
    runs inside a single SQLite transaction (`with conn:`), so any failure
    rolls the entire order back (threat T-02-02). The fill price is read from
    the price cache, never from the client.
    """
    ticker = trade.ticker
    price = price_cache.get_price(ticker)
    if price is None:
        raise UnknownTickerError(f"No current price for ticker {ticker}")

    with conn:
        profile = conn.execute(
            "SELECT cash_balance FROM users_profile WHERE id = ?", ("default",)
        ).fetchone()
        cash_balance = float(profile["cash_balance"]) if profile else 0.0

        position = conn.execute(
            "SELECT quantity, avg_cost FROM positions WHERE user_id = ? AND ticker = ?",
            ("default", ticker),
        ).fetchone()

        order_cost = round(price * trade.quantity, 2)
        now = datetime.now(timezone.utc).isoformat()

        if trade.side == "buy":
            if order_cost > cash_balance:
                raise InsufficientCashError(
                    f"Insufficient cash: order costs {order_cost:.2f} but cash is {cash_balance:.2f}"
                )

            new_cash = round(cash_balance - order_cost, 2)

            if position is None:
                conn.execute(
                    "INSERT INTO positions (id, user_id, ticker, quantity, avg_cost, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (str(uuid.uuid4()), "default", ticker, trade.quantity, price, now),
                )
            else:
                old_quantity = float(position["quantity"])
                old_avg_cost = float(position["avg_cost"])
                new_quantity = round(old_quantity + trade.quantity, 4)
                new_avg_cost = round(
                    (old_quantity * old_avg_cost + trade.quantity * price) / new_quantity, 4
                )
                conn.execute(
                    "UPDATE positions SET quantity = ?, avg_cost = ?, updated_at = ? "
                    "WHERE user_id = ? AND ticker = ?",
                    (new_quantity, new_avg_cost, now, "default", ticker),
                )
        else:
            owned_quantity = float(position["quantity"]) if position is not None else 0.0
            if position is None or trade.quantity - owned_quantity > 1e-9:
                raise InsufficientSharesError(
                    f"Insufficient shares: order is for {trade.quantity} but owned is "
                    f"{owned_quantity}"
                )

            new_cash = round(cash_balance + order_cost, 2)
            new_quantity = round(owned_quantity - trade.quantity, 4)

            if abs(new_quantity) < 1e-9:
                conn.execute(
                    "DELETE FROM positions WHERE user_id = ? AND ticker = ?",
                    ("default", ticker),
                )
            else:
                conn.execute(
                    "UPDATE positions SET quantity = ?, updated_at = ? "
                    "WHERE user_id = ? AND ticker = ?",
                    (new_quantity, now, "default", ticker),
                )

        conn.execute(
            "UPDATE users_profile SET cash_balance = ? WHERE id = ?",
            (new_cash, "default"),
        )

        conn.execute(
            "INSERT INTO trades (id, user_id, ticker, side, quantity, price, executed_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), "default", ticker, trade.side, trade.quantity, price, now),
        )

    return get_portfolio(conn, price_cache)
