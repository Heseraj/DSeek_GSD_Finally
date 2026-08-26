---
phase: 02-ai-chat-assistant
verified: 2026-08-26T23:45:00Z
status: passed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/7
  gaps_closed:
    - "Under the documented .env configuration (LLM_MOCK=false, the .env.example default), the live LLM branch runs when OPENROUTER_API_KEY is set, and the missing-key guard returns the locked 503 error"
    - "Any LLM-backend failure returns HTTP 503 with a valid ChatResponse body — never a 500"
  gaps_remaining: []
  regressions: []
---

# Phase 2: AI Chat Assistant Verification Report

**Phase Goal:** A chat endpoint where the AI analyzes the portfolio and auto-executes trades and watchlist changes from natural language.
**Verified:** 2026-08-26T23:45:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (fix commit 51fb5a7)

## Goal Achievement

The chat endpoint is implemented end-to-end: `POST /api/chat` receives natural-language messages, assembles portfolio/watchlist/history context, produces a structured proposal (mock or live LLM), auto-executes proposed trades and watchlist changes through the exact Phase 1 services, persists the conversation, and returns a structured envelope. The two code-review-critical defects (CR-01, CR-02) that blocked the previous verification are **both fixed in commit 51fb5a7 and confirmed closed against the live code** — the fixed logic was read, the exception hierarchy re-probed via `issubclass`, and the new regression tests pass in the chat battery (43/43), the full suite (158 passed), and a clean ruff run. All seven must-haves are now verified.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: Sending a message to `POST /api/chat` returns a structured response with assistant text plus any trades and watchlist changes | ✓ VERIFIED | `router.py:14-35` (POST, response_model=ChatResponse); `schemas.py:64-70` (envelope with per-action status); HTTP test `test_chat_mock_happy_path_executes_trade_and_persists` (200 + envelope + executed AAPL trade). Live branch kwargs pinned by `test_live_branch_calls_acompletion_with_expected_kwargs` |
| 2 | SC2: A buy or sell proposed by the AI executes automatically and updates cash and positions using manual-trade validation | ✓ VERIFIED | `service.py:162-178` (`TradeRequest(**proposal)` → `execute_trade`, manual validation reused); `test_buy_executes` (cash 9620.0, position qty 2), `test_sell_executes` (cash 9810.0, avg_cost 190.0 unchanged), `test_insufficient_cash_keeps_batch_alive`, `test_insufficient_shares`, `test_unknown_ticker` — all through the real pipeline |
| 3 | SC3: A watchlist change proposed by the AI applies automatically | ✓ VERIFIED | `service.py:181-197` (`add_ticker`/`remove_ticker` — DB row + market source + price cache in sync); `test_watchlist_add_applies`, `test_watchlist_remove_applies`, `test_duplicate_add`, `test_remove_unknown` |
| 4 | SC4: Conversation history persists with executed actions and is included as context on later messages | ✓ VERIFIED | `service.py:130-159` (`_save_messages` — user row actions NULL, assistant row JSON actions), `service.py:62-87` (`_load_history` + `build_messages` include prior turns); `test_history_persists_and_is_included_as_context`. Warning WR-02 still open (informational): actions column persisted but not fed into the LLM context payload |
| 5 | SC5: With `LLM_MOCK=true`, chat returns deterministic responses without an API key | ✓ VERIFIED | `service.py:49-59, 103-104` (mock branch, no key touched, gated by `_mock_enabled()`); `test_mock_deterministic_across_requests` (byte-identical bodies over HTTP), `test_mock_mode_returns_canned_dict` (unit-level exact dict); full chat suite runs with no OPENROUTER_API_KEY |
| 6 | Under the documented `.env` configuration (`LLM_MOCK=false`, per `.env.example:9`), the live LLM branch runs when a key is set, and the missing-key guard returns the locked 503 | ✓ VERIFIED | **CR-01 closed.** `service.py:38-46` `_mock_enabled()` parses only `{"true","1","yes"}` (stripped, case-insensitive); `"false"` → mock OFF. Both call sites use it: `service.py:103` (`if _mock_enabled()`) and `service.py:223` (`if not _mock_enabled() and not os.environ.get("OPENROUTER_API_KEY")` — no bare truthiness anywhere). Regression tests pass: `test_mock_false_is_not_truthy_live_branch_runs` (LLM_MOCK=false + key → acompletion reached, live content returned, no `[mock]` prefix) and `test_mock_false_without_key_returns_error_not_mock` (LLM_MOCK=false + no key → error ChatResponse `OPENROUTER_API_KEY is not set`, acompletion never called) |
| 7 | Any LLM-backend failure returns HTTP 503 with a valid ChatResponse body — never a 500 | ✓ VERIFIED | **CR-02 closed.** `service.py:21` `from openai import APIError as OpenAIAPIError`; `service.py:244` `except (OpenAIAPIError, ValidationError)` — the common base of the litellm/openai hierarchy, re-probed via `issubclass`: RateLimitError ✓, BadRequestError ✓, ContextWindowExceededError ✓, AuthenticationError ✓, APIConnectionError ✓, Timeout ✓ all subclass `openai.APIError`. `_execute_trade` (`service.py:177`) catches `Exception` per action so one failure never aborts the batch. Regression tests pass: `test_rate_limit_error_maps_to_error_response_not_500` (RateLimitError raised through `acompletion` → error ChatResponse, never a raise) and `test_unexpected_exception_in_one_trade_does_not_abort_batch` (RuntimeError in trade 1 → `status:"failed"`, trade 2 still `executed`, `response.error is None`). Endpoint-level 503 contract intact: `router.py:33-34` maps `error is not None` → 503; `test_no_key_returns_503_chat_response_shape`, `test_llm_backend_error_returns_503`, `test_malformed_proposal_returns_503_and_executes_nothing` all assert `resp.status_code == 503` |

**Score:** 7/7 truths verified (0 present-but-behavior-unverified; 0 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `backend/app/chat/schemas.py` | CHAT-01 envelope (ChatRequest, TradeAction, WatchlistChange, TradeActionResult, WatchlistChangeResult, ChatProposal, ChatResponse) | ✓ VERIFIED | 70 lines, all 7 classes defined, ticker normalization + Field(gt=0) + 12-char bound; wired into service/router/tests |
| `backend/app/chat/prompts.py` | SYSTEM_PROMPT + pure build_context | ✓ VERIFIED | Starts "FinAlly, an AI trading assistant"; formatter has no DB/cache access; unit-tested |
| `backend/app/chat/service.py` | Orchestrator: context, LLM seam, parse, execute, persist | ✓ VERIFIED | Substantive (271 lines) and wired; CR-01 fixed (`_mock_enabled()` at 38-46 used at both call sites 103/223); CR-02 fixed (`OpenAIAPIError, ValidationError` catch at 244; per-action `except Exception` at 177) |
| `backend/app/chat/router.py` | POST /api/chat, app.state DI, 503 mapping | ✓ VERIFIED | Wired into main.py:78; 503 set exactly when `result.error is not None` (line 33-34) — now reached for the full litellm exception hierarchy |
| `backend/app/main.py` | load_dotenv before app construction + chat_router registration | ✓ VERIFIED | `load_dotenv()` at line 28 before `app = FastAPI(...)` at line 73; chat_router included line 78 |
| `.env.example` | Documents OPENROUTER_API_KEY / LLM_MOCK / MASSIVE_API_KEY | ✓ VERIFIED | Placeholders only; `.env` gitignored (git check-ignore exit 0), `.env.example` committed. Default `LLM_MOCK=false` now correctly disables mock |
| `backend/pyproject.toml` + `uv.lock` | litellm>=1.98.0, python-dotenv>=1.0 locked | ✓ VERIFIED | Pins present; `importlib.metadata` confirms litellm 1.98.0, python-dotenv 1.2.1 installed |
| `backend/tests/chat/` (conftest, test_service, test_chat_endpoint, test_execution) | 43-test battery (incl. 4 CR regressions) | ✓ VERIFIED | 43/43 pass in one run; full suite 158/158 pass; ruff clean |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `router.py` | `process_message` | `request.app.state` (db_path/price_cache/market_source) — no module singletons | WIRED | router.py:28-32 |
| `service.py` | `execute_trade`/`TradeRequest` (portfolio) | `TradeRequest(**proposal)` + `execute_trade(conn, price_cache, trade)` — manual-trade validation reused, no re-implementation | WIRED | service.py:171-173 |
| `service.py` | `add_ticker`/`remove_ticker` (watchlist) | awaited in `_apply_watchlist_change` — DB row + market source + cache kept in sync | WIRED | service.py:181-197 |
| `service.py` | `chat_messages` (db) | `_save_messages` inserts user + assistant rows with JSON actions in one `with conn:` | WIRED | service.py:130-159; schema database.py:59-66 |
| Mock branch ↔ live branch | Same JSON-string shape | Both return a JSON string parsed by the same `ChatProposal.model_validate_json` path; mock gated by `_mock_enabled()` | WIRED | service.py:103-127 |
| Router error → HTTP 503 | ChatResponse with `error` set | `response.status_code = 503` when `result.error is not None` | WIRED | router.py:33-34; full litellm hierarchy now funnels through the tolerant catch (service.py:244), so the 503 path is reached for all routine failure modes |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `build_context` input | portfolio/watchlist | `get_portfolio(conn, price_cache)` / `get_watchlist(conn, price_cache)` — real DB queries | Yes | ✓ FLOWING |
| History context | history rows | `_load_history` — real `SELECT ... FROM chat_messages` | Yes | ✓ FLOWING |
| Trade results in response | `trades[]` status | Real `execute_trade` side effects (cash/positions/trades rows asserted in tests) | Yes | ✓ FLOWING |
| Watchlist results in response | `watchlist_changes[]` status | Real `add_ticker`/`remove_ticker` (row + source.tracked + cache asserted) | Yes | ✓ FLOWING |
| Assistant message | `proposal.message` | LLM output (mock canned dict by design, or live `acompletion` content — reachable under `LLM_MOCK=false` + key) | Yes (mode-appropriate) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Chat test battery (SC1-SC5 + CR regressions) | `uv run --extra dev pytest tests/chat -q` | **43 passed** in 1.13s (was 39; +4 CR regression tests) | ✓ PASS |
| Phase gate (full regression) | `uv run --extra dev pytest -q` | **158 passed**, 2 warnings (was 154) | ✓ PASS |
| Lint | `uv run --extra dev ruff check app/chat/` | All checks passed | ✓ PASS |
| CR-01: `LLM_MOCK=false` + no key → locked 503? | `test_mock_false_without_key_returns_error_not_mock` (monkeypatched env, real pipeline) | error ChatResponse `OPENROUTER_API_KEY is not set`, no acompletion call — matches endpoint test `test_no_key_returns_503_chat_response_shape` (503) | ✓ PASS (was FAIL) |
| CR-01: `LLM_MOCK=false` + key → live branch? | `test_mock_false_is_not_truthy_live_branch_runs` (monkeypatched acompletion) | acompletion reached with model `openrouter/openai/gpt-oss-120b`, live content `'{"message":"ok"}'` returned — no `[mock]` short-circuit | ✓ PASS (was FAIL) |
| CR-02: RateLimitError → 503 ChatResponse body? | `test_rate_limit_error_maps_to_error_response_not_500` (RateLimitError raised from acompletion) + `test_llm_backend_error_returns_503` (endpoint) | error ChatResponse (`"unavailable"`), trades/watchlist empty, never raised; endpoint asserts 503 | ✓ PASS (was FAIL) |
| CR-02: non-TradeError in one action aborts batch? | `test_unexpected_exception_in_one_trade_does_not_abort_batch` (RuntimeError in trade 1) | trade 1 `status:"failed"` with `Trade failed: boom`, trade 2 `status:"executed"`, `response.error is None` (HTTP 200) | ✓ PASS (was FAIL) |
| Exception hierarchy covers full litellm family? | `issubclass` probe vs `openai.APIError` | RateLimitError/BadRequestError/ContextWindowExceededError/AuthenticationError/APIConnectionError/Timeout → all True | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| n/a — no `probe-*.sh` scripts exist in the repo (`scripts/` tree has none), and no phase PLAN/SUMMARY declares probes | — | — | SKIPPED (no runnable probes) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| CHAT-01 | 02-01, 02-02, 02-03 | `POST /api/chat` returns a complete structured JSON response (message + trades + watchlist_changes) | ✓ SATISFIED | schemas.py envelope; router.py POST; HTTP happy-path test |
| CHAT-02 | 02-02 | AI auto-executes trades from the structured response using the same validation as manual trades | ✓ SATISFIED | service.py:162-178; test_execution.py buy/sell/insufficient-cash/shares/unknown scenarios; per-action Exception isolation keeps batch alive |
| CHAT-03 | 02-02 | AI auto-applies watchlist changes from the structured response | ✓ SATISFIED | service.py:181-197; test_execution.py add/remove/duplicate/unknown |
| CHAT-04 | 02-02, 02-03 | Conversation history persists in `chat_messages` and is included as context on subsequent messages | ✓ SATISFIED | service.py:62-87, 130-159; history-as-context HTTP test |
| CHAT-05 | 02-02, 02-03 | `LLM_MOCK=true` returns deterministic mock responses (no API key required) | ✓ SATISFIED | mock branch service.py:49-59, 103-104 gated by `_mock_enabled()`; byte-identical HTTP determinism test |

No orphaned requirements: the five CHAT IDs claimed by plans (02-01: [CHAT-01]; 02-02: [CHAT-01..05]; 02-03: [CHAT-01, CHAT-04, CHAT-05]) exactly cover the five IDs REQUIREMENTS.md maps to Phase 2. All five carry `[x] Complete` in REQUIREMENTS.md, consistent with implementation.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `backend/app/chat/service.py` | 73 | History `actions` dropped from LLM context (WR-02) | ⚠️ Warning | Model never sees which actions executed; persisted for future use only |
| `backend/app/chat/schemas.py` | 13 | `ChatRequest.message` has no `max_length` (WR-01) | ⚠️ Warning | Unbounded token cost; megabyte messages replayed 20× in history |
| `backend/app/chat/service.py` | 247 | Raw exception text in 503 `error` field (WR-03) | ⚠️ Warning | Provider/request details leaked to unauthenticated callers |
| `backend/app/chat/service.py` | 258-263 | Execution commits before `_save_messages` (WR-04) | ⚠️ Warning | Retry after a failed save can double-execute a proposal |
| `backend/app/chat/prompts.py` | 24-36 | Ticker symbols interpolated unescaped (WR-05) | ⚠️ Warning | Newline-injection into the prompt via 12-char tickers |

**Blockers from the previous verification (CR-01, CR-02) are RESOLVED — no blocker-level findings remain.** The three former blocker rows (service.py bare env truthiness at 91/199; incomplete exception tuple at 215-220; per-action catch limited to TradeError at 149-154/226-232) are eliminated by the 51fb5a7 fix. WR-01..WR-05 are pre-existing informational warnings, unchanged by the fix, and do not block the phase goal.

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers and no leftover `NotImplementedError` stubs in `backend/app/chat/`.

### Human Verification Required

Informational only (not a gate — all five success criteria and both CR regressions are behaviorally proven by the passing suite):

1. **Optional live smoke test against real OpenRouter** — the one item in this phase that requires a human.
   - **Test:** Put a real `OPENROUTER_API_KEY` in the project-root `.env`, ensure `LLM_MOCK` is unset or `false` (now correctly interpreted), start the backend, and `POST /api/chat {"message": "What is my portfolio worth?"}`.
   - **Expected:** HTTP 200 with a genuine (non-`[mock]`) assistant message and empty/valid action arrays.
   - **Why human:** requires a real API key and live provider access; the recorded-kwargs unit tests pin the request shape, but only a real call proves the provider contract end-to-end.

### Gaps Summary

**No gaps remain. All 7/7 must-haves verified; phase goal achieved.**

The two code-review-critical blockers from the previous verification are both closed in commit 51fb5a7, confirmed against the live code and behaviorally:

1. **CR-01 (LLM_MOCK truthiness) — CLOSED.** The bare-truthiness checks at the two call sites were replaced by the explicit `_mock_enabled()` parser (`service.py:38-46`), which treats only `true`/`1`/`yes` (case-insensitive) as truthy. `.env.example`'s `LLM_MOCK=false` now correctly leaves mock mode OFF. Two new regression tests behaviorally prove it: with a key, the live `acompletion` branch is reached; without a key, the locked `OPENROUTER_API_KEY is not set` error ChatResponse is returned (503 at the router) and the mock is never served.
2. **CR-02 (error contract) — CLOSED.** The 4-type exception tuple was replaced with `except (OpenAIAPIError, ValidationError)` using `openai.APIError` — re-probed by `issubclass` to be the common base of the entire litellm hierarchy (RateLimitError, BadRequestError, ContextWindowExceededError, AuthenticationError, APIConnectionError, Timeout all True). `_execute_trade` now catches `Exception` per action, so a non-TradeError in one action marks it failed while the rest of the batch executes. Both new regression tests pass, and the endpoint-level 503 contract (router.py:33-34) is asserted by three existing HTTP tests.

Verification evidence: chat battery **43/43 passed** (was 39), full suite **158/158 passed** (was 154), `ruff check app/chat/` clean, no debt markers in the fixed file. Commit 51fb5a7 touches only `service.py` (+48/-15), `test_service.py` (+106), and `test_execution.py` (±4) — a minimal, targeted fix with no collateral changes.

---

_Verified: 2026-08-26T23:45:00Z_
_Verifier: the agent (gsd-verifier)_
