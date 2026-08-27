"""Pydantic request/response schemas for the chat API."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator


class ChatRequest(BaseModel):
    """A user chat message; whitespace-only bodies are rejected (threat T-02-01)."""

    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class TradeAction(BaseModel):
    """A trade proposed by the LLM; validated like a manual TradeRequest."""

    model_config = ConfigDict(extra="forbid")

    ticker: str
    quantity: float = Field(gt=0, description="Number of shares; fractional shares supported")
    side: Literal["buy", "sell"]

    @field_validator("ticker")
    @classmethod
    def normalize_ticker(cls, value: str) -> str:
        """Uppercase and strip whitespace so ' aapl ' trades as 'AAPL'."""
        return value.strip().upper()


class WatchlistChange(BaseModel):
    """A watchlist change proposed by the LLM (threat T-02-01: ticker bounded to 12 chars)."""

    model_config = ConfigDict(extra="forbid")

    ticker: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=12)]
    action: Literal["add", "remove"]


class TradeActionResult(BaseModel):
    """The executed outcome of a proposed trade, as returned to the client."""

    ticker: str
    side: Literal["buy", "sell"]
    quantity: float
    status: Literal["executed", "failed"]
    error: str | None = None


class WatchlistChangeResult(BaseModel):
    """The executed outcome of a proposed watchlist change, as returned to the client."""

    ticker: str
    action: Literal["add", "remove"]
    status: Literal["executed", "failed"]
    error: str | None = None


class ChatProposal(BaseModel):
    """The LLM output envelope: status-less proposals parsed via model_validate_json."""

    model_config = ConfigDict(extra="forbid")

    message: str
    trades: list[TradeAction] = []
    watchlist_changes: list[WatchlistChange] = []


class ChatResponse(BaseModel):
    """The HTTP response envelope: proposals enriched into status-carrying results."""

    message: str
    trades: list[TradeActionResult] = []
    watchlist_changes: list[WatchlistChangeResult] = []
    error: str | None = None
