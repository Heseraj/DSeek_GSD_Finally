"""Pydantic request/response schemas for the portfolio API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class TradeRequest(BaseModel):
    """A market order to buy or sell shares at the current price."""

    ticker: str
    quantity: float = Field(gt=0, description="Number of shares; fractional shares supported")
    side: Literal["buy", "sell"]

    @field_validator("ticker")
    @classmethod
    def normalize_ticker(cls, value: str) -> str:
        """Uppercase and strip whitespace so ' aapl ' trades as 'AAPL'."""
        return value.strip().upper()


class PositionResponse(BaseModel):
    """A single portfolio position with live valuation."""

    ticker: str
    quantity: float
    avg_cost: float
    current_price: float
    market_value: float
    unrealized_pnl: float
    unrealized_pnl_percent: float


class PortfolioResponse(BaseModel):
    """The portfolio shape: cash, positions, total value, and unrealized P&L."""

    cash_balance: float
    positions: list[PositionResponse]
    total_value: float
    unrealized_pnl: float
