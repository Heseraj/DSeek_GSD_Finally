---
phase: 01-backend-foundation
verified: 2026-08-26T00:00:00Z
status: passed
score: 16/16 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 1: Backend Foundation Verification Report

**Phase Goal:** A running FastAPI backend that persists a $10k portfolio and watchlist, streams live prices, and lets users trade and manage their watchlist through a REST API.
**Verified:** 2026-08-26T00:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

Goal-backward: the goal is achieved only if a user can boot the backend, see seeded $10k + 10 tickers, stream live prices, read/manage the portfolio and watchlist via REST. Every observable truth was checked against the live codebase (`backend/app/*`), with behavior proven by the actual test suite (115 passed), not SUMMARY claims.

### ROADMAP Success Criteria

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| 1 | Starting the backend seeds a fresh database with a $10,000 cash balance and ten default watchlist tickers | ✓ VERIFIED | `init_db()` in `app/db/database.py` seeds only when profile absent; direct fresh-file check: `cash=10000.0`, exactly 10 tickers (AAPL GOOGL MSFT AMZN TSLA NVDA META JPM V NFLX), all 6 tables; `TestAppSmoke.test_startup_seeds_database` passed in suite run |
| 2 | Live prices stream over `GET /api/stream/prices` with ticker, price, previous price, and direction | ✓ VERIFIED | `app/market/stream.py` serves `text/event-stream`; `PriceUpdate.to_dict()` (models.py) emits `ticker/price/previous_price/direction`; `test_stream_prices_serves_sse_frames` passed against a real uvicorn server (network httpx, not ASGI-buffered transport) |
| 3 | `GET /api/portfolio` reports cash balance, positions, total value, and unrealized P&L | ✓ VERIFIED | `get_portfolio()` joins DB cash/positions with `price_cache.get_price`; router returns `cash_balance/total_value/unrealized_pnl/positions[]`; `test_fresh_portfolio` + `test_portfolio_with_position_valuations` passed |
| 4 | A buy order reduces cash and creates/updates a position; a sell order increases cash and rejects insufficient shares | ✓ VERIFIED | `execute_trade()` buy path deducts cash + weighted-average upsert; sell path credits cash + decrements, rejects oversells (400), deletes row on full sell; `test_buy_creates_position_and_deducts_cash`, `test_sell_reduces_quantity_and_increases_cash`, `test_sell_insufficient_shares_returns_400` passed |
| 5 | Adding and removing tickers updates the watchlist, and `GET /api/health` reports healthy | ✓ VERIFIED | `add_ticker`/`remove_ticker` persist rows and sync `market_source` + price cache; `test_add_persists_row_and_starts_streaming`, `test_remove_existing_deletes_row_and_clears_cache` passed; health endpoint returns `{"status": "healthy"}` and `test_health_returns_healthy` passed |

### Observable Truths (PLAN must_haves — deduplicated against SCs)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Fresh boot seeds one profile with cash_balance 10000.0 and exactly ten default watchlist tickers | ✓ VERIFIED | Direct temp-DB check (`FRESH_SEED_OK`); suite test passed |
| 2 | GET /api/health returns HTTP 200 with a JSON body whose status field reports healthy | ✓ VERIFIED | `main.py` `/api/health` returns `{"status": "healthy"}`; test passed |
| 3 | GET /api/stream/prices serves text/event-stream emitting ticker, price, previous_price, direction | ✓ VERIFIED | `stream.py` + `PriceUpdate.to_dict()`; real-uvicorn test passed |
| 4 | GET /api/portfolio on a fresh start returns cash 10000.0, empty positions, total_value 10000.0, unrealized_pnl 0.0 | ✓ VERIFIED | `test_fresh_portfolio` passed; service math confirmed |
| 5 | GET /api/watchlist on a fresh start returns the ten seeded tickers, each with a latest price when the cache is populated | ✓ VERIFIED | `get_watchlist` orders by `added_at, rowid` and annotates from cache; `test_fresh_watchlist_returns_ten_seeded_tickers`, `test_ticker_with_cached_price` passed |
| 6 | /api/stream/prices is registered exactly once with no duplicate-route/double-registration errors | ✓ VERIFIED | `create_stream_router` builds a fresh `APIRouter(prefix="/api/stream")` per call (module-global router removed); route table shows `/api/stream/prices` exactly once; app boots clean |
| 7 | Buy reduces cash_balance by qty×price and creates/increases position with correct weighted-average avg_cost | ✓ VERIFIED | `execute_trade` buy path; `test_buy_creates_position_and_deducts_cash`, `test_second_buy_recomputes_weighted_average_cost` passed |
| 8 | Buy with insufficient cash returns HTTP 400 and leaves cash unchanged | ✓ VERIFIED | `InsufficientCashError` → 400 in router; `test_buy_insufficient_cash_returns_400_and_leaves_cash` passed |
| 9 | Sell increases cash and reduces quantity; returns HTTP 400 when quantity exceeds owned shares | ✓ VERIFIED | `InsufficientSharesError` → 400; `test_sell_reduces_quantity_and_increases_cash`, `test_sell_exceeding_shares_raises_and_leaves_state_untouched`, `test_sell_without_position_raises` passed |
| 10 | Sell of the entire position removes the position row; every buy/sell appends a trades row and records a portfolio_snapshots row | ✓ VERIFIED | Position DELETE at `abs(new_quantity) < 1e-9`; trades insert + `record_snapshot` inside the same `with conn:` transaction; `test_sell_of_entire_position_removes_row_and_logs_trade`, `test_successful_trade_records_snapshot`, `test_failed_trade_records_no_snapshot` passed |
| 11 | GET /api/portfolio/history returns recorded_at and total_value snapshots ascending, including one captured immediately after each trade | ✓ VERIFIED | `get_history()` orders by `recorded_at`; post-trade snapshot in same transaction; `test_history_returns_snapshots_in_ascending_order` passed |
| 12 | POST /api/watchlist adds a row, normalizes ticker to uppercase, and starts streaming through the market source | ✓ VERIFIED | `add_ticker` awaits `market_source.add_ticker` after insert; `test_add_normalizes_persists_and_starts_streaming`, `test_add_persists_row_and_starts_streaming` passed |
| 13 | POST /api/watchlist with an already-watched or invalid ticker does not create a duplicate row | ✓ VERIFIED | `UNIQUE(user_id,ticker)` backstop; `IntegrityError` → `(ticker, False)` → 409; whitespace/empty/overlong → 422 via `StringConstraints`; `test_add_existing_ticker_returns_existing_without_duplicate_row`, `test_add_duplicate_returns_conflict_without_second_row`, `test_whitespace_only_ticker_rejected` passed |
| 14 | DELETE /api/watchlist/{ticker} removes the row, stops the market source tracking it, and removes it from the price cache | ✓ VERIFIED | `remove_ticker` deletes row, calls `market_source.remove_ticker` (which clears cache per interface contract) only on rowcount>0; `test_remove_existing_deletes_row_and_stops_source`, `test_remove_existing_deletes_row_and_clears_cache` passed |
| 15 | Deleting a ticker that is not watched returns a not-found response without erroring | ✓ VERIFIED | rowcount==0 → `False` → 404; source/cache untouched; `test_remove_unknown_ticker_returns_false_and_leaves_source`, `test_remove_unknown_ticker_returns_not_found` passed |
| 16 | The 30s background snapshot loop records rows on interval and exits cleanly on cancellation | ✓ VERIFIED | `start_snapshot_loop` absorbs `CancelledError` at both awaits; `test_loop_records_snapshots_on_interval_and_cancels_cleanly` passed; lifespan cancels the named task on shutdown |

**Score:** 16/16 truths verified (0 present-but-behavior-unverified, 0 overrides)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `backend/app/db/database.py` | Six-table schema + lazy seed | ✓ VERIFIED | `SCHEMA_SQL` has all 6 tables (incl. `chat_messages`) with `UNIQUE(user_id,ticker)`; `init_db` seeds only when profile absent; parameterized SQL only |
| `backend/app/db/__init__.py` | Export `init_db`/`get_connection` | ✓ VERIFIED | Single persistence seam, re-exported |
| `backend/app/main.py` | FastAPI entry, lifespan wiring, health | ✓ VERIFIED | Lifespan: `create_market_data_source(price_cache)` → `source.start(DEFAULT_TICKERS)` → `init_db(DB_PATH)` → `app.state.price_cache/market_source/db_path` → snapshot loop; shutdown cancels loop + `source.stop()`; all 3 routers mounted; `/api/health` |
| `backend/app/market/stream.py` | Fresh router per factory call | ✓ VERIFIED | Duplicate-route fix confirmed: `APIRouter(prefix="/api/stream")` constructed inside `create_stream_router()` |
| `backend/app/portfolio/service.py` | Valuation + trade execution | ✓ VERIFIED | `get_portfolio`, `execute_trade` (single `with conn:` transaction, weighted-avg buy, sell w/ full-sell delete, `record_snapshot` per fill), `get_history`, domain error hierarchy |
| `backend/app/portfolio/router.py` | GET portfolio, POST trade, GET history | ✓ VERIFIED | Reads `request.app.state`; 404 unknown ticker / 400 insufficient cash & shares; response_model=PortfolioResponse |
| `backend/app/portfolio/schemas.py` | TradeRequest/PortfolioResponse | ✓ VERIFIED | `quantity > 0`, `side: Literal["buy","sell"]`, ticker uppercase-stripped |
| `backend/app/portfolio/snapshots.py` | record_snapshot + 30s loop | ✓ VERIFIED | Shared by post-trade path and background loop; clean cancellation |
| `backend/app/watchlist/service.py` | get/add/remove | ✓ VERIFIED | Insertion-order read with cache prices; `add_ticker`→source sync; `remove_ticker`→source+cache sync |
| `backend/app/watchlist/router.py` | GET/POST/DELETE watchlist | ✓ VERIFIED | Reads `request.app.state`; 200/409/204/404/422 contract |
| `backend/app/watchlist/schemas.py` | WatchlistAddRequest | ✓ VERIFIED | `StringConstraints(strip_whitespace, min 1, max 12)` + uppercase validator |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | -- | ------ | ------- |
| main.py lifespan | market source + price cache + DB | `create_market_data_source` → `source.start(DEFAULT_TICKERS)` → `init_db` → `app.state` | ✓ WIRED | All three state fields set; cache holds AAPL after startup (tested). Note: PriceCache is constructed at module level, not in lifespan — documented deviation in 01-01-SUMMARY (required because `create_stream_router(cache)` mounts at import time); functional contract (single cache, state exposure, seeded DB) verified by tests |
| portfolio/watchlist routers | app.state | `request.app.state.db_path/price_cache/market_source` | ✓ WIRED | No module-level singletons in any router |
| db package | every downstream service | `init_db(path)` + `get_connection(path)` imports | ✓ WIRED | Routers open `get_connection(db_path)`; services take `conn` |
| trade route | price cache + DB | `execute_trade` reads `price_cache.get_price` + cash/positions in one `with conn:` transaction | ✓ WIRED | Client never supplies price; atomic commit-or-rollback (threat T-02-02) |
| execute_trade | snapshots | `record_snapshot(conn, price_cache)` inside trade transaction | ✓ WIRED | Post-trade snapshot guaranteed per fill |
| 30s loop + post-trade | record_snapshot | Shared function in `snapshots.py` | ✓ WIRED | Both call the same `record_snapshot`; `test_snapshot_matches_portfolio_total_value` pins history to live portfolio |
| watchlist mutation routes | market source | `await market_source.add_ticker/remove_ticker` | ✓ WIRED | Stream stays in sync with persisted watchlist; UNIQUE(user_id,ticker) backstop |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| GET /api/portfolio | cash, positions, total_value, pnl | `users_profile` + `positions` queries + `PriceCache` | Yes — real DB rows + live cache prices | ✓ FLOWING |
| POST /api/portfolio/trade | fill price, cash, position | `PriceCache.get_price` + transactional DB writes | Yes — real cache price, real persisted state | ✓ FLOWING |
| GET /api/portfolio/history | snapshots | `portfolio_snapshots` query | Yes — rows from 30s loop + post-trade writes | ✓ FLOWING |
| GET /api/watchlist | tickers + prices | `watchlist` query + `PriceCache.get` | Yes — real DB rows + cache prices | ✓ FLOWING |
| GET /api/stream/prices | price events | `PriceCache.get_all()` | Yes — live simulator/poller updates | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full test suite | `uv run --extra dev pytest -q` | `115 passed, 2 warnings` (websockets deprecation only) | ✓ PASS |
| Lint | `uv run --extra dev ruff check app/ tests/` | `All checks passed!` | ✓ PASS |
| Fresh DB seed | `init_db` on temp file → inspect | `cash=10000.0`, 10 tickers, 6 tables → `FRESH_SEED_OK` | ✓ PASS |
| Route registration (no duplicates) | `app.routes` enumeration | All 8 Phase-1 endpoints registered exactly once | ✓ PASS |
| SSE payload fields | `PriceUpdate.to_dict()` | ticker, price, previous_price, timestamp, change, change_percent, direction | ✓ PASS (behavioral: real-uvicorn SSE test consumed frames) |
| Trade atomicity + validation | `TestExecuteTradeBuy/Sell` + endpoint tests | Buy deducts cash, weighted avg correct; 400 insufficient cash/shares with state untouched; rollback verified | ✓ PASS (in suite run) |
| Snapshot cadence + cancellation | `TestSnapshotLoop.test_loop_records_snapshots_on_interval_and_cancels_cleanly` | Records on interval, exits cleanly on cancel | ✓ PASS (in suite run) |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| — | — | No probes declared in any Phase 1 plan; declared verification was pytest + ruff, both executed green | SKIPPED (none declared) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| DB-01 | 01-01 | SQLite lazy init + full schema + seed ($10k, 10 tickers) | ✓ SATISFIED | `database.py`; direct fresh-seed check; `test_startup_seeds_database` |
| DB-02 | 01-01 | FastAPI entry wiring source/cache/SSE/routers with lifespan | ✓ SATISFIED | `main.py` lifespan + mounts; `test_price_cache_contains_aapl_after_startup` |
| DB-03 | 01-01 | GET /api/health healthy | ✓ SATISFIED | `main.py`; `test_health_returns_healthy` |
| PORT-01 | 01-01 | GET /api/portfolio positions/cash/total/P&L | ✓ SATISFIED | service+router; portfolio tests passed |
| PORT-02 | 01-02 | POST /api/portfolio/trade market buy (cash validation) | ✓ SATISFIED | `execute_trade` buy path; trade tests passed |
| PORT-03 | 01-02 | POST /api/portfolio/trade market sell (shares validation, avg-cost update) | ✓ SATISFIED | `execute_trade` sell path; trade tests passed |
| PORT-04 | 01-02 | GET /api/portfolio/history snapshots (30s + post-trade) | ✓ SATISFIED | `snapshots.py` + `get_history`; history tests passed |
| WATCH-01 | 01-01 | GET /api/watchlist tickers with latest prices | ✓ SATISFIED | `get_watchlist`; watchlist tests passed |
| WATCH-02 | 01-03 | POST /api/watchlist adds ticker | ✓ SATISFIED | `add_ticker`; mutation tests passed |
| WATCH-03 | 01-03 | DELETE /api/watchlist/{ticker} removes ticker | ✓ SATISFIED | `remove_ticker`; mutation tests passed |

No orphaned requirements: all Phase 1 requirement IDs appear in plan frontmatter, all satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | — | — | No TBD/FIXME/XXX/placeholder markers, empty-stub returns, or console.log-only implementations in any Phase 1 file (grep + read verified). The single `return {}` match in `app/market/simulator.py` is pre-existing market-subsystem code (out of phase scope) returning an empty ticker-state dict legitimately. |

### Human Verification Required

None. Every behavior-dependent truth (trade state transitions, snapshot cadence/cancellation, SSE streaming, watchlist↔source↔cache sync) is exercised by a passing test that was actually run in this verification — no ⚠️ PRESENT_BEHAVIOR_UNVERIFIED items. Backend API work has no visual/UX surface requiring human judgment.

### Gaps Summary

No gaps found. All 5 ROADMAP success criteria, all 16 must-have truths, all 10 artifacts, and all 7 key links verified against the live codebase. The full suite (115 tests) and ruff pass. One documented, non-blocking deviation: `PriceCache` is constructed at module level in `main.py` rather than inside the lifespan (01-01-SUMMARY key decision — required for `create_stream_router(cache)` to mount at import time); the observable contract (single cache, `app.state.price_cache` populated, source started on seed tickers, DB seeded) holds and is test-proven.

---

_Verified: 2026-08-26T00:00:00Z_
_Verifier: the agent (gsd-verifier)_
