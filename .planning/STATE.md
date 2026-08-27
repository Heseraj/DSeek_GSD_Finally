---
gsd_state_version: 1.0
current_phase: 4
current_phase_name: Deployment & E2E
status: executing
stopped_at: Completed 04-03-PLAN.md
last_updated: "2026-08-27T05:55:52.385Z"
last_activity: 2026-08-26
last_activity_desc: Phase 4 execution started
state_head: 433029a635aa96689da32e1db7143be39e303dd0
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 17
  completed_plans: 16
  percent: 75
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-25)

**Core value:** A user runs one Docker command and immediately gets a working Bloomberg-style trading terminal — streaming prices, instant simulated trades, portfolio analytics, and an AI copilot that trades on their behalf.
**Current focus:** Phase 4 — Deployment & E2E

## Current Position

Phase: 4 (Deployment & E2E) — EXECUTING
Plan: 4 of 4
Status: Ready to execute
Last activity: 2026-08-26 — Phase 4 execution started

Progress: [████████░░] 75%

## Performance Metrics

**Velocity:**

- Total plans completed: 10
- Average duration: - min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 02 | 3 | - | - |
| 3 | 7 | - | - |

**Recent Trend:**

- Last 5 plans: none
- Trend: -

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 47 | 3 tasks | 16 files |
| Phase 01-backend-foundation P02 | 10 | 3 tasks | 7 files |
| Phase 01 P01-03 | 14 | 2 tasks | 4 files |
| Phase 02 P01 | 9 | 3 tasks | 8 files |
| Phase 02 P02-02 | 24 | 2 tasks | 7 files |
| Phase 02 P03 | 8 | 2 tasks | 4 files |
| Phase 03 P01 | 50 | 3 tasks | 27 files |
| Phase 03 P02 | 16 | 2 tasks | 8 files |
| Phase 03-frontend-trading-terminal P04 | 9 | 3 tasks | 6 files |
| Phase 03 P05 | 10 | 3 tasks | 6 files |
| Phase 03-frontend-trading-terminal P03 | 11 | 2 tasks | 6 files |
| Phase 03-frontend-trading-terminal P06 | 6 | 2 tasks | 5 files |
| Phase 4 P04-01 | 20 | 3 tasks | 8 files |
| Phase 04-02 P04-02 | 10 | 2 tasks | 4 files |
| Phase 04 P04-03 | 15 | 2 tasks | 8 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Phase 1 (roadmap): Database + portfolio + watchlist APIs grouped into one backend-foundation phase; market data wiring rides along
- Phase 2 (roadmap): LLM chat assistant isolated from the frontend so the UI can be built against the full REST surface
- Phase 4 (roadmap): Docker packaging and E2E tests combined (E2E requires Docker to run)
- [Phase 01]: PriceCache constructed at module level in main.py so the SSE router mounts at import time; lifespan owns source creation + init_db; single-cache invariant preserved
- [Phase 01]: SSE smoke test uses real uvicorn + httpx network transport because httpx ASGITransport buffers full response bodies and TestClient cannot consume infinite SSE streams
- [Phase 01]: Pydantic structural violations keep FastAPI's standard 422; only domain validation failures map to the plan's codes - unknown ticker/missing price -> 404, insufficient cash/shares -> 400 (matches threat T-02-01)
- [Phase 01]: Custom TradeError exception hierarchy in portfolio service.py (UnknownTickerError/InsufficientCashError/InsufficientSharesError) so routers map domain errors to 404/400 - deliberate extension of the no-custom-exceptions convention
- [Phase 01]: record_snapshot mirrors get_portfolio valuation math inline (avoids circular import); test_history pins snapshot == live portfolio value so history cannot drift
- [Phase 01]: HTTP trade tests use non-simulated tickers (IBM/ORCL/INTC) primed in the cache so the live simulator cannot race the fill price
- [Phase 01]: Duplicate watchlist add returns 409 Conflict: add_ticker returns (ticker, created=False) on UNIQUE(user_id,ticker) violation; no duplicate row written and market source untouched (already tracking)
- [Phase 01]: remove_ticker deletes first and calls market_source.remove_ticker only when a row was actually deleted; unknown-ticker deletes return 404 leaving source and price cache untouched
- [Phase 01]: WatchlistAddRequest uses StringConstraints(strip_whitespace=True, min_length=1, max_length=12) so whitespace-only bodies are rejected with 422 (threat T-03-01); min_length alone would accept a single space
- [Phase 02]: Floor-pin litellm>=1.98.0 and python-dotenv>=1.0 exactly as planned; uv.lock committed for reproducibility (LiteLLM ships daily)
- [Phase 02]: Relaxed dev httpx pin to >=0.27.0,<1.0: litellm>=1.98.0 requires httpx>=0.28.0,<1.0; SSE smoke test uses real uvicorn transport, so the old <0.28 ASGITransport guard is moot
- [Phase 02]: POST /api/chat mock-mode tracer: litellm imported at module level in chat/service.py (# noqa: F401) as the 02-03 live-branch dependency; live branch raises NotImplementedError until 02-03 Task 1
- [Phase 02]: test_execution.py drives proposals through the mock_llm_proposal factory fixture (setenv LLM_MOCK + patch app.chat.service._mock_response) so all nine scenarios exercise the real parse -> TradeRequest/execute_trade -> add_ticker/remove_ticker pipeline
- [Phase 02]: Live LiteLLM branch encoded per spec §9 verbatim (cerebras-inference skill absent locally): model openrouter/openai/gpt-oss-120b, response_format json_schema from ChatProposal.model_json_schema() (strict) with json_object fallback, extra_body Cerebras pinning allow_fallbacks False, force_timeout=60 — RESEARCH finding 3 / A6 — the skill does not exist locally; the §9 pattern is fully encoded in research and now in code
- [Phase 02]: Locked error contract (RESEARCH A5/Open Question 3): any ChatResponse with top-level error returns HTTP 503 with the ChatResponse body, never 500; per-action trade/watchlist failures keep HTTP 200 — Planner-locked contract the Phase 3 frontend renders without special-casing; rated costly, flagged not gated
- [Phase 03]: [Phase 03-01] Store lives at frontend/store/useStore.ts per PLAN.md files_modified (authoritative over the PATTERNS sketch path); tests and later plans import from there — PLAN.md files_modified list is the executed contract; 03-PATTERNS.md's lib/useStore.ts is a structural sketch
- [Phase 03]: [Phase 03-01] npm 11 project-scoped allowScripts policy handled in-repo via frontend/package.json allowScripts (next: true); no machine-level npm config changes — Keeps the repo self-contained and reproducible on any machine with npm 11
- [Phase 03]: [Phase 03-01] Root .gitignore lib/ pattern anchored to /lib/ (pip virtualenv ignore no longer swallows frontend/lib/) — frontend/lib contract types must be tracked; root lib/ does not exist
- [Phase 03]: Tracer gate run autonomously: plan carries no checkpoint tasks and orchestrator directed full-plan execution; tracer verify re-ran end-to-end before Task 2 - passed — Phase tracer is the architectural dead-end detector; its verify passing cleared expansion
- [Phase 03]: XSS guard asserted element-level (no img/script elements, no [onerror] attributes) instead of innerHTML substrings — React serializes attribute VALUES raw in innerHTML, but browsers never parse attribute values as markup; element-level queries are the true security property
- [Phase 03]: RTL cleanup registered centrally in tests/setup.ts (afterEach(cleanup)) — vitest globals are off so RTL auto-cleanup never fired; leaked mounted components stayed subscribed to the shared store and re-rendered on later tests' setState
- [Phase 03]: header-slot wrapper div retained in page.tsx across the Task 1 placeholder -> Task 2 <Header /> swap — keeps the shell's five data-testid slots stable for TerminalApp assertions
- [Phase 3]: Heatmap content prop typed as recharts' exported TreemapContentType; HeatmapCell consumes Partial<TreemapNode> + maxAbsPnl (Recharts delivers nodeProps via cloneElement)
- [Phase 3]: PnlChart XAxis tickFormatter renders HH:MM in UTC - deterministic test assertions regardless of machine timezone
- [Phase 3]: Recharts-in-jsdom: stub ResizeObserver with a synchronous fixed-size fire (640x192) per chart test file - ResponsiveContainer renders only once width/height are positive
- [Phase 3]: PnlChart fetch errors keep the last data; the 30s poll self-heals (no error UI)
- [Phase 03]: TradeBar ticker pre-fill uses the React 'adjust state during render' pattern (track prevSelected, initialize state from selectedTicker) instead of a useEffect - the next 16 / react 19 react-hooks/set-state-in-effect lint rule rejects setState in effects; the mount pre-fill survives because state initializes from the store value — TradeBar ticker pre-fill uses the React 'adjust state during render' pattern (track prevSelected, initialize state from selectedTicker) instead of a useEffect - the next 16 / react 19 react-hooks/set-state-in-effect lint rule rejects setState in effects; the mount pre-fill survives because state initializes from the store value
- [Phase 03]: ChatPanel refetches portfolio+watchlist with .catch(() => {}) so a refetch failure after a successful chat response cannot mislabel the turn as a network-error banner — ChatPanel refetches portfolio+watchlist with .catch(() => {}) so a refetch failure after a successful chat response cannot mislabel the turn as a network-error banner
- [Phase 03]: Confirmations render only from the structured trades/watchlist_changes fields (never from message text); LLM message/error render as React text children - T-03-01 mitigated (XSS test asserts zero parsed elements) — Confirmations render only from the structured trades/watchlist_changes fields (never from message text); LLM message/error render as React text children - T-03-01 mitigated (XSS test asserts zero parsed elements)
- [Phase 03]: WatchlistPanel DELETE uses a raw fetch with a res.status check before ANY body read - apiFetch's unconditional res.json() rejects on the backend's 204 empty body (03-PATTERNS.md:143); the 204 branch never touches the body — WatchlistPanel DELETE uses a raw fetch with a res.status check before ANY body read - apiFetch's unconditional res.json() rejects on the backend's 204 empty body (03-PATTERNS.md:143); the 204 branch never touches the body
- [Phase 03]: MainChart subscribes three per-slice selectors (selectedTicker + its history + its latest PriceUpdate) — update() needs Math.floor(timestamp), and the PriceUpdate frame is its only carrier; per-slice isolation preserved — 03-03 Task 1 — the plan prose named two selectors, but the streaming boundary requires the frame timestamp
- [Phase 03]: Sparkline data prop optional (default []) so useStore(s => s.histories[ticker])'s stable undefined never fabricates a new [] per render at 20Hz — 03-03 Task 2 — zustand selector churn (Pitfall 6)
- [Phase 3]: Remove wiring lives in TickerRow (the UI-06 single delivery point): WatchlistPanel renders the real TickerRow per entry and each row owns its DELETE via raw fetch with res.status checked before any body read; 204 and 404 both prune locally (pruneTicker) + refetchWatchlist; stopPropagation so remove never triggers row click-to-select — 03-06-PLAN Task 1 names TickerRow as the delivery point; apiFetch's unconditional res.json() rejects on the backend's 204 empty body (03-PATTERNS.md:143)
- [Phase 4]: FINALLY_DB_PATH env read (default db/finally.db) converts the volume mount from WORKDIR coincidence into an explicit, testable contract (RESEARCH A4); app.frontend() with check_dir=False keeps backend pytest importable without a frontend build
- [Phase 04-02]: Build-if-missing guard (docker image inspect finally:latest >/dev/null 2>&1 || docker build) in both start scripts - a second run skips the build
- [Phase 04-02]: Health-gated URL echo in BOTH script pairs: URL prints only after /api/health responds; PowerShell exits 1 when the 30x2s poll is exhausted (mirrors sh set -e fail-fast)
- [Phase 04-02]: No --rm and no --workers anywhere: named container is the stop model; single-process invariant preserved
- [Phase 04-02]: Conditional --env-file .env only when the file exists - keys reach the container at runtime, never baked (T-04-01)
- [Phase 04]: Playwright service sits behind profiles: [e2e] so bare docker compose up never auto-runs the suite; run-e2e invokes it explicitly via run --rm playwright (BLOCKER FIX per plan) — Without a profile, docker compose up starts the playwright container whose command auto-runs the suite and mutates finally-test-data before the explicit invocation
- [Phase 04]: Bare docker compose build skips profile-guarded services by design; the playwright image requires --profile e2e build (or is auto-built by docker compose run when missing) — Compose profiles filter multi-service commands; run-e2e's run --rm playwright auto-build path was empirically verified (image removed, rebuilt from cached MCR base)
- [Phase 04]: test/.gitignore added (Rule 2) - root .gitignore is Python-oriented with no node_modules pattern; dry-run git add test/ staged ~300 node_modules files — Repo convention is per-package .gitignore (frontend/.gitignore); node_modules must not be committed - npm ci from lockfile is the reproducibility mechanism

### Pending Todos

None yet.

### Blockers/Concerns

- `OPENROUTER_API_KEY` is required for live chat; `LLM_MOCK=true` covers testing without it
- ~~`stream.py` module-global router re-decoration~~ — **resolved in 01-01**: `create_stream_router()` now builds a fresh `APIRouter` per call

## Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| Deployment | Cloud deploy (App Runner/Render) + Terraform | deferred | 2026-08-25 | v1 |
| Chat | Token-by-token streaming responses | deferred | 2026-08-25 | v1 |

## Session Continuity

Last session: 2026-08-27T05:55:40.475Z
Stopped at: Completed 04-03-PLAN.md
Resume file: None
