# Phase 2: User Setup Required

**Generated:** 2026-08-26
**Phase:** 02-ai-chat-assistant
**Status:** Incomplete

Complete these items for the **live (non-mock)** chat path to function. Everything in this phase is proven by the automated test suite with `LLM_MOCK=true` — this setup is **optional** and only unlocks a live smoke test of `POST /api/chat` against OpenRouter. The plan completes without it.

## Environment Variables

| Status | Variable | Source | Add to |
|--------|----------|--------|--------|
| [ ] | `OPENROUTER_API_KEY` | https://openrouter.ai/keys → create key → add `OPENROUTER_API_KEY=...` to the project-root `.env` file | `.env` (project root) |

## Account Setup

- [ ] **Create OpenRouter account** (if needed)
  - URL: https://openrouter.ai
  - Skip if: Already have an OpenRouter account
  - The key is read at call time by the chat service (`backend/app/chat/service.py`); no process restart is needed once set.

## Verification

After completing setup, run the optional live smoke test:

```bash
# from the backend directory, with LLM_MOCK unset and the key in .env
uv run --extra dev uvicorn app.main:app --port 8000
# then POST a chat message:
#   POST /api/chat {"message":"What is my portfolio worth?"}
```

Expected results:
- HTTP 200 with a real conversational `message` and empty/valid `trades`/`watchlist_changes` arrays
- Missing key (without the above setup) returns HTTP 503 with a valid `ChatResponse` body whose `error` field is set — the locked error contract

---

**Once all items complete:** Mark status as "Complete" at top of file.
