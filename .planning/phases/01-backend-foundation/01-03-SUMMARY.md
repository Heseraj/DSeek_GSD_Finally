---
phase: 01-backend-foundation
plan: 03
subsystem: api
tags: [fastapi, sqlite, pydantic, pytest, asyncio, sse]
requires:
  - phase: 00-market-data
    provides: PriceCache with get/remove, MarketDataSource with async add_ticker/remove_ticker
  - phase: 01-01
    provides: SQLite persistence layer (app/db), app.state DI pattern, watchlist read service/router, main.py lifespan
  - phase: 01-02
    provides: pydantic ticker-normalization pattern (TradeRequest), service/router/HTTP-test conventions
provides:
  - Watchlist mutation: POST /api/watchlist (add + start streaming) and DELETE /api/watchlist/{ticker} (remove + stop streaming), keeping the persisted watchlist, price cache, and market source in sync
  - WatchlistAddRequest schema (non-empty, max 12 chars, uppercase-normalized) and 13 new tests
affects: [phase-2-chat, phase-3-frontend, phase-4-deployment]
actuals:
  tokens: 3275
  tasks: 2
  commits: 5
tech-stack:
  added: []
  patterns:
    - "async service functions (add_ticker/remove_ticker) await market_source.add_ticker/remove_ticker; routers declare async def so the awaits stay on the app loop"
    - "tuple return (ticker, created) for domain outcomes — the service never raises on duplicate; the router maps created=False to HTTP 409"
    - "StringConstraints(strip_whitespace=True, min_length=1, max_length=12) so whitespace-only ticker bodies are rejected by pydantic (threat T-03-01)"
    - "`with conn:` transaction idiom for the single INSERT / DELETE; UNIQUE(user_id, ticker) as the duplicate backstop (threat T-03-02)"
key-files:
  created:
    - backend/app/watchlist/schemas.py
    - backend/tests/watchlist/test_mutation.py
  modified:
    - backend/app/watchlist/service.py
    - backend/app/watchlist/router.py
key-decisions:
  - "Duplicate add returns 409 Conflict (the plan's 'conflict-or-success' option): the service returns (ticker, created=False) on UNIQUE violation and the router maps it; the existing row is returned, no duplicate written, source untouched (already tracking)"
  - "remove_ticker deletes the row first and calls market_source.remove_ticker only when rowcount > 0 — a not-found delete returns 404 with the source and cache untouched, per must_have 'deleting a ticker that is not watched returns a not-found response without erroring'"
  - "StringConstraints over min_length alone: min_length=1 accepts a single space, so strip_whitespace before the length check is what makes '   ' reject with 422"
  - "HTTP tests exercise the real app + real SimulatorDataSource (add/remove are deterministic — awaited before the response returns), so cache-gain and cache-clear assertions are race-free"
patterns-established:
  - "Mutation services return plain data (tuple/bool); HTTP status mapping lives in the router — mirrors the 01-02 TradeError → status mapping but without an exception hierarchy (two discrete outcomes only)"
  - "Path parameters are normalized inside the service, so DELETE /api/watchlist/pypl removes PYPL"
requirements-completed: [WATCH-02, WATCH-03]
coverage:
  - id: D1
    description: "POST /api/watchlist adds a normalized ticker row, starts streaming it through market_source.add_ticker, avoids duplicate rows (409), and rejects empty/whitespace/overlong tickers with 422"
    requirement: WATCH-02
    verification:
      - kind: unit
        ref: "backend/tests/watchlist/test_mutation.py#TestAddTickerService.test_add_normalizes_persists_and_starts_streaming"
        status: pass
      - kind: unit
        ref: "backend/tests/watchlist/test_mutation.py#TestAddTickerService.test_add_existing_ticker_returns_existing_without_duplicate_row"
        status: pass
      - kind: integration
        ref: "backend/tests/watchlist/test_mutation.py#TestAddTickerEndpoint.test_add_persists_row_and_starts_streaming"
        status: pass
      - kind: integration
        ref: "backend/tests/watchlist/test_mutation.py#TestAddTickerEndpoint.test_add_duplicate_returns_conflict_without_second_row"
        status: pass
    human_judgment: false
  - id: D2
    description: "DELETE /api/watchlist/{ticker} removes the watchlist row, stops the market source from tracking it, clears the price cache, and returns 404 for unknown tickers without touching source or cache"
    requirement: WATCH-03
    verification:
      - kind: unit
        ref: "backend/tests/watchlist/test_mutation.py#TestRemoveTickerService.test_remove_existing_deletes_row_and_stops_source"
        status: pass
      - kind: unit
        ref: "backend/tests/watchlist/test_mutation.py#TestRemoveTickerService.test_remove_unknown_ticker_returns_false_and_leaves_source"
        status: pass
      - kind: integration
        ref: "backend/tests/watchlist/test_mutation.py#TestRemoveTickerEndpoint.test_remove_existing_deletes_row_and_clears_cache"
        status: pass
      - kind: integration
        ref: "backend/tests/watchlist/test_mutation.py#TestRemoveTickerEndpoint.test_remove_unknown_ticker_returns_not_found"
        status: pass
    human_judgment: false
duration: 14min
completed: 2026-08-26
status: complete
---

# Phase 1 Plan 3: Watchlist Mutation Summary

**POST /api/watchlist add + DELETE /api/watchlist/{ticker} remove — both keeping the persisted watchlist, the price cache, and the market data source in sync — with pydantic ticker validation, uppercase normalization, duplicate/not-found handling, and 13 new tests proven over the real app.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-08-26T07:52:08Z
- **Completed:** 2026-08-26T08:06:00Z
- **Tasks:** 2 (both TDD: RED + GREEN + REFACTOR commits)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `add_ticker(conn, market_source, ticker)` (WATCH-02): normalizes the ticker to uppercase-stripped, inserts one row (`uuid` id, `user_id='default'`, ISO `added_at`) with a parameterized INSERT, catches the `UNIQUE(user_id, ticker)` IntegrityError and returns the existing ticker instead of raising (no duplicate row, source untouched), then awaits `market_source.add_ticker(ticker)` so the simulator/Massive source starts streaming it and the price cache gains a price.
- `remove_ticker(conn, market_source, ticker)` (WATCH-03): normalizes, deletes the row where `user_id='default'` matches, and only when `rowcount > 0` awaits `market_source.remove_ticker(ticker)` — which also clears the ticker from the price cache (per the interface contract). Unknown tickers return `False`; the source and cache are untouched.
- `WatchlistAddRequest` schema: `StringConstraints(strip_whitespace=True, min_length=1, max_length=12)` + uppercase after-validator — whitespace-only bodies (`"   "`) and overlong symbols are rejected with 422, `"  aapl  "` adds as `AAPL`.
- Endpoints read `conn` and `market_source` from `request.app.state` (no module singletons); POST returns `200 {"ticker": "PYPL"}`, duplicate returns `409`, DELETE returns `204` on removal and `404` for unknown tickers.
- 13 new tests (9 add + 4 remove): schema validation, service behavior against a mock market source with a temp DB, and HTTP-level tests over the real app with the real simulator — the awaited `add_ticker`/`remove_ticker` make cache-gain and cache-clear assertions race-free.
- 115 tests pass (102 baseline + 13 new), `ruff check app/ tests/` clean, new/modified files `ruff format` compliant.

## Task Commits

Each task was committed atomically (TDD: test → feat → refactor):

1. **Task 1 (tdd): Add ticker: POST /api/watchlist (WATCH-02)** — `279c0a2` (test/RED), `d2aa11f` (feat/GREEN)
2. **Task 2 (tdd): Remove ticker: DELETE /api/watchlist/{ticker} (WATCH-03)** — `5c6289f` (test/RED), `c90a426` (feat/GREEN)
3. **REFACTOR: ruff format** — `577a569` (style)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `backend/app/watchlist/schemas.py` — `WatchlistAddRequest` (new): ticker bounded to non-empty, ≤12 chars, whitespace-stripped, uppercased
- `backend/app/watchlist/service.py` — `add_ticker` (returns `(ticker, created)`), `remove_ticker` (returns `bool`); `get_watchlist` untouched
- `backend/app/watchlist/router.py` — `POST /api/watchlist` + `DELETE /api/watchlist/{ticker}`; GET unchanged
- `backend/tests/watchlist/test_mutation.py` — 13 tests: schema, service (mock source + temp DB), endpoint (real app)

## Decisions Made

- **409 for duplicate adds.** The plan allowed "conflict-or-success". The service returns `(ticker, created=False)` on the UNIQUE violation and the router maps it to `409 Conflict` — informative for the frontend, no duplicate row, and no source call (the ticker is already tracked).
- **`with conn:` transaction idiom** for the single INSERT and DELETE — commit-or-rollback handled by the context manager; IntegrityError caught outside it so a duplicate returns cleanly instead of leaving the connection in a failed-transaction state.
- **StringConstraints over bare `min_length`.** `min_length=1` alone accepts `" "`; `strip_whitespace=True` is what makes whitespace-only bodies fail (threat T-03-01).
- **Real app + real simulator for HTTP tests.** Unlike 01-02's trade tests (which needed non-simulated tickers because fills race the 500ms tick), add/remove are deterministic: the source call is awaited before the response returns, so asserting `"PYPL" in price_cache` / `"PYPL" not in price_cache` cannot race.

## Deviations from Plan

None - plan executed exactly as written (both tasks, all four must_have truths, threat mitigations T-03-01/T-03-02 in place, no new dependencies so T-03-SC holds).

## Issues Encountered

- **Task 2 RED failed on the endpoint, not at collection.** `remove_ticker` was authored in the Task 1 GREEN commit (kept the service module cohesive), so the Task 2 RED run showed `1 failed, 12 passed` — the failing endpoint test (`DELETE` route not yet registered → 404 for the wrong reason) was the genuine gate. The GREEN commit flipped it to 204 and made the unknown-ticker 404 real. RED-gate intent preserved: the new surface failed before implementation.
- **`ruff format` flagged `service.py`** (function signatures over the 100-char line limit) after GREEN; fixed in a dedicated `style` commit, tests re-run green.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 2 (chat auto-execution) can call `add_ticker` / `remove_ticker` directly for `watchlist_changes`; the tuple/bool returns map cleanly to per-action success messages, and 409/404 responses carry human-readable details the LLM can relay.
- Phase 3 (frontend) consumes: `POST /api/watchlist` (200/409), `DELETE /api/watchlist/{ticker}` (204/404), plus the 422 contract for malformed bodies — the watchlist CRUD surface is complete.
- The full watchlist API (GET/POST/DELETE) plus portfolio trading means Phase 4 E2E scenarios (watchlist add/remove, buy/sell) have a complete backend to drive.

---
*Phase: 01-backend-foundation*
*Completed: 2026-08-26*

## Self-Check: PASSED

- All 4 created/modified files confirmed on disk (`schemas.py`, `test_mutation.py` created; `service.py`, `router.py` modified).
- All 5 commits confirmed in git: 279c0a2, d2aa11f, 5c6289f, c90a426, 577a569.
- Full suite: 115 passed; `ruff check app/ tests/` clean; new files `ruff format` compliant.

## TDD Gate Compliance

- RED → GREEN order verified in git log: `279c0a2` (test) → `d2aa11f` (feat) for WATCH-02; `5c6289f` (test) → `c90a426` (feat) for WATCH-03; optional REFACTOR `577a569` (style) after GREEN. No missing gates.
