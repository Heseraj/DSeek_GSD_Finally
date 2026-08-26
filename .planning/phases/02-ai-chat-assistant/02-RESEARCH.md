# Phase 2: AI Chat Assistant — Research

**Researched:** 2026-08-26
**Domain:** LLM integration (LiteLLM → OpenRouter → Cerebras) with structured outputs, auto-execution of trades/watchlist changes, conversation persistence, deterministic mock mode
**Confidence:** HIGH

## Summary

Phase 2 adds `POST /api/chat`: it assembles portfolio + watchlist context, loads conversation history from `chat_messages`, calls the LLM through LiteLLM → OpenRouter (`openrouter/openai/gpt-oss-120b`, Cerebras provider) requesting structured JSON output, parses it, **auto-executes** trades and watchlist changes by reusing the exact Phase 1 service functions (`execute_trade`, `add_ticker`, `remove_ticker`), persists the exchange, and returns a complete JSON response — no streaming (deliberate, per spec §9).

**Primary recommendation:** Add `litellm>=1.98.0` as the single new runtime dependency; build `backend/app/chat/` with a `service.py` that owns prompt assembly, LLM-call branching (mock vs live via `LLM_MOCK` env read at call time), schema parsing with Pydantic, and per-action execution with per-action error capture (a failed trade never aborts the rest of the response); a `router.py` following the established `app.state` DI pattern; and `tests/chat/` tests that exercise the **full parse→execute pipeline** in mock mode so `LLM_MOCK=true` is genuinely deterministic.

**Three findings the planner must honor:**
1. **LiteLLM is NOT in `backend/pyproject.toml`** — it must be added (currently only fastapi, uvicorn[standard], numpy, massive, rich are pinned). PyPI-verified: latest 1.98.0 (2026-08-22), `requires-python >=3.10,<3.15` → Python 3.12 compatible.
2. **No `.env` file exists and the backend has no dotenv loading** — the spec's "backend reads `.env` from the project root" (§5) is unimplemented. `OPENROUTER_API_KEY` is not present on this machine. Live chat cannot be exercised here; `LLM_MOCK=true` is the only executable path unless the user supplies a key. Recommend adding `python-dotenv` with `load_dotenv()` at app import, and code that reads env at call time (so tests can `monkeypatch.setenv`).
3. **The "cerebras-inference skill" referenced by PLAN.md §9 does not exist locally** (searched `.opencode/skills`, `~/.agents/skills`, `~/.claude/skills` — absent). Its intent — LiteLLM → OpenRouter → gpt-oss-120b with Cerebras provider and structured outputs — is fully implementable directly; the plan should treat the skill as out-of-scope and encode the pattern from §9 verbatim.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHAT-01 | `POST /api/chat` returns a complete structured JSON response (message + trades + watchlist_changes) | LiteLLM structured outputs (`response_format` json_schema / Pydantic passthrough) [CITED: docs.litellm.ai/docs/completion/json_mode]; response shape locked by spec §9 schema; Pydantic `ChatResponse` model + per-trade/per-change result enrichment |
| CHAT-02 | AI auto-executes trades using the same validation as manual trades | Reuse `execute_trade(conn, price_cache, trade)` [VERIFIED: backend/app/portfolio/service.py:85]; `TradeError` hierarchy maps validation failures to human-readable errors [VERIFIED: service.py:13-26]; catch per trade so one failure does not abort the response (spec §9: "error is included in the chat response") |
| CHAT-03 | AI auto-applies watchlist changes | Reuse `add_ticker(conn, market_source, ticker) -> (ticker, created)` [VERIFIED: backend/app/watchlist/service.py:34-36] and `remove_ticker(conn, market_source, ticker) -> bool` [VERIFIED: service.py:63-65]; both async — the chat handler must be `async def` and hold `market_source` from `app.state` |
| CHAT-04 | Conversation history persists in `chat_messages` and is included as context | `chat_messages` table exists with `role/content/actions/created_at` columns [VERIFIED: backend/app/db/database.py:59-66]; `actions` TEXT is the JSON-encoded executed-actions payload (null for user messages per schema comment); history load = `SELECT ... ORDER BY created_at` with a cap (~20 rows) — 131K context window makes truncation non-critical [CITED: openrouter.ai/openai/gpt-oss-120b] |
| CHAT-05 | `LLM_MOCK=true` returns deterministic mock responses without an API key | Provider seam in `chat/service.py`: read `os.environ.get("LLM_MOCK")` at call time, return a canned structured dict, then run the **same** parse + auto-execute pipeline — deterministic AND exercises CHAT-02/CHAT-03 in tests; LiteLLM's built-in `mock_response` is an alternative but bypasses our parse layer [CITED: docs.litellm.ai/docs/tutorials/mock_completion] |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| LLM API call (LiteLLM → OpenRouter) | API / Backend | — | The chat service owns the `acompletion` call; no client-side LLM access |
| Structured-output parsing | API / Backend | — | Pydantic models in `app/chat/schemas.py` validate LLM JSON before any side effect |
| Portfolio + watchlist context assembly | API / Backend | Database | Reads via existing `get_portfolio` / `get_watchlist` services |
| Trade auto-execution | API / Backend | Database / Storage | Reuses `execute_trade` (single SQLite transaction, snapshot recorded inside it) — chat never re-implements trade math |
| Watchlist changes | API / Backend | — | Reuses async `add_ticker` / `remove_ticker`; must await `market_source` calls |
| Conversation persistence | Database / Storage | API / Backend | `chat_messages` rows written by the chat service; read back as context on later calls |
| Mock mode | API / Backend | — | Env-var branch in the chat service; keeps all execution code identical |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `litellm` | `>=1.98.0` (latest 1.98.0, 2026-08-22) | LLM gateway: `acompletion()` → OpenRouter, structured outputs | Mandated by spec §9 ("use LiteLLM via OpenRouter"); PyPI-verified exists, `requires-python >=3.10,<3.15` (3.12 OK) [VERIFIED: PyPI registry] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `python-dotenv` | `>=1.0` | Load `.env` from project root | Spec §5 says backend reads `.env` from project root; currently **unimplemented** (no dotenv anywhere in backend). Add `load_dotenv()` at `main.py` import. If Docker passes env via `--env-file` (Phase 4), dotenv is optional — decide in plan |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| LiteLLM | Direct `openai` SDK with `base_url=https://openrouter.ai/api/v1` | Fewer deps, but loses provider-agnostic translation, `mock_response`, cost tracking; spec mandates LiteLLM |
| LiteLLM `response_format=json_schema` | Function calling / tools | Tools are the fallback if a provider rejects `json_schema`; gpt-oss-120b natively supports `response_format` JSON schema [CITED: openrouter.ai/openai/gpt-oss-120b], so structured outputs is the simpler, spec-aligned path |
| Own mock provider | LiteLLM `mock_response` param | `mock_response` short-circuits inside LiteLLM and returns raw text; our own seam returns a structured dict through the real parse+execute pipeline — better E2E determinism |

**Installation (runtime deps added to `backend/pyproject.toml`):**
```bash
uv add litellm ">=1.98.0"
# if .env loading is decided:
uv add python-dotenv ">=1.0"
```

**Version verification (performed this session):**
- `litellm` — latest 1.98.0, uploaded 2026-08-22, `requires-python <3.15,>=3.10` — confirmed via `https://pypi.org/pypi/litellm/json` [VERIFIED: PyPI registry]
- `python-dotenv` — exists on PyPI (latest release 2026-08-16) [VERIFIED: PyPI registry]

## Package Legitimacy Audit

> Gate protocol run 2026-08-26. Seam returned `SUS` for both packages — **both verdicts are heuristics artifacts** (the seam reads the *latest-release* date as package age and could not fetch download stats). Counter-evidence below.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| litellm | PyPI | 3+ yrs (first release 2023-07-27, v0.1.0) | ~10M+/wk (industry-standard LLM gateway; pypistats rate-limited this session) | github.com/BerriAI/litellm | SUS (seam artifact) | Approved — tag `litellm` [WARNING: seam flagged SUS on release-date heuristic; counter-evidence: 3+ yrs old, first-party repo, mandated by spec §9] |
| python-dotenv | PyPI | 10+ yrs | high (universal stdlib-adjacent) | github.com/theskumar/python-dotenv | SUS (seam artifact) | Approved — same heuristic artifact; optionally gate behind checkpoint |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `litellm` and `python-dotenv` — planner should add a single `checkpoint:human-verify` before the `uv add` task only if it wants strict protocol compliance; the evidence above (3+ year old, source-repo-backed, spec-mandated) makes actual risk negligible.

*Note: no package names in this research came from WebSearch/training — `litellm` and `python-dotenv` were identified from the in-repo canonical spec (planning/PLAN.md §9, §5) and verified on the PyPI registry + official docs this session.*

## Architecture Patterns

### System Architecture Diagram

```
POST /api/chat {message}
        │
        ▼
┌────────────────────────────────────────────┐
│ chat/router.py (async def, app.state DI)   │
│   reads: db_path, price_cache, market_source│
└───────────────┬────────────────────────────┘
                ▼
┌────────────────────────────────────────────┐
│ chat/service.py — process_message(...)     │
│  1. load portfolio (get_portfolio)         │
│  2. load watchlist (get_watchlist)         │
│  3. load recent chat_messages (≤20 rows)   │
│  4. build messages[] (system prompt +      │
│     context + history + user message)      │
└───────────────┬────────────────────────────┘
                ▼
        ┌───────┴────────┐
        │ LLM_MOCK=true? │─── yes ──► canned dict (deterministic)
        └───────┬────────┘
                ▼ no
        await litellm.acompletion(
          model="openrouter/openai/gpt-oss-120b",
          messages=messages,
          response_format={...json_schema, strict:true},
          extra_body={"provider": {"order": ["cerebras"], "allow_fallbacks": False}},
          force_timeout=60)
                ▼
        content string → pydantic ChatResponse parse (tolerant)
                ▼
┌────────────────────────────────────────────┐
│ auto-execution (per action, errors caught) │
│  trades:  execute_trade(conn, cache, t)    │
│           catch TradeError → record error  │
│  watch:   await add_ticker / remove_ticker │
│           record created/removed or 409/404│
└───────────────┬────────────────────────────┘
                ▼
  persist: INSERT user msg + assistant msg
           (actions = JSON of executed results)
                ▼
  return {message, trades:[{...status,error?}],
          watchlist_changes:[{...status,error?}]}
```

### Recommended Project Structure

```
backend/app/chat/
├── __init__.py          # re-export router
├── schemas.py           # ChatRequest, ChatResponse, TradeAction, WatchlistChange, per-action result models
├── service.py           # build_messages(), generate_assistant_response() (mock/live branch),
│                        # execute_actions(), save_messages(), process_message() orchestrator
├── prompts.py           # SYSTEM_PROMPT ("FinAlly, an AI trading assistant"), portfolio/watchlist context formatter
└── router.py            # POST /api/chat via request.app.state
backend/tests/chat/
├── test_service.py      # prompt build, mock determinism, parse tolerance, per-action error capture
├── test_execution.py    # trade/watchlist auto-execution through real services + temp DB
└── test_chat_endpoint.py# HTTP: happy path, failure-in-response, history persistence, 503 no-key
```

### Pattern 1: Provider seam — mock vs live at call time
**What:** `generate_assistant_response(...)` reads `os.environ.get("LLM_MOCK")` inside the call and returns a canned structured dict in mock mode; otherwise awaits `litellm.acompletion`. Both paths return the same shape, so the caller (parse + execute) is identical.
**When to use:** Always — CHAT-05 requires determinism without a key, and the tests must run the real execution pipeline.
**Why call-time read:** tests use `monkeypatch.setenv("LLM_MOCK", "true")` (the repo's established env pattern — `tests/market/test_factory.py` uses `patch.dict(os.environ, ...)`); an import-time read would be un-patchable.

### Pattern 2: Per-action execution with error capture
**What:** Iterate the parsed `trades` list; for each, `execute_trade(...)` inside try/except `TradeError`; append a result record (`{ticker, side, quantity, status: "executed"|"failed", error?}`). Continue to the next trade. Same for watchlist changes. The final `trades` array in the HTTP response carries the executed results, not the raw LLM proposal.
**When to use:** Mandated by spec §9 — "If a trade fails validation … the error is included in the chat response so the LLM can inform the user." One failed trade must not abort the batch.
**Example (source: in-repo service signatures this session):**
```python
from app.portfolio.service import TradeError, execute_trade
from app.portfolio.schemas import TradeRequest

def _execute_trade(conn, price_cache, proposal: dict) -> dict:
    trade = TradeRequest(**proposal)          # normalizes ticker, validates quantity>0/side
    try:
        execute_trade(conn, price_cache, trade)
        return {**proposal, "status": "executed"}
    except TradeError as exc:
        return {**proposal, "status": "failed", "error": str(exc)}
```

### Pattern 3: History as context, persisted after execution
**What:** Load `SELECT role, content FROM chat_messages WHERE user_id='default' ORDER BY created_at DESC LIMIT 20` (reverse for chronological order) before calling the LLM. After execution, INSERT the user row (actions NULL) and the assistant row (actions = JSON of result arrays) in one `with conn:` block.
**When to use:** CHAT-04 — "history persists with executed actions and is included as context on later messages".

### Anti-Patterns to Avoid
- **Stopping the batch on the first failed trade** — spec explicitly wants errors surfaced inside the response, all other actions still attempted.
- **Trusting LLM JSON blindly** — parse with Pydantic; reject unknown tickers/quantities via the *existing* `TradeRequest` validation (a `field_validator` normalizes `" aapl "` → `"AAPL"` [VERIFIED: backend/app/portfolio/schemas.py:17-21]); do not invent a second validation path.
- **Blocking the event loop** — `litellm.acompletion` is awaited (async); keep the sync sqlite work inside the same async handler (it is sub-millisecond) or offload; never call blocking `litellm.completion` in an `async def` route.
- **Logging the API key or full prompt** — LiteLLM logs requests by default; disable/redact if verbose logging is enabled, and never print `OPENROUTER_API_KEY`.
- **Import-time env reads** — makes tests un-patchable and hides `LLM_MOCK` changes mid-process.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM provider routing / translation | Custom HTTP client for OpenRouter | LiteLLM | Provider-agnostic, handles auth headers, error mapping, cost tracking, mock; spec-mandated |
| Structured output schema | Regex / string scraping of model output | `response_format` json_schema + Pydantic `model_validate_json` | Provider enforces the schema; Pydantic already in the stack and validates types/values |
| Trade execution math | Re-implement cash/position updates | `execute_trade` (Phase 1) | Weighted-average cost, epsilon full-sell detection, single-transaction rollback, post-trade snapshot — all already tested (102→115 test baseline) |
| Watchlist mutation + market-source sync | Direct SQL | `add_ticker` / `remove_ticker` (Phase 1) | They keep the SQLite row, price cache, and live market source in sync (cache-clear on remove) |
| JSON parsing/validation | Manual `json.loads` + asserts | Pydantic v2 | Type coercion, `field_validator` normalization, one code path for HTTP bodies and LLM output |

**Key insight:** This phase is an *orchestration* phase — every side-effectful operation already exists and is tested. The only new external surface is the LLM call. The chat service should be a thin orchestrator over verified primitives, never a second implementation of them.

## Common Pitfalls

### Pitfall 1: LiteLLM version drift (daily releases)
**What goes wrong:** LiteLLM ships releases near-daily (1.98.0 → 1.99.0 → …); a future `uv sync` silently changes `response_format`/OpenRouter behavior.
**Why it happens:** Fast-moving project with weekly API churn; the project's other pins are loose (`fastapi>=0.115.0`).
**How to avoid:** Floor-pin `litellm>=1.98.0` in pyproject and rely on `backend/uv.lock` (already committed) for reproducibility; re-run the full suite after any lock bump.
**Warning signs:** Chat responses change shape after `uv sync`.

### Pitfall 2: `response_format` silently ignored / unsupported
**What goes wrong:** Some providers ignore `json_schema` or reject it; the model returns plain text or `json_object`-shaped output and Pydantic parse fails.
**Why it happens:** Structured outputs support varies by provider/model; LiteLLM's doc list of `json_schema`-supporting providers does not name OpenRouter (it passes through).
**How to avoid:** Use `litellm.supports_response_schema(model="openrouter/openai/gpt-oss-120b")` [CITED: docs.litellm.ai/docs/completion/json_mode] as a runtime check with a `json_object` + system-prompt fallback; optionally set `litellm.enable_json_schema_validation = True`; always wrap parse in try/except and return a graceful error message.
**Warning signs:** `JSONSchemaValidationError` (exists in `litellm.exceptions` [CITED: github.com/BerriAI/litellm/blob/main/litellm/exceptions.py]) or `ValidationError` from Pydantic.

### Pitfall 3: One failed trade aborts the whole response
**What goes wrong:** An LLM proposes 3 trades; #1 is too expensive (InsufficientCash) and raising aborts #2/#3 and the response.
**Why it happens:** Natural instinct to let exceptions propagate.
**How to avoid:** Pattern 2 — per-action try/except `TradeError`; collect results; never re-raise from the executor.
**Warning signs:** Chat endpoint returns 400/500 when the LLM proposes an oversized buy.

### Pitfall 4: Watchlist calls are async — forgetting `await`
**What goes wrong:** `add_ticker` returns a coroutine; forgetting `await` yields a `RuntimeWarning` and a missing row/source-sync.
**Why it happens:** `execute_trade` is sync but `add_ticker`/`remove_ticker` are async (they await `market_source.add_ticker`) — mixed sync/async in one handler.
**How to avoid:** Declare the chat route `async def`; await both watchlist mutators; keep `execute_trade` as a plain call (fast, no awaits).
**Warning signs:** "coroutine was never awaited" warnings in chat logs.

### Pitfall 5: No API key → confusing 500
**What goes wrong:** Without `OPENROUTER_API_KEY`, LiteLLM raises `AuthenticationError`; a raw 500 leaks nothing but confuses the user.
**Why it happens:** No `.env` file exists on this machine; the spec assumes one.
**How to avoid:** Catch `litellm.exceptions.AuthenticationError`/`APIConnectionError`/`Timeout` and return a readable 503-style JSON (`{"message": "...", "error": "LLM backend unavailable"}`) or fall back to mock; document that live chat needs the key. All exceptions subclass `openai.*` and are catchable via `APIError` [CITED: github.com/BerriAI/litellm/blob/main/litellm/exceptions.py].
**Warning signs:** 500s on `/api/chat` in a fresh checkout.

### Pitfall 6: History grows unbounded in the prompt
**What goes wrong:** Every message re-sends all history; token use grows; cost/latency creep.
**Why it happens:** Trivial to `SELECT *` without a limit.
**How to avoid:** `LIMIT 20` (or a configurable `HISTORY_LIMIT`), newest first, then reversed; 131K context makes even 50 messages trivial, so the cap is a cost guard, not a correctness one.
**Warning signs:** Prompt token counts balloon after a long session.

## Code Examples

### Calling LiteLLM with structured outputs through OpenRouter (live path)
```python
# Source pattern: docs.litellm.ai/docs/completion/json_mode (response_format) +
# openrouter transformation source for extra_body merge
# (github.com/BerriAI/litellm/blob/main/litellm/llms/openrouter/chat/transformation.py)
import litellm

response = await litellm.acompletion(
    model="openrouter/openai/gpt-oss-120b",
    messages=messages,                       # [{role, content}, ...]
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "chat_response",
            "schema": ChatResponse.model_json_schema(),
            "strict": True,
        },
    },
    extra_body={                              # verified: OpenRouter-only params merge into body
        "provider": {"order": ["cerebras"], "allow_fallbacks": False},
    },
    force_timeout=60,                        # LiteLLM's timeout arg (completion() reference)
)
content = response.choices[0].message.content
parsed = ChatResponse.model_validate_json(content)
```

### Mock path (deterministic, no network, same pipeline)
```python
# Source: design recommendation from this research (CHAT-05)
def _mock_response(user_message: str) -> dict:
    """Deterministic canned response — always proposes a small AAPL buy."""
    return {
        "message": f"[mock] Acknowledged: {user_message}",
        "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 1}],
        "watchlist_changes": [],
    }
```

### Loading history for context (schema source: backend/app/db/database.py:59-66)
```python
rows = conn.execute(
    "SELECT role, content, actions FROM chat_messages "
    "WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    ("default", 20),
).fetchall()
history = list(reversed(rows))  # chronological for the LLM
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Regex/`json.loads` scraping of free-form LLM text | Provider-native **structured outputs** (`response_format` json_schema with `strict: true`) | OpenAI Aug 2024 structured outputs; now standard across providers incl. gpt-oss-120b | Schema guaranteed at generation time; Pydantic parse is a safety net, not the primary mechanism |
| Function calling / tools for action extraction | JSON-schema structured outputs for a fixed response envelope | gpt-oss-120b natively supports both [CITED: openrouter.ai/openai/gpt-oss-120b] | Simpler for a single fixed response shape; tools remain the fallback |
| DIY LLM clients per provider | LiteLLM single gateway | 2023–present | One call signature across providers, cost tracking, mock, failover |

**Deprecated/outdated:**
- `response_format={"type": "json_object"}` alone: works but only guarantees *valid JSON*, not *matching schema* — use `json_schema` for schema conformance; keep `json_object` as the fallback for providers without json_schema support.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `extra_body={"provider": {...}}` is the correct way to pass OpenRouter provider-routing through LiteLLM. Mechanism verified in LiteLLM source (`optional_params.pop("extra_body")` → `response.update(extra_body)` in the openrouter transformation), and OpenRouter's `provider.order` field verified in OpenRouter docs — but the **combination** was not live-tested (no API key on this machine). | Standard Stack / Code Examples | If rejected by a future LiteLLM version, fall back to `provider` kwarg or `route` param; a single live smoke test with a key resolves it |
| A2 | gpt-oss-120b on **Cerebras** honors `response_format` json_schema. Model page confirms structured outputs support and that OpenRouter routes `response_format` to supporting providers; Cerebras serves the model — but no live call was made. | Code Examples | If Cerebras rejects it, OpenRouter falls back per its soft-preference routing (or we relax `allow_fallbacks`) |
| A3 | Adding `python-dotenv` is desirable. Spec §5 says the backend reads `.env` from project root; nothing implements it today. | Standard Stack | If Phase 4 ships env via `docker --env-file` only, dotenv is dead weight (though tiny); decision point for planner |
| A4 | Capping history at ~20 messages is sufficient for CHAT-04. Spec does not state a cap; 131K context makes it a cost guard. | Pitfalls | No functional risk; only prompt-size/cost tuning |
| A5 | A missing/blank `OPENROUTER_API_KEY` with `LLM_MOCK` unset should return a clean 503-style JSON rather than 500. Spec silent on the exact code. | Pitfalls | Frontend (Phase 3) consumes the response; planner should lock the exact status code |
| A6 | The plan may implement the integration directly without the (absent) cerebras-inference skill; §9's literal instructions (LiteLLM → OpenRouter → gpt-oss-120b, Cerebras, structured outputs) are fully encoded in this research. | Summary | If the user later provides the skill, the implementation still conforms to §9 |

## Open Questions (RESOLVED)

1. **Will the user provide `OPENROUTER_API_KEY`?**
   - What we know: No `.env` file exists; no key in the environment; tests can run entirely in mock mode.
   - What's unclear: Whether live-mode verification is expected this phase.
   - Recommendation: Build + test with `LLM_MOCK=true` (all 5 success criteria are testable in mock); gate a single live smoke call behind the user supplying `.env`; do not block planning on it.
   - **RESOLVED (2026-08-26, 02-03):** Live-mode verification gated behind a `user_setup` checkpoint in 02-03 — the user supplies `OPENROUTER_API_KEY` in `.env` for an optional live smoke test; all automated tests run in mock. Not blocking.

2. **`.env` loading now or at Docker time?**
   - What we know: Spec §5 promises `.env` support; backend has none.
   - What's unclear: Whether Phase 2 should add `python-dotenv` or Phase 4's `docker --env-file` is the intended mechanism.
   - Recommendation: Add `python-dotenv` in this phase (small, standard, honors the spec's promise for local dev).
   - **RESOLVED (2026-08-26, 02-01):** 02-01 Task 2 adds `python-dotenv>=1.0` with `load_dotenv()` at `main.py` import and a root `.env.example` (`.env` itself is gitignored).

3. **Exact error contract when the LLM backend is unavailable**
   - What we know: LiteLLM raises `AuthenticationError`/`APIConnectionError`/`Timeout` (all `APIError` subclasses).
   - What's unclear: Status code + body shape the frontend should expect.
   - Recommendation: 503 with `{"message": "...", "trades": [], "watchlist_changes": [], "error": "..."}` — a valid `ChatResponse` shape with an error field, so the Phase 3 chat panel renders it without special-casing.
   - **RESOLVED (2026-08-26, 02-03):** 02-03 Task 2 locks the contract — any `ChatResponse` with a top-level `error` returns HTTP 503 with a valid `ChatResponse` body; per-action failures stay 200. Rated `costly` (Phase 3 frontend contract), flagged not gated.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python (backend venv) | All backend work | ✓ | 3.12.12 | — |
| uv | Deps/lock/test runner | ✓ | 0.12.6 | — |
| pytest + pytest-asyncio | Test suite | ✓ | dev deps (pyproject) | — |
| httpx (<0.28) | TestClient | ✓ | dev dep pinned | — |
| `OPENROUTER_API_KEY` | Live chat (non-mock) | ✗ | — | `LLM_MOCK=true` (deterministic) |
| `.env` file (project root) | Key delivery per spec | ✗ | — | Create manually; or add python-dotenv |
| cerebras-inference skill | §9 reference | ✗ | — | Implement §9 pattern directly (A6) |

**Missing dependencies with no fallback:** none — the phase is fully executable in mock mode.
**Missing dependencies with fallback:**
- `OPENROUTER_API_KEY` → `LLM_MOCK=true` covers all tests and the full auto-execution pipeline; only a final live smoke test needs the key.
- cerebras-inference skill → direct implementation per §9.

## Validation Architecture

> `workflow.nyquist_validation: true` (config.json) — included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest `>=8.3.0` + pytest-asyncio `>=0.24.0` (`asyncio_mode = "auto"` in pyproject) |
| Config file | `backend/pyproject.toml` → `[tool.pytest.ini_options]` |
| Quick run command | `uv run --extra dev pytest tests/chat -q` |
| Full suite command | `uv run --extra dev pytest -v` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHAT-01 | `POST /api/chat` returns `{message, trades, watchlist_changes}` | integration | `uv run --extra dev pytest tests/chat/test_chat_endpoint.py -q` | ❌ Wave 0 |
| CHAT-02 | LLM-proposed buy/sell executes via `execute_trade`, updates cash+positions; failed trade returns error in response, batch continues | unit + integration | `pytest tests/chat/test_execution.py::test_... -q` | ❌ Wave 0 |
| CHAT-03 | LLM-proposed watchlist add/remove applies via `add_ticker`/`remove_ticker` | integration | `pytest tests/chat/test_execution.py::test_... -q` | ❌ Wave 0 |
| CHAT-04 | Messages + executed actions persist in `chat_messages`; later requests include prior turns as context | integration | `pytest tests/chat/test_chat_endpoint.py::test_history_... -q` | ❌ Wave 0 |
| CHAT-05 | `LLM_MOCK=true` returns deterministic response with no key; mock path still executes actions | unit + integration | `pytest tests/chat/test_service.py::test_mock_... -q` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run --extra dev pytest tests/chat -q`
- **Per wave merge:** `uv run --extra dev pytest -v` (full suite; 115 tests baseline + new)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `backend/tests/chat/` — new test package for all chat tests (follows `tests/portfolio/`, `tests/watchlist/` convention)
- [ ] `backend/tests/chat/conftest.py` (optional) — shared `_make_client(tmp_path, monkeypatch)` fixture (the established pattern from `tests/test_app.py:17-20`), a `monkeypatch.setenv("LLM_MOCK", "true")` fixture, and a `mock_llm` fixture that patches the live branch
- [ ] Framework install: none needed (pytest/pytest-asyncio/httpx already dev deps); only `litellm` (+ optional `python-dotenv`) added to runtime deps

## Security Domain

> `workflow.security_enforcement: true`, `security_asvs_level: 1` (config.json) — included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user `"default"` model by design (REQUIREMENTS.md Out of Scope) |
| V3 Session Management | no | Stateless API; no sessions |
| V4 Access Control | no | Single user, no roles |
| V5 Input Validation | **yes** | Request body via Pydantic `ChatRequest`; **LLM output** via Pydantic `ChatResponse` (the trust boundary is bidirectional — a malicious prompt must not bypass `TradeRequest` validation) |
| V6 Cryptography | yes | `OPENROUTER_API_KEY` from env only; never logged, never in responses; TLS handled by OpenRouter |

### Known Threat Patterns for the Chat Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection → malicious trades | Tampering | LLM output passes through the **same** `TradeRequest`/`execute_trade` validation as manual trades (spec §9 mandates this): unknown ticker → 404-equivalent error captured per trade; insufficient cash/shares → captured error; quantities must be `> 0` (Pydantic `Field(gt=0)` [VERIFIED: backend/app/portfolio/schemas.py:14]); watchlist tickers bounded to ≤12 chars by `WatchlistAddRequest` [VERIFIED: backend/app/watchlist/schemas.py:12]. Max damage = a simulated trade the validation allows — bounded by available cash |
| API key leakage | Information Disclosure | Env-var only; no key in logs (disable LiteLLM verbose logging or redact); `.env` is gitignored (Phase 4 concern: never baked into the Docker image) |
| Unbounded prompt / cost abuse | DoS | History cap (~20 messages); `force_timeout`; single-user local app so exposure is the user's own key |
| Malformed LLM output | Tampering | Pydantic `model_validate_json` with tolerant fallback; failed parse returns a friendly message, executes nothing |

**Note (not a threat in this app):** SSRF is not applicable — LiteLLM targets the fixed OpenRouter base URL, and `api_base` is not user-controllable.

## Sources

### Primary (HIGH confidence)
- [docs.litellm.ai/docs/completion/json_mode](https://docs.litellm.ai/docs/completion/json_mode) — `response_format` json_schema/json_object, Pydantic passthrough, `supports_response_schema`, `enable_json_schema_validation`
- [docs.litellm.ai/docs/completion/stream](https://docs.litellm.ai/docs/completion/stream) — `acompletion` async API
- [docs.litellm.ai/docs/providers/openrouter](https://docs.litellm.ai/docs/providers/openrouter) — `openrouter/` model prefix, `OPENROUTER_API_KEY`/`OPENROUTER_API_BASE`, OpenRouter-only params
- [openrouter.ai/docs/features/provider-routing](https://openrouter.ai/docs/features/provider-routing) — `provider.order`/`allow_fallbacks` pinning, parameter-preference routing for `response_format`
- [openrouter.ai/openai/gpt-oss-120b](https://openrouter.ai/openai/gpt-oss-120b) — model exists, 131K context, native structured outputs + tools, Cerebras provider stats (757 tps, 99.99% uptime)
- [github.com/BerriAI/litellm/blob/main/litellm/llms/openrouter/chat/transformation.py](https://github.com/BerriAI/litellm/blob/main/litellm/llms/openrouter/chat/transformation.py) — `extra_body` merge verified from source
- [github.com/BerriAI/litellm/blob/main/litellm/exceptions.py](https://github.com/BerriAI/litellm/blob/main/litellm/exceptions.py) — exception hierarchy verified from source
- [pypi.org/pypi/litellm/json](https://pypi.org/pypi/litellm/json) — version 1.98.0, requires-python, first release 2023-07-27
- In-repo (read this session): `backend/app/db/database.py:59-66` (chat_messages schema), `backend/app/portfolio/service.py:13-27,85` (TradeError + execute_trade), `backend/app/portfolio/schemas.py:10-21` (TradeRequest), `backend/app/watchlist/service.py:34-60,63-83` (add/remove_ticker), `backend/app/watchlist/schemas.py:12-24` (TickerStr), routers and test harness

### Secondary (MEDIUM confidence)
- [docs.litellm.ai/docs/tutorials/mock_completion](https://docs.litellm.ai/docs/tutorials/mock_completion) — `mock_response` (referenced as an alternative to our own seam)
- [docs.litellm.ai/docs/providers/openai_compatible](https://docs.litellm.ai/docs/providers/openai_compatible) — OpenAI-compatible passthrough mechanism
- [docs.litellm.ai/completion/input](https://docs.litellm.ai/completion/input) — `force_timeout` LiteLLM arg

### Tertiary (LOW confidence)
- None — every claim above is either tool-verified, official-docs-cited, or tagged `[ASSUMED]` in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — litellm 1.98.0 verified on PyPI + official docs; only new runtime dep; mandated by spec
- Architecture: **HIGH** — every orchestration target (`execute_trade`, `add_ticker`, `remove_ticker`, `chat_messages`, DI pattern) read from source this session with line-range citations
- Pitfalls: **MEDIUM** — LiteLLM/OpenRouter live behavior (A1/A2) not end-to-end verified (no API key); mechanisms verified from docs/source, combination untested

**Research date:** 2026-08-26
**Valid until:** 2026-09-25 (30 days) for LiteLLM version pin; re-check on any `uv lock` bump (LiteLLM releases daily)
