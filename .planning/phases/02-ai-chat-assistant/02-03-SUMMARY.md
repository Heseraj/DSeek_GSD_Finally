---
phase: 02-ai-chat-assistant
plan: 03
subsystem: api
tags: [litellm, openrouter, cerebras, gpt-oss-120b, structured-outputs, fastapi, chat, error-contract]

# Dependency graph
requires:
  - phase: 02-ai-chat-assistant
    provides: 02-02 mock-mode tracer — service.py orchestrator (build_messages, _save_messages, _execute_trade, _apply_watchlist_change, _mock_response), async router with app.state DI, conftest fixtures, ChatProposal/ChatResponse schemas
  - phase: 02-ai-chat-assistant
    provides: 02-01 foundation — chat schemas/prompts, litellm>=1.98.0 + python-dotenv locked
  - phase: 01-backend-foundation
    provides: execute_trade/TradeError (portfolio), add_ticker/remove_ticker (watchlist), chat_messages schema, TestClient harness
provides:
  - Live LiteLLM branch: litellm.acompletion for openrouter/openai/gpt-oss-120b, response_format json_schema from ChatProposal.model_json_schema() (strict) with json_object fallback, extra_body Cerebras pinning (allow_fallbacks False), force_timeout=60 — spec §9 verbatim
  - Locked error contract: OPENROUTER_API_KEY pre-check + tolerant handler (AuthenticationError/APIConnectionError/Timeout/ValidationError → error ChatResponse); router maps top-level error to HTTP 503 with a valid ChatResponse body, never 500
  - Full phase test battery: 6 service tests (live kwargs, no-key, backend-error, malformed-tolerance, json_object fallback, mock determinism) + 5 endpoint tests (503 no-key, 503 backend-error, 503 malformed, history-as-context CHAT-04, HTTP determinism CHAT-05)
affects: [03-frontend chat panel (renders the 503-with-ChatResponse contract), phase-4 docker (env delivery for the live path)]

# Actuals (#2632) — pairs with the plan's estimate (47000 estimateTokens, low confidence)
actuals:
  tokens: 4070
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Call-time key pre-check: OPENROUTER_API_KEY read inside process_message when LLM_MOCK is falsy — tests monkeypatch.setenv without a process restart (T-02-02)"
    - "Tolerant LLM output parse: generate + model_validate_json wrapped in a four-exception handler; persistence and execution happen only for successfully parsed turns (T-02-04)"
    - "Error contract via response_model: 503 status + valid ChatResponse body so the frontend renders errors without special-casing"

key-files:
  created: []
  modified:
    - backend/app/chat/service.py
    - backend/app/chat/router.py
    - backend/tests/chat/test_service.py
    - backend/tests/chat/test_chat_endpoint.py

key-decisions:
  - "Followed spec §9 verbatim for the live branch: model openrouter/openai/gpt-oss-120b, response_format json_schema from ChatProposal.model_json_schema() (strict: True), extra_body provider order [cerebras] with allow_fallbacks False, force_timeout=60; cerebras-inference skill absent locally so the pattern is encoded directly (RESEARCH finding 3 / A6)"
  - "APIConnectionError('boom') from the plan's test example cannot be constructed in litellm 1.98.0 (signature requires llm_provider + model positional args) — tests raise APIConnectionError('boom', 'openrouter', 'openrouter/openai/gpt-oss-120b')"
  - "Removed the dead unused conn = get_connection(db_path) / finally close block from the chat handler while rewriting it for the 503 contract (opened an unused DB connection per request)"
  - "Locked 503 contract per RESEARCH A5/Open Question 3: any ChatResponse with top-level error → HTTP 503 with the ChatResponse body; per-action trade/watchlist failures keep HTTP 200"
  - "The mock-determinism regression pin (test_mock_mode_returns_canned_dict) passed at RED — expected, the mock branch pre-existed; the other five live-branch tests failed on NotImplementedError before GREEN"

patterns-established:
  - "Structured-output live branch: build response_format from the Pydantic model JSON schema, gate on litellm.supports_response_schema with json_object fallback (RESEARCH Pitfall 2)"
  - "Error ChatResponse is the single failure vehicle: pre-check, backend exceptions, and schema violations all funnel into {message, trades: [], watchlist_changes: [], error}"

requirements-completed: [CHAT-01, CHAT-04, CHAT-05]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "Live LiteLLM branch: litellm.acompletion for openrouter/openai/gpt-oss-120b with response_format json_schema (ChatProposal.model_json_schema, strict), json_object fallback when supports_response_schema is False, extra_body Cerebras pinning, force_timeout=60"
    requirement: CHAT-01
    verification:
      - kind: unit
        ref: "backend/tests/chat/test_service.py#test_live_branch_calls_acompletion_with_expected_kwargs"
        status: pass
      - kind: unit
        ref: "backend/tests/chat/test_service.py#test_supports_response_schema_false_uses_json_object"
        status: pass
    human_judgment: false
  - id: D2
    description: "Locked error contract: missing OPENROUTER_API_KEY, litellm backend failure, or schema-violating output returns HTTP 503 with a valid ChatResponse body (error set, empty action arrays) and executes/persists nothing — never 500"
    requirement: CHAT-01
    verification:
      - kind: integration
        ref: "backend/tests/chat/test_chat_endpoint.py#test_no_key_returns_503_chat_response_shape"
        status: pass
      - kind: integration
        ref: "backend/tests/chat/test_chat_endpoint.py#test_llm_backend_error_returns_503"
        status: pass
      - kind: integration
        ref: "backend/tests/chat/test_chat_endpoint.py#test_malformed_proposal_returns_503_and_executes_nothing"
        status: pass
      - kind: unit
        ref: "backend/tests/chat/test_service.py#test_no_key_returns_error_chat_response"
        status: pass
      - kind: unit
        ref: "backend/tests/chat/test_service.py#test_llm_backend_error_returns_error_chat_response"
        status: pass
      - kind: unit
        ref: "backend/tests/chat/test_service.py#test_malformed_output_is_tolerated"
        status: pass
    human_judgment: false
  - id: D3
    description: "Conversation history persists in chat_messages and the prior user turn reaches the next request's LLM context (CHAT-04)"
    requirement: CHAT-04
    verification:
      - kind: integration
        ref: "backend/tests/chat/test_chat_endpoint.py#test_history_persists_and_is_included_as_context"
        status: pass
    human_judgment: false
  - id: D4
    description: "LLM_MOCK=true is deterministic at unit level (canned dict byte-equal) and at HTTP level (identical requests return byte-identical bodies) with no API key (CHAT-05)"
    requirement: CHAT-05
    verification:
      - kind: unit
        ref: "backend/tests/chat/test_service.py#test_mock_mode_returns_canned_dict"
        status: pass
      - kind: integration
        ref: "backend/tests/chat/test_chat_endpoint.py#test_mock_deterministic_across_requests"
        status: pass
    human_judgment: false
  - id: D5
    description: "Optional live (non-mock) smoke test of POST /api/chat against real OpenRouter"
    verification: []
    human_judgment: true
    rationale: "No OPENROUTER_API_KEY on this machine — the live call is gated behind the plan's optional user_setup. All five CHAT requirements are proven by the mock-path tests regardless; the recorded-kwargs unit tests pin the exact request shape the live branch sends."

# Metrics
duration: 8min
completed: 2026-08-26
status: complete
---

# Phase 02 Plan 03: Live LLM Branch + Locked Error Contract Summary

**Live LiteLLM → OpenRouter branch (openrouter/openai/gpt-oss-120b on Cerebras with structured outputs per spec §9, encoded directly since the cerebras-inference skill does not exist locally), the locked 503-with-ChatResponse error contract, tolerant LLM-output parsing, and the full CHAT-04/CHAT-05 verification battery — POST /api/chat is now production-capable against the real backend while every behavior stays deterministic in mock mode**

## Performance

- **Duration:** 8 min
- **Started:** 2026-08-26T22:05:00Z
- **Completed:** 2026-08-26T22:12:00Z
- **Tasks:** 2 (1 TDD RED+GREEN, 1 auto)
- **Files modified:** 4 (2 app, 2 test)

## Accomplishments

- **Live LLM branch (spec §9 verbatim):** `generate_assistant_response` now calls `litellm.acompletion(model="openrouter/openai/gpt-oss-120b", response_format=json_schema-from-ChatProposal.model_json_schema() (strict), extra_body={"provider": {"order": ["cerebras"], "allow_fallbacks": False}}, force_timeout=60)` — the exact §9 pattern encoded directly because the cerebras-inference skill the spec references is absent locally (RESEARCH finding 3 / A6). `litellm.supports_response_schema` gates a `json_object` fallback (RESEARCH Pitfall 2). Mock mode returns through the identical JSON-string shape, so the parse-to-execute path is mode-independent (CHAT-05).
- **Locked error contract (RESEARCH A5 / Open Question 3):** `process_message` pre-checks `OPENROUTER_API_KEY` at call time when mock is off (nothing executed, nothing persisted on failure); the generate+parse sequence is wrapped in a tolerant handler catching `AuthenticationError` / `APIConnectionError` / `Timeout` / `ValidationError` into an error `ChatResponse`. The router maps any `ChatResponse` with a top-level `error` to **HTTP 503 with the ChatResponse body** — never 500 — the contract the Phase 3 frontend renders without special-casing. Per-action trade/watchlist failures stay HTTP 200.
- **Full phase test battery (11 new tests):** six service-level (live kwargs recorder, no-key pre-check with acompletion-never-called guard, backend-error mapping, malformed-output tolerance with zero-persistence proof, json_object fallback, mock determinism) and five HTTP-level (503 no-key with ChatResponse parse + zero DB rows, 503 backend-error, 503 malformed proposal, history-as-context with the second call's LLM messages captured, byte-identical mock bodies across requests).
- Full suite: **154 passed** (143 baseline + 6 service + 5 endpoint); ruff clean.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: add failing tests for live LLM branch and error mapping** - `c966bfb` (test)
2. **Task 1 GREEN: implement live LiteLLM branch with tolerant error mapping** - `d72d090` (feat)
3. **Task 2: lock 503 error contract and add endpoint verification battery** - `e5a41b0` (feat)

**Plan metadata:** `pending` (docs: complete plan — final commit in this step)

## Files Created/Modified

- `backend/app/chat/service.py` - Live branch inside `generate_assistant_response` (litellm.acompletion with json_schema/json_object response_format, Cerebras pinning, force_timeout=60); `process_message` gains the OPENROUTER_API_KEY pre-check (call-time read) and the four-exception tolerant handler; `from pydantic import ValidationError`
- `backend/app/chat/router.py` - Handler signature gains `response: Response`; `response.status_code = 503` when `result.error is not None`; dead unused conn block removed (dropped `get_connection` import)
- `backend/tests/chat/test_service.py` - `TestLiveLiteLLMBranch` class with the six behavior tests + `MockMarketSource`/`_make_db` helpers (copied per repo convention)
- `backend/tests/chat/test_chat_endpoint.py` - Five new `TestChatEndpoint` methods (503 × 3, history-as-context, HTTP determinism)

## Decisions Made

- Live branch follows spec §9 verbatim; the absent cerebras-inference skill is out-of-scope and the pattern is encoded directly (RESEARCH finding 3 / A6) — matches 02-02's `import litellm` seam, now actually used.
- 503-with-ChatResponse-body contract locked per the planner's resolution of RESEARCH A5 / Open Question 3; rated `costly` (Phase 3 frontend contract), flagged not gated.
- `APIConnectionError` in tests is constructed with the `llm_provider`/`model` positional args litellm 1.98.0 requires — the plan's two-arg example would raise TypeError.
- `supports_response_schema("openrouter/openai/gpt-oss-120b")` verified live in the venv: returns True on litellm 1.98.0, so the primary json_schema path is the one exercised by the kwargs test.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] APIConnectionError constructor signature in tests**
- **Found during:** Task 1 (RED tests — llm_backend_error tests)
- **Issue:** The plan's test examples raise `litellm.exceptions.APIConnectionError("boom")`, but litellm 1.98.0's constructor is `(self, message, llm_provider, model, ...)` — the two-arg call raises TypeError before the exception can be caught by the tolerant handler.
- **Fix:** Raised `APIConnectionError("boom", "openrouter", "openrouter/openai/gpt-oss-120b")` in both test_service.py and test_chat_endpoint.py — same exception class, same "boom" message, so the handler and assertions are unchanged.
- **Files modified:** backend/tests/chat/test_service.py, backend/tests/chat/test_chat_endpoint.py
- **Verification:** Both backend-error tests pass (error contains "unavailable", 503 at HTTP layer).
- **Committed in:** c966bfb, e5a41b0

**2. [Rule 1 - Bug] Dead unused DB connection in the chat handler**
- **Found during:** Task 2 (router rewrite for the 503 contract)
- **Issue:** The 02-02 handler opened `conn = get_connection(db_path)` and closed it in `finally` without ever using `conn` (process_message opens its own connection) — one wasted connection open per chat request, plus a needless `get_connection` import.
- **Fix:** Removed the dead block and the import while rewriting the handler per the plan's Task 2 action.
- **Files modified:** backend/app/chat/router.py
- **Verification:** Endpoint tests pass; ruff clean (no F401 for the dropped import).
- **Committed in:** e5a41b0

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both were mechanical corrections required for the plan's own tests to run on the pinned litellm and for the router rewrite to stay lint-clean. No behavioral or scope change to the plan's contract.

## Issues Encountered

- **Optional live smoke not run:** no `OPENROUTER_API_KEY` exists on this machine (confirmed: env unset, no `.env`). Per the plan, the live smoke test is skipped silently — all five CHAT requirements are proven by the mock-path tests, and the kwargs-recorder test pins the exact live request shape. The optional `user_setup` is documented in 02-USER-SETUP.md.
- **Estimate variance:** plan estimated 47000 estimateTokens (low confidence); realized diff measures ~4070 (chars/4 over the 4 changed files) — consistent with 02-02's ~10x over-estimation pattern for this phase. Recorded honestly in `actuals`.
- **Mock determinism pin passed at RED:** `test_mock_mode_returns_canned_dict` passed before the live branch existed — expected, since the mock branch was already implemented in 02-02; it is a regression pin, and the other five live-branch tests failed for the right reason (NotImplementedError).

## User Setup Required

**Optional live chat requires manual configuration.** See [02-USER-SETUP.md](./02-USER-SETUP.md) for:
- `OPENROUTER_API_KEY` — create at https://openrouter.ai/keys, add to the project-root `.env` (status Incomplete — no key supplied)
- Unlocks only the optional live smoke test; `LLM_MOCK=true` covers every automated test in this phase

## Next Phase Readiness

- **Phase 3 (frontend chat panel) contract is locked:** `POST /api/chat` returns HTTP 200 with `{message, trades, watchlist_changes}` on success and per-action results; any error (missing key, backend failure, malformed output) returns **HTTP 503 with a valid ChatResponse body** whose `error` field is set. The frontend renders the error field without special-casing.
- The live branch is exercised end-to-end by recorded-kwargs unit tests; a real live smoke remains available whenever the user supplies a key (user_setup).
- `OPENROUTER_API_KEY` read at call time means enabling live chat later needs no code change — just the `.env` entry and `LLM_MOCK` unset.

---
*Phase: 02-ai-chat-assistant*
*Completed: 2026-08-26*

## Self-Check: PASSED

- Created files exist: `.planning/phases/02-ai-chat-assistant/02-03-SUMMARY.md`, `02-USER-SETUP.md` — both FOUND
- Commits verified in git log: `c966bfb` (test RED), `d72d090` (feat GREEN), `e5a41b0` (feat Task 2) — all FOUND
- Task 1 acceptance criteria: six behavior tests in test_service.py all passing (24 total in file); live branch with exact model id `openrouter/openai/gpt-oss-120b`, response_format from ChatProposal.model_json_schema() with strict, extra_body provider order cerebras allow_fallbacks False, force_timeout=60 (grep-verified service.py:98-113); key pre-check + four-exception tolerant handler in process_message (grep-verified service.py:205,216); RED commit failed at new assertions (5 failed / 19 passed) while existing mock tests stayed green — PASS
- Task 2 acceptance criteria: router.py sets `response.status_code = 503` exactly when `result.error is not None` (grep-verified router.py:34, response_model=ChatResponse retained at :14); five endpoint tests pass; every 503 body parses via ChatResponse.model_validate checking message/trades/watchlist_changes/error; history test captures prior user turn "hello" in the second call's LLM messages; determinism test proves byte-identical bodies — PASS
- Plan verification commands: Task 1 `pytest tests/chat/test_service.py -q` → 24 passed; Task 2 `pytest tests/chat/test_chat_endpoint.py -q` → 6 passed; phase gate `pytest -q` → 154 passed (143 baseline + 11 new); `ruff check app/ tests/` → All checks passed
- Optional live smoke: skipped silently (no OPENROUTER_API_KEY) — documented in 02-USER-SETUP.md per plan's user_setup
