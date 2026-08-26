---
gsd_state_version: 1.0
current_phase: 02
current_phase_name: AI Chat Assistant
status: executing
stopped_at: Completed 02-02-PLAN.md
last_updated: "2026-08-26T22:01:17.894Z"
last_activity: 2026-08-26
last_activity_desc: Phase 02 execution started
state_head: 171efae40173ba318e8f2b09a6212ff1af20fb6a
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 6
  completed_plans: 5
  percent: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-25)

**Core value:** A user runs one Docker command and immediately gets a working Bloomberg-style trading terminal — streaming prices, instant simulated trades, portfolio analytics, and an AI copilot that trades on their behalf.
**Current focus:** Phase 02 — AI Chat Assistant

## Current Position

Phase: 02 (AI Chat Assistant) — EXECUTING
Plan: 3 of 3
Status: Ready to execute
Last activity: 2026-08-26 — Phase 02 execution started

Progress: [███░░░░░░░] 25%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: - min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

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

Last session: 2026-08-26T22:00:27.733Z
Stopped at: Completed 02-02-PLAN.md
Resume file: None
