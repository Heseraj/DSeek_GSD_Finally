# Codebase Concerns

**Analysis Date:** 2026-08-25

> Scope: full repo. This is a brownfield repo where only the `backend/app/market/` subsystem (FastAPI/uv market-data) is implemented, complete, and code-reviewed. The rest of the application (portfolio, watchlist, chat/LLM, database layer, frontend, Docker, E2E tests) is **not yet implemented** and is flagged under "Missing Critical Features" below. Findings in the market-data subsystem are traced back to `planning/archive/MARKET_DATA_REVIEW.md`.

---

## Tech Debt

**`PriceCache.version` property reads `_version` without the lock:**
- Issue: `backend/app/market/cache.py:64-67` returns `self._version` directly, while every other method acquires `self._lock`. This was flagged in `MARKET_DATA_REVIEW.md` §3.4 and was **not** among the seven fixes applied.
- Files: `backend/app/market/cache.py`
- Impact: Correct on CPython today (single-int reads are atomic under the GIL), but becomes a race on no-GIL Python builds (PEP 703 / 3.13t+). Inconsistent with the rest of the class.
- Fix approach: Acquire `self._lock` inside the property, or use an `int` counter that is only written under lock and accept the benign read race with a comment.

**Module-level `router` in `stream.py` is a latent double-registration footgun:**
- Issue: `backend/app/market/stream.py:17` defines a module-level `APIRouter`, and `create_stream_router()` registers the `/prices` route on it via a closure. Calling `create_stream_router()` twice (e.g., two app instances, or re-running startup in tests) registers the same route twice on the same router.
- Files: `backend/app/market/stream.py`
- Impact: Duplicate route registration errors or duplicated SSE handlers if the factory is ever invoked more than once per process. No effect today because it is called once at startup.
- Fix approach: Create a fresh `APIRouter()` inside `create_stream_router()` instead of reusing a module-level singleton.

**Broad exception swallowing in the Massive poller hides outage conditions:**
- Issue: `backend/app/market/massive_client.py:118-121` catches `Exception` and only logs. A bad API key (401) or persistent rate-limit (429) results in the app silently serving stale/last-known prices with no user-visible or health-check signal.
- Files: `backend/app/market/massive_client.py`
- Impact: With `MASSIVE_API_KEY` set but invalid, the terminal shows frozen prices and the user has no idea real data is unavailable.
- Fix approach: Distinguish auth/rate-limit errors (401/429) from transient network errors; surface a degraded status (e.g., expose source health on `/api/health` or emit a cache "stale" flag).

**Untyped return on `_fetch_snapshots`:**
- Issue: `backend/app/market/massive_client.py:123` declares `-> list` with no element type.
- Files: `backend/app/market/massive_client.py`
- Impact: Weak type contract; the downstream loop assumes `snap.ticker` / `snap.last_trade.price` exist and relies on per-item `try/except` to stay safe.
- Fix approach: Type as the Massive snapshot model (e.g., `list[SnapshotTicker]`) once available; keep the defensive per-item guard.

**Documentation drift between backend setup commands:**
- Issue: `backend/README.md:25` says `uv sync --dev`, while `backend/CLAUDE.md:7` says `uv sync --extra dev`. The optional-dependency group is named `dev` in `backend/pyproject.toml:16`, so `--extra dev` is the correct invocation (`--dev` is the legacy flag).
- Files: `backend/README.md`, `backend/CLAUDE.md`
- Impact: Copy-paste setup failures for new contributors.
- Fix approach: Standardize on `uv sync --extra dev` and align both docs.

**Demo script duplicates the default ticker list:**
- Issue: `backend/market_data_demo.py:30` hardcodes `TICKERS = ["AAPL", ... "NFLX"]`, duplicating the keys of `SEED_PRICES` in `backend/app/market/seed_prices.py` and the default watchlist in `planning/PLAN.md` §7.
- Files: `backend/market_data_demo.py`, `backend/app/market/seed_prices.py`
- Impact: Adding a default ticker in one place silently diverges from the others. No test asserts the demo list matches the seed list.
- Fix approach: Derive `TICKERS` from `SEED_PRICES` (or a shared constant) and add a test asserting parity.

---

## Known Bugs

No logic bugs are known in the reviewed market-data subsystem — all seven code-review issues (`MARKET_DATA_REVIEW.md` §3) were resolved per `planning/MARKET_DATA_SUMMARY.md` ("all issues resolved"). Two latent issues remain:

**Latent — duplicate SSE route registration (see Tech Debt above):**
- Symptoms: `create_stream_router()` called twice raises a duplicate-route error or serves duplicate handlers.
- Files: `backend/app/market/stream.py:17,48`
- Trigger: Any second invocation of `create_stream_router(price_cache)` in one process (tests, hot reload, multiple app instances).
- Workaround: Ensure the factory is called exactly once per process.

**Latent — `PriceCache.version` read race (see Tech Debt above):**
- Symptoms: A stale version read under no-GIL Python, causing a missed SSE change-detection tick.
- Files: `backend/app/market/cache.py:64-67`
- Trigger: Free-threaded Python 3.13t+ with concurrent writers.
- Workaround: Not applicable on CPython (GIL-protected); fix before any free-threading migration.

**Latent — timestamp precision assumption in Massive client:**
- Symptoms: `backend/app/market/massive_client.py:103` assumes `snap.last_trade.timestamp` is Unix **milliseconds** and divides by `1000.0`. If the Massive API ever returns seconds, timestamps become wildly wrong (~1970).
- Files: `backend/app/market/massive_client.py`
- Trigger: API response format change or a ticker whose snapshot lacks a timestamp (guarded per-item, but a wrong-but-present value passes the guard).
- Workaround: None — the conversion is unconditional; covered only by the mocked `test_timestamp_conversion` in `backend/tests/market/test_massive.py:86`.

---

## Security Considerations

**Unconfirmed LLM auto-execution (future chat feature):**
- Risk: Per `planning/PLAN.md` §9, LLM-specified trades/watchlist changes auto-execute with no confirmation dialog. The safety rests entirely on structured-output parsing and on re-validating each trade (cash/shares) before execution. If the parser accepts a malformed-but-shaped payload, bad trades execute.
- Files: Not yet implemented (chat endpoint absent). Contract in `planning/PLAN.md` §9.
- Current mitigation: Design calls for the same validation as manual trades (`planning/PLAN.md` §9 "Auto-Execution"); deterministic `LLM_MOCK=true` mode for tests.
- Recommendations: Enforce a strict schema (Pydantic model with required/optional fields and quantity > 0), treat any parse failure as a no-op with an error message, and never partially execute a batch that failed to fully parse.

**Missing `.env.example` (onboarding + secret hygiene gap):**
- Risk: `README.md:30` instructs `cp .env.example .env`, but no `.env.example` exists anywhere in the repo. `planning/PLAN.md` §9 states there is an `OPENROUTER_API_KEY` in `.env` at the project root, but no `.env` (or example) is committed. Developers may invent their own `.env` shape, or worse, commit a real `.env`.
- Files: `README.md:30`, `planning/PLAN.md:286`; `.env.example` absent.
- Current mitigation: `.gitignore:138` ignores `.env`/`.envrc`/`.venv`.
- Recommendations: Commit a `.env.example` with `OPENROUTER_API_KEY=`, `MASSIVE_API_KEY=`, `LLM_MOCK=false` placeholders and comments, matching `planning/PLAN.md` §5.

**API-key handling in logs:**
- Risk: `backend/app/market/massive_client.py:119` logs `logger.error("Massive poll failed: %s", e)`. If the Massive client's exception ever includes the request URL or query string containing the key, it would be written to logs.
- Files: `backend/app/market/massive_client.py`
- Current mitigation: Massive auth uses a `Bearer` header (per `planning/archive/MASSIVE_API.md`), not a query parameter, so the key is unlikely to appear in exception text. Low risk.
- Recommendations: Log exception class + a sanitized message rather than the raw exception; never log `self._api_key`.

**No authentication on the application (deliberate, but a future risk):**
- Risk: The design is single-user with no login (`planning/PLAN.md` §2 "No login, no signup"). Portfolio, trade, and chat endpoints will be unauthenticated. This is fine for a local single-container demo, but `planning/PLAN.md` §11 mentions optional cloud deployment (App Runner/Render) as a stretch goal — if exposed publicly, anyone could read/modify the portfolio and chat.
- Files: N/A (endpoints not yet implemented).
- Current mitigation: None (by design).
- Recommendations: If cloud deployment is ever pursued, add an auth gate or reverse-proxy restriction before exposing trade/chat endpoints.

**SSE endpoint has no connection limits:**
- Risk: `backend/app/market/stream.py:26-46` accepts unlimited long-lived SSE connections, each looping until disconnect. Public exposure could exhaust connection slots.
- Files: `backend/app/market/stream.py`
- Current mitigation: Single-user local use only.
- Recommendations: Add a connection cap or rely on the reverse proxy for limits if deployed publicly.

---

## Performance Bottlenecks

**SSE sends a full snapshot on every version change:**
- Problem: `backend/app/market/stream.py:81-83` serializes **all** tracked tickers into one `data:` event whenever the cache version changes (i.e., ~every 500ms). The version gate avoids sending when nothing changed, but when anything changes the whole set is re-serialized.
- Files: `backend/app/market/stream.py`
- Cause: Design trades simplicity for completeness; fine at the default 10 tickers.
- Improvement path: If the watchlist grows, emit only changed tickers (diff against `last_version` per-ticker) or raise the interval.

**Cholesky rebuild is O(n²) on every add/remove:**
- Problem: `backend/app/market/simulator.py:154-172` rebuilds the full correlation matrix and its Cholesky decomposition whenever a ticker is added or removed.
- Files: `backend/app/market/simulator.py`
- Cause: Correctness/simplicity; explicitly bounded by the docstring comment "n < 50".
- Improvement path: Only a concern if the watchlist exceeds hundreds of tickers; then switch to incremental correlation updates or batch rebuilds.

**Massive poller spawns a thread per poll:**
- Problem: `backend/app/market/massive_client.py:97` uses `asyncio.to_thread` for each synchronous API call. At the free-tier 15s interval this is negligible, but there is no reuse strategy beyond the default executor.
- Files: `backend/app/market/massive_client.py`
- Cause: The Massive `RESTClient` is synchronous; `to_thread` is the correct escape hatch.
- Improvement path: Not needed at current scale; if polling frequency increases, use a persistent executor.

**Unbounded growth of future SQLite tables (design concern):**
- Problem: `portfolio_snapshots` are recorded every 30s per `planning/PLAN.md` §7 — ~2,880 rows/day, ~1M/year — plus an append-only `trades` log and `chat_messages` history. No retention/compaction is specified.
- Files: Not yet implemented; schema contract in `planning/PLAN.md` §7.
- Cause: No retention policy defined.
- Improvement path: Add snapshot compaction (e.g., downsampling old snapshots) and consider trade/chat pruning once the DB layer is built.

---

## Fragile Areas

**`backend/app/market/stream.py` — module-level router + closure:**
- Files: `backend/app/market/stream.py`
- Why fragile: Couples route registration to a module-level singleton; the route closure captures `price_cache` invisibly. Hard to test in isolation and unsafe to call twice.
- Safe modification: Refactor to construct the `APIRouter` inside the factory; add an ASGI integration test using an in-process `httpx.AsyncClient`.
- Test coverage: ~31% — no dedicated SSE tests exist (`MARKET_DATA_REVIEW.md` §4.2).

**`backend/app/market/massive_client.py` — external API dependency, mocked-only tests:**
- Files: `backend/app/market/massive_client.py`
- Why fragile: 56% coverage, all via mocks; the real `massive` package and API format are never exercised. Timestamp ms→s assumption and snapshot field access (`snap.last_trade.price`) depend on the external SDK's shape.
- Safe modification: Keep the per-item `try/except (AttributeError, TypeError)` guard; add a recorded-fixture test against a real API response if a key is available.
- Test coverage: 56% (`MARKET_DATA_REVIEW.md` §1).

**`backend/app/market/factory.py` — env read with no config layer:**
- Files: `backend/app/market/factory.py`
- Why fragile: Reads `MASSIVE_API_KEY` from `os.environ` directly. `planning/PLAN.md` §5 says the backend reads `.env` from the project root, but **no `.env` loading code exists** (no `python-dotenv`/`pydantic-settings` dependency in `backend/pyproject.toml`). Running `uv run` locally will not pick up a root `.env` file.
- Safe modification: Introduce a single config/settings module (e.g., `pydantic-settings`) that loads `.env` and exposes typed settings; have `factory.py` consume it.
- Test coverage: 100% of the factory, but only the env-var branch logic, not `.env` file loading.

**`backend/app/market/seed_prices.py` — single source of truth with duplicated consumers:**
- Files: `backend/app/market/seed_prices.py`, `backend/market_data_demo.py`
- Why fragile: Ticker/parameter constants are split across this module and the demo's hardcoded `TICKERS` list; `planning/PLAN.md` §7 duplicates the default watchlist a third time.
- Safe modification: Add a parity test between `SEED_PRICES` keys and the demo `TICKERS`; consider a single `DEFAULT_TICKERS` constant.
- Test coverage: 100% of the constants module, but no cross-file parity test.

---

## Scaling Limits

**Single process, in-memory state:**
- Current capacity: One FastAPI process, one in-memory `PriceCache` (`backend/app/market/cache.py`), one SQLite file.
- Limit: `PriceCache` and the background simulator/poller live in a single process. Running multiple replicas would produce independent, divergent price state with no shared cache. The SSE/trade/portfolio consumers all assume a single cache instance.
- Scaling path: The DB schema already includes `user_id` defaulting to `"default"` (`planning/PLAN.md` §7) for future multi-user; for multi-process, move the price cache to a shared store (Redis) or designate a single "producer" replica.

**Massive free-tier rate limit:**
- Current capacity: 5 requests/minute (`planning/archive/MASSIVE_API.md`). Default 15s poll = 4 req/min — already at 80% of the free-tier budget.
- Limit: Any added endpoint (detail view, historical bars) or faster polling exceeds the free tier and triggers 429s (currently swallowed silently — see Tech Debt).
- Scaling path: Keep the single-snapshot-for-all-tickers pattern; require a paid key for faster polling or additional endpoints.

---

## Dependencies at Risk

**`massive>=1.0.0` (formerly Polygon.io):**
- Risk: Renamed/rebranded SDK with an unbounded upper version. It is now a **core dependency** — lazy imports were deliberately removed (`planning/MARKET_DATA_SUMMARY.md` fix #2), so even simulator-only users must have `massive` installed. `backend/app/market/massive_client.py:8-9` and `backend/app/market/factory.py:10` import it at module load.
- Impact: A breaking change in the `massive` package would break `app.market` imports for **all** users, not just those with `MASSIVE_API_KEY`.
- Migration plan: Pin `massive` to a known-good minor, or reintroduce optional/lazy import so the simulator path does not require it. Verify against `planning/archive/MASSIVE_API.md` if the API surface changes.

**No upper bounds on any runtime dependency:**
- Risk: `backend/pyproject.toml:7-13` pins lower bounds only (`fastapi>=0.115.0`, `uvicorn[standard]>=0.32.0`, `numpy>=2.0.0`, `massive>=1.0.0`, `rich>=13.0.0`).
- Impact: Relies entirely on the committed `backend/uv.lock` for reproducibility. A fresh resolve without the lock could pull incompatible majors (notably `numpy` 2.x has breaking changes vs 1.x).
- Migration plan: Keep `uv.lock` committed and use `uv sync` (which respects it); consider upper-bound pins on `numpy`.

**Python `>=3.12` with no upper bound:**
- Risk: `backend/pyproject.toml:6`. The Docker plan targets Python 3.12 slim (`planning/PLAN.md` §11), but the metadata allows 3.13+.
- Impact: Future 3.13/3.14 releases could introduce incompatibilities before they are tested.
- Migration plan: Align the metadata to the tested version (e.g., `>=3.12,<3.14`) once CI matrix is defined.

---

## Missing Critical Features

The following components are defined in `planning/PLAN.md` but **not present** in the repo. Only `backend/app/market/` and its tests exist today.

**FastAPI application entry point — MISSING:**
- Problem: There is no `backend/app/main.py` (or any `FastAPI()` instance). `backend/app/` contains only `__init__.py` and the `market/` package. No lifespan wiring instantiates `PriceCache` + `create_market_data_source`, no routes are mounted (market SSE router is never attached), and no static-file serving exists.
- Blocks: Running the server at all; all other API endpoints.
- Expected location: `backend/app/main.py` (per `planning/PLAN.md` §4 "backend owns all server logic").

**Database layer — MISSING:**
- Problem: No `backend/db/` directory, no schema SQL, no seed data, no lazy-initialization logic. The six tables (`users_profile`, `watchlist`, `positions`, `trades`, `portfolio_snapshots`, `chat_messages`) and default seed (user `"default"` with $10,000, ten tickers) are specified in `planning/PLAN.md` §7 but not implemented.
- Blocks: Portfolio, watchlist, chat history, and P&L chart persistence.
- Expected location: `backend/db/` with schema/seed modules.

**Portfolio API — MISSING:**
- Problem: No `GET /api/portfolio`, `POST /api/portfolio/trade`, or `GET /api/portfolio/history` endpoints. Trade execution, P&L math, and insufficient-cash/insufficient-shares validation are unimplemented.
- Blocks: Buying/selling, positions table, portfolio heatmap, P&L chart.
- Spec: `planning/PLAN.md` §8 "Portfolio".

**Watchlist API — MISSING:**
- Problem: No `GET /api/watchlist`, `POST /api/watchlist`, or `DELETE /api/watchlist/{ticker}` endpoints, and no persistence of watchlist rows.
- Blocks: Adding/removing tickers manually or via chat.
- Spec: `planning/PLAN.md` §8 "Watchlist".

**Chat / LLM integration — MISSING:**
- Problem: No `POST /api/chat` endpoint and no LiteLLM → OpenRouter (Cerebras) integration. Structured-output parsing, portfolio-context prompt construction, conversation history loading, and auto-execution are all unimplemented. Note the `cerebras-inference` skill and `OPENROUTER_API_KEY` are referenced in `planning/PLAN.md` §9 but no code consumes them.
- Blocks: AI copilot; the headline feature.
- Spec: `planning/PLAN.md` §9; use the `cerebras-inference` skill for the LiteLLM/OpenRouter calls.

**Health endpoint — MISSING:**
- Problem: No `GET /api/health` for Docker/deployment readiness.
- Blocks: Docker healthchecks and container orchestration.
- Spec: `planning/PLAN.md` §8 "System".

**Frontend — MISSING:**
- Problem: No `frontend/` directory. The entire Next.js (TypeScript, static export, Tailwind) UI — watchlist grid, main chart, portfolio heatmap, P&L chart, positions table, trade bar, AI chat panel, header with connection status — is unimplemented.
- Blocks: The user-visible product.
- Spec: `planning/PLAN.md` §10.

**E2E tests — MISSING:**
- Problem: No `test/` directory, no Playwright tests, no `docker-compose.test.yml`. The seven key scenarios in `planning/PLAN.md` §12 (fresh start, add/remove ticker, buy/sell, visualizations, mocked chat, SSE reconnection) are untested.
- Blocks: End-to-end regression confidence.
- Spec: `planning/PLAN.md` §12 "E2E Tests".

**Docker & deployment — MISSING:**
- Problem: No `Dockerfile` (multi-stage Node→Python), no `docker-compose.yml`, no `db/` volume-mount target with `.gitkeep`, no `scripts/start_*.sh`/`stop_*.sh`/`start_windows.ps1`/`stop_windows.ps1`. The single-container run command in `README.md:34-35` cannot work yet.
- Blocks: Running the app the intended way (`docker run ... --env-file .env`).
- Spec: `planning/PLAN.md` §11.

**`.env.example` — MISSING:**
- Problem: Referenced by `README.md:30` but absent (see Security Considerations). Also blocks documented onboarding.
- Blocks: Reliable environment setup and secret hygiene.

---

## Test Coverage Gaps

**SSE streaming — untested:**
- What's not tested: `backend/app/market/stream.py` (`_generate_events` and the route) has ~31% coverage with no dedicated tests. No test exercises an SSE connection end-to-end via an ASGI client.
- Files: `backend/app/market/stream.py`
- Risk: The primary consumer of `PriceCache` (and the main client-facing data path) can regress silently — disconnect handling, version gating, and payload formatting are unverified.
- Priority: High (it is the only path between the market data and the frontend).

**Massive client — real API path untested:**
- What's not tested: `backend/app/market/massive_client.py` at 56% coverage; all tests mock `_fetch_snapshots`/`RESTClient`. Real response parsing, the ms→s timestamp conversion against live data, and 401/429/5xx behavior are unverified.
- Files: `backend/app/market/massive_client.py`, `backend/tests/market/test_massive.py`
- Risk: API/schema drift breaks the integration undetected; the silent-failure path (bad key → frozen prices) is unexercised.
- Priority: Medium (only active when `MASSIVE_API_KEY` is set).

**PriceCache thread-safety — untested:**
- What's not tested: No concurrency test writes to `PriceCache` from multiple threads simultaneously (`MARKET_DATA_REVIEW.md` §4.2).
- Files: `backend/app/market/cache.py`, `backend/tests/market/test_cache.py`
- Risk: Lock correctness is only verified by inspection.
- Priority: Low-Medium.

**GBMSimulator full default watchlist — untested:**
- What's not tested: No test runs the simulator with all 10 default tickers to verify the 10×10 Cholesky decomposition succeeds and stays positive-definite.
- Files: `backend/app/market/simulator.py`, `backend/tests/market/test_simulator.py`
- Risk: A correlation-matrix edge case for the full default set is uncaught (tests use 1-2 tickers).
- Priority: Low.

**All non-market subsystems — 0% coverage:**
- What's not tested: Portfolio math, trade validation, watchlist CRUD, LLM structured-output parsing, DB schema/seed, and API route status codes have no tests because they are not implemented (see Missing Critical Features).
- Files: N/A (not yet built).
- Risk: The bulk of the application has no safety net.
- Priority: High — build tests alongside each subsystem as it is implemented.

---

*Concerns audit: 2026-08-25*
