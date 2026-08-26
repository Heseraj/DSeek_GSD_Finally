<!-- refreshed: 2026-08-25 -->
# Architecture

**Analysis Date:** 2026-08-25

## System Overview

The repository currently contains a **backend-only** FastAPI/uv project (`backend/`) whose sole implemented subsystem is the **market data layer**. The frontend (Next.js static export), portfolio/trading logic, watchlist persistence, LLM chat, and SQLite database are all **planned but not yet implemented** — they exist only as a contract in `planning/PLAN.md`. The market data subsystem is complete, tested (73 tests, 84% coverage per `planning/MARKET_DATA_SUMMARY.md`), and designed to be wired into the eventual FastAPI app.

```text
┌────────────────────────────────────────────────────────────────────┐
│                    Market Data Subsystem                            │
│                       backend/app/market/                            │
├──────────────┬──────────────┬──────────────────────────────────────┤
│ SimulatorDataSource │ MassiveDataSource │   MarketDataSource (ABC)   │
│ `simulator.py`      │ `massive_client.py`│   `interface.py`           │
│  (GBM + Cholesky)   │  (Polygon.io poller)│                            │
└────────┬─────────────┴────────┬─────────────┴───────────┬────────────┘
         │       produced by `create_market_data_source`  │
         │               `factory.py`                      │
         ▼                                                  │
┌─────────────────────────────────────────────────────────────┐
│                 PriceCache (single point of truth)           │
│                 `cache.py` — thread-safe, versioned          │
└──────────────┬───────────────────────────────────────────────┘
               │
     ┌─────────┴──────────┬───────────────────┐
     ▼                    ▼                   ▼
 SSE endpoint       Portfolio valuation    Trade execution
 `stream.py`        (planned — not built)  (planned — not built)
 GET /api/stream/prices
```

**Current reality:** Only the left-hand producer→cache→SSE path is implemented. The `MarketDataSource` ABC has two concrete implementations selected by a factory; the `PriceCache` is the shared, source-agnostic store that SSE (and future consumers) read from.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `PriceUpdate` | Immutable price snapshot dataclass (`ticker`, `price`, `previous_price`, `timestamp`, computed `change`, `change_percent`, `direction`, `to_dict()`) | `backend/app/market/models.py` |
| `PriceCache` | Thread-safe in-memory store of latest price per ticker; monotonic `version` counter for SSE change detection | `backend/app/market/cache.py` |
| `MarketDataSource` | Abstract contract for data providers (`start/stop/add_ticker/remove_ticker/get_tickers`) | `backend/app/market/interface.py` |
| `GBMSimulator` | Pure GBM math engine: correlated price steps, random shock events, Cholesky correlation matrix | `backend/app/market/simulator.py` |
| `SimulatorDataSource` | `MarketDataSource` adapter running a background asyncio loop that writes `GBMSimulator.step()` results to the cache | `backend/app/market/simulator.py` |
| `MassiveDataSource` | `MarketDataSource` adapter polling the Polygon.io REST API (via `massive` package) and writing to the cache | `backend/app/market/massive_client.py` |
| `create_market_data_source` | Factory selecting `SimulatorDataSource` vs `MassiveDataSource` from `MASSIVE_API_KEY` | `backend/app/market/factory.py` |
| `create_stream_router` | Factory returning a FastAPI `APIRouter` with the SSE endpoint wired to a `PriceCache` | `backend/app/market/stream.py` |
| `seed_prices.py` | Seed prices, per-ticker GBM params (drift/volatility), and correlation constants | `backend/app/market/seed_prices.py` |
| `market_data_demo.py` | Rich terminal dashboard demonstrating the simulator end-to-end | `backend/market_data_demo.py` |

## Pattern Overview

**Overall:** Strategy pattern + Factory pattern + shared-state mediator.

**Key Characteristics:**
- **Strategy pattern** — `MarketDataSource` (ABC) has two interchangeable implementations (`SimulatorDataSource`, `MassiveDataSource`). Downstream code depends only on the abstract interface, never on a concrete source.
- **Factory pattern** — `create_market_data_source(cache)` in `backend/app/market/factory.py` decides which strategy to instantiate based on `MASSIVE_API_KEY`. `create_stream_router(cache)` is a second factory that injects the `PriceCache` into the SSE route without globals.
- **Single point of truth** — producers write to `PriceCache`; all consumers (SSE, and future portfolio/trade code) read from it. No consumer reads directly from a data source.
- **Version-counter change detection** — `PriceCache.version` increments on every `update()`; the SSE generator emits only when the version changes, avoiding redundant pushes.
- **Inversion of control via constructor injection** — data sources and the router receive their `PriceCache` as a constructor argument rather than importing a singleton.

## Layers

**Interface layer (`backend/app/market/interface.py`):**
- Purpose: Define the `MarketDataSource` abstract contract that all providers implement.
- Location: `backend/app/market/interface.py`
- Contains: `MarketDataSource` ABC with abstract async methods `start`, `stop`, `add_ticker`, `remove_ticker`, `get_tickers`.
- Depends on: nothing (stdlib `abc` only).
- Used by: `simulator.py`, `massive_client.py`, `factory.py`.

**Model layer (`backend/app/market/models.py`):**
- Purpose: Define the `PriceUpdate` value object and its derived metrics.
- Location: `backend/app/market/models.py`
- Contains: `PriceUpdate` frozen/slotted dataclass with `change`, `change_percent`, `direction` properties and `to_dict()`.
- Depends on: stdlib `dataclasses`, `time`.
- Used by: `cache.py` (creates instances), `stream.py` (serialization), consumers.

**Store layer (`backend/app/market/cache.py`):**
- Purpose: Thread-safe in-memory price store and change-detection counter.
- Location: `backend/app/market/cache.py`
- Contains: `PriceCache` with `update`, `get`, `get_all`, `get_price`, `remove`, `version`, `__len__`, `__contains__`.
- Depends on: `models.py` (imports `PriceUpdate`).
- Used by: `simulator.py`, `massive_client.py` (writers); `stream.py`, `market_data_demo.py` (readers).

**Source implementation layer (`backend/app/market/simulator.py`, `backend/app/market/massive_client.py`):**
- Purpose: Concrete `MarketDataSource` strategies. Each owns a background `asyncio.Task` and pushes results into the cache.
- Location: `backend/app/market/simulator.py`, `backend/app/market/massive_client.py`
- Contains: `GBMSimulator` + `SimulatorDataSource`; `MassiveDataSource`.
- Depends on: `interface.py`, `cache.py`, `seed_prices.py` (simulator only), `massive` package (client only).
- Used by: `factory.py` (instantiation), `market_data_demo.py` (direct use).

**Factory layer (`backend/app/market/factory.py`):**
- Purpose: Environment-driven selection of the data source strategy.
- Location: `backend/app/market/factory.py`
- Contains: `create_market_data_source(price_cache)`.
- Depends on: `interface.py`, `simulator.py`, `massive_client.py`, `cache.py`.
- Used by: application startup (planned; currently exercised via `tests/market/test_factory.py`).

**Transport layer (`backend/app/market/stream.py`):**
- Purpose: Expose live prices over SSE.
- Location: `backend/app/market/stream.py`
- Contains: `create_stream_router(price_cache)` factory and `_generate_events` async generator.
- Depends on: `fastapi`, `cache.py`.
- Used by: the FastAPI app (planned; currently unused at runtime).

**Config/data layer (`backend/app/market/seed_prices.py`):**
- Purpose: Static seed prices and per-ticker simulation parameters.
- Location: `backend/app/market/seed_prices.py`
- Contains: `SEED_PRICES`, `TICKER_PARAMS`, `DEFAULT_PARAMS`, `CORRELATION_GROUPS`, and correlation constants (`INTRA_TECH_CORR`, `INTRA_FINANCE_CORR`, `CROSS_GROUP_CORR`, `TSLA_CORR`).
- Depends on: nothing.
- Used by: `simulator.py`, `market_data_demo.py`.

## Data Flow

### Primary Request Path (simulator → cache → SSE)

1. **Source selection** — `create_market_data_source(cache)` reads `os.environ["MASSIVE_API_KEY"]`; empty/whitespace → `SimulatorDataSource` (`backend/app/market/factory.py:24-31`).
2. **Startup & seed** — `await source.start(tickers)` constructs the `GBMSimulator`, immediately seeds each ticker's seed price into the cache (so SSE has data on connect), then spawns the background loop task (`backend/app/market/simulator.py:219-230`).
3. **Tick loop** — `_run_loop()` calls `GBMSimulator.step()` every `update_interval` (default 0.5s), which advances each ticker via GBM with Cholesky-correlated noise and optionally applies a random shock event, then writes each `{ticker: price}` into the cache (`backend/app/market/simulator.py:260-270`, `74-118`).
4. **Cache write** — `PriceCache.update()` computes `previous_price` from the prior value, builds a `PriceUpdate`, stores it, and increments `version` (`backend/app/market/cache.py:23-42`).
5. **SSE emission** — `_generate_events()` loops, polls `price_cache.version`, and on change serializes `get_all()` → `{ticker: update.to_dict()}` as a single JSON `data:` event, then sleeps 0.5s (`backend/app/market/stream.py:51-87`).

### Massive API Path (alternate producer)

1. Same factory, but `MASSIVE_API_KEY` set → `MassiveDataSource(api_key, price_cache)` (`backend/app/market/factory.py:26-28`).
2. `start()` constructs the synchronous `RESTClient`, performs an immediate first poll, then spawns `_poll_loop` (`backend/app/market/massive_client.py:41-53`).
3. `_poll_loop` sleeps `poll_interval` (default 15s) then calls `_poll_once` (`backend/app/market/massive_client.py:83-87`).
4. `_poll_once` runs the blocking `_fetch_snapshots()` in a worker thread via `asyncio.to_thread` to avoid blocking the event loop, then converts each snapshot (`last_trade.price`, ms→s timestamp) into a `PriceCache.update()` call (`backend/app/market/massive_client.py:89-121`).
5. Downstream cache→SSE path is identical to the simulator path — consumers are source-agnostic.

### Watchlist Mutation Path

- `source.add_ticker(ticker)` — simulator rebuilds the correlation matrix and seeds the cache immediately; Massive appends to its ticker list (price appears on next poll) (`backend/app/market/simulator.py:242-249`, `massive_client.py:66-70`).
- `source.remove_ticker(ticker)` — both remove the ticker from tracking AND from the `PriceCache` (`backend/app/market/simulator.py:251-255`, `massive_client.py:72-76`).

**State Management:**
- All live price state lives in a single `PriceCache` instance (in-memory). No persistence yet — the SQLite database (`db/finally.db`) is planned but not implemented.
- `PriceCache` uses a `threading.Lock` to guard the internal dict and `version` counter.
- Change detection is version-based, not diff-based — consumers compare `cache.version` to a remembered value.

## Key Abstractions

**`MarketDataSource` (Strategy contract):**
- Purpose: The interface every price provider implements, decoupling the cache/SSE from any concrete source.
- Examples: `backend/app/market/simulator.py:200` (`SimulatorDataSource`), `backend/app/market/massive_client.py:17` (`MassiveDataSource`).
- Pattern: Abstract base class with an explicit async lifecycle (`start` → `add_ticker`/`remove_ticker` → `stop`).

**`PriceCache` (shared store / mediator):**
- Purpose: The single source of truth that decouples producers from consumers.
- Examples: instantiated at `backend/app/market/cache.py:11`; injected into sources via `factory.py` and into the router via `stream.py`.
- Pattern: Guarded dict + monotonic version counter; exposes read (`get`, `get_all`, `get_price`) and write (`update`, `remove`) operations.

**`GBMSimulator` (domain engine, separated from I/O):**
- Purpose: Pure price-math engine, isolated from the async/IO concerns of `SimulatorDataSource` for testability.
- Examples: `backend/app/market/simulator.py:28`; exercised directly by `backend/tests/market/test_simulator.py`.
- Pattern: Stateful math object with `step()`, `add_ticker()`, `remove_ticker()`, `get_tickers()` — no cache/IO dependencies.

## Entry Points

**Terminal demo:**
- Location: `backend/market_data_demo.py`
- Triggers: `uv run market_data_demo.py` (guarded by `if __name__ == "__main__": asyncio.run(run())`, line 271-272)
- Responsibilities: Instantiates `PriceCache` + `SimulatorDataSource`, runs a Rich live dashboard for 60s, prints a session summary.

**Test suite:**
- Location: `backend/tests/` (discovered via `pyproject.toml` `testpaths = ["tests"]`)
- Triggers: `uv run --extra dev pytest -v`

**FastAPI application entry point:**
- **Not yet implemented.** No `backend/main.py` or `backend/app/main.py` exists. The `create_stream_router` and `create_market_data_source` factories are designed to be wired into a future FastAPI app (per `planning/PLAN.md` §3, §8). The eventual startup flow will: create a `PriceCache`, create the source, `await source.start(DEFAULT_TICKERS)`, mount `create_stream_router(cache)`, and add lifespan shutdown to `await source.stop()`.

## Architectural Constraints

- **Threading:** Concurrency is asyncio-first (source loops + SSE generator run as `asyncio.Task`s on the event loop). `PriceCache` is additionally guarded by a `threading.Lock` because `MassiveDataSource` runs its blocking HTTP call in a worker thread via `asyncio.to_thread` (`backend/app/market/massive_client.py:97`). The GBM hot path (`GBMSimulator.step()`) is synchronous and must remain fast.
- **Global state:** One module-level `router = APIRouter(prefix="/api/stream", tags=["streaming"])` in `backend/app/market/stream.py:17` — the single shared router instance. Per-module `logging.getLogger(__name__)` loggers. No global `PriceCache`; instances are injected.
- **Circular imports:** None detected. Dependency direction is strictly one-way: `models ← cache/interface ← simulator/massive_client ← factory`, and `stream ← cache`. `seed_prices` is a leaf.
- **Single producer assumption:** `PriceCache` docstring states "Writers: SimulatorDataSource or MassiveDataSource (one at a time)" — the design assumes exactly one active data source per process, selected at startup.
- **`start()` called once:** `MarketDataSource.start()` documents that calling it twice is undefined behavior (`backend/app/market/interface.py:30`).

## Anti-Patterns

### Module-global router + factory re-decoration

**What happens:** `stream.py` declares a module-level `router` (`backend/app/market/stream.py:17`), then `create_stream_router()` registers the `GET /prices` route onto that same shared router via a closure (`stream.py:26-46`).
**Why it's wrong:** The injected `price_cache` is captured by the inner route function, but the router itself is a shared singleton. Calling `create_stream_router()` twice (e.g., in tests with different caches) would register duplicate routes on the same global router, and only the last-registered route would win for a given path — a latent trap.
**Do this instead:** Prefer constructing a fresh `APIRouter` inside `create_stream_router()` (e.g., `router = APIRouter(prefix="/api/stream", tags=["streaming"])`) so each factory call returns an isolated router, matching the clean injection pattern already used by `create_market_data_source` in `factory.py`. If a module-level router is retained, document the single-instantiation contract explicitly.

### Broad exception swallowing in background loops

**What happens:** `_run_loop` (`simulator.py:262-269`) and `_poll_once` (`massive_client.py:118-121`) wrap their work in bare `except Exception` and continue, with no backoff.
**Why it's wrong:** A persistent failure (e.g., a permanently bad Massive API key) causes silent, tight retry loops at full cadence with only log output — no signal to the app or the user, and potential log spam.
**Do this instead:** Keep the resilience (never crash the loop) but add: (a) a bounded retry/backoff on `MassiveDataSource` poll failures, and (b) surface a health/status flag or structured log so the app can report "market data degraded" rather than failing silently. The `_poll_once` per-snapshot `except (AttributeError, TypeError)` is appropriately narrow and should remain.

### Untyped return in the blocking client boundary

**What happens:** `MassiveDataSource._fetch_snapshots()` returns `list` (`massive_client.py:123`) with no element type.
**Why it's wrong:** This is the seam between the sync REST client and the async layer; the untyped `list` means downstream attribute access (`snap.last_trade.price`) is unchecked and relies on the broad `except` in `_poll_once`.
**Do this instead:** Type the return (e.g., the `massive` snapshot type, or a `Sequence[Snapshot]` protocol) so the loop is statically checked and the `AttributeError` guard becomes a last-resort net rather than the primary type boundary.

## Error Handling

**Strategy:** Fail-isolated background loops — producers never propagate exceptions; they log and continue.

**Patterns:**
- Simulator loop: bare `except Exception` → `logger.exception("Simulator step failed")`, then sleeps and retries (`backend/app/market/simulator.py:262-270`).
- Massive poll loop: bare `except Exception` → `logger.error("Massive poll failed: %s", e)` and retries on the next interval; never re-raises (`backend/app/market/massive_client.py:118-121`). Commented expected failures: 401 (bad key), 429 (rate limit), network errors.
- Per-snapshot guard: `except (AttributeError, TypeError)` skips malformed snapshots and logs a warning with the ticker (`backend/app/market/massive_client.py:110-115`).
- Task shutdown: `stop()` cancels the task and swallows `asyncio.CancelledError` (`simulator.py:232-240`, `massive_client.py:55-64`).
- SSE: explicit `asyncio.CancelledError` handling for clean stream teardown (`stream.py:86-87`); client disconnect detected via `request.is_disconnected()`.

## Cross-Cutting Concerns

**Logging:** Standard `logging.getLogger(__name__)` per module, with `logger.info` for lifecycle events (start/stop/add/remove, client connect/disconnect) and `logger.debug` for per-tick detail (e.g., random events, per-poll counts). No structured logging or log aggregation yet.

**Validation:** Minimal at present — `MassiveDataSource` normalizes tickers with `.upper().strip()` on add/remove (`massive_client.py:67,73`); the simulator does not normalize. Planned trade/order validation (sufficient cash/shares) is not implemented.

**Authentication:** None — single-user model with a hardcoded `"default"` user id in the planned schema (`planning/PLAN.md` §7). API keys (`MASSIVE_API_KEY`, `OPENROUTER_API_KEY`) are read from environment only.

---

*Architecture analysis: 2026-08-25*
