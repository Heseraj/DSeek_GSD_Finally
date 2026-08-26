---
phase: 02-ai-chat-assistant
plan: 02
subsystem: api
tags: [fastapi, pydantic, chat, mock, litellm, sqlite, auto-execution]

# Dependency graph
requires:
  - phase: 02-ai-chat-assistant
    provides: CHAT-01 envelope (schemas.py) + SYSTEM_PROMPT/build_context (prompts.py), litellm/python-dotenv locked, .env wiring
  - phase: 01-backend-foundation
    provides: execute_trade/TradeError (portfolio), add_ticker/remove_ticker (watchlist), chat_messages schema, TestClient harness
provides:
  - POST /api/chat end-to-end in mock mode (router + service orchestrator + app wiring)
  - chat/service.py: context assembly, call-time LLM_MOCK seam, ChatProposal parse, per-action auto-execution, chat_messages persistence
  - tests/chat/ harness: client/mock_llm/mock_llm_proposal fixtures + HTTP happy-path test + nine-scenario execution battery
affects: [02-03 live LLM branch, 03-frontend chat panel, phase-4 docker]

# Actuals (#2632) — pairs with the plan's estimate (61000 estimateTokens, low confidence)
actuals:
  tokens: 6287
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Call-time env seam: generate_assistant_response reads LLM_MOCK inside the call; mock returns the same JSON-string shape as the future live branch so parse/execute is identical (CHAT-05)"
    - "Per-action error capture: _execute_trade/_apply_watchlist_change never re-raise; a failed action is recorded with status=failed + error and the batch continues (spec §9)"
    - "app.state DI: router reads db_path/price_cache/market_source from request.app.state; process_message takes them as args — no module singletons"

key-files:
  created:
    - backend/app/chat/service.py
    - backend/app/chat/router.py
    - backend/app/chat/__init__.py
    - backend/tests/chat/conftest.py
    - backend/tests/chat/test_chat_endpoint.py
    - backend/tests/chat/test_execution.py
  modified:
    - backend/app/main.py

key-decisions:
  - "litellm imported at module level in service.py (# noqa: F401) exactly per plan — it is the 02-03 live-branch dependency; the live branch itself raises NotImplementedError (unreachable in mock-mode tests) until 02-03 Task 1"
  - "Router imports only APIRouter/Request — the plan's 'Response' import was omitted as unused by the ChatResponse-returning handler (ruff F401 would fail lint)"
  - "test_execution.py drives proposals via the mock_llm_proposal factory fixture (setenv LLM_MOCK + patch app.chat.service._mock_response) so all nine scenarios exercise the real parse → TradeRequest/execute_trade → add_ticker/remove_ticker pipeline"

patterns-established:
  - "Chat executor reuses Phase 1 validation wholesale: TradeRequest(**proposal) normalizes tickers and validates quantity/side; watchlist changes flow through add_ticker/remove_ticker with the UNIQUE(user_id,ticker) backstop — the chat layer never re-implements trade math or source sync"
  - "Mock proposals are module-level monkeypatchable dicts returned as json.dumps, so tests drive arbitrary proposals through the identical pipeline the live LLM will use"

requirements-completed: [CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "POST /api/chat end-to-end in mock mode over HTTP: 200 ChatResponse envelope {message, trades, watchlist_changes} with per-action status, real execute_trade side effects, chat_messages persistence"
    requirement: CHAT-01
    verification:
      - kind: integration
        ref: "backend/tests/chat/test_chat_endpoint.py#test_chat_mock_happy_path_executes_trade_and_persists"
        status: pass
    human_judgment: false
  - id: D2
    description: "LLM-proposed trades auto-execute through the same TradeRequest/execute_trade validation as manual trades; failed trades (insufficient cash/shares, unknown ticker) are recorded per-action and the batch continues"
    requirement: CHAT-02
    verification:
      - kind: unit
        ref: "backend/tests/chat/test_execution.py#test_buy_executes"
        status: pass
      - kind: unit
        ref: "backend/tests/chat/test_execution.py#test_sell_executes"
        status: pass
      - kind: unit
        ref: "backend/tests/chat/test_execution.py#test_insufficient_cash_keeps_batch_alive"
        status: pass
      - kind: unit
        ref: "backend/tests/chat/test_execution.py#test_insufficient_shares"
        status: pass
      - kind: unit
        ref: "backend/tests/chat/test_execution.py#test_unknown_ticker"
        status: pass
    human_judgment: false
  - id: D3
    description: "LLM-proposed watchlist changes apply through add_ticker/remove_ticker keeping the DB row, price cache, and market source in sync; duplicate add and unknown remove fail per-action with no duplicate row"
    requirement: CHAT-03
    verification:
      - kind: unit
        ref: "backend/tests/chat/test_execution.py#test_watchlist_add_applies"
        status: pass
      - kind: unit
        ref: "backend/tests/chat/test_execution.py#test_watchlist_remove_applies"
        status: pass
      - kind: unit
        ref: "backend/tests/chat/test_execution.py#test_duplicate_add"
        status: pass
      - kind: unit
        ref: "backend/tests/chat/test_execution.py#test_remove_unknown"
        status: pass
    human_judgment: false
  - id: D4
    description: "Each parsed turn persists a user row (actions NULL) and an assistant row (JSON-encoded executed actions) in chat_messages; prior turns load back as context via _load_history"
    requirement: CHAT-04
    verification:
      - kind: integration
        ref: "backend/tests/chat/test_chat_endpoint.py#test_chat_mock_happy_path_executes_trade_and_persists (2 chat rows, actions JSON asserted)"
        status: pass
      - kind: unit
        ref: "backend/tests/chat/test_execution.py#test_sell_executes (second turn loads prior history)"
        status: pass
    human_judgment: false
  - id: D5
    description: "LLM_MOCK=true returns the deterministic canned proposal through the same parse-to-execute pipeline with no API key — mock_llm/mock_llm_proposal fixtures drive every chat test"
    requirement: CHAT-05
    verification:
      - kind: other
        ref: "cd backend && uv run --extra dev pytest tests/chat -q (10 passed, no OPENROUTER_API_KEY in environment)"
        status: pass
    human_judgment: false

# Metrics
duration: 24min
completed: 2026-08-26
status: complete
---

# Phase 02 Plan 02: Chat Mock-Mode Tracer Summary

**POST /api/chat wired end-to-end in mock mode — chat service orchestrator (context assembly, call-time LLM_MOCK seam, ChatProposal parse, per-action auto-execution reusing execute_trade/add_ticker/remove_ticker, chat_messages persistence), async router with app.state DI, main.py registration, and a 10-test battery (HTTP happy path + nine auto-execution scenarios) proving CHAT-01..CHAT-05 deterministically with no API key**

## Performance

- **Duration:** 24 min
- **Started:** 2026-08-26T21:35:00Z
- **Completed:** 2026-08-26T21:59:26Z
- **Tasks:** 2 (1 tracer + 1 auto)
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments

- **POST /api/chat end-to-end in mock mode (CHAT-01):** `chat/router.py` (async, `response_model=ChatResponse`, reads `db_path`/`price_cache`/`market_source` from `request.app.state`) → `chat/service.py::process_message` opens one connection, loads portfolio + watchlist + history, builds the message list (system prompt → context → history → user message), calls the mock LLM, parses with `ChatProposal.model_validate_json`, executes, persists, and returns the enriched envelope.
- **Auto-execution through Phase 1 services (CHAT-02, CHAT-03):** `_execute_trade` constructs `TradeRequest(**proposal)` and calls `execute_trade` inside `try/except TradeError` (never re-raises — spec §9); `_apply_watchlist_change` awaits `add_ticker`/`remove_ticker` with the row + market source + price cache kept in sync. The chat layer re-implements none of the trade math or source sync.
- **Persistence + history (CHAT-04):** `_save_messages` inserts the user row (actions NULL) and assistant row (JSON-encoded executed results) in one `with conn:` block; `_load_history` reads the last 20 turns newest-first and reverses to chronological for the LLM.
- **Deterministic mock seam (CHAT-05):** `generate_assistant_response` reads `LLM_MOCK` at call time; the mock returns `json.dumps(_mock_response(...))` — the same JSON-string shape the live branch will produce in 02-03, so the parse-to-execute path is identical in both modes. Module-level `_mock_response` is monkeypatchable, letting tests drive arbitrary proposals through the real pipeline.
- **Test harness:** `conftest.py` fixtures (`client` with temp-DB lifespan boot, `mock_llm`, `mock_llm_proposal` factory) plus the tracer gate HTTP test and nine service-level execution scenarios (buy/sell executes, insufficient cash keeps batch alive, insufficient shares, unknown ticker, watchlist add/remove, duplicate add, unknown remove).
- Full suite: **143 passed** (115 baseline + 18 from 02-01 + 1 endpoint + 9 execution); ruff clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: POST /api/chat end-to-end in mock mode — one happy path** - `2131a9d` (feat)
2. **Task 2: Auto-execution battery — trades and watchlist changes through the real pipeline** - `b9cee48` (test)

**Plan metadata:** `pending` (docs: complete plan — final commit in this step)

## Files Created/Modified

- `backend/app/chat/service.py` - Orchestrator: `process_message`, `generate_assistant_response` (call-time LLM_MOCK seam, live branch raises NotImplementedError until 02-03), `build_messages`, `_load_history`, `_save_messages`, `_execute_trade`, `_apply_watchlist_change`, `_mock_response`
- `backend/app/chat/router.py` - `APIRouter(prefix="/api/chat")` with async POST handler reading app.state DI, conn lifecycle `try/finally close`
- `backend/app/chat/__init__.py` - Package init re-exporting `router` (portfolio pattern)
- `backend/app/main.py` - `from app.chat import router as chat_router` + `app.include_router(chat_router)` after the watchlist router
- `backend/tests/chat/conftest.py` - Fixtures `client`, `mock_llm`, `mock_llm_proposal`
- `backend/tests/chat/test_chat_endpoint.py` - `TestChatEndpoint.test_chat_mock_happy_path_executes_trade_and_persists` (tracer gate)
- `backend/tests/chat/test_execution.py` - Nine `async def test_*` scenarios calling `process_message` directly (MockMarketSource copied from tests/watchlist/test_mutation.py, `_make_db` helper, persistence asserted by reopening `get_connection`)

## Decisions Made

- Followed the plan verbatim on the module-level `import litellm` (`# noqa: F401`) — the dependency is the 02-03 live branch; the tracer's live path raises `NotImplementedError` (unreachable in mock-mode tests), exactly as the plan's Task 1 spec says.
- Omitted `Response` from the router's fastapi import list — the handler returns `ChatResponse` (not `Response`), so importing it would fail `ruff F401`. Trivial lint-driven adjustment to the plan's import list.
- Added `TradeActionResult`/`WatchlistChangeResult` to service.py imports — the plan's import list named only `ChatProposal, ChatResponse`, but the Task 1 action text explicitly builds the response with `TradeActionResult(**r)` / `WatchlistChangeResult(**r)`, so they are required for the specified behavior.
- test_execution.py asserts exact cash values (9620.0 / 9810.0 / 9700.0) — deterministic because each scenario primes its own controlled `PriceCache` and uses `MockMarketSource` (no simulator race, unlike the HTTP happy path which only asserts `cash < 10000`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Unused `Response` import omitted from chat/router.py**
- **Found during:** Task 1 (router implementation)
- **Issue:** The plan's router import list named `APIRouter, Request, Response` from fastapi, but the handler returns `ChatResponse` and never uses `Response` — importing it would fail the repo's `ruff check` (F401) and block the lint gate.
- **Fix:** Imported only `APIRouter, Request`.
- **Files modified:** backend/app/chat/router.py
- **Verification:** `ruff check app/ tests/` → All checks passed
- **Committed in:** 2131a9d (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Trivial import-list adjustment required for lint compliance; zero behavioral impact. No scope creep.

## Issues Encountered

- **Estimate variance:** the plan estimated 61000 estimateTokens (low confidence); the realized diff measures ~6287 (chars/4 over the 7 changed files) — the planner over-estimated by ~10x, consistent with the `confidence: low` flag. Recorded honestly in `actuals` to calibrate future plan estimates.
- **litellm import cost:** importing litellm at module level of service.py adds ~4.3s one-time per test process (module cached in `sys.modules` thereafter); full suite went 3.85s → 8.34s. Acceptable and per plan spec.

## User Setup Required

None - no external service configuration required for this plan. (Live chat needs `OPENROUTER_API_KEY` in `.env`; mock mode via `LLM_MOCK=true` covers all testing without a key — same posture as 02-01.)

## Next Phase Readiness

- 02-03 (live LiteLLM branch) replaces the `raise NotImplementedError` line in `generate_assistant_response` with the awaited `litellm.acompletion` call (RESEARCH code example) — the parse/execute/persist pipeline is already proven and unchanged.
- The 503 error contract and tolerant-parse fallback land in 02-03 Task 2; per-action failure handling is already in place.
- CHAT-01/CHAT-04/CHAT-05 are also declared by 02-03 — per the shared-ID gate they will be marked complete in REQUIREMENTS.md when 02-03 finishes (CHAT-02/CHAT-03 are marked now).
- `OPENROUTER_API_KEY` is still absent on this machine; 02-03's `user_setup` gates the optional live smoke test.

---
*Phase: 02-ai-chat-assistant*
*Completed: 2026-08-26*
