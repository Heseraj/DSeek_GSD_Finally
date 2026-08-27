# Roadmap: FinAlly

## Overview

The market-data subsystem is already built and tested. The remaining work delivers the full trading workstation in four phases: first a persistent backend (database + portfolio + watchlist APIs) wired to the existing price stream, then the AI chat assistant with auto-execution, then the Bloomberg-style frontend terminal, and finally Docker packaging and end-to-end tests so one command produces a running workstation.

## Phases

- [x] **Phase 1: Backend Foundation** - SQLite persistence, FastAPI wiring, portfolio + watchlist APIs (completed 2026-08-26)
- [x] **Phase 2: AI Chat Assistant** - LLM integration with structured outputs and auto-execution (completed 2026-08-26)
- [ ] **Phase 3: Frontend Trading Terminal** - Bloomberg-style UI with streaming prices and visualizations
- [ ] **Phase 4: Deployment & E2E** - Single Docker container, persistent SQLite, Playwright tests

## Phase Details

### Phase 1: Backend Foundation

**Goal**: A running FastAPI backend that persists a $10k portfolio and watchlist, streams live prices, and lets users trade and manage their watchlist through a REST API.
**Depends on**: Nothing (market data subsystem already implemented)
**Requirements**: DB-01, DB-02, DB-03, PORT-01, PORT-02, PORT-03, PORT-04, WATCH-01, WATCH-02, WATCH-03
**Success Criteria** (what must be TRUE):

  1. Starting the backend seeds a fresh database with a $10,000 cash balance and ten default watchlist tickers
  2. Live prices stream over `GET /api/stream/prices` with ticker, price, previous price, and direction
  3. `GET /api/portfolio` reports cash balance, positions, total value, and unrealized P&L
  4. A buy order reduces cash and creates/updates a position; a sell order increases cash and rejects insufficient shares
  5. Adding and removing tickers updates the watchlist, and `GET /api/health` reports healthy

**Plans**: 3/3 plans complete

- [x] 01-01-PLAN.md — Database foundation + FastAPI wiring + health + SSE + read API (DB-01, DB-02, DB-03, PORT-01, WATCH-01)
- [x] 01-02-PLAN.md — Portfolio trading (buy/sell) + history snapshots (PORT-02, PORT-03, PORT-04)
- [x] 01-03-PLAN.md — Watchlist mutation add/remove (WATCH-02, WATCH-03)

### Phase 2: AI Chat Assistant

**Goal**: A chat endpoint where the AI analyzes the portfolio and auto-executes trades and watchlist changes from natural language.
**Depends on**: Phase 1
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05
**Success Criteria** (what must be TRUE):

  1. Sending a message to `POST /api/chat` returns a structured response with assistant text plus any trades and watchlist changes
  2. A buy or sell proposed by the AI executes automatically and updates cash and positions using manual-trade validation
  3. A watchlist change proposed by the AI applies automatically
  4. Conversation history persists with executed actions and is included as context on later messages
  5. With `LLM_MOCK=true`, chat returns deterministic responses without an API key

**Plans**: 3/3 plans executed
**Wave 1**

- [x] 02-01-PLAN.md — Dependencies (litellm, python-dotenv), .env loading, chat schemas & prompts (CHAT-01)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — POST /api/chat mock-mode tracer: parse → auto-execute → persist pipeline (CHAT-01..CHAT-05)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-03-PLAN.md — Live LiteLLM branch (gpt-oss-120b/Cerebras) + 503 error contract + history/determinism tests (CHAT-01, CHAT-04, CHAT-05)

### Phase 3: Frontend Trading Terminal

**Goal**: A Bloomberg-style terminal UI with streaming prices, instant trading, portfolio visualizations, and chat, in one page.
**Depends on**: Phase 2
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07
**Success Criteria** (what must be TRUE):

  1. Opening the app shows a dark terminal layout with ten watchlist tickers, live prices, $10k cash, and a connection indicator
  2. Prices flash green/red and sparklines fill in as the SSE stream delivers updates
  3. Clicking a ticker shows a larger chart; buying or selling from the trade bar updates cash, positions, and portfolio instantly
  4. The portfolio heatmap (treemap), P&L line chart, and positions table render with live data
  5. The chat panel sends messages, shows a loading state, and displays trade/watchlist confirmations inline
  6. Users can add and remove tickers from the watchlist UI

**Plans**: 3/7 plans executed
**UI hint**: yes
**Wave 1**

- [x] 03-01-PLAN.md — Foundation: scaffold (create-next-app, output:'export'), contracts, api helpers, zustand store, vitest harness (UI-01, UI-02, UI-07)

**Wave 2** *(parallel)*

- [x] 03-02-PLAN.md — TRACER: SSE → store → flashing TickerRow → terminal shell + Header connection indicator (UI-01, UI-02, UI-07)
- [x] 03-04-PLAN.md — Portfolio visuals: heatmap treemap, P&L chart, positions table with live prices (UI-03)
- [ ] 03-05-PLAN.md — Controls: TradeBar buy/sell, ChatPanel (503 contract), WatchlistPanel add/remove (UI-04, UI-05, UI-06)

**Wave 3**

- [ ] 03-03-PLAN.md — Charting: useLightweightChart hook, MainChart (selected ticker), sparklines (UI-01, UI-03)

**Wave 4**

- [ ] 03-06-PLAN.md — Integration: compose the terminal grid in page.tsx + phase gates (UI-01..UI-07)

**Wave 5** *(checkpoint-gated)*

- [ ] 03-07-PLAN.md — Dev-only CORS (A1, human gate) + manual browser verification (UI-01, UI-02, UI-07)

### Phase 4: Deployment & E2E

**Goal**: One command deploys the full app in a single Docker container with a persistent database, and Playwright E2E tests prove the core flows.
**Depends on**: Phase 3
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, TEST-01, TEST-02
**Success Criteria** (what must be TRUE):

  1. Running a single Docker command (or start script) builds and serves the app on http://localhost:8000 with streaming prices and a working terminal
  2. The SQLite database persists across container restarts (positions, watchlist, and cash survive)
  3. Start/stop scripts are idempotent — safe to run repeatedly
  4. E2E tests pass for fresh start, watchlist add/remove, buy/sell, visualizations, mocked AI chat, and SSE reconnection

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Backend Foundation | 3/3 | Complete   | 2026-08-26 |
| 2. AI Chat Assistant | 3/3 | Complete    | 2026-08-26 |
| 3. Frontend Trading Terminal | 3/7 | In Progress|  |
| 4. Deployment & E2E | 0/- | Not started | - |
