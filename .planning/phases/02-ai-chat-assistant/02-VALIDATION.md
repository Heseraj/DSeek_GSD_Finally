---
phase: 2
slug: ai-chat-assistant
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| TBD | 01 | 1 | CHAT-01 | T-02-01 / — | LLM output parsed via Pydantic before any side effect | integration | `pytest tests/chat/test_chat_endpoint.py -q` | ❌ W0 | ⬜ pending |
| TBD | 01 | 1 | CHAT-05 | — | `LLM_MOCK=true` deterministic, no key required | unit + integration | `pytest tests/chat/test_service.py::test_mock_... -q` | ❌ W0 | ⬜ pending |
| TBD | 02 | 1 | CHAT-02 | T-02-01 | Failed trade captured per trade, batch continues | unit + integration | `pytest tests/chat/test_execution.py::test_... -q` | ❌ W0 | ⬜ pending |
| TBD | 02 | 1 | CHAT-03 | — | Watchlist add/remove via existing async services | integration | `pytest tests/chat/test_execution.py::test_... -q` | ❌ W0 | ⬜ pending |
| TBD | 03 | 2 | CHAT-04 | — | History persists in `chat_messages`; later calls include prior turns | integration | `pytest tests/chat/test_chat_endpoint.py::test_history_... -q` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/chat/` — new test package for all chat tests (follows `tests/portfolio/`, `tests/watchlist/` convention)
- [ ] `backend/tests/chat/conftest.py` (optional) — shared `_make_client(tmp_path, monkeypatch)` fixture (established pattern from `tests/test_app.py:17-20`), a `monkeypatch.setenv("LLM_MOCK", "true")` fixture, and a `mock_llm` fixture that patches the live branch
- [ ] Framework install: none needed (pytest/pytest-asyncio/httpx already dev deps); only `litellm` (+ optional `python-dotenv`) added to runtime deps

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

**Approval:** pending
