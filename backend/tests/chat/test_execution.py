"""Auto-execution battery for LLM-proposed trades and watchlist changes (CHAT-02, CHAT-03).

Every scenario calls process_message DIRECTLY (no HTTP) against a temp seeded
database, a MockMarketSource, and a controlled PriceCache, driving the proposal
through the same parse -> TradeRequest/execute_trade -> add_ticker/remove_ticker
pipeline as the endpoint by patching app.chat.service._mock_response.
"""

from __future__ import annotations

from app.chat.service import process_message
from app.db import get_connection, init_db
from app.market import PriceCache


class MockMarketSource:
    """Minimal MarketDataSource stand-in recording add/remove calls.

    Mirrors the real simulator's contract: add_ticker seeds the price cache
    so the ticker gains a price, remove_ticker clears it from the cache.
    (Copied verbatim from tests/watchlist/test_mutation.py.)
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


def _cash_balance(db_path: str) -> float:
    conn = get_connection(db_path)
    try:
        return float(
            conn.execute(
                "SELECT cash_balance FROM users_profile WHERE id = ?", ("default",)
            ).fetchone()["cash_balance"]
        )
    finally:
        conn.close()


def _position(db_path: str, ticker: str):
    """Return the position row for one ticker, or None."""
    conn = get_connection(db_path)
    try:
        return conn.execute(
            "SELECT quantity, avg_cost FROM positions WHERE ticker = ?", (ticker,)
        ).fetchone()
    finally:
        conn.close()


def _watchlist_row(db_path: str, ticker: str):
    conn = get_connection(db_path)
    try:
        return conn.execute("SELECT ticker FROM watchlist WHERE ticker = ?", (ticker,)).fetchone()
    finally:
        conn.close()


async def test_buy_executes(tmp_path, mock_llm_proposal):
    """A proposed buy runs through execute_trade: cash down, position + trade row written."""
    db_path = _make_db(tmp_path)
    cache = PriceCache()
    cache.update("AAPL", 190.0)
    source = MockMarketSource()

    mock_llm_proposal(
        {
            "message": "buy",
            "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 2}],
            "watchlist_changes": [],
        }
    )
    response = await process_message(db_path, cache, source, "buy")

    assert response.trades[0].status == "executed"
    assert _cash_balance(db_path) == 9620.0  # 10000 - 2 * 190.0
    pos = _position(db_path, "AAPL")
    assert pos is not None
    assert pos["quantity"] == 2.0

    conn = get_connection(db_path)
    try:
        trade_row = conn.execute("SELECT ticker, side, quantity FROM trades").fetchone()
    finally:
        conn.close()
    assert trade_row is not None
    assert trade_row["ticker"] == "AAPL"
    assert trade_row["side"] == "buy"
    assert trade_row["quantity"] == 2.0


async def test_sell_executes(tmp_path, mock_llm_proposal):
    """A proposed sell reduces the position, credits cash, and keeps avg_cost."""
    db_path = _make_db(tmp_path)
    cache = PriceCache()
    cache.update("AAPL", 190.0)
    source = MockMarketSource()

    # Establish a 2-share position through the real pipeline first.
    mock_llm_proposal(
        {
            "message": "buy",
            "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 2}],
            "watchlist_changes": [],
        }
    )
    await process_message(db_path, cache, source, "buy")

    mock_llm_proposal(
        {
            "message": "sell",
            "trades": [{"ticker": "AAPL", "side": "sell", "quantity": 1}],
            "watchlist_changes": [],
        }
    )
    response = await process_message(db_path, cache, source, "sell")

    assert response.trades[0].status == "executed"
    assert _cash_balance(db_path) == 9810.0  # 9620 + 1 * 190.0
    pos = _position(db_path, "AAPL")
    assert pos is not None
    assert pos["quantity"] == 1.0
    assert pos["avg_cost"] == 190.0  # avg_cost unchanged on a partial sell


async def test_insufficient_cash_keeps_batch_alive(tmp_path, mock_llm_proposal):
    """A failed trade is recorded per-action and the batch continues (spec §9)."""
    db_path = _make_db(tmp_path)
    cache = PriceCache()
    cache.update("AAPL", 190.0)
    cache.update("MSFT", 300.0)
    source = MockMarketSource()

    mock_llm_proposal(
        {
            "message": "diversify",
            "trades": [
                {"ticker": "AAPL", "side": "buy", "quantity": 1000},
                {"ticker": "MSFT", "side": "buy", "quantity": 1},
            ],
            "watchlist_changes": [],
        }
    )
    response = await process_message(db_path, cache, source, "diversify")

    assert response.trades[0].status == "failed"
    assert "Insufficient cash" in response.trades[0].error
    assert response.trades[1].status == "executed"
    assert _cash_balance(db_path) == 9700.0  # only the MSFT buy ran: 10000 - 300


async def test_insufficient_shares(tmp_path, mock_llm_proposal):
    """Selling shares that are not owned fails per-action with a readable error."""
    db_path = _make_db(tmp_path)
    cache = PriceCache()
    cache.update("AAPL", 190.0)
    source = MockMarketSource()

    mock_llm_proposal(
        {
            "message": "sell",
            "trades": [{"ticker": "AAPL", "side": "sell", "quantity": 5}],
            "watchlist_changes": [],
        }
    )
    response = await process_message(db_path, cache, source, "sell")

    assert response.trades[0].status == "failed"
    assert "Insufficient shares" in response.trades[0].error
    assert _cash_balance(db_path) == 10000.0  # untouched


async def test_unknown_ticker(tmp_path, mock_llm_proposal):
    """A ticker with no cache price fails per-action through execute_trade validation."""
    db_path = _make_db(tmp_path)
    cache = PriceCache()  # ZZZZ never primed
    source = MockMarketSource()

    mock_llm_proposal(
        {
            "message": "buy zzzz",
            "trades": [{"ticker": "ZZZZ", "side": "buy", "quantity": 1}],
            "watchlist_changes": [],
        }
    )
    response = await process_message(db_path, cache, source, "buy zzzz")

    assert response.trades[0].status == "failed"
    assert "No current price" in response.trades[0].error


async def test_watchlist_add_applies(tmp_path, mock_llm_proposal):
    """A proposed add applies through add_ticker: row + market source + price cache in sync."""
    db_path = _make_db(tmp_path)
    cache = PriceCache()
    source = MockMarketSource()

    mock_llm_proposal(
        {
            "message": "track pypl",
            "watchlist_changes": [{"ticker": "PYPL", "action": "add"}],
        }
    )
    response = await process_message(db_path, cache, source, "track pypl")

    assert response.watchlist_changes[0].status == "executed"
    assert _watchlist_row(db_path, "PYPL") is not None
    assert source.tracked == {"PYPL"}
    assert source.cache.get_price("PYPL") == 100.0


async def test_watchlist_remove_applies(tmp_path, mock_llm_proposal):
    """A proposed remove applies through remove_ticker: row gone, source + cache cleared."""
    db_path = _make_db(tmp_path)
    cache = PriceCache()
    source = MockMarketSource()

    # Add PYPL first through the real pipeline.
    mock_llm_proposal(
        {
            "message": "add pypl",
            "watchlist_changes": [{"ticker": "PYPL", "action": "add"}],
        }
    )
    await process_message(db_path, cache, source, "add pypl")

    mock_llm_proposal(
        {
            "message": "remove pypl",
            "watchlist_changes": [{"ticker": "PYPL", "action": "remove"}],
        }
    )
    response = await process_message(db_path, cache, source, "remove pypl")

    assert response.watchlist_changes[0].status == "executed"
    assert _watchlist_row(db_path, "PYPL") is None
    assert source.tracked == set()
    assert "PYPL" not in source.cache


async def test_duplicate_add(tmp_path, mock_llm_proposal):
    """Adding an already-watched ticker fails per-action; no duplicate row is written."""
    db_path = _make_db(tmp_path)
    cache = PriceCache()
    source = MockMarketSource()

    # AAPL is in the seeded default watchlist.
    mock_llm_proposal(
        {
            "message": "add aapl",
            "watchlist_changes": [{"ticker": "AAPL", "action": "add"}],
        }
    )
    response = await process_message(db_path, cache, source, "add aapl")

    assert response.watchlist_changes[0].status == "failed"
    assert response.watchlist_changes[0].error == "Ticker already on watchlist"
    assert source.tracked == set()  # market source untouched

    conn = get_connection(db_path)
    try:
        count = conn.execute(
            "SELECT COUNT(*) AS n FROM watchlist WHERE ticker = ?", ("AAPL",)
        ).fetchone()["n"]
    finally:
        conn.close()
    assert count == 1


async def test_remove_unknown(tmp_path, mock_llm_proposal):
    """Removing a ticker that is not watched fails per-action with a readable error."""
    db_path = _make_db(tmp_path)
    cache = PriceCache()
    source = MockMarketSource()

    mock_llm_proposal(
        {
            "message": "remove zzzz",
            "watchlist_changes": [{"ticker": "ZZZZ", "action": "remove"}],
        }
    )
    response = await process_message(db_path, cache, source, "remove zzzz")

    assert response.watchlist_changes[0].status == "failed"
    assert response.watchlist_changes[0].error == "Ticker not on watchlist"
    assert source.tracked == set()
