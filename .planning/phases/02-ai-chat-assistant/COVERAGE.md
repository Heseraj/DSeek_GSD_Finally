# API Coverage — OpenRouter (via LiteLLM)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

**Phase:** 2 — AI Chat Assistant
**External API:** OpenRouter chat completions, reached through the LiteLLM gateway (`litellm.acompletion`, model `openrouter/openai/gpt-oss-120b`, Cerebras provider pinning).

| capability | decision | reason |
|---|---|---|
| chat completions (non-streaming) | INTEGRATE | Core CHAT-01..05 behavior — `POST /api/chat` calls `acompletion` and returns the complete structured JSON response |
| structured outputs (`response_format` JSON schema) | INTEGRATE | Spec §9 mandates JSON-matching-schema responses; gpt-oss-120b natively supports it; Pydantic validates before any side effect |
| provider routing / pinning (`provider.order`) | INTEGRATE | Spec pins Cerebras for fast inference; LiteLLM `extra_body={"provider": {"order": ["cerebras"]}}` |
| streaming chat completions | OPT-OUT | Deliberate per spec §9 — no token-by-token streaming (Cerebras is fast); deferred to backlog |
| models list / model metadata retrieval | OPT-OUT | Model is pinned in code (`openrouter/openai/gpt-oss-120b`); no dynamic model listing needed |
| API key management | OPT-OUT | `OPENROUTER_API_KEY` read from env only; never surfaced through the API |
| cost / credit tracking | OPT-OUT | Not needed — single-user local app; out of scope per PROJECT.md |
| tool / function calling | OPT-OUT | Structured outputs (`response_format` json_schema) is the spec-aligned path; tools are the documented fallback if a provider rejects `json_schema` |

*Gate protocol run 2026-08-26 via `gsd-core/bin/lib/api-coverage.cjs` — `detected: true`.*
