# Testing Patterns

**Analysis Date:** 2026-08-25

## Test Framework

**Runner:**
- pytest >= 8.3.0
- Config: `backend/pyproject.toml` `[tool.pytest.ini_options]`

**Async support:**
- pytest-asyncio >= 0.24.0 with `asyncio_mode = "auto"` (no explicit `@pytest.mark.asyncio` required on async functions — but the codebase still applies the marker at class level)
- `asyncio_default_fixture_loop_scope = "function"`

**Coverage:**
- pytest-cov >= 5.0.0

**Assertion Library:**
- Built-in `assert` (no separate assertion library)

**Run Commands:**
```bash
uv run pytest                                     # Run all tests
uv run --extra dev pytest -v                      # Verbose
uv run pytest --cov=app                           # Coverage (source = app)
uv run pytest --cov=app --cov-report=html         # HTML coverage report
uv run pytest tests/market/test_simulator.py      # Single file
```

**Test discovery config (`[tool.pytest.ini_options]`):**
```toml
testpaths = ["tests"]
python_files = ["test_*.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
asyncio_mode = "auto"
asyncio_default_fixture_loop_scope = "function"
```

## Test File Organization

**Location:**
- Separate `tests/` tree mirroring the `app/` package structure: `backend/tests/market/` ↔ `backend/app/market/`

**Naming:**
- Files: `test_<module>.py` (e.g. `test_cache.py` for `cache.py`, `test_models.py` for `models.py`)
- One test file per source module, EXCEPT data sources get two: `test_simulator.py` (unit, `GBMSimulator`) + `test_simulator_source.py` (integration, `SimulatorDataSource`)

**Structure:**
```
backend/tests/
├── __init__.py                 # "Tests for FinAlly backend."
├── conftest.py                 # shared fixtures
└── market/
    ├── __init__.py
    ├── test_models.py
    ├── test_cache.py
    ├── test_factory.py
    ├── test_simulator.py       # GBMSimulator unit tests
    ├── test_simulator_source.py # SimulatorDataSource integration tests
    └── test_massive.py         # MassiveDataSource (mocked API)
```

## Test Structure

**Suite Organization (class-based, one class per unit under test):**
```python
"""Tests for PriceUpdate dataclass."""

import pytest

from app.market.models import PriceUpdate


class TestPriceUpdate:
    """Unit tests for the PriceUpdate model."""

    def test_price_update_creation(self):
        """Test basic PriceUpdate creation."""
        update = PriceUpdate(
            ticker="AAPL", price=190.50, previous_price=190.00, timestamp=1234567890.0
        )
        assert update.ticker == "AAPL"
        assert update.price == 190.50
```

**Conventions:**
- Every test class has a docstring; every test method has a docstring starting with `Test ...`
- Test method names are descriptive sentences: `test_change_percent_zero_previous`, `test_remove_nonexistent_is_noop`, `test_empty_tickers_skips_poll`
- Each test constructs its own dependencies inline — no shared `PriceCache` fixture

**Async test pattern:**
```python
@pytest.mark.asyncio
class TestSimulatorDataSource:
    """Integration tests for the SimulatorDataSource."""

    async def test_start_populates_cache(self):
        cache = PriceCache()
        source = SimulatorDataSource(price_cache=cache, update_interval=0.1)
        await source.start(["AAPL", "GOOGL"])
        assert cache.get("AAPL") is not None
        await source.stop()
```

**Setup/Teardown:**
- Setup is inline per test (construct `PriceCache()` + data source)
- Teardown is explicit `await source.stop()` at the end of each async test (no `yield` fixtures, no `with` context managers for the source lifecycle)

## Mocking

**Framework:** `unittest.mock` (standard library) — `patch`, `patch.dict`, `patch.object`, `MagicMock`

**Environment variable patching (factory tests):**
```python
from unittest.mock import patch

with patch.dict(os.environ, {}, clear=True):
    source = create_market_data_source(cache)
```

**Method patching (data-source tests):**
```python
with patch.object(source, "_fetch_snapshots", return_value=mock_snapshots):
    await source._poll_once()

# Side-effect for error cases
with patch.object(source, "_fetch_snapshots", side_effect=Exception("network error")):
    await source._poll_once()  # Should not raise
```

**Class patching at import path (avoid real network):**
```python
with patch("app.market.massive_client.RESTClient"):
    await source.start(["AAPL"])
```

**Mock object factories:**
```python
def _make_snapshot(ticker: str, price: float, timestamp_ms: int) -> MagicMock:
    snap = MagicMock()
    snap.ticker = ticker
    snap.last_trade = MagicMock()
    snap.last_trade.price = price
    snap.last_trade.timestamp = timestamp_ms
    return snap
```

**What to Mock:**
- Network/API clients — always (`RESTClient`, `_fetch_snapshots`) so tests never hit real services
- Environment variables — via `patch.dict(os.environ, ..., clear=True)` for factory branching

**What NOT to Mock:**
- `PriceCache` — used as a real dependency (fast, deterministic, in-memory)
- `GBMSimulator` — tested directly with real numpy math
- `SimulatorDataSource` — run against a real (fast-interval) simulator, only the tick interval is shortened for test speed

## Fixtures and Factories

**Shared fixtures (`backend/tests/conftest.py`):**
```python
@pytest.fixture
def event_loop_policy():
    """Use the default event loop policy for all async tests."""
    import asyncio
    return asyncio.DefaultEventLoopPolicy()
```
- Only one shared fixture; everything else is constructed inline per test
- Test data is created directly in tests (e.g. `PriceUpdate(ticker="AAPL", price=190.50, ...)`) rather than via factory functions or fixture files

**Location:** No `fixtures/` directory; inline construction is the norm. For mock shapes, small module-level helpers like `_make_snapshot()` live at the top of the test file.

## Coverage

**Requirements:** No minimum threshold enforced (no `fail_under`). Coverage is opt-in via `--cov=app`.

**Coverage config (`[tool.coverage.run]` / `[tool.coverage.report]`):**
```toml
[tool.coverage.run]
source = ["app"]
omit = ["tests/*"]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "def __repr__",
    "raise AssertionError",
    "raise NotImplementedError",
    "if __name__ == .__main__.:",
    "if TYPE_CHECKING:",
]
```

**View Coverage:**
```bash
uv run pytest --cov=app --cov-report=html   # HTML report (htmlcov/)
uv run --extra dev pytest --cov=app         # terminal summary
```

## Test Types

**Unit Tests:**
- Pure logic: `test_models.py` (`PriceUpdate`), `test_cache.py` (`PriceCache`), `test_simulator.py` (`GBMSimulator`), `test_factory.py` (factory branching)
- Deterministic, no I/O, no real network

**Integration Tests:**
- `test_simulator_source.py` — `SimulatorDataSource` driving a real `GBMSimulator` + `PriceCache` with short update intervals (`0.05`–`0.1`s) and `asyncio.sleep()` waits to observe async behavior
- Asserts on observable side effects: `cache.version` increments, cache populated, tasks alive

**E2E Tests:**
- Not used. No FastAPI `TestClient` / httpx tests exist. The SSE endpoint (`stream.py`) has no direct tests — it is exercised only through `market_data_demo.py`.

## Common Patterns

**Async Testing (observe the background loop):**
```python
async def test_prices_update_over_time(self):
    cache = PriceCache()
    source = SimulatorDataSource(price_cache=cache, update_interval=0.05)
    await source.start(["AAPL"])

    initial_version = cache.version
    await asyncio.sleep(0.3)  # Several update cycles

    assert cache.version > initial_version
    await source.stop()
```

**Error/Exception Testing:**
```python
def test_immutability(self):
    update = PriceUpdate(ticker="AAPL", price=190.50, previous_price=190.00, timestamp=1234567890.0)
    with pytest.raises(AttributeError):
        update.price = 200.00  # Should raise error
```

**Resilience / no-crash testing:**
```python
async def test_api_error_does_not_crash(self):
    ...
    with patch.object(source, "_fetch_snapshots", side_effect=Exception("network error")):
        await source._poll_once()  # Should not raise
    assert cache.get_price("AAPL") is None  # No update happened
```

**Edge-case testing style:** named explicitly and asserted for "no-op" behavior:
- `test_add_duplicate_is_noop`, `test_remove_nonexistent_is_noop`, `test_empty_tickers_skips_poll`, `test_stop_is_idempotent`

---

*Testing analysis: 2026-08-25*
