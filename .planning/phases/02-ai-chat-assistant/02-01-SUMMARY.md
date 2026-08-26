---
phase: 02-ai-chat-assistant
plan: 01
subsystem: api
tags: [litellm, python-dotenv, pydantic, fastapi, chat, dotenv]

# Dependency graph
requires:
  - phase: 01-backend-foundation
    provides: TradeRequest/TradeError + watchlist schemas (validators reused), TestClient harness, committed uv.lock
provides:
  - litellm>=1.98.0 + python-dotenv>=1.0 locked in backend/uv.lock
  - Project-root .env loaded at import time (load_dotenv in main.py)
  - .env.example documenting OPENROUTER_API_KEY / LLM_MOCK / MASSIVE_API_KEY
  - app/chat/schemas.py: CHAT-01 envelope (ChatRequest, TradeAction, WatchlistChange, TradeActionResult, WatchlistChangeResult, ChatProposal, ChatResponse)
  - app/chat/prompts.py: SYSTEM_PROMPT + pure build_context formatter
  - tests/chat/ test package with 18 passing schema/prompt tests
affects: [02-02 chat tracer, 02-03 live LLM branch, 03-frontend, phase-4 docker]

# Actuals (#2632) — pairs with the plan's estimate (45000) to calibrate future estimates.
actuals:
  tokens: 87812
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: [litellm>=1.98.0, python-dotenv>=1.0, httpx>=0.28.1 (dev, relaxed from <0.28)]
  patterns:
    - "Call-time env reads (LLM_MOCK/OPENROUTER_API_KEY never read at import) — keeps tests monkeypatchable"
    - "LLM-proposal validation reuses TradeRequest/WatchlistAddRequest Pydantic constraints (one validation path)"

key-files:
  created: [.env.example, backend/app/chat/schemas.py, backend/app/chat/prompts.py, backend/tests/chat/__init__.py, backend/tests/chat/test_service.py]
  modified: [backend/pyproject.toml, backend/uv.lock, backend/app/main.py]

key-decisions:
  - "Floor-pin litellm>=1.98.0 and python-dotenv>=1.0 exactly as planned (RESEARCH Pitfall 1 — LiteLLM ships daily; uv.lock committed for reproducibility)"
  - "Relaxed dev httpx pin from >=0.27.0,<0.28 to >=0.27.0,<1.0 — litellm>=1.98.0 requires httpx>=0.28.0,<1.0, and the SSE smoke test uses real uvicorn network transport (not ASGITransport), so the old <0.28 guard is moot"
  - "Used importlib.metadata.version('litellm') instead of litellm.__version__ for the version gate — litellm 1.98.0 does not expose __version__ (lazy __getattr__)"

patterns-established:
  - "Chat envelope split: ChatProposal (status-less LLM output, parsed via model_validate_json) vs ChatResponse (status-carrying wire results) — service enriches proposals into results"
  - "build_context is a pure formatter (no DB/cache access) — caller passes pre-loaded dicts, trivially unit-testable"

requirements-completed: [CHAT-01]

coverage:
  - id: D1
    description: "Runtime dependencies litellm>=1.98.0 and python-dotenv>=1.0 installed and locked in backend/uv.lock"
    requirement: CHAT-01
    verification:
      - kind: other
        ref: "uv run python -c \"import importlib.metadata as md; v=md.version('litellm'); assert tuple(map(int, v.split('.'))) >= (1,98,0)\""
        status: pass
    human_judgment: false
  - id: D2
    description: "Project-root .env loaded at import time via load_dotenv() before app construction; call-time env reads preserved"
    verification:
      - kind: unit
        ref: "backend/tests/test_app.py#TestAppSmoke (regression: 4 passed after dotenv wiring)"
        status: pass
    human_judgment: false
  - id: D3
    description: ".env.example at project root documents OPENROUTER_API_KEY / LLM_MOCK / MASSIVE_API_KEY with placeholders only; .env ignored, .env.example committed"
    verification:
      - kind: other
        ref: "git check-ignore .env (exit 0) && git check-ignore .env.example (exit 1)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Chat Pydantic schemas defining the CHAT-01 response envelope (ChatRequest, TradeAction, WatchlistChange, TradeActionResult, WatchlistChangeResult, ChatProposal, ChatResponse)"
    requirement: CHAT-01
    verification:
      - kind: unit
        ref: "backend/tests/chat/test_service.py#TestChatRequest"
        status: pass
      - kind: unit
        ref: "backend/tests/chat/test_service.py#TestTradeAction"
        status: pass
      - kind: unit
        ref: "backend/tests/chat/test_service.py#TestWatchlistChange"
        status: pass
      - kind: unit
        ref: "backend/tests/chat/test_service.py#TestChatProposalParse"
        status: pass
      - kind: unit
        ref: "backend/tests/chat/test_service.py#TestChatResponseShape"
        status: pass
    human_judgment: false
  - id: D5
    description: "SYSTEM_PROMPT ('FinAlly, an AI trading assistant') and pure build_context(portfolio, watchlist) formatter"
    verification:
      - kind: unit
        ref: "backend/tests/chat/test_service.py#TestSystemPrompt"
        status: pass
      - kind: unit
        ref: "backend/tests/chat/test_service.py#TestBuildContext"
        status: pass
    human_judgment: false

# Metrics
duration: 9min
completed: 2026-08-26
status: complete
---

# Phase 02 Plan 01: Chat Foundation Summary

**litellm + python-dotenv installed and locked, project-root .env wired into main.py, and the CHAT-01 Pydantic envelope (schemas.py) + prompt module (prompts.py) delivered with 18 TDD unit tests — the dependency stack and schema shapes every later chat plan imports from**

## Performance

- **Duration:** 9 min
- **Started:** 2026-08-26T21:39:40Z
- **Completed:** 2026-08-26T21:48:39Z
- **Tasks:** 3 (Task 1 checkpoint approved by user; Tasks 2-3 executed)
- **Files modified:** 8 (5 created, 3 modified)

## Accomplishments

- litellm 1.98.0 + python-dotenv 1.2.1 added to `backend/pyproject.toml` and locked in `backend/uv.lock` (floor pins kept exactly as planned)
- `load_dotenv()` wired into `backend/app/main.py` before `app = FastAPI(...)` — backend started from `backend/` reads the project-root `.env`; all env reads stay at call time (un-patchable import-time reads avoided per RESEARCH)
- `.env.example` committed documenting OPENROUTER_API_KEY / LLM_MOCK / MASSIVE_API_KEY (placeholders only; `.env` stays gitignored)
- `backend/app/chat/schemas.py` defines the full CHAT-01 envelope: `ChatRequest`, `TradeAction`, `WatchlistChange`, `TradeActionResult`, `WatchlistChangeResult`, `ChatProposal`, `ChatResponse` — proposal vs response split means the LLM emits status-less proposals the service enriches into status-carrying wire results
- `backend/app/chat/prompts.py` defines `SYSTEM_PROMPT` (starts "FinAlly, an AI trading assistant") and the pure `build_context(portfolio, watchlist)` formatter
- TDD discipline: RED commit fails at collection (modules absent), GREEN commit passes all 18 tests
- Full baseline suite stays green: **133 passed** (115 baseline + 18 new)

## Task Commits

Each task was committed atomically:

1. **Task 1: Package legitimacy checkpoint** - human-approved (litellm + python-dotenv) — no commit (gate only)
2. **Task 2: Install deps, wire dotenv, add .env.example** - `673f425` (feat)
3. **Task 3 (TDD) RED: failing tests** - `f8c7d71` (test)
4. **Task 3 (TDD) GREEN: schemas + prompts** - `928a317` (feat)
5. **Lint follow-up: sort dotenv import (ruff I001)** - `db6a4bd` (style)

**Plan metadata:** `pending` (docs: complete plan — final commit in this step)

_Note: TDD task produced test → feat commits; one style follow-up commit fixed a ruff import-order error on the Task 2 file._

## Files Created/Modified

- `.env.example` - Documents OPENROUTER_API_KEY (required for live chat, blank for mock), LLM_MOCK (true = deterministic mock), MASSIVE_API_KEY (optional, real market data)
- `backend/app/chat/schemas.py` - CHAT-01 envelope: request/proposal/response/result Pydantic models with TradeRequest-style ticker normalization and bounded watchlist tickers (threat T-02-01)
- `backend/app/chat/prompts.py` - SYSTEM_PROMPT constant + pure `build_context(portfolio, watchlist) -> str` formatter
- `backend/tests/chat/__init__.py` - Empty test-package marker (tests/portfolio convention)
- `backend/tests/chat/test_service.py` - 18 tests: TestChatRequest, TestTradeAction, TestWatchlistChange, TestChatProposalParse, TestChatResponseShape, TestSystemPrompt, TestBuildContext
- `backend/pyproject.toml` - Added `litellm>=1.98.0`, `python-dotenv>=1.0`; relaxed dev `httpx>=0.27.0,<1.0`
- `backend/uv.lock` - Regenerated by `uv add` (litellm 1.98.0, python-dotenv 1.2.1, httpx 0.28.1)
- `backend/app/main.py` - `from dotenv import load_dotenv` + `load_dotenv()` before app construction

## Decisions Made

- Floor pins kept verbatim (`litellm>=1.98.0`, `python-dotenv>=1.0`) per RESEARCH Pitfall 1 — LiteLLM ships near-daily releases and the committed uv.lock is the reproducibility guard
- Dev httpx pin relaxed to `>=0.27.0,<1.0` because litellm>=1.98.0 requires httpx>=0.28.0,<1.0; the old `<0.28` ASGITransport guard is moot since the SSE smoke test uses real uvicorn network transport (verified: tests/test_app.py still green on httpx 0.28.1)
- Version-gate check uses `importlib.metadata.version("litellm")` — litellm 1.98.0 has no `__version__` attribute (lazy `__getattr__`), so the plan's literal check expression was adapted while keeping the same >= 1.98.0 assertion

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Relaxed dev httpx pin — litellm resolution conflict**
- **Found during:** Task 2 (install deps)
- **Issue:** `uv add "litellm>=1.98.0"` failed: litellm>=1.98.0 requires `httpx>=0.28.0,<1.0` but the dev extra pinned `httpx>=0.27.0,<0.28` ("for ASGITransport streaming support"). Resolution impossible without changing the pin.
- **Fix:** Relaxed dev pin to `httpx>=0.27.0,<1.0` with an explanatory comment. Evidence the old guard is stale: `tests/test_app.py:59-61` documents the SSE smoke test uses a real uvicorn server + httpx network transport precisely because ASGITransport buffers — the `<0.28` pin protected a mechanism the suite no longer uses. Starlette 0.52.1 (in lock) supports httpx 0.28.
- **Files modified:** backend/pyproject.toml (dev extra), backend/uv.lock (httpx 0.27.2 -> 0.28.1)
- **Verification:** Full suite green on httpx 0.28.1: 115 baseline tests passed, including TestAppSmoke::test_stream_prices_serves_sse_frames
- **Committed in:** 673f425 (Task 2 commit)

**2. [Rule 3 - Blocking] Version-check expression adapted — litellm has no `__version__`**
- **Found during:** Task 2 verification (plan `<verify>` command)
- **Issue:** The plan's verify command `litellm.__version__` raises `AttributeError` in litellm 1.98.0 — the package exposes version only via `importlib.metadata` (lazy `__getattr__` on the module).
- **Fix:** Used `importlib.metadata.version("litellm")` with the identical `>= (1, 98, 0)` assertion. Import of litellm + dotenv confirmed working.
- **Files modified:** none (verification command only)
- **Verification:** `uv run python -c "..."` prints `litellm 1.98.0 OK | dotenv 1.2.1`
- **Committed in:** n/a (no code change)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were required to complete Task 2 as specified — the httpx conflict was unresolvable without the pin change, and the version-gate adaptation preserves the plan's exact assertion semantics. No scope creep.

## Issues Encountered

- **httpx pin conflict (litellm vs dev extra):** the only real blocker; resolved by relaxing the stale `<0.28` guard after confirming the SSE smoke test uses network transport (details above).
- **`litellm.__version__` absent:** verify-command adaptation; no functional impact.

## User Setup Required

None - no external service configuration required for this plan. (Live chat needs `OPENROUTER_API_KEY` in `.env`; mock mode via `LLM_MOCK=true` covers all testing without a key.)

## Next Phase Readiness

- 02-02 (chat tracer) can import `app.chat.schemas` and `app.chat.prompts` with the dependency stack proven — the service/router layers build directly on these shapes
- 02-03 (live LiteLLM branch) can rely on call-time env reads and the validated proposal→response enrichment split
- `POST /api/chat` endpoint still unimplemented — that is exactly 02-02's scope
- The `.env` file itself does not exist yet on this machine; LLM_MOCK=true remains the only executable path until the user supplies OPENROUTER_API_KEY (gated in 02-03 user_setup)

---
*Phase: 02-ai-chat-assistant*
*Completed: 2026-08-26*

## Self-Check: PASSED

- Created files exist: `.env.example`, `backend/app/chat/schemas.py`, `backend/app/chat/prompts.py`, `backend/tests/chat/__init__.py`, `backend/tests/chat/test_service.py` — all FOUND
- Commits verified in git log: `673f425` (feat deps), `f8c7d71` (test RED), `928a317` (feat GREEN), `db6a4bd` (style lint) — all FOUND
- All acceptance criteria PASS (deps in pyproject/lock, load_dotenv before app construction, .env ignored / .env.example committed, schema/prompt exports import cleanly)
- Full suite: 133 passed (115 baseline + 18 chat tests); ruff check + format clean
