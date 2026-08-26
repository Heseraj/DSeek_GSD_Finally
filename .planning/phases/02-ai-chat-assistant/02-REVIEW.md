---
phase: 02-ai-chat-assistant
reviewed: 2026-08-26T22:21:05Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - .env.example
  - backend/app/chat/__init__.py
  - backend/app/chat/prompts.py
  - backend/app/chat/router.py
  - backend/app/chat/schemas.py
  - backend/app/chat/service.py
  - backend/app/main.py
  - backend/pyproject.toml
  - backend/tests/chat/__init__.py
  - backend/tests/chat/conftest.py
  - backend/tests/chat/test_chat_endpoint.py
  - backend/tests/chat/test_execution.py
  - backend/tests/chat/test_service.py
  - backend/uv.lock
findings:
  critical: 2
  warning: 5
  info: 5
  total: 12
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-08-26T22:21:05Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Reviewed the Phase 2 AI Chat Assistant implementation: `POST /api/chat` endpoint, LiteLLM/OpenRouter live branch with `LLM_MOCK` seam, structured proposal parsing, auto-execution of trades/watchlist changes reusing Phase 1 services, and `chat_messages` persistence. Cross-referenced against `app/db/database.py`, `app/portfolio/service.py`, `app/watchlist/service.py`, and the market cache/interface.

The architecture is sound: trades and watchlist changes flow through the exact Phase 1 services (`execute_trade`, `add_ticker`/`remove_ticker`) with identical validation, per-action error capture is correctly implemented for `TradeError`, the key pre-check runs before any LLM call, and the test battery is strong. However, two blocking defects were found:

1. **`LLM_MOCK=false` is truthy** — the documented `.env` configuration silently activates mock mode, defeating both the live branch and the missing-key 503 guard.
2. **The locked error contract ("never 500") is violated** — the tolerant-parse `except` clause covers only 4 of the routine failure modes of `litellm.acompletion` (rate limits, context overflow, provider 5xx, DB errors in the executor loops all escape to a raw FastAPI 500).

Additionally, five warnings (unbounded message cost vector, history `actions` never reaching the LLM context, raw exception text leaked to clients, execution-before-persistence ordering, newline-injection into the prompt via ticker symbols) and five info items are reported.

## Critical Issues

### CR-01: `LLM_MOCK=false` is evaluated truthy — documented config silently activates mock mode

**File:** `backend/app/chat/service.py:91`, `backend/app/chat/service.py:199`; `.env.example:9`
**Issue:** Both mock-mode checks use bare truthiness on the env string:

```python
if os.environ.get("LLM_MOCK"):                      # line 91
...
if not os.environ.get("LLM_MOCK") and not os.environ.get("OPENROUTER_API_KEY"):  # line 199
```

`.env.example` documents `LLM_MOCK=false` as the default. `os.environ.get("LLM_MOCK")` returns the string `"false"`, which is truthy — so an operator who copies `.env.example`, fills in `OPENROUTER_API_KEY`, and leaves `LLM_MOCK=false` (the documented default) gets the **mock branch**, not the live model. Consequences:
- The live LiteLLM branch silently never runs; every turn executes the canned AAPL buy against the real portfolio (real cash depletion) while appearing to be a live AI.
- The no-key 503 guard (line 199) is also bypassed: with `LLM_MOCK=false` and **no** key set, the API happily serves mock responses instead of the locked "OPENROUTER_API_KEY is not set" error.
- The existing tests never catch this because `test_no_key_returns_503_chat_response_shape` uses `monkeypatch.delenv("LLM_MOCK", ...)` instead of setting it to `"false"` — the exact value the shipped `.env.example` prescribes.

Verified: `bool("false") == True`.

**Fix:** Parse the flag explicitly and reuse it in both places:
```python
def _mock_enabled() -> bool:
    return os.environ.get("LLM_MOCK", "").strip().lower() in {"1", "true", "yes", "on"}

# line 91
if _mock_enabled():
    return json.dumps(_mock_response(messages[-1]["content"]))

# line 199
if not _mock_enabled() and not os.environ.get("OPENROUTER_API_KEY"):
    ...
```
Add a test: `monkeypatch.setenv("LLM_MOCK", "false")` + no key → expects the 503 error ChatResponse (mirrors the `.env.example` configuration).

### CR-02: Unhandled LLM/executor exceptions produce raw HTTP 500, violating the locked error contract

**File:** `backend/app/chat/service.py:215-224` (catch clause), `226-232` (executor loops), `234-239` (`_save_messages`)
**Issue:** The router docstring locks an error contract: "any ChatResponse whose top-level error is set is returned with HTTP 503 ... **never 500**, never a bare detail." But the tolerant-parse block catches only `AuthenticationError`, `APIConnectionError`, `Timeout`, and `ValidationError`. Routine production failures escape to FastAPI's default 500 handler with a bare `{"detail": ...}` body the Phase 3 frontend cannot parse:

- `litellm.exceptions.RateLimitError` (429 from OpenRouter — routine under load)
- `litellm.exceptions.BadRequestError` / `ContextWindowExceededError` (guaranteed once history + unbounded messages exceed the model window — see WR-01)
- `litellm.exceptions.APIError`, `InternalServerError`, `APIResponseValidationError`, and the raw `openai.*` SDK exceptions litellm can re-raise directly
- `sqlite3.OperationalError` ("database is locked" with concurrent requests, disk full) from `execute_trade` / `add_ticker` / `_save_messages` — note `get_connection` sets no explicit `busy_timeout`

The same gap breaks the per-action isolation contract: `_execute_trade` catches only `TradeError` (service.py:153), so a non-`TradeError` exception in one action propagates out of the list comprehension at line 226-228 and aborts the entire batch mid-way — after earlier actions have already committed — leaving the turn in a state where some trades ran, none were persisted, and the client got a 500.

(Verified: `model_validate_json(None)` raises `pydantic_core.ValidationError`, which *is* caught, so the null-content path alone is not the problem — the gap is the exception *types* above.)

**Fix:** Broaden the catch around the LLM call and parse:
```python
except (
    litellm.exceptions.AuthenticationError,
    litellm.exceptions.APIConnectionError,
    litellm.exceptions.Timeout,
    litellm.exceptions.RateLimitError,
    litellm.exceptions.BadRequestError,   # includes ContextWindowExceededError
    litellm.exceptions.APIError,
    ValidationError,
) as exc:
    logger.warning("LLM backend error: %s", exc, exc_info=True)
    return ChatResponse(
        message="The AI backend could not produce a valid response. Please try again.",
        error="LLM backend unavailable",
    )
```
And in `_execute_trade` / `_apply_watchlist_change`, catch `Exception` per action (logging it) so one failing action never aborts the batch, matching the documented per-action contract.

## Warnings

### WR-01: Unbounded user message length defeats the documented "unbounded cost" mitigation

**File:** `backend/app/chat/schemas.py:13`; `backend/app/chat/service.py:134`
**Issue:** `ChatRequest.message` has `min_length=1` but **no `max_length`**. The message is (a) sent verbatim to the LLM in the last user turn (token cost directly proportional to input size) and (b) persisted verbatim into `chat_messages`, then replayed into every subsequent prompt inside the 20-row history window. The history cap (CHAT-04) limits *turn count*, not *bytes*: a client can post megabyte-scale messages each turn, each retained and re-broadcast 20 times, and eventually exceed the model's context window — which then trips the currently-unhandled `ContextWindowExceededError` from CR-02. This is a genuine hole in the threat model's stated cost mitigation (`history cap, force_timeout=60`).

**Fix:** Bound the input, e.g. `message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]`, and/or truncate history content in `build_messages` to a fixed per-row budget.

### WR-02: Executed-action history is fetched but never fed to the LLM — documented intent unimplemented

**File:** `backend/app/chat/service.py:56-59`, `73`, `126-127`
**Issue:** `_save_messages` states the assistant row "carries the JSON-encoded executed-action results **so later turns can see what ran**." `_load_history` does select the `actions` column, but `build_messages` builds history entries as `{"role": r["role"], "content": r["content"]}` — the `actions` payload is dropped before reaching the LLM. The model can therefore never see which trades actually executed (only the assistant's plain-text `message`, which is the envelope's `message` field, not the JSON envelope). The design intent behind persisting `actions` is not realized, and the LLM is left to guess whether its proposals ran.

**Fix:** Either include a compact action summary in the history context (e.g., append `"\n[executed] trades: ... watchlist: ..."` derived from the `actions` JSON to each assistant history entry), or correct the docstring and accept that actions are persisted for future features only.

### WR-03: Raw exception text leaked to the client in the 503 error field

**File:** `backend/app/chat/service.py:221-224`
**Issue:** `error=f"LLM backend unavailable: {exc}"` embeds the full `str(exc)` of litellm exceptions into the HTTP response body. litellm exception messages can echo provider error bodies, request URLs, model names, and internal request details — information an unauthenticated caller should not receive. The message field already gives the client everything it needs to render a friendly error.

**Fix:** Log the exception server-side and return a generic error string:
```python
logger.warning("LLM backend failure: %s", exc, exc_info=True)
error="LLM backend unavailable",
```

### WR-04: Actions are committed before chat persistence — lost transcript and double-execution risk on retry

**File:** `backend/app/chat/service.py:226-239`
**Issue:** Each trade/watchlist change commits in its own transaction (`execute_trade` and `add_ticker`/`remove_ticker` each use `with conn:`), and `_save_messages` runs *after* both executor loops. If `_save_messages` fails (DB error, disk full, lock timeout) or the process dies between execution and save, the trades are permanently applied but the turn has no chat record — and the client receives a 500/connection error, prompting a retry of the same message, which can execute the same proposal a second time. For a trading application this is a data-integrity hazard: the response cannot tell the client which of the executed actions actually happened.

**Fix:** At minimum, catch failures from `_save_messages` and return an explicit error ChatResponse (503) stating that actions executed but the transcript failed, so the client never retries blind. Stronger: persist the chat rows in the same transaction as execution (requires restructuring `execute_trade`'s inner `with conn:` usage into one outer transaction for the turn).

### WR-05: Newline injection into the LLM prompt context via ticker symbols

**File:** `backend/app/chat/prompts.py:24-36`; `backend/app/chat/schemas.py:33`
**Issue:** `build_context` interpolates ticker strings directly into prompt lines (`POS {ticker} ...`, `Watchlist: ...`). Ticker validation (both `WatchlistChange` and Phase 1 `TickerStr`) bounds length to 12 chars but allows arbitrary characters, including embedded newlines (`strip_whitespace` only trims leading/trailing whitespace). A ticker such as `A\nSELL ALL` (9 chars) is accepted by the schema, lands in `watchlist`/`positions`, and renders as an injected prompt line that terminates the watchlist/position record and adds unrequested instruction text into the model's context — the exact prompt-injection vector the threat model targets. The Pydantic output validation reduces blast radius but does not prevent the model from acting on injected short commands like "SELL ALL" or "BUY AAPL" (both fit in the 12-char budget). Note Phase 1 never feeds watchlist content to an LLM, so this is chat-specific amplification.

**Fix:** Constrain ticker format (e.g., `pattern=r"^[A-Z0-9]{1,12}$"` on `WatchlistChange.ticker` and `TradeAction.ticker`, after normalization) and/or escape newlines in `build_context` (`str.replace("\n", " ")`).

## Info

### IF-01: `TradeAction.ticker` lacks the 12-char bound that `WatchlistChange.ticker` enforces

**File:** `backend/app/chat/schemas.py:19` (vs `33`)
**Issue:** `TradeAction.ticker` is a plain `str` with only whitespace-strip/uppercase normalization; `WatchlistChange.ticker` bounds to 12 chars (matching Phase 1's `TickerStr`). Verified: a 1000-char ticker passes `TradeAction` validation. Harmless in practice today (a trade on such a ticker fails with "No current price" because no cache entry can exist), but the two LLM-output models should validate identically. Apply the same `StringConstraints(strip_whitespace=True, min_length=1, max_length=12)` — it also closes the CR/WR-05 injection surface for trades.

### IF-02: Stale `# noqa: F401` comment on `import litellm`

**File:** `backend/app/chat/service.py:20`
**Issue:** The comment claims litellm is imported for side effects ("used by the live branch"), but it is genuinely used at lines 105, 108, 216-218 — `acompletion`, `supports_response_schema`, and the exception classes. The `# noqa: F401` is misleading and would mask a real unused-import regression. Remove the noqa (and the comment, or reword it).

### IF-03: `ChatProposal.message` allows an empty assistant message

**File:** `backend/app/chat/schemas.py:59`
**Issue:** `message: str` has no `min_length`; verified `ChatProposal.model_validate_json('{"message":""}')` succeeds. An LLM returning `{"message": ""}` yields an empty assistant message that is persisted and returned to the client. Add `min_length=1` (or reject empty after strip).

### IF-04: History ordering and count rely on an undocumented SQLite tiebreak

**File:** `backend/app/chat/service.py:56-60`, `129`, `139`
**Issue:** `_save_messages` stamps both rows of a turn with the identical `created_at` value (same `now`), and `_load_history` orders by `ORDER BY created_at DESC` with no tiebreaker. Correct intra-turn ordering (user before assistant after `reversed()`) currently depends on SQLite's implementation detail of tiebreaking equal sort keys by rowid; this is not guaranteed by the SQL standard and can flip silently (e.g., if the table is ever vacuumed/rebuilt or the query plan changes). Also, `LIMIT 20` on rows is 10 turns, not "up to 20 prior turns" as the docstring claims. Fix: `ORDER BY created_at DESC, rowid DESC LIMIT 20` (makes each turn's user→assistant order explicit after reversal) and correct the docstring.

### IF-05: Mock mode executes real trades — "deterministic" is not "read-only"

**File:** `backend/app/chat/service.py:37-47`
**Issue:** With `LLM_MOCK=true`, every chat turn executes a real $190 AAPL buy against the live portfolio (canned proposal runs through the full execute pipeline, and tests codify this). An operator enabling mock mode for demos may not expect real cash depletion and portfolio mutation. Consider documenting this prominently in `.env.example` (e.g., "mock mode still executes the canned trade"), or adding a no-side-effect mock variant.

---

_Reviewed: 2026-08-26T22:21:05Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
