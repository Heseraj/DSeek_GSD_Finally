---
phase: 02-ai-chat-assistant
verified: 2026-08-26T23:05:00Z
status: gaps_found
score: 5/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Under the documented .env configuration (LLM_MOCK=false, the .env.example default), the live LLM branch runs when OPENROUTER_API_KEY is set, and the missing-key guard returns the locked 503 error"
    status: failed
    reason: "CR-01 (code-review critical, behaviorally confirmed): both LLM_MOCK checks use bare string truthiness (service.py:91 `if os.environ.get(\"LLM_MOCK\")` and service.py:199 `if not os.environ.get(\"LLM_MOCK\") ...`), and bool(\"false\") == True. The documented default therefore silently activates the mock branch: with LLM_MOCK=false + key set the live AI never runs (canned AAPL buy executes against the real portfolio while appearing live), and with LLM_MOCK=false + no key the API serves mock 200 responses instead of the locked 'OPENROUTER_API_KEY is not set' 503. This defeats the phase goal's 'the AI analyzes the portfolio' clause under the operator's most likely configuration."
    artifacts:
      - path: "backend/app/chat/service.py"
        issue: "Lines 91 and 199 use bare truthiness on the LLM_MOCK env string; 'false' is truthy"
    missing:
      - "Parse the flag explicitly, e.g. _mock_enabled() returning os.environ.get('LLM_MOCK','').strip().lower() in {'1','true','yes','on'}, used at both service.py:91 and service.py:199"
      - "A test with monkeypatch.setenv('LLM_MOCK', 'false') + no key asserting the 503 error ChatResponse (the exact .env.example configuration)"
  - truth: "Any LLM-backend failure returns HTTP 503 with a valid ChatResponse body — never a 500"
    status: failed
    reason: "CR-02 (code-review critical, behaviorally confirmed): the tolerant-parse except clause (service.py:215-220) catches only AuthenticationError, APIConnectionError, Timeout, and ValidationError. litellm.exceptions.RateLimitError (confirmed by probe — propagates out of generate_assistant_response at service.py:108), BadRequestError, ContextWindowExceededError, APIError, and sqlite3.OperationalError all escape to FastAPI's default 500 handler with a bare {\"detail\": ...} body, violating the locked never-500 contract (router.py:22-26) that Phase 3's frontend renders. Additionally _execute_trade (service.py:149-154) catches only TradeError, so a non-TradeError in one action propagates out of the list comprehension (service.py:226-228) and aborts the batch mid-way."
    artifacts:
      - path: "backend/app/chat/service.py"
        issue: "Except clause at lines 215-220 covers 4 of the routine litellm failure modes; executor loops at 226-232 only isolate TradeError"
    missing:
      - "Broaden the except tuple to include RateLimitError, BadRequestError, APIError (and log server-side, return generic error) "
      - "Catch Exception per action in _execute_trade/_apply_watchlist_change so one failing action never aborts the batch"
      - "An endpoint test raising RateLimitError asserting 503 + ChatResponse body"
---

# Phase 2: AI Chat Assistant Verification Report

**Phase Goal:** A chat endpoint where the AI analyzes the portfolio and auto-executes trades and watchlist changes from natural language.
**Verified:** 2026-08-26T23:05:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

The chat endpoint is implemented end-to-end: `POST /api/chat` receives natural-language messages, assembles portfolio/watchlist/history context, produces a structured proposal (mock or live LLM), auto-executes proposed trades and watchlist changes through the exact Phase 1 services, persists the conversation, and returns a structured envelope. All five roadmap success criteria are individually proven TRUE by passing behavioral tests. **However, two code-review-critical defects (CR-01, CR-02 from 02-REVIEW.md) remain unfixed in the delivered code and are behaviorally confirmed below.** CR-01 means the live AI path is unreachable under the documented `.env.example` configuration, and CR-02 means the locked "never 500" error contract is violated on routine failure modes — so the phase goal is not fully achieved as shipped.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: Sending a message to `POST /api/chat` returns a structured response with assistant text plus any trades and watchlist changes | ✓ VERIFIED | `router.py:14-35` (POST, response_model=ChatResponse); `schemas.py:64-70` (envelope with per-action status); HTTP test `test_chat_mock_happy_path_executes_trade_and_persists` (200 + envelope + executed AAPL trade). Live branch kwargs pinned by `test_live_branch_calls_acompletion_with_expected_kwargs`. Caveat: on unhandled exception paths a raw 500 escapes (Gap 2) |
| 2 | SC2: A buy or sell proposed by the AI executes automatically and updates cash and positions using manual-trade validation | ✓ VERIFIED | `service.py:143-154` (`TradeRequest(**proposal)` → `execute_trade`, manual validation reused); `test_buy_executes` (cash 9620.0, position qty 2), `test_sell_executes` (cash 9810.0, avg_cost 190.0 unchanged), `test_insufficient_cash_keeps_batch_alive` (failed+executed in one batch), `test_insufficient_shares`, `test_unknown_ticker` — all through the real pipeline |
| 3 | SC3: A watchlist change proposed by the AI applies automatically | ✓ VERIFIED | `service.py:157-173` (`add_ticker`/`remove_ticker` — DB row + market source + price cache in sync); `test_watchlist_add_applies` (row exists, `source.tracked == {"PYPL"}`, cache price 100.0), `test_watchlist_remove_applies` (row gone, cache cleared), `test_duplicate_add`, `test_remove_unknown` |
| 4 | SC4: Conversation history persists with executed actions and is included as context on later messages | ✓ VERIFIED | `service.py:118-140` (`_save_messages` — user row actions NULL, assistant row JSON actions), `service.py:50-75` (`_load_history` + `build_messages` include prior turns); `test_history_persists_and_is_included_as_context` (4 rows after 2 turns; prior "hello" captured in second call's LLM messages; actions JSON `"status": "executed"`). Warning WR-02: actions column is persisted but not fed into the LLM context payload |
| 5 | SC5: With `LLM_MOCK=true`, chat returns deterministic responses without an API key | ✓ VERIFIED | `service.py:91-92` (mock branch, no key touched); `test_mock_deterministic_across_requests` (byte-identical bodies over HTTP), `test_mock_mode_returns_canned_dict` (unit-level exact dict); full chat suite runs with no OPENROUTER_API_KEY |
| 6 | Under the documented `.env` configuration (`LLM_MOCK=false`, per `.env.example:9`), the live LLM branch runs when a key is set, and the missing-key guard returns the locked 503 | ✗ FAILED | **CR-01**, behaviorally confirmed: `LLM_MOCK=false` + key → HTTP 200 `[mock] Acknowledged: ...` (live AI never runs); `LLM_MOCK=false` + no key → HTTP 200 mock instead of 503. Root cause `service.py:91`/`:199` bare truthiness. See Gap 1 |
| 7 | Any LLM-backend failure returns HTTP 503 with a valid ChatResponse body — never a 500 | ✗ FAILED | **CR-02**, behaviorally confirmed: `RateLimitError` raised by `litellm.acompletion` propagates out of the 4-type catch (`service.py:215-220`), escaping as a raw 500 (probe raised the exception through the endpoint). See Gap 2 |

**Score:** 5/7 truths verified (0 present-but-behavior-unverified; 2 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `backend/app/chat/schemas.py` | CHAT-01 envelope (ChatRequest, TradeAction, WatchlistChange, TradeActionResult, WatchlistChangeResult, ChatProposal, ChatResponse) | ✓ VERIFIED | 70 lines, all 7 classes defined, ticker normalization + Field(gt=0) + 12-char bound; wired into service/router/tests |
| `backend/app/chat/prompts.py` | SYSTEM_PROMPT + pure build_context | ✓ VERIFIED | Starts "FinAlly, an AI trading assistant"; formatter has no DB/cache access; unit-tested |
| `backend/app/chat/service.py` | Orchestrator: context, LLM seam, parse, execute, persist | ✓ VERIFIED (2 defects) | Substantive (247 lines) and wired; contains CR-01 (lines 91, 199) and CR-02 (lines 149-154, 215-220) defects |
| `backend/app/chat/router.py` | POST /api/chat, app.state DI, 503 mapping | ✓ VERIFIED | Wired into main.py:78; 503 set exactly when `result.error is not None` (line 33-34) |
| `backend/app/main.py` | load_dotenv before app construction + chat_router registration | ✓ VERIFIED | `load_dotenv()` at line 28 before `app = FastAPI(...)` at line 73; chat_router included line 78 |
| `.env.example` | Documents OPENROUTER_API_KEY / LLM_MOCK / MASSIVE_API_KEY | ✓ VERIFIED | Placeholders only; `.env` gitignored (git check-ignore exit 0), `.env.example` committed |
| `backend/pyproject.toml` + `uv.lock` | litellm>=1.98.0, python-dotenv>=1.0 locked | ✓ VERIFIED | Pins present; `importlib.metadata` confirms litellm 1.98.0, python-dotenv 1.2.1 installed |
| `backend/tests/chat/` (conftest, test_service, test_chat_endpoint, test_execution) | 39-test battery | ✓ VERIFIED | 39/39 pass in one run; full suite 154/154 pass; ruff clean |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `router.py` | `process_message` | `request.app.state` (db_path/price_cache/market_source) — no module singletons | WIRED | router.py:28-32 |
| `service.py` | `execute_trade`/`TradeRequest` (portfolio) | `TradeRequest(**proposal)` + `execute_trade(conn, price_cache, trade)` — manual-trade validation reused, no re-implementation | WIRED | service.py:149-154 |
| `service.py` | `add_ticker`/`remove_ticker` (watchlist) | awaited in `_apply_watchlist_change` — DB row + market source + cache kept in sync | WIRED | service.py:157-173 |
| `service.py` | `chat_messages` (db) | `_save_messages` inserts user + assistant rows with JSON actions in one `with conn:` | WIRED | service.py:118-140; schema database.py:59-66 |
| Mock branch ↔ live branch | Same JSON-string shape | Both return a JSON string parsed by the same `ChatProposal.model_validate_json` path | WIRED | service.py:91-115 |
| Router error → HTTP 503 | ChatResponse with `error` set | `response.status_code = 503` when `result.error is not None` | PARTIAL | router.py:33-34 works for the 4 caught types; CR-02 unhandled types bypass it (raw 500) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `build_context` input | portfolio/watchlist | `get_portfolio(conn, price_cache)` / `get_watchlist(conn, price_cache)` — real DB queries | Yes | ✓ FLOWING |
| History context | history rows | `_load_history` — real `SELECT ... FROM chat_messages` | Yes | ✓ FLOWING |
| Trade results in response | `trades[]` status | Real `execute_trade` side effects (cash/positions/trades rows asserted in tests) | Yes | ✓ FLOWING |
| Watchlist results in response | `watchlist_changes[]` status | Real `add_ticker`/`remove_ticker` (row + source.tracked + cache asserted) | Yes | ✓ FLOWING |
| Assistant message | `proposal.message` | LLM output (mock canned dict by design, or live `acompletion` content) | Yes (mode-appropriate) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Chat test battery (SC1-SC5) | `uv run --extra dev pytest tests/chat -q` | 39 passed in 0.92s | ✓ PASS |
| Phase gate (full regression) | `uv run --extra dev pytest -q` | 154 passed, 2 warnings | ✓ PASS |
| Lint | `uv run --extra dev ruff check app/chat/` | All checks passed | ✓ PASS |
| Deps installed/locked | `importlib.metadata` probe | litellm 1.98.0 OK, dotenv 1.2.1 OK | ✓ PASS |
| CR-01: `LLM_MOCK=false` + no key → locked 503? | Endpoint probe (`POST /api/chat`, LLM_MOCK=false, no key) | **HTTP 200 `[mock] Acknowledged: hello`, error=None** — expected 503 | ✗ FAIL (confirms CR-01) |
| CR-01: `LLM_MOCK=false` + key → live branch? | Endpoint probe (`LLM_MOCK=false`, key set) | **HTTP 200 with `[mock]` prefix** — mock served, live AI never reached | ✗ FAIL (confirms CR-01) |
| CR-02: RateLimitError → 503 ChatResponse body? | Endpoint probe (LLM_MOCK unset, `acompletion` raises `RateLimitError`) | **Exception propagates out of the endpoint** (raw 500 in server terms) | ✗ FAIL (confirms CR-02) |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| n/a — no `probe-*.sh` scripts exist in the repo (`scripts/` tree has none), and no phase PLAN/SUMMARY declares probes | — | — | SKIPPED (no runnable probes) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| CHAT-01 | 02-01, 02-02, 02-03 | `POST /api/chat` returns a complete structured JSON response (message + trades + watchlist_changes) | ✓ SATISFIED | schemas.py envelope; router.py POST; HTTP happy-path test |
| CHAT-02 | 02-02 | AI auto-executes trades from the structured response using the same validation as manual trades | ✓ SATISFIED | service.py:149-154; test_execution.py buy/sell/insufficient-cash/shares/unknown scenarios |
| CHAT-03 | 02-02 | AI auto-applies watchlist changes from the structured response | ✓ SATISFIED | service.py:157-173; test_execution.py add/remove/duplicate/unknown |
| CHAT-04 | 02-02, 02-03 | Conversation history persists in `chat_messages` and is included as context on subsequent messages | ✓ SATISFIED | service.py:50-75, 118-140; history-as-context HTTP test |
| CHAT-05 | 02-02, 02-03 | `LLM_MOCK=true` returns deterministic mock responses (no API key required) | ✓ SATISFIED | mock branch service.py:91-92; byte-identical HTTP determinism test |

No orphaned requirements: the five CHAT IDs claimed by plans (02-01: [CHAT-01]; 02-02: [CHAT-01..05]; 02-03: [CHAT-01, CHAT-04, CHAT-05]) exactly cover the five IDs REQUIREMENTS.md maps to Phase 2. All five also carry `[x] Complete` in REQUIREMENTS.md, consistent with implementation.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `backend/app/chat/service.py` | 91, 199 | Bare truthiness on env string (`LLM_MOCK=false` → truthy) | 🛑 Blocker (CR-01) | Documented default config silently runs mock; live AI unreachable; no-key 503 guard bypassed; canned AAPL buy executes against real portfolio while appearing live |
| `backend/app/chat/service.py` | 215-220 | Incomplete exception tuple in tolerant handler | 🛑 Blocker (CR-02) | RateLimitError/BadRequestError/ContextWindowExceededError/APIError/sqlite errors → raw 500, violating the locked never-500 contract |
| `backend/app/chat/service.py` | 149-154, 226-232 | Per-action isolation only catches `TradeError` | 🛑 Blocker (CR-02) | Non-TradeError in one action aborts the whole batch mid-way, after earlier actions committed |
| `backend/app/chat/service.py` | 73 | History `actions` dropped from LLM context (WR-02) | ⚠️ Warning | Model never sees which actions executed; persisted for future use only |
| `backend/app/chat/schemas.py` | 13 | `ChatRequest.message` has no `max_length` (WR-01) | ⚠️ Warning | Unbounded token cost; megabyte messages replayed 20× in history |
| `backend/app/chat/service.py` | 223 | Raw exception text in 503 `error` field (WR-03) | ⚠️ Warning | Provider/request details leaked to unauthenticated callers |
| `backend/app/chat/service.py` | 226-239 | Execution commits before `_save_messages` (WR-04) | ⚠️ Warning | Retry after a failed save can double-execute a proposal |
| `backend/app/chat/prompts.py` | 24-36 | Ticker symbols interpolated unescaped (WR-05) | ⚠️ Warning | Newline-injection into the prompt via 12-char tickers |

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers and no leftover `NotImplementedError` stubs in `backend/app/chat/`.

### Human Verification Required

Informational (gaps take precedence per decision tree; not routed as a blocking human gate):

1. **Optional live smoke test against real OpenRouter** — the one item in this phase that requires a human. 
   - **Test:** Put a real `OPENROUTER_API_KEY` in the project-root `.env`, ensure `LLM_MOCK` is *unset* (note: `LLM_MOCK=false` currently activates mock — see Gap 1), start the backend, and `POST /api/chat {"message": "What is my portfolio worth?"}`.
   - **Expected:** HTTP 200 with a genuine (non-`[mock]`) assistant message and empty/valid action arrays.
   - **Why human:** requires a real API key and live provider access; the recorded-kwargs unit tests pin the request shape, but only a real call proves the provider contract end-to-end.

### Gaps Summary

**5/7 must-haves verified; 2 critical code-review defects confirmed in the delivered code, blocking full goal achievement.**

The chat subsystem is architecturally sound and all five roadmap success criteria hold in their tested configurations: the structured envelope, auto-execution through Phase 1 validation, watchlist auto-apply, history persistence + context, and mock determinism are all proven by passing behavioral tests (39 chat + 154 total, ruff clean).

The phase goal — *"the AI analyzes the portfolio"* — is not fully achieved as shipped for two behaviorally-confirmed reasons:

1. **Gap 1 (CR-01, `LLM_MOCK=false` truthiness):** The `.env.example` shipped by this very phase documents `LLM_MOCK=false` as the default. Because both checks in `service.py` use bare string truthiness, an operator following the documented setup silently gets the mock branch — the live AI never runs even with a valid key, and the no-key 503 guard is bypassed (mock 200 served instead). The canned AAPL buy executes against the real portfolio while the UI would appear to be a live AI. This defeats the goal's core "AI analyzes" clause in the most likely production configuration.
2. **Gap 2 (CR-02, error-contract violation):** The locked "never 500" contract (router.py:22-26, the contract Phase 3's frontend renders) is violated by unhandled litellm exceptions — `RateLimitError` confirmed by probe; `BadRequestError`, `ContextWindowExceededError`, `APIError`, and sqlite errors also escape. Additionally, per-action isolation breaks on non-`TradeError` exceptions, aborting a batch after earlier actions have already committed.

Both gaps are actionable with well-defined fixes (an explicit `_mock_enabled()` parse; a broadened exception tuple + per-action `Exception` catch), already specified in 02-REVIEW.md. Neither is addressed by Phase 3 (frontend — consumes the 503 contract) or Phase 4 (Docker/E2E — uses `LLM_MOCK=true`), so they are not deferred.

---

_Verified: 2026-08-26T23:05:00Z_
_Verifier: the agent (gsd-verifier)_
