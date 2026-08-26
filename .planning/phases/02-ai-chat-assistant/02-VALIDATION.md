---
phase: 2
slug: ai-chat-assistant
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-26
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest >=8.3.0 + pytest-asyncio >=0.24.0 (`asyncio_mode = "auto"` in pyproject) |
| **Config file** | `backend/pyproject.toml` → `[tool.pytest.ini_options]` |
| **Quick run command** | `uv run --extra dev pytest tests/chat -q` |
| **Full suite command** | `uv run --extra dev pytest -v` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run --extra dev pytest tests/chat -q`
- **After every plan wave:** Run `uv run --extra dev pytest -v` (full suite; 115 tests baseline + new)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-T2 | 01 | 1 | CHAT-01 | T-02-01 / — | Pydantic `ChatRequest`/`ChatProposal` schemas validate LLM output before any side effect | unit | `pytest tests/chat/test_schemas.py -q` | ✅ | ⬜ pending |
| 02-01-T3 | 01 | 1 | CHAT-05 | — | `SYSTEM_PROMPT` + `build_context` assembled; mock seam ready | unit | `pytest tests/chat/test_service.py::test_... -q` | ✅ | ⬜ pending |
| 02-02-T1 | 02 | 1 | CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05 | T-02-01 | Mock-mode tracer: POST /api/chat shape, real `execute_trade` side effects, `chat_messages` persistence | integration | `pytest tests/chat/test_chat_endpoint.py -q` | ✅ | ⬜ pending |
| 02-02-T2 | 02 | 1 | CHAT-02, CHAT-03 | T-02-01 | 9-scenario auto-execution battery — failed trade captured per trade, batch continues | unit + integration | `pytest tests/chat/test_execution.py -q` | ✅ | ⬜ pending |
| 02-03-T1 | 03 | 2 | CHAT-05 | — | Live LiteLLM branch TDD (mock-verified): gpt-oss-120b, Cerebras pinning, `response_format` json_schema | unit | `pytest tests/chat/test_service.py -q` | ✅ | ⬜ pending |
| 02-03-T2 | 03 | 2 | CHAT-01, CHAT-04, CHAT-05 | T-02-01 | 503-with-ChatResponse error contract + history-as-context + byte-identical determinism | integration | `pytest tests/chat/test_chat_endpoint.py -q && uv run --extra dev pytest -q` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `backend/tests/chat/` — new test package created inside 02-02 Task 1 / 02-02 Task 2 (follows `tests/portfolio/`, `tests/watchlist/` convention)
- [x] `backend/tests/chat/conftest.py` (optional) — shared `_make_client(tmp_path, monkeypatch)` fixture created inside 02-02 Task 1 (established pattern from `tests/test_app.py:17-20`); `monkeypatch.setenv("LLM_MOCK", "true")` + `mock_llm` fixtures in the same task
- [x] Framework install: none needed (pytest/pytest-asyncio/httpx already dev deps); `litellm` (+ `python-dotenv`) added to runtime deps in 02-01 Task 2

Wave 0 coverage is provided inline — every test file is created inside the plan tasks that need it, so no separate Wave 0 seeding task is required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live LLM call against OpenRouter/Cerebras with a real API key | CHAT-01, CHAT-02 | Requires `OPENROUTER_API_KEY`; all 5 success criteria are automated-testable in `LLM_MOCK=true` | Supply key in `.env`, set `LLM_MOCK=false`, restart backend, send a message via `POST /api/chat` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-26 (plan-phase verification pass)
