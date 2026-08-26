---
phase: 01-backend-foundation
plan: 02
subsystem: api
tags: [fastapi, sqlite, pydantic, pytest, asyncio, trading]
requires:
  - phase: 00-market-data
    provides: PriceCache with get_price/get_all
  - phase: 01-01
    provides: SQLite persistence layer (app/db), app.state DI pattern, get_portfolio, POST-ready router, main.py lifespan
provides:
  - Market-order trade execution (buy/sell) with weighted-average cost accounting, atomic single-transaction writes, and 400/404 domain-error mapping
  - Portfolio value history: record_snapshot shared by the 30s background loop and post-trade recording, plus GET /api/portfolio/history
  - TradeRequest/PortfolioResponse pydantic schemas (ticker normalized, quantity > 0, side literal)
affects: [phase-2-chat, phase-3-frontend, phase-4-deployment]
actuals:
  tokens: 8038
  tasks: 3
  commits: 7
tech-stack:
  added: []
  patterns:
    - "single sqlite3 transaction per trade (`with conn:`): cash update + position upsert/delete + trade insert + snapshot commit together or roll back together (threat T-02-02)"
    - "domain exception hierarchy (TradeError -> UnknownTicker/InsufficientCash/InsufficientShares) in the service so routers map validation to 404/400"
    - "record_snapshot(conn, price_cache) shared by the lifespan background loop and execute_trade so history stays consistent with portfolio value"
    - "background loop uses run_in_executor with a fresh connection per interval and absorbs CancelledError at both awaits"
key-files:
  created:
    - backend/app/portfolio/schemas.py
    - backend/app/portfolio/snapshots.py
    - backend/tests/portfolio/test_trade.py
    - backend/tests/portfolio/test_history.py
  modified:
    - backend/app/portfolio/service.py
    - backend/app/portfolio/router.py
    - backend/app/main.py
key-decisions:
  - "Pydantic structural violations (quantity <= 0, invalid side) return FastAPI's standard 422; only domain validation failures map to the plan's status codes — unknown ticker/missing price -> 404, insufficient cash/shares -> 400 — exactly matching threat T-02-01"
  - "Custom domain exception hierarchy in service.py deliberately extends the 'no custom exception classes' market-subystem convention: the plan mandates domain errors mapped to distinct HTTP codes, which built-ins cannot express cleanly"
  - "record_snapshot computes total_value with its own inline math mirroring get_portfolio (round per-position market value, then accumulate) to avoid a circular import; test_history pins snapshot == live portfolio value so the two can never drift silently"
  - "Snapshot loop records immediately on startup and then every 30s; each interval opens a dedicated connection in a worker thread so the loop never holds a transaction while idle"
  - "Trade tests split between service-level (exact arithmetic with a controlled PriceCache) and HTTP-level (status codes + state untouched via TestClient) for determinism; non-simulated tickers (IBM/ORCL/INTC) are primed in the cache so the live simulator cannot race the fill price"
patterns-established:
  - "Trade fills read the price exclusively from app.state.price_cache — the client never supplies a price"
  - "Epsilon (1e-9) checks for full-position sell detection so float noise never leaves a dust position"
  - "RED commits fail at collection (new modules don't exist yet) — repo-established pattern from 01-01"
requirements-completed: [PORT-02, PORT-03, PORT-04]
coverage:
  - id: D1
    description: "Market buy execution: cash deduction, position create/upsert with weighted-average avg_cost, trade row append, insufficient-cash rejection"
    requirement: PORT-02
    verification:
      - kind: unit
        ref: "backend/tests/portfolio/test_trade.py#TestExecuteTradeBuy"
        status: pass
      - kind: integration
        ref: "backend/tests/portfolio/test_trade.py#TestTradeEndpoint.test_buy_returns_updated_portfolio"
        status: pass
    human_judgment: false
  - id: D2
    description: "Market sell execution: cash credit, quantity decrement with avg_cost unchanged, full-sell row removal, insufficient-shares rejection"
    requirement: PORT-03
    verification:
      - kind: unit
        ref: "backend/tests/portfolio/test_trade.py#TestExecuteTradeSell"
        status: pass
      - kind: integration
        ref: "backend/tests/portfolio/test_trade.py#TestTradeEndpoint.test_sell_insufficient_shares_returns_400"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every successful trade records a post-trade portfolio_snapshots row inside the same transaction; failed trades record none"
    requirement: PORT-04
    verification:
      - kind: unit
        ref: "backend/tests/portfolio/test_history.py#TestTradeRecordsSnapshot"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/portfolio/history returns recorded_at/total_value snapshots in ascending time order"
    requirement: PORT-04
    verification:
      - kind: integration
        ref: "backend/tests/portfolio/test_history.py#TestHistoryEndpoint.test_history_returns_snapshots_in_ascending_order"
        status: pass
    human_judgment: false
  - id: D5
    description: "The background snapshot loop writes rows on its interval and exits cleanly on cancellation"
    requirement: PORT-04
    verification:
      - kind: unit
        ref: "backend/tests/portfolio/test_history.py#TestSnapshotLoop"
        status: pass
    human_judgment: false
duration: 10min
completed: 2026-08-26
status: complete
---

# Phase 1 Plan 2: Portfolio Trading + History Summary

**Market-order buy/sell trading with weighted-average cost accounting in a single SQLite transaction per fill, plus portfolio value history snapshots recorded on a 30-second background cadence and immediately after every trade, served by POST /api/portfolio/trade and GET /api/portfolio/history.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-26T07:36:40Z
- **Completed:** 2026-08-26T07:46:53Z
- **Tasks:** 3 (all TDD: RED + GREEN commits)
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments

- `execute_trade(conn, price_cache, trade)` in `app/portfolio/service.py`: buy path deducts cash and upserts a position with weighted-average `avg_cost`; sell path credits cash, decrements quantity with `avg_cost` unchanged, deletes the position row on a full sell, and rejects oversells. The entire read-modify-write — cash update, position upsert/delete, trade insert — runs inside one `with conn:` SQLite transaction (threat T-02-02), so any failure rolls the whole order back.
- Domain error hierarchy (`UnknownTickerError` → 404, `InsufficientCashError`/`InsufficientSharesError` → 400) mapped in the router; fill price comes exclusively from `app.state.price_cache`, never the client.
- `app/portfolio/snapshots.py`: `record_snapshot(conn, price_cache)` computes `total_value` (cash + per-position market values) and is called by **both** the post-trade path (inside the trade transaction) and the 30-second lifespan background loop — the plan's shared-snapshot key link. The loop records immediately at startup, survives per-interval failures, and exits cleanly on cancellation.
- `GET /api/portfolio/history` returns `{recorded_at, total_value}` snapshots ascending — the P&L chart payload.
- `TradeRequest` (ticker normalized to uppercase-stripped, quantity > 0, side literal) and `PortfolioResponse` pydantic schemas shared by GET /api/portfolio and POST /api/portfolio/trade.
- 102 tests pass (82 baseline + 20 new), `ruff check app/ tests/` clean, all new files `ruff format` compliant.

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1 (tdd): Market buy order with sufficient-cash validation (PORT-02)** — `7e8c5ca` (test/RED), `cb00e8d` (feat/GREEN)
2. **Task 2 (tdd): Market sell order with sufficient-shares validation (PORT-03)** — `a708b98` (test/RED), `94f8be7` (feat/GREEN)
3. **Task 3 (tdd): Portfolio value history: snapshots + GET /api/portfolio/history (PORT-04)** — `f475cd3` (test/RED), `7464d5a` (feat/GREEN)
4. **Deviation fix: snapshot-loop cancellation race** — `94ab750` (fix)

**Plan metadata:** pending final docs commit

## Files Created/Modified

- `backend/app/portfolio/schemas.py` — `TradeRequest`, `PositionResponse`, `PortfolioResponse` pydantic models
- `backend/app/portfolio/service.py` — `execute_trade` (buy+sell in one transaction), `get_history`, `TradeError` hierarchy; `get_portfolio` unchanged
- `backend/app/portfolio/router.py` — `POST /api/portfolio/trade` + `GET /api/portfolio/history`; GET /api/portfolio now uses `response_model=PortfolioResponse`
- `backend/app/portfolio/snapshots.py` — `record_snapshot`, `start_snapshot_loop`, thread-bound `_record_snapshot_to_db`
- `backend/app/main.py` — lifespan starts/cancels the named `portfolio-snapshot-loop` task
- `backend/tests/portfolio/test_trade.py` — 13 tests: schema normalization, buy math, sell math, rollback-on-reject, HTTP 400/404 mapping
- `backend/tests/portfolio/test_history.py` — 7 tests: snapshot math, post-trade snapshots, history ordering, loop cadence + cancellation

## Decisions Made

- **422 for structural violations, 400/404 for domain failures.** The plan's "maps validation failures to 400/404" is implemented for domain validation exactly as threat T-02-01 specifies (unknown ticker/missing price → 404; insufficient cash/shares → 400). Malformed bodies (quantity ≤ 0, invalid side) keep FastAPI's standard 422. A global `RequestValidationError → 400` handler would have silently changed every existing and future route's error contract; the frontend phase consumes 422 as the standard body-validation signal.
- **Custom exception hierarchy in service.py.** Deliberate extension of the market subsystem's "no custom exception classes" convention — the plan mandates domain errors with distinct HTTP mappings that built-in exceptions cannot express cleanly.
- **Inline valuation math in `record_snapshot` (mirrors `get_portfolio`).** Avoids a circular import between service.py and snapshots.py (execute_trade must call record_snapshot; record_snapshot needs the same total-value math). `test_snapshot_matches_portfolio_total_value` pins the two together so a drift between history and the live endpoint fails CI immediately.
- **Non-simulated test tickers (IBM/ORCL/INTC).** HTTP tests prime these in the cache; the live simulator never updates them, so fill prices are deterministic and cannot race the 500ms simulator tick.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Snapshot loop ignored CancelledError at the executor await**
- **Found during:** Task 3 verification — `TestSnapshotLoop.test_loop_records_snapshots_on_interval_and_cancels_cleanly` failed intermittently (~1 in 2 runs)
- **Issue:** `task.cancel()` can land at either await in the loop: `asyncio.sleep` (guarded) or `await loop.run_in_executor(...)` (unguarded). When cancellation hit the executor await, `CancelledError` propagated out of the loop, failing the clean-cancellation contract.
- **Fix:** Catch `CancelledError` at both awaits and return; executor threads that already started complete harmlessly on their own connection.
- **Files modified:** `backend/app/portfolio/snapshots.py`
- **Verification:** Loop test passed 5/5 consecutive runs; full suite green.
- **Committed in:** `94ab750` (separate fix commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Correctness fix in code this plan introduced. No scope creep; no runtime dependency surface changed.

## Issues Encountered

- **TDD RED commits fail at collection**, not at assertions: each RED commit adds tests importing modules that do not exist yet (schemas.py, snapshots.py, execute_trade), so pytest reports a collection error. This matches the pattern established by 01-01 and satisfies the "must fail" gate; the commit message and test intent make the RED state explicit.
- **`ruff format` pre-existing violations** in `backend/tests/market/test_simulator.py` and `test_simulator_source.py` — pre-existing, untouched per scope boundary (already documented in 01-01).
- **pytest `--count` flag unavailable** (pytest-repeat not installed) — loop-stability verification ran the test 5 times via a shell loop instead.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `01-03-PLAN.md` (watchlist mutation) builds on the same app.state DI + service/router pattern; `TradeRequest`'s ticker normalization is reusable for `POST /api/watchlist`.
- Phase 2 (chat auto-execution) can call `execute_trade` directly — the plan's threat model T-02-01 validation (404 unknown ticker, 400 insufficient cash/shares) applies to LLM-proposed trades unchanged; the chat service should catch `TradeError` and surface the message to the user.
- Phase 3 (frontend) consumes: `GET /api/portfolio/history` (P&L chart), `POST /api/portfolio/trade` (trade bar), and the 422/400/404 status contract documented above.
- The uvicorn-in-thread SSE test harness from 01-01 remains the pattern for any future streaming/integration test.

---
*Phase: 01-backend-foundation*
*Completed: 2026-08-26*

## Self-Check: PASSED

- All 7 created/modified files confirmed on disk (`schemas.py`, `snapshots.py`, `test_trade.py`, `test_history.py` created; `service.py`, `router.py`, `main.py` modified).
- All 7 commits confirmed in git: 7e8c5ca, cb00e8d, a708b98, 94f8be7, f475cd3, 7464d5a, 94ab750.
- Full suite: 102 passed; `ruff check app/ tests/` clean; new files `ruff format` compliant.
