# FinAlly

## What This Is

FinAlly (Finance Ally) is a visually stunning AI-powered trading workstation that streams live market data, lets users trade a simulated $10k portfolio, and integrates an LLM chat assistant that can analyze positions and execute trades via natural language. It looks and feels like a modern Bloomberg terminal with an AI copilot. It is the capstone project for an agentic AI coding course, built entirely by coding agents.

## Core Value

A user runs one Docker command and immediately gets a working Bloomberg-style trading terminal — streaming prices, instant simulated trades, portfolio analytics, and an AI copilot that trades on their behalf.

## Requirements

### Validated

- ✓ **Market data subsystem** — GBM price simulator, Polygon.io (Massive) poller, shared thread-safe price cache, and SSE stream router. Implemented in `backend/app/market/` (8 modules), 73 tests passing, 84% coverage. NOT rebuilt in this roadmap.

### Active

- [ ] SQLite database with lazy init + seed ($10k profile, 10 tickers)
- [ ] FastAPI app wiring (market source + price cache + SSE + REST routers)
- [ ] Portfolio API (view portfolio, buy/sell market orders, history snapshots)
- [ ] Watchlist API (list, add, remove)
- [ ] AI chat assistant with structured outputs + auto-execution
- [ ] Frontend trading terminal (watchlist, chart, portfolio visualizations, chat)
- [ ] Docker deployment (single container, port 8000, persistent SQLite)
- [ ] Playwright E2E tests

### Out of Scope

- User authentication / multi-user accounts — single-user `"default"` model by design
- Limit orders, order book, partial fills — market orders only
- Real-money trading / brokerage integration — simulated portfolio only
- Cloud deployment (AWS App Runner / Render / Terraform) — stretch goal, not core build
- Mobile app — desktop-first web only

## Context

Brownfield repo: the market-data subsystem (`backend/app/market/`, 8 modules, ~500 lines) is complete, tested (73 tests, 84% coverage), and reviewed. Everything else — SQLite persistence, portfolio/trading, watchlist, LLM chat, the Next.js frontend, Docker, and E2E tests — is planned in `planning/PLAN.md` but unbuilt. The FastAPI app entry point (`main.py`) does not exist yet; the market factories (`create_market_data_source`, `create_stream_router`) are designed to be wired into it.

## Constraints

- **Architecture**: Single Docker container on port 8000 — FastAPI serves `/api/*` REST, `/api/stream/*` SSE, and the static Next.js export; SQLite volume-mounted
- **Frontend**: Next.js + TypeScript, static export (`output: 'export'`), served by FastAPI; single origin, no CORS
- **Database**: SQLite at `db/finally.db`, lazily initialized on first request (no migration step); single-user `user_id="default"`
- **Market data**: Simulator (default) vs Polygon.io (Massive) behind one interface, selected by `MASSIVE_API_KEY`
- **LLM**: LiteLLM → OpenRouter (`openrouter/openai/gpt-oss-120b`, Cerebras provider) with structured outputs; `LLM_MOCK=true` for deterministic testing
- **Visual design**: Dark theme (#0d1117 / #1a1a2e), price flash animations, Bloomberg-style data density, Tailwind CSS

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SSE over WebSockets | One-way push is all we need; simpler, universal browser support | ✓ Good |
| Static Next.js export | Single origin, no CORS, one port, one container | ✓ Good |
| SQLite over Postgres | No auth = no multi-user; self-contained, zero config | ✓ Good |
| Single Docker container | Students run one command; no compose orchestration for production | ✓ Good |
| Market orders only | Eliminates order book / limit / partial-fill complexity | ✓ Good |
| Strategy + Factory for market data | Two providers behind one ABC; downstream code source-agnostic | ✓ Good (implemented) |

---
*Last updated: 2026-08-25 after initial ingest*
