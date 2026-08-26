# Requirements: FinAlly

**Defined:** 2026-08-25
**Core Value:** A user runs one Docker command and immediately gets a working Bloomberg-style trading terminal — streaming prices, instant simulated trades, portfolio analytics, and an AI copilot that trades on their behalf.

## v1 Requirements

Requirements for initial release. Each maps to a roadmap phase.

### Validated — Market Data (already implemented)

Built in `backend/app/market/` (73 tests, 84% coverage). NOT rebuilt in this roadmap.

- ✓ **MKT-01**: Live price simulator generates realistic GBM prices with correlated moves and occasional 2–5% shock events
- ✓ **MKT-02**: Polygon.io (Massive) REST poller provides real market data when `MASSIVE_API_KEY` is set
- ✓ **MKT-03**: Shared thread-safe in-memory `PriceCache` is the single source of truth for prices
- ✓ **MKT-04**: SSE stream router factory exposes `GET /api/stream/prices`

### Database (DB)

- [x] **DB-01**: SQLite database lazily initializes on first request (no migration step) with full schema and seed data — one `$10,000` profile and ten default tickers
- [x] **DB-02**: FastAPI app entry point wires the market data source, price cache, SSE router, and all REST routers with lifespan startup/shutdown
- [x] **DB-03**: `GET /api/health` returns a healthy status for Docker/uptime checks

### Portfolio (PORT)

- [x] **PORT-01**: `GET /api/portfolio` returns positions, cash balance, total value, and unrealized P&L
- [x] **PORT-02**: `POST /api/portfolio/trade` executes market buy orders (instant fill, no fees, sufficient-cash validation)
- [x] **PORT-03**: `POST /api/portfolio/trade` executes market sell orders (sufficient-shares validation, average-cost update)
- [x] **PORT-04**: `GET /api/portfolio/history` returns value snapshots (recorded every 30s and after each trade)

### Watchlist (WATCH)

- [x] **WATCH-01**: `GET /api/watchlist` returns watched tickers with latest prices
- [x] **WATCH-02**: `POST /api/watchlist` adds a ticker to the watchlist
- [x] **WATCH-03**: `DELETE /api/watchlist/{ticker}` removes a ticker from the watchlist

### Chat Assistant (CHAT)

- [x] **CHAT-01**: `POST /api/chat` returns a complete structured JSON response (message + trades + watchlist_changes)
- [x] **CHAT-02**: AI auto-executes trades from the structured response using the same validation as manual trades
- [x] **CHAT-03**: AI auto-applies watchlist changes from the structured response
- [x] **CHAT-04**: Conversation history persists in `chat_messages` and is included as context on subsequent messages
- [x] **CHAT-05**: `LLM_MOCK=true` returns deterministic mock responses (no API key required)

### Frontend UI (UI)

- [ ] **UI-01**: Single-page terminal-style layout with dark theme (watchlist, chart, portfolio, chat, header)
- [ ] **UI-02**: Live price streaming with green/red flash animations and sparklines via `EventSource`
- [ ] **UI-03**: Portfolio heatmap (treemap), P&L line chart, and positions table render with live data
- [ ] **UI-04**: Trade bar for buy/sell with instant fill and live cash/portfolio updates
- [ ] **UI-05**: AI chat panel with history, loading indicator, and inline trade/watchlist confirmations
- [ ] **UI-06**: Users can add/remove tickers from the watchlist in the UI
- [ ] **UI-07**: Connection status indicator (green/yellow/red) and live portfolio value in the header

### Deployment (DEPLOY)

- [ ] **DEPLOY-01**: Single Docker container on port 8000 serves FastAPI + static Next.js export
- [ ] **DEPLOY-02**: Multi-stage Dockerfile (Node 20 build → Python 3.12 runtime)
- [ ] **DEPLOY-03**: SQLite persists via named volume (`finally-data:/app/db`)
- [ ] **DEPLOY-04**: Idempotent start/stop scripts (macOS/Linux shell + Windows PowerShell)

### Testing (TEST)

- [ ] **TEST-01**: Playwright E2E infrastructure (`docker-compose.test.yml` + Playwright container, `LLM_MOCK=true`)
- [ ] **TEST-02**: E2E scenarios cover fresh start, watchlist CRUD, buy/sell, visualizations, mocked AI chat, and SSE reconnection

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Optional Enhancements

- **DEPLOY-05**: Cloud deployment (AWS App Runner / Render) and Terraform config
- **CHAT-06**: Token-by-token streaming chat responses (currently complete-JSON only)

## Out of Scope

| Feature | Reason |
|---------|--------|
| User authentication / multi-user | Single-user `"default"` model by design |
| Limit orders / order book / partial fills | Market orders only; dramatically simpler math |
| Real-money brokerage integration | Simulated portfolio only (demo/capstone) |
| Mobile app | Desktop-first web only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MKT-01 | — | Validated |
| MKT-02 | — | Validated |
| MKT-03 | — | Validated |
| MKT-04 | — | Validated |
| DB-01 | Phase 1 | Complete |
| DB-02 | Phase 1 | Complete |
| DB-03 | Phase 1 | Complete |
| PORT-01 | Phase 1 | Complete |
| PORT-02 | Phase 1 | Complete |
| PORT-03 | Phase 1 | Complete |
| PORT-04 | Phase 1 | Complete |
| WATCH-01 | Phase 1 | Complete |
| WATCH-02 | Phase 1 | Complete |
| WATCH-03 | Phase 1 | Complete |
| CHAT-01 | Phase 2 | Complete |
| CHAT-02 | Phase 2 | Complete |
| CHAT-03 | Phase 2 | Complete |
| CHAT-04 | Phase 2 | Complete |
| CHAT-05 | Phase 2 | Complete |
| UI-01 | Phase 3 | Pending |
| UI-02 | Phase 3 | Pending |
| UI-03 | Phase 3 | Pending |
| UI-04 | Phase 3 | Pending |
| UI-05 | Phase 3 | Pending |
| UI-06 | Phase 3 | Pending |
| UI-07 | Phase 3 | Pending |
| DEPLOY-01 | Phase 4 | Pending |
| DEPLOY-02 | Phase 4 | Pending |
| DEPLOY-03 | Phase 4 | Pending |
| DEPLOY-04 | Phase 4 | Pending |
| TEST-01 | Phase 4 | Pending |
| TEST-02 | Phase 4 | Pending |

**Coverage:**

- Active v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-25*
*Last updated: 2026-08-25 after roadmap creation*
