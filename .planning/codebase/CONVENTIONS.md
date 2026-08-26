# Coding Conventions

**Analysis Date:** 2026-08-25

## Naming Patterns

**Files:**
- Lowercase snake_case: `massive_client.py`, `seed_prices.py`, `test_simulator_source.py`
- Test files prefixed `test_`: `test_cache.py`, `test_factory.py`
- One module per concern within `backend/app/market/`

**Functions:**
- snake_case: `create_market_data_source()`, `_generate_events()`, `_rebuild_cholesky()`
- Private helpers prefixed `_`: `_add_ticker_internal()`, `_poll_once()`, `_fetch_snapshots()`, `_run_loop()`

**Variables:**
- snake_case for locals and params: `price_cache`, `update_interval`, `event_probability`
- Instance attributes prefixed `_` (private): `self._prices`, `self._lock`, `self._version`, `self._task`, `self._sim`, `self._cholesky`

**Types/Classes:**
- PascalCase: `PriceUpdate`, `PriceCache`, `MarketDataSource`, `GBMSimulator`, `SimulatorDataSource`, `MassiveDataSource`
- Test classes `Test*` PascalCase: `TestPriceUpdate`, `TestPriceCache`, `TestFactory`, `TestGBMSimulator`, `TestSimulatorDataSource`, `TestMassiveDataSource`

**Constants:**
- UPPER_SNAKE_CASE module-level: `SEED_PRICES`, `TICKER_PARAMS`, `DEFAULT_PARAMS`, `CORRELATION_GROUPS`, `INTRA_TECH_CORR`, `TSLA_CORR`
- Class-level constants UPPER_SNAKE: `TRADING_SECONDS_PER_YEAR`, `DEFAULT_DT` (in `GBMSimulator`)

## Code Style

**Formatting:**
- Tool: `ruff format` (via `uv run ruff format .`)
- Line length: 100 chars (`[tool.ruff] line-length = 100`)
- Target Python: 3.12 (`target-version = "py312"`)
- Double quotes throughout (strings, docstrings)

**Linting:**
- Tool: `ruff check` (via `uv run ruff check .` or `uv run --extra dev ruff check app/ tests/`)
- Rule select: `["E", "F", "I", "N", "W"]`
- `E501` (line too long) ignored — delegated to the formatter
- `I` rule enforces isort import ordering (see Import Organization below)

**Type Hints:**
- Full type annotations on all public methods and most private ones
- Modern PEP 604 union syntax: `PriceUpdate | None`, `float | None`, `np.ndarray | None`
- Builtin generics: `dict[str, float]`, `list[str]`, `dict[str, PriceUpdate]`, `dict[str, dict[str, float]]`
- Return annotations always present: `-> None`, `-> PriceUpdate`, `-> dict[str, float]`

## Import Organization

**Order (enforced by ruff `I` rule — isort):**
1. `from __future__ import annotations` (always first, in every module)
2. Standard library (`import asyncio`, `import logging`, `import os`, `import time`, `from dataclasses import dataclass, field`)
3. Third-party (`import numpy as np`, `from fastapi import APIRouter, Request`, `from massive import RESTClient`)
4. Local/relative (`from .cache import PriceCache`, `from .models import PriceUpdate`)

**Import style:**
- Within the `app.market` package, modules import each other via relative imports: `from .models import PriceUpdate`, `from .interface import MarketDataSource`
- Tests import via absolute path from package root: `from app.market.cache import PriceCache`
- `from app.market import PriceCache, PriceUpdate, MarketDataSource, create_market_data_source` is the documented public entry point (re-exported in `backend/app/market/__init__.py` with an explicit `__all__`)

**Path Aliases:**
- No import path aliases configured (no `src/` layout; `app` is the import root, declared in `[tool.hatch.build.targets.wheel] packages = ["app"]`)

## Module & Docstring Conventions

**Every module opens with:**
1. A module docstring (`"""Thread-safe in-memory price cache."""`)
2. `from __future__ import annotations`
3. Imports

**Every class and public function/method has a docstring.** Examples:
- Class docstring explains purpose and lifecycle (`backend/app/market/interface.py`)
- Method docstrings describe behavior, return values, and edge cases (`backend/app/market/cache.py`)
- Math documented in `GBMSimulator` docstring with the GBM formula

**Docstring style is prose/narrative (not strict Google/NumPy),** with occasional inline parameter explanation. Inline `#` comments are used for non-obvious constants and rationale, e.g. `# ~0.1% chance per tick per ticker`.

## Error Handling

**Patterns:**
- **Background loops swallow exceptions** — never let a background task die:
  - `SimulatorDataSource._run_loop()` wraps `self._sim.step()` in `try/except Exception` with `logger.exception("Simulator step failed")` (`backend/app/market/simulator.py`)
  - `MassiveDataSource._poll_once()` catches `Exception` and `logger.error("Massive poll failed: %s", e)` without re-raising, so the loop retries next interval (`backend/app/market/massive_client.py`)
- **Per-item tolerance** — skip bad records rather than aborting the batch: `except (AttributeError, TypeError) as e: logger.warning(...)` when processing individual snapshots (`backend/app/market/massive_client.py`)
- **Cancellation handling** — `stop()` cancels the task and awaits it under `try/except asyncio.CancelledError: pass` (`simulator.py`, `massive_client.py`, `stream.py`)
- **Graceful degradations** — `PriceCache.get()` returns `None` for unknown tickers rather than raising; `change_percent` returns `0.0` when `previous_price == 0` (`backend/app/market/models.py`)
- **No custom exception classes** — the codebase relies on built-in exceptions and `None`/empty-return sentinels

## Logging

**Framework:** Python standard `logging` (no third-party logger)

**Patterns:**
- Module-level logger via `logger = logging.getLogger(__name__)` (in `factory.py`, `simulator.py`, `massive_client.py`, `stream.py`)
- Lazy `%`-style formatting in log calls: `logger.info("Simulator started with %d tickers", len(tickers))`
- Levels used purposefully:
  - `logger.info` — lifecycle events (start/stop/connect/disconnect)
  - `logger.warning` — skipped malformed records
  - `logger.error` — poll failures (non-fatal)
  - `logger.debug` — high-frequency events (random price shocks, per-poll counts)
  - `logger.exception` — unhandled exceptions inside background loops

## Comments

**When to Comment:**
- Explain non-obvious math/constants (GBM formula, `TRADING_SECONDS_PER_YEAR` derivation)
- Document why a thread/threading approach is chosen (`asyncio.to_thread` to avoid blocking the event loop)
- Inline `#` comments clarify subtle behavior (e.g., `# Disable nginx buffering if proxied`)

**JSDoc/TSDoc:** Not applicable (Python). Docstrings used instead (see Module & Docstring Conventions).

## Function Design

**Size:** Small and single-purpose; most methods under ~30 lines. The largest methods (`GBMSimulator.step()` at ~45 lines, `stream._generate_events()` at ~36 lines) are hot-path or generator code.

**Parameters:**
- Keyword-friendly construction for data sources: `SimulatorDataSource(price_cache=cache, update_interval=0.1)` — tests always pass `price_cache` by keyword
- Optional params default sensibly: `timestamp: float | None = None`, `update_interval: float = 0.5`, `poll_interval: float = 15.0`
- Keyword-only arguments not used; positional + defaults

**Return Values:**
- Prefer `X | None` over raising for lookups (`get()`, `get_price()`, `get_price()` on simulator)
- `dict`/`list` copies returned for snapshots (`get_all()` returns `dict(self._prices)`, `get_tickers()` returns `list(self._tickers)`) to avoid leaking mutable internals

## Module Design

**Exports:**
- Explicit `__all__` in the package `__init__.py` (`backend/app/market/__init__.py`) listing the public API
- Internal modules import via relative paths; the `__init__.py` is the curated public surface

**Barrel Files:**
- `backend/app/market/__init__.py` serves as the package barrel, re-exporting: `PriceUpdate`, `PriceCache`, `MarketDataSource`, `create_market_data_source`, `create_stream_router`

**Dependency-injection / factory pattern (recurring):**
- `create_market_data_source(price_cache)` selects `MassiveDataSource` vs `SimulatorDataSource` based on `MASSIVE_API_KEY` (`factory.py`)
- `create_stream_router(price_cache)` injects the cache without globals (`stream.py`)
- Prefer this factory-injection pattern over module-level singletons for new components

**Concurrency conventions:**
- Thread safety via `threading.Lock` in `PriceCache` (single lock guarding all state)
- Background work via `asyncio.create_task(..., name="...")` with named tasks (`simulator-loop`, `massive-poller`)
- Monotonic `version` counter for change detection (SSE) — reuse this pattern for any pub/sub change signaling

---

*Convention analysis: 2026-08-25*
