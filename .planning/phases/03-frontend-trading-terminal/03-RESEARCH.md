# Phase 3: Frontend Trading Terminal — Research

**Researched:** 2026-08-26
**Domain:** Next.js static-export SPA (React 19) consuming a FastAPI REST + SSE backend — Bloomberg-style terminal with live prices, instant trading, portfolio visualizations, and AI chat
**Confidence:** HIGH

## Summary

Phase 3 builds `frontend/` from scratch: a single-page, dark, data-dense trading terminal that consumes the fully-shipped Phase 1/2 backend (`GET /api/portfolio`, `POST /api/portfolio/trade`, `GET /api/portfolio/history`, `GET/POST/DELETE /api/watchlist`, `POST /api/chat`, `GET /api/stream/prices` SSE — all verified this session from backend source). No `frontend/` directory exists today; every framework, library, and test tool is a fresh install. Node v24.19.0 / npm 11.17.0 are present (Next.js 16 requires Node ≥20.9 — ✓).

The core architectural finding: **this is a client-only SPA with `output: 'export'`.** Next.js 16.3.3 static export produces `frontend/out/` (one HTML file per route, no server), and the docs explicitly list `rewrites`, `proxy`, route handlers relying on `Request`, and dynamic routes without `generateStaticParams` as **unsupported** — so the dev-server proxy trick for reaching the backend is unavailable. The standard pattern (and the one the Next.js docs themselves recommend for client data fetching) is a build-time-inlined `NEXT_PUBLIC_API_BASE` env var: empty in production builds (relative `/api/*`, same origin, honors the locked "no CORS" constraint), `http://localhost:8000` in a dev-only `.env.local`. The single deviation to flag: dev-mode calls from `next dev` (:3000) to FastAPI (:8000) are cross-origin, so the backend needs a **dev-only CORS middleware** — a small `main.py` change that conflicts with the "no CORS" constraint in dev only. If the user rejects CORS, the fallback is serving the built `out/` from FastAPI (slow iteration loop); both options are documented in Open Questions.

**Charting recommendation: two libraries, each for what it is best at.** `lightweight-charts` 5.2.1 (TradingView, canvas, ~3MB unpacked, zero peer deps, purpose-built for streaming financial data) owns the main chart (Area series — the backend only provides `price`, no OHLC, so no candles) and the ten watchlist sparklines (tiny Area series fed by `series.update()`). `recharts` 3.10.1 (React 19 peer-dep verified, `Treemap` component verified present in the 3.10.1 tarball) owns the portfolio heatmap treemap and the P&L line chart — low-frequency data (positions + 30s snapshots) where SVG/declarative wins. ECharts 6.1.0 was rejected (~60MB unpacked, imperative option-object API); d3/@visx treemap was rejected (hand-rolled layout math).

**State management: one zustand 5.0.15 store, no React Query.** SSE pushes a full 10-ticker snapshot every ~500ms; zustand selectors let each component subscribe to only its slice (a ticker row, the connection dot) so a 20Hz tick stream never re-renders the tree. React Query/SWR are server-state caches — redundant for ~5 REST endpoints where the SSE stream is the realtime channel and mutations trigger an explicit refetch. The store holds: prices, per-ticker sparkline histories (capped ~100 points), connection state, selected ticker, portfolio snapshot + live-derived market values, watchlist, chat messages. Plain `fetch` + `apiUrl()` helper for REST; EventSource consumer hook for the stream; the chat 503-with-ChatResponse contract renders without special-casing (Phase 2 locked it).

**Primary recommendation:** Scaffold with `npx create-next-app@latest frontend --typescript --app --eslint --tailwind` (Next 16.3.3, React 19.2.8, Tailwind 4.3.3), set `output: 'export'`, add `lightweight-charts@5.2.1` + `recharts@3.10.1` + `zustand@5.0.15` as the only three runtime deps beyond the scaffold, and `vitest@4.1.11` + `@testing-library/react@16.3.2` + `jsdom@30.0.1` for component/unit tests. Every API contract below is quoted verbatim from backend source so the frontend types match exactly — no guessing.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UI-01 | Single-page terminal layout (watchlist, chart, portfolio, chat, header) | Static export SPA — one `app/page.tsx` Client Component + component tree; layout grid in Tailwind v4; `output:'export'` verified [CITED: nextjs.org/docs/app/guides/static-exports v16.3.3] |
| UI-02 | Live price streaming with flash animations + sparklines via EventSource | Backend SSE frame format verified [VERIFIED: backend/app/market/stream.py:64-86]; `retry: 1000` directive + browser auto-reconnect [VERIFIED: stream.py:65, CITED: developer.mozilla.org EventSource]; zustand store + flash-by-key pattern; lightweight-charts Area sparklines |
| UI-03 | Portfolio heatmap (treemap), P&L line chart, positions table with live data | Recharts 3.10.1 `Treemap` verified in tarball; history shape `{"snapshots": [{recorded_at, total_value}]}` [VERIFIED: backend/app/portfolio/service.py:190-195]; positions fields [VERIFIED: portfolio/schemas.py:24-33]; live prices from SSE for current-price column |
| UI-04 | Trade bar buy/sell with instant fill and live updates | `POST /api/portfolio/trade {ticker, quantity, side}` → 200 PortfolioResponse / 400 insufficient / 404 unknown [VERIFIED: portfolio/router.py:40-61]; refetch portfolio after fill; client-side recompute of live market value from SSE |
| UI-05 | AI chat panel with history, loading, inline confirmations | `POST /api/chat {message}` → 200 ChatResponse; **any `error` field set → HTTP 503 with a valid ChatResponse body** [VERIFIED: chat/router.py:33-34]; response shape [VERIFIED: chat/schemas.py:37-70]; render `error` without special-casing; mock mode `LLM_MOCK=true` covers testing |
| UI-06 | Add/remove tickers from watchlist UI | `POST /api/watchlist {ticker}` → 200 `{ticker}` / 409 duplicate [VERIFIED: watchlist/router.py:32-51]; `DELETE /api/watchlist/{ticker}` → 204 / 404 [VERIFIED: router.py:54-73]; SSE stops carrying removed tickers (market source sync) |
| UI-07 | Connection status indicator + live portfolio value in header | `EventSource.readyState` CONNECTING(0)/OPEN(1)/CLOSED(2) → yellow/green/red [CITED: MDN]; backend stream disconnect detection [VERIFIED: stream.py:74-76]; live total value = cash + Σ(quantity × live price) |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Live price consumption (SSE) | Browser / Client | — | `EventSource` + zustand store; the backend only emits, never receives |
| Price flash + sparklines | Browser / Client | — | Pure client rendering from store prices; flash via CSS class remount |
| Main chart (selected ticker) | Browser / Client | — | lightweight-charts canvas; data accumulated client-side from SSE since page load |
| Portfolio heatmap / P&L chart / positions | Browser / Client | API / Backend | Data from `GET /api/portfolio` + `/history`; client recomputes live market values from SSE prices |
| Trade execution | API / Backend | — | `POST /api/portfolio/trade` is authoritative (single SQLite transaction, snapshot inside it); client only sends `{ticker, quantity, side}` and renders the response |
| Chat | API / Backend | — | `POST /api/chat` owns LLM call + auto-execution; client renders loading → ChatResponse |
| Watchlist CRUD | API / Backend | — | REST endpoints keep DB + market source + price cache in sync; client never mutates directly |
| Connection status | Browser / Client | — | EventSource `readyState` + `open`/`error` events |
| Persistence | Database / Storage | — | Entirely backend-side (SQLite); frontend is stateless across reloads |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | `16.3.3` (latest; Node ≥20.9 ✓ on v24.19.0) | App Router static-export SPA (`output:'export'` → `out/`) | Mandated by PROJECT.md/PROJECT constraints; static-export docs verified for v16.3.3 [VERIFIED: npm registry + CITED: nextjs.org/docs/app/guides/static-exports] |
| `react` / `react-dom` | `19.2.8` | UI runtime | Next 16 default; Recharts/zustand/testing-library all React-19-compatible (peer deps verified) [VERIFIED: npm registry] |
| `lightweight-charts` | `5.2.1` | Main chart + watchlist sparklines (canvas, streaming) | TradingView's purpose-built financial charting lib; v5 API + React pattern verified from official docs; ~3MB unpacked, zero peer deps [VERIFIED: npm registry + CITED: tradingview.github.io/lightweight-charts/docs] |
| `recharts` | `3.10.1` | Portfolio treemap + P&L line chart (SVG, declarative) | `Treemap` component verified in 3.10.1 tarball; peer deps `react ^16.8–^19` [VERIFIED: npm registry + tarball inspection]; 59M downloads/wk |
| `zustand` | `5.0.15` | Single client state store (prices, sparklines, connection, portfolio, watchlist, chat) | Selector-based subscriptions fit 20Hz SSE updates; peer `react >=18` [VERIFIED: npm registry]; design choice [ASSUMED] |
| `tailwindcss` + `@tailwindcss/postcss` | `4.3.3` | Styling, dark theme tokens, flash animations | Mandated by PROJECT.md; v4 CSS-first setup with Next.js verified from official docs [VERIFIED: npm registry + CITED: tailwindcss.com/docs/installation/framework-guides/nextjs] |

### Supporting (dev / test)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | `4.1.11` | Frontend unit/component test runner (jsdom) | All component + hook tests; 96M downloads/wk [VERIFIED: npm registry] |
| `@testing-library/react` | `16.3.2` | Component rendering + interaction tests | React 19 compatible (peer deps verified) [VERIFIED: npm registry] |
| `@testing-library/jest-dom` | `7.0.1` | DOM matchers (`toBeInTheDocument`, `toHaveClass`) | Standard companion [VERIFIED: npm registry] |
| `jsdom` | `30.0.1` | DOM environment for vitest | Test environment [VERIFIED: npm registry] |
| `typescript`, `@types/react`, `@types/react-dom` | 7.0.2 / 19.2.18 / 19.2.5 | Types | Scaffold defaults; versions verified [VERIFIED: npm registry] |
| `eslint` + `eslint-config-next` | 10.9.1 / 16.3.3 | Lint | `eslint-config-next` 16.3.3 matches next 16.3.3 [VERIFIED: npm registry] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| lightweight-charts + Recharts (two libs) | ECharts 6.1.0 + echarts-for-react 3.0.6 for everything | One dep, native treemap — but ~60MB unpacked vs ~10MB combined, imperative option-object API fights React, no React-idiomatic realtime update path [VERIFIED: npm registry sizes] |
| lightweight-charts + Recharts | Recharts 3.10.1 for everything | Simpler dep set; but SVG re-render of the main chart on every 500ms tick is jankier than canvas, and Recharts lacks a streaming-update primitive — weak for the Bloomberg-density main chart |
| lightweight-charts + Recharts | d3 7.9 + @visx/hierarchy 4.0.0 treemap | Full control, tiny — but hand-rolled treemap layout (squarify) + axes + tooltips = significant extra work; `@visx/treemap` does not exist on npm (404 — treemap lives in `@visx/hierarchy`), another integration to hand-wire |
| zustand | @tanstack/react-query 5.102.6 / SWR 2.5.1 | React Query is excellent for server-state caching but redundant here: SSE is the realtime channel, ~5 endpoints, mutations already trigger refetch; adds a second data model |
| zustand | Plain React Context | Context re-renders every consumer on any store change; no selector isolation → 20Hz tick stream re-renders the whole tree without `useSyncExternalStore` gymnastics |
| `NEXT_PUBLIC_API_BASE` + dev CORS | Next.js `rewrites`/`proxy` to the backend in dev | **Unsupported with `output:'export'`** — verified in the v16.3.3 unsupported-features list [CITED: nextjs.org/docs/app/guides/static-exports] |

**Installation (inside `frontend/` after `create-next-app` scaffold):**
```bash
npm install lightweight-charts@5.2.1 recharts@3.10.1 zustand@5.0.15
npm install -D vitest@4.1.11 @testing-library/react@16.3.2 @testing-library/jest-dom@7.0.1 jsdom@30.0.1
# Tailwind v4 comes from the scaffold (tailwindcss + @tailwindcss/postcss + postcss)
```

**Version verification (performed this session via `npm view`):** next 16.3.3 (2026-08-25), react/react-dom 19.2.8, lightweight-charts 5.2.1 (2026-08-12), recharts 3.10.1 (2026-07-25), echarts 6.1.0, zustand 5.0.15, @tanstack/react-query 5.102.6, swr 2.5.1, tailwindcss 4.3.3, vitest 4.1.11, @testing-library/react 16.3.2, jsdom 30.0.1, typescript 7.0.2, eslint-config-next 16.3.3 — all `[VERIFIED: npm registry]`.

## Package Legitimacy Audit

> Gate protocol run 2026-08-26. Six packages returned `SUS` — **all are the same heuristic artifact documented in Phase 2** (the seam reads the *latest-release* date as package age and flags "too-new"). Counter-evidence per row. No `postinstall` scripts on any candidate (`postinstall: null` in every verdict).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| next | npm | 9+ yrs (Vercel) | 54.3M/wk | github.com/vercel/next.js | SUS (artifact) | Approved — mandated by PROJECT.md; scaffold standard |
| react / react-dom | npm | 13+ yrs | 173M/162M wk | github.com/react/react | OK | Approved |
| lightweight-charts | npm | 7+ yrs (TradingView) | 948K/wk | github.com/tradingview/lightweight-charts | SUS (artifact) | Approved — first-party TradingView library, official docs verified |
| recharts | npm | 9+ yrs | 59M/wk | github.com/recharts/recharts | OK | Approved |
| zustand | npm | 7+ yrs (pmndrs) | 53.6M/wk | github.com/pmndrs/zustand | SUS (artifact) | Approved — pmndrs org, 53M/wk |
| @tanstack/react-query | npm | 6+ yrs | 67M/wk | github.com/TanStack/query | SUS (artifact) | Not selected — rejected as redundant; listed for completeness |
| echarts | npm | 11+ yrs (Apache) | 5M/wk | github.com/apache/echarts | OK | Not selected — bundle size (see Alternatives) |
| @visx/hierarchy | npm | 5+ yrs (Airbnb) | 227K/wk | github.com/airbnb/visx | OK | Not selected — rejected in favor of Recharts Treemap |
| tailwindcss + @tailwindcss/postcss | npm | 9+ yrs | 126M/34M wk | github.com/tailwindlabs/tailwindcss | OK | Approved — mandated |
| vitest | npm | 4+ yrs | 96M/wk | github.com/vitest-dev/vitest | SUS (artifact) | Approved — industry-standard test runner |
| @testing-library/react | npm | 8+ yrs | 56M/wk | github.com/testing-library/react-testing-library | OK | Approved |
| jsdom | npm | 14+ yrs | 97M/wk | github.com/jsdom/jsdom | SUS (artifact) | Approved — universal DOM test environment |
| postcss | npm | 11+ yrs | 279M/wk | github.com/postcss/postcss | SUS (artifact) | Approved — Tailwind v4 peer dep |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none in substance — the six `SUS` rows are release-date-heuristic artifacts with first-party repos and 0.9M–279M weekly downloads; no `checkpoint:human-verify` is warranted (mirrors Phase 2's litellm/python-dotenv resolution).

*Note: every package name above was either mandated by project docs (next, react, tailwindcss), named in the phase research brief (zustand, @tanstack/react-query, swr, recharts, lightweight-charts, echarts, visx), or discovered this session and verified on the npm registry + official docs. Names carried in the brief are `[ASSUMED]` for behavioral claims; registry existence/versions are `[VERIFIED: npm registry]`.*

## Architecture Patterns

### System Architecture Diagram

```
Browser — static export served at / (FastAPI in Phase 4; `next dev` :3000 in Phase 3)
│
│  page.tsx ('use client') — terminal shell
│  ┌──────────────────────────────────────────────────────────────┐
│  │ Header: live total value │ connection dot │ cash             │
│  ├──────────────┬───────────────────────────────┬───────────────┤
│  │ Watchlist    │ Main Chart (selected ticker)  │ AI Chat       │
│  │ 10 TickerRow │ lightweight-charts Area       │ panel         │
│  │  sparkline   │  (accumulated from SSE)       │               │
│  │  flash       ├───────────────────────────────┤  messages     │
│  │  add/remove  │ Portfolio: heatmap (Recharts  │  loading      │
│  │              │ Treemap) │ P&L (LineChart)    │  confirmations│
│  │              │ Positions table               │               │
│  │              ├───────────────────────────────┤               │
│  │              │ TradeBar: ticker/qty/buy/sell │               │
│  └──────────────┴───────────────────────────────┴───────────────┘
│
│  Data flows:
│  EventSource('/api/stream/prices') ──► usePriceStream hook ──► zustand store
│      onmessage: JSON.parse(e.data) → {TICKER: {ticker,price,previous_price,
│      timestamp,change,change_percent,direction}} → set(state => ...)
│      readyState: OPEN=green, CONNECTING=yellow, CLOSED=red
│
│  REST (apiFetch via NEXT_PUBLIC_API_BASE, empty in prod → same origin):
│  GET  /api/portfolio          → PortfolioResponse   (on load, after trade, after chat)
│  POST /api/portfolio/trade    → 200 PortfolioResponse | 400 | 404
│  GET  /api/portfolio/history  → {snapshots:[{recorded_at,total_value}]} (poll 30s)
│  GET  /api/watchlist          → {tickers:[PriceUpdate|{ticker}]}
│  POST /api/watchlist          → 200 {ticker} | 409
│  DELETE /api/watchlist/{t}    → 204 | 404
│  POST /api/chat               → 200 ChatResponse | 503 ChatResponse{error}
│  (fetch → refetch portfolio+watchlist after trade/chat actions)
└──────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
frontend/
├── app/
│   ├── layout.tsx            # root layout (metadata, fonts); runs at build time
│   ├── page.tsx              # 'use client' — the terminal app shell
│   └── globals.css           # @import "tailwindcss" + @theme tokens + flash keyframes
├── components/
│   ├── header/Header.tsx            # live total value, connection dot, cash
│   ├── watchlist/WatchlistPanel.tsx # grid of TickerRow + add form + remove buttons
│   ├── watchlist/TickerRow.tsx      # symbol, flashing price, change%, sparkline
│   ├── watchlist/Sparkline.tsx      # tiny lightweight-charts Area chart
│   ├── chart/MainChart.tsx          # selected-ticker Area chart (lightweight-charts)
│   ├── chart/useLightweightChart.ts # official React wrapper hook (createChart/cleanup)
│   ├── portfolio/Heatmap.tsx        # Recharts Treemap
│   ├── portfolio/PnlChart.tsx       # Recharts LineChart over /history snapshots
│   ├── portfolio/PositionsTable.tsx # ticker/qty/avg cost/price/P&L/% rows
│   ├── trade/TradeBar.tsx           # ticker, quantity, Buy/Sell
│   └── chat/ChatPanel.tsx           # messages, loading, inline confirmations, input
├── lib/
│   ├── api.ts               # apiUrl() + apiFetch() (NEXT_PUBLIC_API_BASE-aware)
│   ├── types.ts             # backend contract types (verbatim from schemas below)
│   └── format.ts            # currency/percent formatters, pnlColor()
├── store/
│   └── useStore.ts          # zustand: prices, histories, connection, portfolio, watchlist, chat
├── hooks/
│   └── usePriceStream.ts    # EventSource lifecycle (open/error/message → store)
├── tests/
│   ├── setup.ts             # jest-dom + EventSource mock + fetch mock
│   ├── usePriceStream.test.ts
│   ├── TickerRow.test.tsx   # flash class on direction change
│   ├── TradeBar.test.tsx    # POST body + cash update
│   ├── ChatPanel.test.tsx   # loading + 503 contract rendering
│   └── WatchlistPanel.test.tsx
├── next.config.ts           # output: 'export'
├── vitest.config.ts         # environment jsdom + setupFiles
├── postcss.config.mjs       # @tailwindcss/postcss
├── .env.local               # dev only: NEXT_PUBLIC_API_BASE=http://localhost:8000 (gitignored)
└── package.json
```

### Pattern 1: SSE consumer → zustand store (EventSource + selector isolation)

**What:** One `usePriceStream` hook opens `new EventSource(apiUrl('/api/stream/prices'))` in a `useEffect` (client-only), and its `onmessage` writes parsed prices into the zustand store via functional `set()`. Components subscribe with selectors so a 20Hz tick stream only re-renders affected rows.

**When to use:** Always — this is the UI-02/UI-07 backbone. Never put the EventSource in a component body (stale closure / double-open under StrictMode); always `es.close()` in the effect cleanup.

**Key store shape:**
```typescript
interface Store {
  prices: Record<string, PriceUpdate>;          // latest per ticker (from SSE)
  histories: Record<string, number[]>;          // sparkline arrays, capped ~100
  connection: 'connected' | 'reconnecting' | 'closed';
  selectedTicker: string | null;
  portfolio: PortfolioResponse | null;          // refetched after mutations
  watchlist: WatchlistTicker[];                 // ticker order + prices
  chatMessages: ChatMessage[];                  // {role, content, actions?, error?}
  chatLoading: boolean;
  // actions: applyPrices(update), setConnection, refetchPortfolio, ...
}
```

### Pattern 2: official lightweight-charts React wrapper (v5 API)

**What:** `createChart` is imperative and canvas-based — wrap it in a hook/component that creates the chart in `useEffect`, wires `series.setData()`/`series.update()`, handles resize, and calls `chart.remove()` on cleanup. This is the pattern TradingView's own docs teach (and their agent skill encodes); do **not** use a third-party React wrapper package.

**When to use:** Main chart + every sparkline. v5 API: `chart.addSeries(AreaSeries, opts)` — the v4 `addAreaSeries()` method no longer exists. `series.update({time, value})` pushes a tick without a full redraw.

### Pattern 3: flash animation by key-remount

**What:** Give the price element a `key` that includes a per-ticker tick sequence number, and a CSS animation class chosen by `direction` (`up`/`down`/`flat`). Remounting the element restarts the animation — no timeout juggling, and the animation naturally fades over ~500ms.

**When to use:** Every watchlist price cell (UI-02). Backend `direction` values are exactly `"up" | "down" | "flat"` [VERIFIED: backend/app/market/models.py:31-37].

### Pattern 4: API base resolution for static export

**What:** `const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? ''` — Next.js inlines `NEXT_PUBLIC_*` at build time. Production build with the var unset → `''` → relative `/api/*` (same origin, no CORS). Dev build with `.env.local` → `http://localhost:8000`. All fetches and the EventSource URL go through `apiUrl(path)`.

**When to use:** Every API call + EventSource. `rewrites`/`proxy` (the usual Next dev proxy) are **unsupported** with `output:'export'` [CITED: nextjs.org/docs/app/guides/static-exports].

### Pattern 5: chat 503-contract rendering

**What:** `POST /api/chat` returns HTTP 200 with `{message, trades, watchlist_changes}` normally, and **HTTP 503 with a still-valid `ChatResponse` body** whenever the top-level `error` is set (missing key, backend failure, malformed LLM output) [VERIFIED: backend/app/chat/router.py:33-34]. Per-action trade/watchlist failures keep HTTP 200 with per-action `status: "failed"` + `error`.

**When to use:** Always in ChatPanel. Render: `resp.message` as text; `resp.error` as a styled error line (no special status handling); `resp.trades` as inline confirmation chips (`executed`/`failed`); `resp.watchlist_changes` likewise. After any successful response, refetch portfolio + watchlist (the AI may have traded/edited).

### Anti-Patterns to Avoid

- **Using `next start` for the built export** — with `output:'export'` there is no Node server; serve `out/` from any static host (Phase 4: FastAPI). [ASSUMED]
- **Importing lightweight-charts into a Server Component** — it is client-only by design [CITED: tradingview.github.io/lightweight-charts/docs]; the whole terminal page must be `'use client'`, and chart/EventSource work belongs in `useEffect`.
- **`JSON.parse(e.data)` without try/catch** — one malformed SSE frame kills the handler; wrap it and log.
- **Trusting `message.content` as HTML** — LLM output is untrusted (prompt injection); render as text; never `dangerouslySetInnerHTML` (ASVS V5 / XSS).
- **Full-tree re-render per tick** — subscribe via zustand selectors; do not read the whole store in `page.tsx` at 20Hz.
- **Calling `series.setData()` on every tick** — use `series.update()` for streaming (docs: setData replaces all data and hurts performance) [CITED: tradingview.github.io/lightweight-charts/docs].
- **Client-side validation as the only gate** — backend Pydantic remains authoritative (422/400/404/409); pre-validate for UX only (quantity > 0, ticker ≤ 12 chars — mirrors `TickerStr` [VERIFIED: backend/app/watchlist/schemas.py:12]).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Financial charting (main chart, sparklines) | Custom canvas/SVG price chart | `lightweight-charts` 5.2.1 | Streaming `update()` primitive, price scales, crosshair, tooltips, dark theme — all built for trading terminals; canvas-grade perf at 20Hz |
| Treemap heatmap | Squarify layout + SVG layout math | Recharts 3.10.1 `Treemap` | Layout, labels, and React integration done; `dataKey`/`nameKey` verified in the 3.10.1 tarball |
| Line chart (P&L) | Custom SVG path + axes | Recharts `LineChart` | Declarative axes/grid/tooltip; trivial for ~2/minute snapshot cadence |
| Realtime client state | Hand-rolled pub/sub or prop-drilling | `zustand` 5.0.15 | Selector subscriptions = per-component isolation at 20Hz; ~1KB API surface |
| SSE consumption | fetch + ReadableStream re-implementation | Native `EventSource` | Auto-reconnect (`retry: 1000` honored), `readyState`, message events — standard, universal [CITED: MDN] |
| Money/percent formatting | `toFixed` sprinkling | `Intl.NumberFormat` | Locale-correct currency/percent, zero deps |
| HTTP calls | Raw fetch with manual base-url concat | Tiny `apiFetch`/`apiUrl` helper | Single place for `NEXT_PUBLIC_API_BASE`, JSON headers, error normalization |

**Key insight:** the backend is complete and contract-locked. This phase is a *consumption* phase — every visual component maps to a verified endpoint shape. The only genuinely hard problems (streaming chart updates, 20Hz re-render isolation) are solved by picking the right libraries, not by writing more code.

## Common Pitfalls

### Pitfall 1: Dev cross-origin calls fail with CORS before any UI shows data
**What goes wrong:** `next dev` serves :3000; the backend is :8000; relative `/api/*` calls 404 on the Next dev server, and absolute `http://localhost:8000` calls are blocked by the browser without CORS headers.
**Why it happens:** `rewrites`/`proxy` are unsupported with `output:'export'` — the usual Next dev-proxy escape hatch is closed.
**How to avoid:** `NEXT_PUBLIC_API_BASE=http://localhost:8000` in `frontend/.env.local` + dev-only `CORSMiddleware` in `backend/app/main.py` (`allow_origins=["http://localhost:3000"]`) — **flagged as Assumption A1 for user confirmation** because it touches the locked "no CORS" constraint in dev only. Fallback: serve the built `out/` from FastAPI (no CORS, slower loop).
**Warning signs:** Console `Failed to fetch` / CORS errors on every `/api/*` call in dev; prices never appear.

### Pitfall 2: Chart canvas zero-height / invisible on first render
**What goes wrong:** lightweight-charts measures its container at `createChart` time; a flex/grid container with no explicit height collapses to 0 and the chart is invisible.
**Why it happens:** Canvas libraries read `clientWidth/clientHeight` synchronously; CSS layout may not be settled in `useEffect`.
**How to avoid:** Give chart containers explicit `h-64`/`h-96` (Tailwind) or a measured height; wire `ResizeObserver` (or the docs' `window resize` listener) to `chart.applyOptions({width, height})`.
**Warning signs:** Blank panel where the chart should be; 0-size canvas in devtools.

### Pitfall 3: `series.update()` with non-monotonic or float timestamps
**What goes wrong:** Backend `timestamp` is Unix **float** seconds (`time.time()`) [VERIFIED: backend/app/market/models.py:14]; lightweight-charts intraday time expects integer seconds and `update()` requires time ≥ the last bar — a float or a second-boundary regression throws or corrupts the series.
**How to avoid:** `Math.floor(timestamp)` before passing to the series; keep the last time per ticker; if equal, `update()` replaces the last bar (correct behavior).
**Warning signs:** Chart "cannot write beyond the last bar" errors; duplicate points on the same second.

### Pitfall 4: 503 chat body treated as a hard error
**What goes wrong:** The chat panel only handles HTTP 200 and shows "something broke" on 503 — hiding the human-readable `message`/`error` the backend deliberately returns.
**Why it happens:** Phase 2's locked contract (503 + valid ChatResponse body) is unusual; a generic fetch handler throws on non-2xx.
**How to avoid:** For `POST /api/chat`, parse the body as `ChatResponse` on both 200 and 503 (any non-2xx other than 503 → network error banner). Render `error` inline; per-action `status: "failed"` chips stay 200-shaped. [VERIFIED: chat/router.py:33-34]
**Warning signs:** User sees a generic error instead of "LLM backend unavailable" in mock-less mode.

### Pitfall 5: Removing a ticker leaves stale sparkline history
**What goes wrong:** `DELETE /api/watchlist/{ticker}` stops the market source and clears the price cache [VERIFIED: watchlist/service.py:63-83] — the ticker disappears from SSE, but its history stays in the store and its sparkline row lingers.
**How to avoid:** On successful 204, also prune `histories[ticker]` and `prices[ticker]` from the store; on 404 show an inline error. Add flow: 409 (duplicate) → inline "already on watchlist" message [VERIFIED: watchlist/router.py:49-50].
**Warning signs:** A deleted ticker's sparkline remains; a re-added ticker chart starts from pre-delete data.

### Pitfall 6: Re-render storm at 20Hz freezing the terminal
**What goes wrong:** Reading the whole zustand store (or Context) in the terminal shell re-renders every component 20×/second; Recharts SVGs and 10 canvases jank.
**Why it happens:** SSE pushes a full snapshot every ~500ms with 10 tickers; naive subscriptions have no selector isolation.
**How to avoid:** Component-level selectors (`useStore(s => s.prices[ticker])`); sparkline components receive only their history array; `useShallow` for object slices; cap history arrays (~100 points) so sparklines don't grow unbounded over a long session.
**Warning signs:** CPU spike in devtools performance tab; dropped SSE frames; sluggish typing in the chat input.

## Code Examples

### Backend contract types (verbatim from backend source — frontend `lib/types.ts`)
```typescript
// Source: backend/app/market/models.py:39-48 (PriceUpdate.to_dict), quoted verbatim
// { "ticker": ..., "price": ..., "previous_price": ..., "timestamp": ...,
//   "change": ..., "change_percent": ..., "direction": "up"|"down"|"flat" }
export interface PriceUpdate {
  ticker: string; price: number; previous_price: number; timestamp: number;
  change: number; change_percent: number; direction: 'up' | 'down' | 'flat';
}
// Source: backend/app/portfolio/schemas.py:24-42 (PositionResponse/PortfolioResponse)
export interface Position {
  ticker: string; quantity: number; avg_cost: number; current_price: number;
  market_value: number; unrealized_pnl: number; unrealized_pnl_percent: number;
}
export interface PortfolioResponse {
  cash_balance: number; positions: Position[]; total_value: number; unrealized_pnl: number;
}
// Source: backend/app/portfolio/service.py:190-195 (get_history)
export interface HistoryResponse { snapshots: { recorded_at: string; total_value: number }[]; }
// Source: backend/app/watchlist/service.py:25-31 — tickers carry PriceUpdate OR just {ticker}
export interface WatchlistResponse { tickers: (PriceUpdate | { ticker: string })[]; }
// Source: backend/app/chat/schemas.py:37-70 (TradeActionResult/WatchlistChangeResult/ChatResponse)
export interface TradeActionResult {
  ticker: string; side: 'buy' | 'sell'; quantity: number;
  status: 'executed' | 'failed'; error?: string | null;
}
export interface WatchlistChangeResult {
  ticker: string; action: 'add' | 'remove'; status: 'executed' | 'failed'; error?: string | null;
}
export interface ChatResponse {
  message: string; trades: TradeActionResult[];
  watchlist_changes: WatchlistChangeResult[]; error?: string | null;
}
```

### SSE consumer hook (EventSource → zustand)
```typescript
// Pattern: MDN EventSource + backend stream.py frame format (this session)
export function usePriceStream() {
  useEffect(() => {
    const es = new EventSource(apiUrl('/api/stream/prices')); // retry: 1000 honored
    es.onopen = () => useStore.getState().setConnection('connected');
    es.onerror = () => useStore.getState().setConnection('reconnecting'); // do NOT close()
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as Record<string, PriceUpdate>;
        useStore.getState().applyPrices(data); // functional set; caps histories
      } catch { /* skip malformed frame */ }
    };
    return () => es.close(); // unmount only — readyState CLOSED(2)
  }, []);
}
```

### Official lightweight-charts React wrapper (v5 API, from TradingView's own tutorial)
```tsx
// Source: https://tradingview.github.io/lightweight-charts/tutorials/react/simple (v5.2)
import { AreaSeries, createChart, ColorType } from 'lightweight-charts';
export function ChartComponent({ data }: { data: { time: number; value: number }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const chart = createChart(ref.current!, {
      layout: { background: { type: ColorType.Solid, color: '#0d1117' }, textColor: '#c9d1d9' },
      width: ref.current!.clientWidth, height: 300,
    });
    chart.timeScale().fitContent();
    const series = chart.addSeries(AreaSeries, { lineColor: '#209dd7', topColor: 'rgba(32,157,215,0.4)', bottomColor: 'rgba(32,157,215,0.02)' });
    series.setData(data);
    const onResize = () => chart.applyOptions({ width: ref.current!.clientWidth });
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); chart.remove(); };
  }, []); // live updates: series.update({ time, value }) from the store — never setData per tick
  return <div ref={ref} />;
}
```

### Flash animation by key-remount
```tsx
// Pattern: PLAN.md §10 ("briefly apply a CSS class ... then remove it") — key-remount restarts CSS animation
const seq = useStore(s => s.tickSeq[ticker]);            // increments per direction-changing tick
return (
  <span key={`${ticker}-${seq}`} className={flashClass(update.direction)}>
    {fmt(update.price)}
  </span>
);
// globals.css: @keyframes flash-up { 0% { background: rgba(38,166,154,.35); } 100% { background: transparent; } }
// .flash-up  { animation: flash-up .5s ease-out; }  .flash-down { ...red... }
```

### Recharts treemap heatmap (portfolio)
```tsx
// Source: Recharts 3.10.1 Treemap API verified this session (dataKey/nameKey)
<Treemap
  data={positions.map(p => ({ name: p.ticker, size: p.market_value, pnl: p.unrealized_pnl }))}
  dataKey="size" nameKey="name" stroke="#1a1a2e"
  content={(props) => <HeatmapCell {...props} />}   // custom rect colored by pnl sign/intensity
/>
```

### apiUrl helper + trade call
```typescript
// Pattern 4 — NEXT_PUBLIC_API_BASE inlined at build time; '' in production builds
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';
export const apiUrl = (p: string) => `${API_BASE}${p}`;
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`); // chat callers read the body on 503 explicitly
  return res.json() as Promise<T>;
}
// Trade: POST /api/portfolio/trade {ticker, quantity, side} → 200 PortfolioResponse | 400 | 404
const portfolio = await apiFetch<PortfolioResponse>('/api/portfolio/trade', {
  method: 'POST', body: JSON.stringify({ ticker, quantity: Number(qty), side }),
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `next export` CLI | `output: 'export'` config | Next.js v14 (2023) | Build config, not CLI; still one HTML file per route; v16.3.3 docs current |
| lightweight-charts v4 `addAreaSeries()` | v5 `chart.addSeries(AreaSeries)` | v5.0 (2024/2025) | Series API unified; old snippets fail against 5.2.1 — use the v5 docs/skill |
| Tailwind v3 `tailwind.config.js` theme | Tailwind v4 CSS-first `@theme` | v4.0 (2025) | No JS config; tokens via CSS custom properties; `@tailwindcss/postcss` plugin |
| Recharts v2 | Recharts v3 | v3.0 (2025) | React 19 support; Treemap API unchanged (`dataKey`/`nameKey` verified) |
| WebSockets for live prices | SSE (`EventSource`) | — | Locked project decision; one-way push, auto-reconnect, no protocol overhead |

**Deprecated/outdated:**
- **`next export` command** — removed in v14; `output:'export'` is the only path [CITED: nextjs.org/docs/app/guides/static-exports].
- **Next.js `rewrites` for dev proxying** — unsupported under static export; use `NEXT_PUBLIC_API_BASE` + dev CORS instead.
- **Candlestick main chart** — impossible with current data: the backend only streams `price` (no OHLC); the main chart must be an Area/Line series [VERIFIED: models.py:10-48].

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Dev workflow adds a **dev-only CORS middleware** to `backend/app/main.py` (allow `http://localhost:3000`) so `next dev` + `NEXT_PUBLIC_API_BASE` can reach FastAPI. Deviates from the locked "no CORS" constraint **in dev only**; production builds keep relative `/api` and stay same-origin. | Standard Stack / Pitfall 1 | User rejects CORS → fallback: serve built `out/` from FastAPI in dev (slow loop) or run the whole stack behind the Phase 4 container earlier. Needs explicit confirmation. |
| A2 | `next start` does not work with `output:'export'` (no Node server is produced). The v16.3.3 docs say the export "can be hosted on any web server that can serve HTML/CSS/JS" — implying no `next start`; not verified by running it. | Anti-Patterns | If Next 16 added a static `next start`, Phase 4 could serve differently; low impact either way (Phase 4 owns serving). |
| A3 | Zustand is the right state layer and React Query is not needed for this app's scale (5 REST endpoints + SSE realtime). | Standard Stack | If the planner prefers React Query for REST caching, the store split changes; zustand remains for the tick stream. |
| A4 | Sparkline history cap ~100 points is sufficient (10 tickers × ~100 points at 2Hz ≈ 50s of intraday context; sparklines "fill in" from page load per PLAN.md §10). | Patterns | Visual only; can raise or make configurable. |
| A5 | Polling `GET /api/portfolio/history` every ~30s matches the server's snapshot cadence (snapshot loop interval 30s [VERIFIED: snapshots.py:46-48]) and keeps the P&L chart current without an extra realtime channel. | Patterns | Poll interval is a tuning knob; a longer session still renders correctly. |
| A6 | `create-next-app@latest` with `--typescript --app --eslint --tailwind` scaffolds a working Next 16 + React 19 + Tailwind 4 base (Turbopack default). | Standard Stack | If scaffold flags changed, the plan adapts; the three added deps are unaffected. |
| A7 | lightweight-charts `time` accepts integer Unix seconds for intraday series; `Math.floor(timestamp)` is required because the backend sends float `time.time()` seconds [VERIFIED: models.py:14]. | Pitfall 3 | If v5 requires a `UTCTimestamp` wrapper in some path, the wrapper is a 1-line change at the store boundary. |

## Open Questions

1. **Dev-loop CORS deviation (A1) — needs user confirmation**
   - What we know: `output:'export'` forbids `rewrites`/`proxy`; `next dev` (:3000) → FastAPI (:8000) is cross-origin; the backend has no CORS middleware today.
   - What's unclear: Whether the user permits a dev-only `CORSMiddleware` (allow_origins=["http://localhost:3000"]) in `backend/app/main.py`, or prefers the no-CORS fallback (serve `out/` from FastAPI during dev).
   - Recommendation: Add the dev-only CORS middleware; it is inert in production (empty-origin builds stay same-origin) and unlocks the fast `next dev` loop. Gate behind a `checkpoint:human-verify` in the plan.
2. **FastAPI `app.frontend()` version gap (Phase 4 concern, note only)**
   - What we know: FastAPI docs (0.141.1) introduce `app.frontend('/', directory=...)` with automatic SPA fallback (`fallback='auto'` → index.html for browser navigation); the installed backend is **0.128.7 and lacks it** (verified `hasattr(FastAPI, 'frontend') == False`).
   - What's unclear: Which FastAPI release added `frontend()` and whether Phase 4 bumps the pin.
   - Recommendation: Phase 3 only guarantees the build lands in `frontend/out/` (index.html + `_next/` + `404.html`); Phase 4 either bumps `fastapi` to a version with `app.frontend()` or uses `StaticFiles` + a catch-all fallback. Not blocking Phase 3.
3. **Live chat verification in Phase 3**
   - What we know: No `OPENROUTER_API_KEY` on this machine (Phase 2 confirmed); `LLM_MOCK=true` returns deterministic mock responses.
   - What's unclear: Whether a live chat smoke test is expected this phase.
   - Recommendation: Build and test the chat panel against mock mode (deterministic, exercises the same `ChatResponse` rendering incl. the 503 contract). The chat endpoint is fully backend-verified already.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js 16 build (`engines: node >=20.9.0`) | ✓ | 24.19.0 | — |
| npm | Install/build/test runner | ✓ | 11.17.0 | — |
| Python backend (uv venv) | Live API + SSE for dev verification | ✓ | 3.12.12 + fastapi 0.128.7 | `LLM_MOCK=true` covers chat |
| Backend SSE + REST | UI-02..07 verification | ✓ | running via `uv run uvicorn app.main:app` | unit-tested against mocked EventSource/fetch |
| `OPENROUTER_API_KEY` | Live chat | ✗ | — | `LLM_MOCK=true` (deterministic, Phase 2-verified) |
| CORS middleware on backend | Dev loop `next dev` (:3000) → :8000 | ✗ | — | A1 decision: add dev CORS, or serve `out/` from FastAPI |
| `frontend/` directory | Everything | ✗ (greenfield) | — | Scaffold via `create-next-app` this phase |

**Missing dependencies with no fallback:** none — the phase is fully executable: mock chat, real backend for REST/SSE, mocked EventSource/fetch for unit tests.
**Missing dependencies with fallback:**
- `OPENROUTER_API_KEY` → `LLM_MOCK=true`.
- Dev CORS → A1 options (add dev CORS middleware, or slow-loop serve `out/` from FastAPI).

## Validation Architecture

> `workflow.nyquist_validation: true` (config.json) — included. Frontend tests are greenfield (no existing infra).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11 + @testing-library/react 16.3.2 + @testing-library/jest-dom 7.0.1 + jsdom 30.0.1 |
| Config file | `frontend/vitest.config.ts` (`environment: 'jsdom'`, `setupFiles: ['./tests/setup.ts']`) |
| Quick run command | `npx vitest run tests/<file> -q` (per task/commit) |
| Full suite command | `npx vitest run` + `npm run build` (phase gate: both green + `npx tsc --noEmit`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UI-01 | Terminal shell renders header/watchlist/chart/portfolio/chat panels | component | `npx vitest run tests/TerminalApp.test.tsx -q` | ❌ Wave 0 |
| UI-02 | SSE consumer parses `{TICKER: PriceUpdate}` frames → store; TickerRow applies flash class on direction change; sparkline data accumulates | unit + component | `npx vitest run tests/usePriceStream.test.ts tests/TickerRow.test.tsx -q` | ❌ Wave 0 |
| UI-03 | Heatmap treemap + P&L line chart + positions table render from mocked portfolio/history; live price column uses store prices | component | `npx vitest run tests/Heatmap.test.tsx tests/PnlChart.test.tsx tests/PositionsTable.test.tsx -q` | ❌ Wave 0 |
| UI-04 | TradeBar posts `{ticker, quantity, side}` and reflects the returned portfolio (cash/positions) | component (fetch mock) | `npx vitest run tests/TradeBar.test.tsx -q` | ❌ Wave 0 |
| UI-05 | ChatPanel: send → loading → renders `message`, per-action confirmations, and the **503-with-ChatResponse error contract** inline | component (fetch mock) | `npx vitest run tests/ChatPanel.test.tsx -q` | ❌ Wave 0 |
| UI-06 | Watchlist add (POST, 409 duplicate handled) and remove (DELETE 204, store pruned; 404 handled) | component (fetch mock) | `npx vitest run tests/WatchlistPanel.test.tsx -q` | ❌ Wave 0 |
| UI-07 | Connection indicator maps readyState OPEN/CONNECTING/CLOSED → green/yellow/red | unit | `npx vitest run tests/usePriceStream.test.ts -q` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/<changed> -q` (targeted)
- **Per wave merge:** `npx vitest run` (full frontend suite) + `npm run build` (static export still compiles)
- **Phase gate:** Full suite green + build succeeds + `npx tsc --noEmit` clean before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `frontend/` scaffold via `create-next-app` (Next 16.3.3, TS, App Router, Tailwind 4) + `output:'export'` in `next.config.ts`
- [ ] `frontend/vitest.config.ts` + `tests/setup.ts` — jsdom env, jest-dom matchers, `EventSource` class mock (constructor captures instance; tests dispatch synthetic `message`/`open`/`error` events with backend-shaped JSON), global `fetch` mock via `vi.stubGlobal`
- [ ] `frontend/lib/types.ts` — backend contract types (quoted verbatim in Code Examples)
- [ ] `frontend/tests/` — the seven test files mapped above (all ❌ Wave 0)
- [ ] Framework install: `npm install -D vitest@4.1.11 @testing-library/react@16.3.2 @testing-library/jest-dom@7.0.1 jsdom@30.0.1`

## Security Domain

> `workflow.security_enforcement: true`, `security_asvs_level: 1` (config.json) — included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user `"default"` model by design (REQUIREMENTS.md Out of Scope) |
| V3 Session Management | no | Stateless API; no sessions |
| V4 Access Control | no | Single user, no roles |
| V5 Input Validation | **yes** | Client pre-validation is UX-only (quantity > 0, ticker ≤ 12 chars — mirrors backend `TradeRequest` `Field(gt=0)` [VERIFIED: portfolio/schemas.py:14] and `TickerStr` max 12 [VERIFIED: watchlist/schemas.py:12]); **backend Pydantic stays authoritative** (422/400/404/409). Also validate/coerce SSE frames and chat responses defensively (unknown shape → skip, never crash) |
| V6 Cryptography | no | No secrets in the client; API keys exist only in backend env; no TLS decision in this phase (Phase 4 Docker/domain) |

### Known Threat Patterns for the Frontend Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection displayed via chat (LLM content is untrusted) | Tampering | Render `message`/`error` as **text** — React auto-escapes; never `dangerouslySetInnerHTML`; confirmations render from structured `trades`/`watchlist_changes` fields, never from message text |
| Malformed/injected SSE payloads | Tampering | `JSON.parse` in try/catch; type-check the frame shape (`direction ∈ {up,down,flat}`); ignore unknown tickers; the store never evaluates data |
| Cross-origin dev calls (dev-only) | Information Disclosure | A1: `CORSMiddleware` scoped to `http://localhost:3000` in dev; production builds use relative `/api` (same origin) so CORS is never exercised |
| Client-side state tampering | Tampering | Cosmetic only — all mutations re-validate server-side (`execute_trade`, `add_ticker`, `remove_ticker` are the authority); a forged quantity is rejected with 400/404 and the UI reconciles from the response |
| Secret leakage in bundle | Information Disclosure | No secrets belong in `NEXT_PUBLIC_*`; only `NEXT_PUBLIC_API_BASE` is inlined, which is a URL, not a credential |

## Sources

### Primary (HIGH confidence)
- [nextjs.org/docs/app/guides/static-exports](https://nextjs.org/docs/app/guides/static-exports) (v16.3.3) — `output:'export'`, `out/` structure, unsupported features (rewrites/proxy/dynamic routes), Client Component + browser API guidance
- [tradingview.github.io/lightweight-charts/docs](https://tradingview.github.io/lightweight-charts/docs) (v5.2) — client-only, `addSeries(AreaSeries)` v5 API, `setData` vs `update`, license/attribution
- [tradingview.github.io/lightweight-charts/tutorials/react/simple](https://tradingview.github.io/lightweight-charts/tutorials/react/simple) — official React wrapper pattern (used verbatim in Code Examples)
- [fastapi.tiangolo.com/tutorial/frontend/](https://fastapi.tiangolo.com/tutorial/frontend/) — `app.frontend()` SPA fallback (Phase 4 note; requires FastAPI > 0.128.7)
- [fastapi.tiangolo.com/tutorial/static-files/](https://fastapi.tiangolo.com/tutorial/static-files/) — `StaticFiles` mount
- [tailwindcss.com/docs/installation/framework-guides/nextjs](https://tailwindcss.com/docs/installation/framework-guides/nextjs) (v4.3) — `@tailwindcss/postcss` + `@import "tailwindcss"`
- [developer.mozilla.org/en-US/docs/Web/API/EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) — readyState, open/message/error events, auto-reconnect, 6-connection HTTP/1.1 limit
- npm registry (`npm view` this session): versions/publish dates/peerDeps/repos for next, react, react-dom, lightweight-charts, recharts, echarts, echarts-for-react, zustand, @tanstack/react-query, swr, @visx/hierarchy, tailwindcss, @tailwindcss/postcss, postcss, vitest, @testing-library/react, @testing-library/jest-dom, jsdom, typescript, eslint-config-next; recharts 3.10.1 tarball inspected (`es6/chart/Treemap.js` present, `dataKey`/`nameKey` defaults)
- In-repo (read this session, line-cited in Code Examples): `backend/app/market/models.py:10-48`, `backend/app/market/stream.py:41-90`, `backend/app/market/seed_prices.py:4-15`, `backend/app/portfolio/schemas.py:10-42`, `backend/app/portfolio/service.py:29-82,179-195`, `backend/app/portfolio/router.py:23-77`, `backend/app/portfolio/snapshots.py:46-48`, `backend/app/watchlist/schemas.py:12-24`, `backend/app/watchlist/service.py:12-31`, `backend/app/watchlist/router.py:15-73`, `backend/app/chat/schemas.py:10-70`, `backend/app/chat/router.py:14-35`, `backend/app/main.py:28-78`, `backend/pyproject.toml`, `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/config.json`, `planning/PLAN.md` §2/§10/§11, `.env.example`

### Secondary (MEDIUM confidence)
- [pypi.org/pypi/fastapi/json](https://pypi.org/pypi/fastapi/json) — latest 0.141.1 vs installed 0.128.7 (frontend() gap)
- [tradingview.github.io/lightweight-charts/tutorials/demos/realtime-updates](https://tradingview.github.io/lightweight-charts/tutorials/demos/realtime-updates) — realtime update demo reference
- Phase 2 artifacts: `02-RESEARCH.md` (503 contract locked), `02-03-SUMMARY.md` (ChatResponse contract), `02-PATTERNS.md` (repo conventions)

### Tertiary (LOW confidence)
- State-management comparison (zustand vs React Query vs Context for SSE apps) — design reasoning from training/experience, tagged `[ASSUMED]` (A3); no web source fetched. Registry facts for those packages are `[VERIFIED: npm registry]`.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — every version verified on the npm registry this session; official docs fetched for next, lightweight-charts, tailwind, fastapi, MDN EventSource; peer-dep compatibility (React 19) verified for recharts/zustand/react-query
- Architecture: **HIGH** — every API contract quoted verbatim from backend source with line ranges; SSE frame format, error codes, and the 503 contract all read this session; charting split justified by verified capabilities (Recharts Treemap present, lightweight-charts v5 API current)
- Pitfalls: **MEDIUM** — dev-CORS workflow (A1) and scaffold details (A6) not live-tested this session; the 20Hz re-render and chart-lifecycle pitfalls are standard React/canvas failure modes flagged from experience, not from a local reproduction

**Research date:** 2026-08-26
**Valid until:** 2026-09-25 (30 days) — re-check versions on `npm install` (Next/React/vitest move fast); lightweight-charts v5 API stable as of 5.2.1
