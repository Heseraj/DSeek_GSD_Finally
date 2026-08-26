# API Coverage — (none external)

**Phase:** 3 — Frontend Trading Terminal

No external API integration: this phase consumes only the backend's own same-origin REST + SSE surface (`/api/portfolio`, `/api/portfolio/trade`, `/api/portfolio/history`, `/api/watchlist`, `/api/chat`, `/api/stream/prices`) served by the FastAPI app it ships with. There are no third-party service credentials, SDKs, or network calls beyond the project's own server. The detector's `detected: true` is a vocabulary false-positive (`wiring`/`api` terms matched ROADMAP prose), not a real external integration.
