"""Pydantic request/response schemas for the watchlist API."""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, field_validator

# Ticker symbols are bounded to 12 chars and non-empty after stripping so a
# whitespace-only body is rejected by pydantic (threat T-03-01: tampering
# through POST /api/watchlist input).
TickerStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=12)]


class WatchlistAddRequest(BaseModel):
    """A request to add a ticker to the watchlist."""

    ticker: TickerStr = Field(description="Ticker symbol; normalized to uppercase, max 12 chars")

    @field_validator("ticker")
    @classmethod
    def normalize_ticker(cls, value: str) -> str:
        """Uppercase the ticker so 'aapl' adds as 'AAPL'."""
        return value.upper()
