# API Coverage — (none external)

**Phase:** 4 — Deployment & E2E

No external API integration: this phase packages the existing backend + static frontend into a Docker container and exercises it with Playwright E2E tests. It consumes only the project's own same-origin REST + SSE surface served by the container itself — no third-party service credentials, SDKs, or network calls beyond the app's own server (and the LLM via LiteLLM already integrated in Phase 2). The detector's `detected: true` is a vocabulary false-positive (`wiring`/`api` terms matched ROADMAP prose), not a real external integration.
