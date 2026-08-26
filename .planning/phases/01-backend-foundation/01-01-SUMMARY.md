---
phase: 01-backend-foundation
plan: 01
subsystem: api
tags: [fastapi, sqlite, sse, uvicorn, pytest, uv]
requires:
  - phase: 00-market-data
    provides: PriceCache, MarketDataSource, create_market_data_source, create_stream_router, SEED_PRICES
provides:
  - SQLite persistence layer (six-table schema, lazy init + $10k/10-ticker seed) via app/db
  - Bootable FastAPI entry point (main.py) with lifespan wiring of market source + cache + SSE
  - GET /api/health, GET /api/portfolio, GET /api/watchlist read endpoints
  - SSE router fixed to return isolated APIRouter instances (no duplicate-route trap)
affects: [phase-2-chat, phase-3-frontend, phase-4-deployment]
actuals:
  tokens: 7341
  tasks: 3
  commits: 6
tech-stack:
  added: [httpx (dev-only, pinned <0.28), Python 3.12 pin via .python-version]
  patterns:
    - "app.state dependency injection: routers read db_path + price_cache from request.app.state, never module-level singletons"
    - "db package as single persistence seam: init_db(path) + get_connection(path) exported from app/db"
    - "lazy SQLite init: schema + seed only when profile absent"
key-files:
  created:
    - backend/app/db/database.py
    - backend/app/db/__init__.py
    - backend/app/main.py
    - backend/app/portfolio/service.py
    - backend/app/portfolio/router.py
    - backend/app/portfolio/__init__.py
    - backend/app/watchlist/service.py
    - backend/app/watchlist/router.py
    - backend/app/watchlist/__init__.py
    - backend/tests/test_app.py
    - backend/tests/portfolio/test_portfolio.py
    - backend/tests/watchlist/test_watchlist.py
  modified:
    - backend/app/market/stream.py
    - backend/app/main.py
    - backend/pyproject.toml
    - backend/uv.lock
    - backend/.python-version
key-decisions:
  - "PriceCache constructed at module level in main.py so create_stream_router can mount at import time (standard FastAPI pattern); lifespan creates the source and seeds the DB — single-cache invariant preserved"
  - "get_connection() accepts an optional path param (default DEFAULT_DB_PATH) so routers open the same file init_db used — the plan's single persistence seam"
  - "Watchlist order: ORDER BY added_at, rowid — seed rows share one timestamp, rowid preserves true insertion order"
  - "SSE smoke test uses real uvicorn + httpx network transport: httpx ASGITransport buffers full response bodies, so TestClient can never consume an infinite SSE stream"
patterns-established:
  - "Factory-created APIRouter per call (create_stream_router builds a fresh router each invocation)"
  - "Service functions take (conn, price_cache) and stay transport-agnostic; routers adapt app.state to services"
  - "Money rounded to 2dp, percentages to 4dp (mirrors PriceUpdate.change_percent convention)"
requirements-completed: [DB-01, DB-02, DB-03, PORT-01, WATCH-01]
coverage:
  - id: D1
    description: "SQLite lazy init with full six-table schema and seed ($10k default profile + ten SEED_PRICES tickers)"
    requirement: DB-01
    verification:
      - kind: integration
        ref: "backend/tests/test_app.py#TestAppSmoke.test_startup_seeds_database"
        status: pass
    human_judgment: false
  - id: D2
    description: "FastAPI app entry point wiring market source, price cache, SSE router, and REST routers with lifespan startup/shutdown"
    requirement: DB-02
    verification:
      - kind: integration
        ref: "backend/tests/test_app.py#TestAppSmoke.test_price_cache_contains_aapl_after_startup"
        status: pass
    human_judgment: false
  - id: D3
    description: "GET /api/health returns 200 with status healthy"
    requirement: DB-03
    verification:
      - kind: integration
        ref: "backend/tests/test_app.py#TestAppSmoke.test_health_returns_healthy"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/stream/prices serves text/event-stream and emits frames carrying ticker, price, previous_price, direction"
    verification:
      - kind: e2e
        ref: "backend/tests/test_app.py#TestAppSmoke.test_stream_prices_serves_sse_frames"
        status: pass
    human_judgment: false
  - id: D5
    description: "GET /api/portfolio returns cash_balance, positions, total_value, unrealized_pnl with correct valuation math"
    requirement: PORT-01
    verification:
      - kind: unit
        ref: "backend/tests/portfolio/test_portfolio.py#TestGetPortfolio.test_portfolio_with_position_valuations"
        status: pass
    human_judgment: false
  - id: D6
    description: "GET /api/watchlist returns the ten seeded tickers in order, each annotated with latest price from the cache when available"
    requirement: WATCH-01
    verification:
      - kind: unit
        ref: "backend/tests/watchlist/test_watchlist.py#TestGetWatchlist.test_ticker_with_cached_price"
        status: pass
    human_judgment: false
duration: 47min
completed: 2026-08-26
status: complete
---

# Phase 1 Plan 1: Database Foundation + FastAPI Wiring Summary

**Bootable FastAPI backend with lazily-seeded SQLite (six-table schema, $10k profile + ten tickers), lifespan-wired market source/price cache/SSE, and read-only portfolio + watchlist endpoints proven end-to-end over a real HTTP server.**

## Performance

- **Duration:** 47 min
- **Started:** 2026-08-26T07:10:41Z
- **Completed:** 2026-08-26T07:57:30Z
- **Tasks:** 3 (1 tracer + 2 TDD)
- **Files modified:** 16 (11 created, 5 modified)

## Accomplishments

- SQLite persistence layer (`app/db`) with the full six-table schema from planning/PLAN.md §7, lazy `init_db(path)` that seeds only when the profile is absent ($10k cash + the ten `SEED_PRICES` tickers), and `get_connection()` as the shared connection seam.
- FastAPI entry point (`main.py`): lifespan creates the market source from the factory, starts it on the seed tickers, runs `init_db`, and exposes `app.state.price_cache / app.state.market_source / app.state.db_path`; shutdown awaits `source.stop()`.
- `create_stream_router` fixed to build a fresh `APIRouter(prefix="/api/stream")` per call — the module-global router duplicate-route trap documented in ARCHITECTURE.md is eliminated; `/api/stream/prices` stays registered exactly once.
- `GET /api/health` (DB-03), `GET /api/portfolio` (PORT-01) and `GET /api/watchlist` (WATCH-01) all return correct data for the seeded state, verified against a real uvicorn server.
- 82 tests pass (73 pre-existing market + 9 new), `ruff check app/ tests/` clean, all new files `ruff format` compliant.

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): End-to-end boot — SQLite schema+seed, FastAPI lifespan wiring, SSE, health** — `acb039e` (feat), `d49e2d9` (chore: test dep + Python pin)
2. **Task 2 (tdd): Portfolio read — valuation service + GET /api/portfolio (PORT-01)** — `d9fd7d7` (test/RED), `a7c7040` (feat/GREEN)
3. **Task 3 (tdd): Watchlist read — list service + GET /api/watchlist (WATCH-01)** — `1f373ca` (test/RED), `dbe4b58` (feat/GREEN)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `backend/app/db/database.py` — SCHEMA_SQL (six tables), `init_db(path)`, `get_connection(path)`, default seeding
- `backend/app/db/__init__.py` — exports `init_db`, `get_connection`
- `backend/app/main.py` — FastAPI app, lifespan wiring, health endpoint, router mounts
- `backend/app/portfolio/service.py` — `get_portfolio(conn, price_cache)` valuation math
- `backend/app/portfolio/router.py` — `GET /api/portfolio` via `request.app.state`
- `backend/app/portfolio/__init__.py` — re-exports `router`
- `backend/app/watchlist/service.py` — `get_watchlist(conn, price_cache)` with cache-annotated prices
- `backend/app/watchlist/router.py` — `GET /api/watchlist` via `request.app.state`
- `backend/app/watchlist/__init__.py` — re-exports `router`
- `backend/app/market/stream.py` — router moved inside `create_stream_router()` (isolated per call)
- `backend/tests/test_app.py` — 4 smoke tests (health, seed, cache, SSE over real uvicorn)
- `backend/tests/portfolio/test_portfolio.py` — 3 service tests
- `backend/tests/watchlist/test_watchlist.py` — 2 service tests
- `backend/pyproject.toml` — httpx added to dev extras, pinned `<0.28`
- `backend/uv.lock` — lockfile update
- `backend/.python-version` — pins uv venv to Python 3.12

## Decisions Made

- PriceCache is constructed at module level in `main.py` so `create_stream_router(cache)` can mount at import time (the standard FastAPI pattern). The lifespan still owns source creation + `init_db`; the single-cache invariant and `app.state` wiring from the plan's key-links hold.
- `get_connection()` gained an optional `path` parameter defaulting to `DEFAULT_DB_PATH`, so routers can open the exact file `init_db` used. The plan's key-link (db package exposes `init_db(path)` + `get_connection()` as the single persistence seam) requires this.
- Watchlist ordering uses `ORDER BY added_at, rowid` because all seed rows share one timestamp; `rowid` preserves true insertion order deterministically.
- SSE smoke test drives a real uvicorn server with a plain httpx network client (see deviation 3) — this actually proves the endpoint end-to-end over HTTP rather than through the ASGI in-process transport.
- Money values rounded to 2dp, percentages to 4dp, mirroring the `PriceUpdate.change_percent` convention.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] httpx added as dev dependency and pinned `<0.28`**
- **Found during:** Task 1 (End-to-end boot) — before test authoring
- **Issue:** The plan mandates TestClient-based smoke tests, but httpx was not in the project lockfile, so `fastapi.testclient.TestClient` was unavailable. Additionally, httpx 0.28's `ASGITransport` buffers the entire response body (it joins all body parts into one stream), breaking streaming-response tests entirely.
- **Fix:** Added `httpx>=0.27.0,<0.28` to the `dev` extras and re-synced. Dev-only, no runtime surface change (threat register T-01-SC unaffected).
- **Files modified:** `backend/pyproject.toml`, `backend/uv.lock`
- **Verification:** `pytest tests/test_app.py` passes; `uv run --extra dev python -c "from fastapi.testclient import TestClient"` succeeds.
- **Committed in:** `d49e2d9` (chore commit)

**2. [Rule 3 - Blocking] Python pinned to 3.12 via `.python-version`**
- **Found during:** Task 1 environment setup
- **Issue:** uv resolved the venv to Python 3.14 (newest matching `>=3.12`). The project spec (planning/PLAN.md DEPLOY-02, CONVENTIONS.md `target-version = "py312"`) targets the 3.12 runtime, and 3.14 is a brand-new interpreter whose anyio/portal behavior caused extra debugging noise.
- **Fix:** Added `backend/.python-version` containing `3.12`; re-synced the venv onto 3.12.12.
- **Files modified:** `backend/.python-version`, `backend/uv.lock`
- **Verification:** `uv run python -c "import sys; sys.version"` reports 3.12.12; full suite passes on 3.12.
- **Committed in:** `d49e2d9` (chore commit)

**3. [Rule 3 - Blocking] SSE smoke test uses real uvicorn + httpx instead of TestClient streaming**
- **Found during:** Task 1 (test authoring) — `client.stream()` hung with no output
- **Issue:** TestClient's transport is httpx `ASGITransport`, which buffers the complete response body before returning. An infinite SSE stream never completes, so `with client.stream(...)` blocks forever — even a minimal 3-frame `StreamingResponse` repro hung. This is a transport-level limitation, not an app bug.
- **Fix:** Rewrote the SSE smoke test to boot a real `uvicorn.Server` on an ephemeral port in a daemon thread and consume frames with a plain httpx network client (which streams correctly). This is strictly more faithful to the plan's mandate ("GET /api/stream/prices serves text/event-stream and emits events") — it proves real HTTP boot, content-type, and frames. The other three smoke assertions remain TestClient-based.
- **Files modified:** `backend/tests/test_app.py`
- **Verification:** `test_stream_prices_serves_sse_frames` passes (~1.5s); manual e2e script confirmed all four endpoints over a live server.
- **Committed in:** `acb039e` (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All three were environment/test-harness corrections required to run the plan's mandated verification. No scope creep; runtime dependency surface unchanged.

## Issues Encountered

- **TestClient SSE deadlock (resolved):** Diagnosed via a minimal repro that ruled out the app code, then isolated to httpx's ASGITransport body buffering. Documented the transport limitation in the test docstring so future streaming tests use the uvicorn harness.
- **Pre-existing `asyncio.DefaultEventLoopPolicy` deprecation warning** in `backend/tests/conftest.py` (Python 3.14-era deprecation) — pre-existing, out of scope, not fixed.
- **Three pre-existing `ruff format` violations** in `backend/tests/market/test_models.py`, `test_simulator.py`, `test_simulator_source.py` — pre-existing files, untouched per scope boundary.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `01-02-PLAN.md` (portfolio trading: buy/sell + history snapshots) can build directly on `app/portfolio/service.py` and the `users_profile` / `positions` / `trades` / `portfolio_snapshots` tables.
- `01-03-PLAN.md` (watchlist mutation) can build on `app/watchlist/service.py` and `source.add_ticker/remove_ticker` (already present on `MarketDataSource`).
- The SSE uvicorn-in-thread test harness in `tests/test_app.py` is reusable for any future streaming/integration test.
- Phase 2 (chat) will need the `chat_messages` table — already created by `SCHEMA_SQL`.
- Note for Phase 4 (Docker): `DB_PATH = "db/finally.db"` is relative to the working directory; the container CWD must be `/app` (matching the volume mount at `/app/db`) or the path must become env-configurable.

---
*Phase: 01-backend-foundation*
*Completed: 2026-08-26*

## Self-Check: PASSED

- All 13 created/tracked files confirmed on disk.
- All 6 task commits confirmed in git: d49e2d9, acb039e, d9fd7d7, a7c7040, 1f373ca, dbe4b58.
- Full suite: 82 passed; ruff check clean; all new files ruff-format compliant.
