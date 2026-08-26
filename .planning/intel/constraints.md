# Constraints

## Architecture: single container, single port
- source: planning/PLAN.md
- type: nfr
- content: Single Docker container on port 8000 — FastAPI serves /api/* REST endpoints, /api/stream/* SSE streaming, and static files (Next.js export). SQLite database (volume-mounted) plus a background market-data polling/sim task.

## Frontend: static Next.js export
- source: planning/PLAN.md
- type: nfr
- content: Next.js with TypeScript, built as static export (output: 'export'), served by FastAPI as static files. Talks to the backend via /api/* and /api/stream/* only; single origin, no CORS.

## SQLite database schema
- source: planning/PLAN.md
- type: schema
- content: SQLite at db/finally.db, lazily initialized on first request (no migration step). Tables: users_profile (id, cash_balance, created_at), watchlist (id, user_id, ticker, added_at, UNIQUE(user_id, ticker)), positions (id, user_id, ticker, quantity, avg_cost, updated_at, UNIQUE(user_id, ticker)), trades (id, user_id, ticker, side, quantity, price, executed_at), portfolio_snapshots (id, user_id, total_value, recorded_at), chat_messages (id, user_id, role, content, actions, created_at). All tables include a user_id column defaulting to "default". Seed: one profile (cash_balance=10000.0) and ten watchlist tickers (AAPL, GOOGL, MSFT, AMZN, TSLA, NVDA, META, JPM, V, NFLX).

## REST/SSE API endpoints
- source: planning/PLAN.md
- type: api-contract
- content: Market Data: GET /api/stream/prices (SSE). Portfolio: GET /api/portfolio; POST /api/portfolio/trade {ticker, quantity, side}; GET /api/portfolio/history. Watchlist: GET /api/watchlist; POST /api/watchlist {ticker}; DELETE /api/watchlist/{ticker}. Chat: POST /api/chat. System: GET /api/health.

## Market data: two implementations, one interface
- source: planning/PLAN.md
- type: protocol
- content: Simulator (default) and Massive (Polygon.io) client both implement the same abstract interface; backend selects via MASSIVE_API_KEY env var. Downstream code (SSE streaming, price cache, frontend) is source-agnostic. Simulator uses geometric Brownian motion with configurable drift/volatility per ticker, ~500ms updates, correlated moves, occasional 2-5% random events, realistic seed prices. Massive uses REST polling (not WebSocket): free tier polls every 15s, paid tiers 2-15s.

## Shared price cache and SSE streaming
- source: planning/PLAN.md
- type: protocol
- content: A single background task (simulator or Massive poller) writes to an in-memory price cache holding latest price, previous price, and timestamp per ticker. SSE reads from the cache and pushes updates. Endpoint GET /api/stream/prices; client uses native EventSource; each event carries ticker, price, previous price, timestamp, and change direction.

## LLM integration via LiteLLM/OpenRouter
- source: planning/PLAN.md
- type: protocol
- content: LiteLLM → OpenRouter to openrouter/openai/gpt-oss-120b with Cerebras inference provider, using structured outputs. Chat flow: load portfolio context + history, build prompt, call LLM for structured JSON, auto-execute trades/watchlist changes, store message + actions in chat_messages, return complete JSON (no token-by-token streaming). Structured output schema: { message, trades: [{ticker, side, quantity}], watchlist_changes: [{ticker, action}] }. LLM_MOCK=true returns deterministic mock responses.

## Environment variables
- source: planning/PLAN.md
- type: nfr
- content: OPENROUTER_API_KEY (required for LLM chat), MASSIVE_API_KEY (optional; real market data via Polygon.io; absent/empty → built-in simulator), LLM_MOCK=false (optional; deterministic mock LLM responses for testing).

## Docker multi-stage deployment
- source: planning/PLAN.md
- type: nfr
- content: Multi-stage Dockerfile — Stage 1 Node 20 slim (npm install + npm run build → static export), Stage 2 Python 3.12 slim (install uv, uv sync, copy frontend build to static/, expose 8000, CMD uvicorn). SQLite persists via named volume (finally-data:/app/db). Start/stop scripts are idempotent. Optional cloud deployment (AWS App Runner / Render); Terraform is a stretch goal.

## Visual design system
- source: planning/PLAN.md
- type: nfr
- content: Dark theme (backgrounds #0d1117 or #1a1a2e), price flash green/red fading over ~500ms, connection status dot (green/yellow/red), Bloomberg-terminal-style data-dense layout, desktop-first responsive. Colors: Accent Yellow #ecad0a, Blue Primary #209dd7, Purple Secondary #753991. Tailwind CSS for styling.
