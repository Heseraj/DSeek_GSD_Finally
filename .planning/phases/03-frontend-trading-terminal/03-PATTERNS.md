# Phase 3: Frontend Trading Terminal - Pattern Map

**Mapped:** 2026-08-26
**Files analyzed:** 35 (34 new in `frontend/`, 1 modified in `backend/`)
**Analogs found:** 30 / 35 (5 use RESEARCH.md verbatim code examples; no in-repo frontend code exists)

> **Greenfield note:** `frontend/` does not exist — zero `.ts/.tsx/.js/.jsx` files in the repo (glob-verified). The closest analog for every frontend file is **RESEARCH.md's Code Examples + Patterns sections (03-RESEARCH.md:196-416)**, which quote backend contracts verbatim and encode the official-library patterns (EventSource, lightweight-charts v5 wrapper, Tailwind v4, Recharts Treemap). Where a *behavioral* analog exists in the backend (same data flow, different stack), it is cited as the cross-stack convention source. No CONTEXT.md exists for this phase — file list extracted from 03-RESEARCH.md:154-194 (Recommended Project Structure) and 03-RESEARCH.md:490-514 (Validation Architecture).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `frontend/` scaffold (`create-next-app`) | config | n/a | Phase 2 `uv add` dep-install workflow (02-PATTERNS.md:251-265) | role-match |
| `frontend/package.json` (scaffold + `npm install`) | config | n/a | `backend/pyproject.toml` (deps + scripts section) | role-match |
| `frontend/next.config.ts` | config | n/a | `backend/pyproject.toml` (build config) | role-match |
| `frontend/postcss.config.mjs` | config | n/a | scaffold default (Tailwind v4 `@tailwindcss/postcss`) | n/a |
| `frontend/vitest.config.ts` | config | n/a | `backend/pyproject.toml` `[tool.pytest]` (test runner config) | role-match |
| `frontend/.env.local` | config | n/a | `.env.example` (env-var conventions; gitignored) | role-match |
| `frontend/app/layout.tsx` | layout | n/a | scaffold default (build-time server component) | n/a |
| `frontend/app/page.tsx` | component (shell) | event-driven + request-response | `backend/app/main.py` (composition root wiring) | role-match |
| `frontend/app/globals.css` | config (style) | n/a | scaffold default + RESEARCH flash keyframes (03-RESEARCH.md:388-389) | verbatim-snippet |
| `frontend/lib/types.ts` | model | transform | `backend/app/portfolio/schemas.py`, `chat/schemas.py`, `watchlist/schemas.py`, `market/models.py` (types quoted verbatim in 03-RESEARCH.md:303-336) | exact |
| `frontend/lib/api.ts` | utility | request-response | `backend/app/portfolio/router.py` (app.state DI) + RESEARCH Pattern 4 / Code Example (03-RESEARCH.md:402-416) | exact (research verbatim) |
| `frontend/lib/format.ts` | utility | transform | `backend/app/chat/prompts.py` shape (pure formatters, no IO — 02-PATTERNS.md:173-188) | partial |
| `frontend/store/useStore.ts` | store | event-driven | `backend/app/market/cache.py` (`PriceCache` in-memory store) | role-match |
| `frontend/hooks/usePriceStream.ts` | hook | event-driven (SSE) | RESEARCH SSE hook verbatim (03-RESEARCH.md:338-355) + `backend/app/market/stream.py:64-86` (frame format) | exact (research verbatim) |
| `frontend/components/header/Header.tsx` | component | event-driven (store selectors) | `TickerRow.tsx` pattern (selector + flash) | role-match (planned) |
| `frontend/components/watchlist/WatchlistPanel.tsx` | component | CRUD (REST) + event-driven | `backend/app/watchlist/router.py:32-73` (409/204/404 semantics) | role-match |
| `frontend/components/watchlist/TickerRow.tsx` | component | event-driven (SSE selector) | RESEARCH flash pattern verbatim (03-RESEARCH.md:379-390) | exact (research verbatim) |
| `frontend/components/watchlist/Sparkline.tsx` | component | event-driven (streaming) | RESEARCH lightweight-charts wrapper verbatim (03-RESEARCH.md:357-377) | exact (research verbatim) |
| `frontend/components/chart/MainChart.tsx` | component | event-driven (streaming) | RESEARCH lightweight-charts wrapper verbatim (03-RESEARCH.md:357-377) | exact (research verbatim) |
| `frontend/components/chart/useLightweightChart.ts` | hook | event-driven | RESEARCH wrapper hook verbatim (03-RESEARCH.md:358-376) | exact (research verbatim) |
| `frontend/components/portfolio/Heatmap.tsx` | component | request-response (render) | RESEARCH Recharts treemap verbatim (03-RESEARCH.md:392-400) | exact (research verbatim) |
| `frontend/components/portfolio/PnlChart.tsx` | component | request-response (30s poll) | `Heatmap.tsx` (Recharts render pattern) + `backend/app/portfolio/service.py:179-195` (history shape) | role-match |
| `frontend/components/portfolio/PositionsTable.tsx` | component | request-response + event-driven | `backend/app/portfolio/schemas.py:24-33` (PositionResponse fields, verbatim in 03-RESEARCH.md:313-319) | exact (data) |
| `frontend/components/trade/TradeBar.tsx` | component | request-response (POST mutation) | `backend/app/portfolio/router.py:40-61` (trade contract) + RESEARCH apiUrl example (03-RESEARCH.md:412-416) | role-match |
| `frontend/components/chat/ChatPanel.tsx` | component | request-response (POST, 503 contract) | `backend/app/chat/router.py:14-35` (503-with-body) + RESEARCH Pattern 5 (03-RESEARCH.md:235-239) | role-match |
| `frontend/tests/setup.ts` | test-fixture | n/a | `backend/tests/conftest.py` (fixture conventions) + Phase 2 conftest (02-PATTERNS.md:275-296) | role-match |
| `frontend/tests/TerminalApp.test.tsx` | test | n/a | `backend/tests/test_app.py` (app smoke test) | role-match |
| `frontend/tests/usePriceStream.test.ts` | test | n/a | `backend/tests/market/test_cache.py` (unit store test) | role-match |
| `frontend/tests/TickerRow.test.tsx` | test | n/a | `backend/tests/portfolio/test_trade.py` (component-behavior test class) | role-match |
| `frontend/tests/Heatmap.test.tsx` | test | n/a | `backend/tests/portfolio/test_portfolio.py` (render-data test) | role-match |
| `frontend/tests/PnlChart.test.tsx` | test | n/a | `backend/tests/portfolio/test_history.py` (history-shape test) | role-match |
| `frontend/tests/PositionsTable.test.tsx` | test | n/a | `backend/tests/portfolio/test_portfolio.py` | role-match |
| `frontend/tests/TradeBar.test.tsx` | test | n/a | `backend/tests/portfolio/test_trade.py` `TestTradeEndpoint` (fetch-mock POST test) | role-match |
| `frontend/tests/ChatPanel.test.tsx` | test | n/a | `backend/tests/chat/test_chat_endpoint.py` (503-contract test) | role-match |
| `frontend/tests/WatchlistPanel.test.tsx` | test | n/a | `backend/tests/watchlist/test_mutation.py` (409/204/404 tests) | role-match |
| `backend/app/main.py` (MODIFY) | config | n/a | itself — add dev-only CORS (A1, **checkpoint:human-verify**) | n/a |

---

## Pattern Assignments

### Scaffold + config (`create-next-app`, `package.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.env.local`)

**Analog:** Phase 2 dep-install workflow (`backend/pyproject.toml` + `uv add`, 02-PATTERNS.md:251-265) — the repo's established pattern for adding a dependency with a locked version floor.

**Scaffold command** (03-RESEARCH.md:17, 80-87):
```bash
npx create-next-app@latest frontend --typescript --app --eslint --tailwind
cd frontend
npm install lightweight-charts@5.2.1 recharts@3.10.1 zustand@5.0.15
npm install -D vitest@4.1.11 @testing-library/react@16.3.2 @testing-library/jest-dom@7.0.1 jsdom@30.0.1
```

**`next.config.ts`** (03-RESEARCH.md:189, 23):
```typescript
const nextConfig: NextConfig = { output: 'export' };
```
`output: 'export'` is the single mandatory deviation from the scaffold default — produces `frontend/out/`, one HTML file per route, **no Node server** (03-RESEARCH.md:243). `rewrites`/`proxy` are unsupported — do not add them (03-RESEARCH.md:78).

**`vitest.config.ts`** (03-RESEARCH.md:486, 510-511):
```typescript
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
```

**`.env.local`** (dev only, gitignored — 03-RESEARCH.md:192, 231):
```bash
NEXT_PUBLIC_API_BASE=http://localhost:8000
```
Production builds leave it unset → `''` → relative `/api/*`, same origin, no CORS (03-RESEARCH.md:231). **Do not** put any secret in `NEXT_PUBLIC_*` (03-RESEARCH.md:538).

---

### `frontend/app/layout.tsx` + `frontend/app/page.tsx` + `frontend/app/globals.css` (shell)

**Analog:** `backend/app/main.py` (composition root: `FastAPI(title=..., lifespan=lifespan)` + `include_router` × 4, lines 73-78) — the shell file that wires every sub-module together.

**`layout.tsx`** — scaffold default; runs at build time (server component, 03-RESEARCH.md:159). Metadata + fonts only; no `'use client'`.

**`page.tsx`** — the terminal shell. **Must be `'use client'`** (lightweight-charts is client-only — 03-RESEARCH.md:244). Layout grid mirrors the architecture diagram (03-RESEARCH.md:119-135): Header top row; Watchlist | MainChart | ChatPanel middle; Portfolio (Heatmap + PnlChart + PositionsTable) and TradeBar below. **Anti-pattern: do not read the whole store in page.tsx** — subscribe per-component with selectors (03-RESEARCH.md:247, 295-299).

**`globals.css`** (03-RESEARCH.md:161, 388-389) — Tailwind v4 CSS-first (no `tailwind.config.js`):
```css
@import "tailwindcss";

/* dark theme tokens via @theme — #0d1117 / #1a1a2e (PROJECT.md:47) */
@keyframes flash-up { 0% { background: rgba(38,166,154,.35); } 100% { background: transparent; } }
@keyframes flash-down { 0% { background: rgba(197,48,48,.35); } 100% { background: transparent; } }
.flash-up { animation: flash-up .5s ease-out; }
.flash-down { animation: flash-down .5s ease-out; }
```

---

### `frontend/lib/types.ts` (model, transform)

**Analog:** `backend/app/portfolio/schemas.py`, `backend/app/chat/schemas.py`, `backend/app/watchlist/schemas.py`, `backend/app/market/models.py` — the TypeScript interfaces are **verbatim transcriptions** of the Pydantic/`to_dict()` shapes, already quoted in 03-RESEARCH.md:303-336. Copy from the research block, not from memory.

**Source map** (each interface → backend origin):
- `PriceUpdate` → `backend/app/market/models.py:39-48` (`to_dict()`; `direction: "up"|"down"|"flat"` — models.py:31-37)
- `Position` + `PortfolioResponse` → `backend/app/portfolio/schemas.py:24-42`
- `HistoryResponse` → `backend/app/portfolio/service.py:179-195` (`{"snapshots":[{recorded_at,total_value}]}`)
- `WatchlistResponse` → `backend/app/watchlist/service.py:12-31` (union: `PriceUpdate | {ticker}`)
- `TradeActionResult` / `WatchlistChangeResult` / `ChatResponse` → `backend/app/chat/schemas.py:37-70` (`error?: string | null` optional — the 503 body is a *valid* `ChatResponse`)

**Convention:** no `unknown`/`any`; the SSE frame is typed `Record<string, PriceUpdate>` (03-RESEARCH.md:348). The `error` field is optional (`error?: string | null`) so the 503-with-body contract type-checks without special-casing (03-RESEARCH.md:236-239, 287).

---

### `frontend/lib/api.ts` (utility, request-response)

**Analog:** RESEARCH Pattern 4 + Code Example verbatim (03-RESEARCH.md:229-233, 402-416). Cross-stack convention from `backend/app/portfolio/router.py:30-31` (`app.state` DI) → the frontend's single `apiUrl()` seam is the equivalent single-place dependency injection.

```typescript
// 03-RESEARCH.md:405-416 — verbatim
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';
export const apiUrl = (p: string) => `${API_BASE}${p}`;
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}
```

**Notes for the planner:**
- The **only** exception to `!res.ok` throwing is `POST /api/chat`: ChatPanel reads the body as `ChatResponse` on **both 200 and 503** (03-RESEARCH.md:287; `backend/app/chat/router.py:33-34`). Give ChatPanel a dedicated `fetchChat()` that bypasses the generic throw for 503.
- `DELETE /api/watchlist/{ticker}` returns 204 with no body — this call must NOT go through `apiFetch`'s `res.json()` (which rejects on an empty body). Use a raw fetch with a `res.status` check before any body read (the `fetchChat` pattern), or extend `apiFetch` to skip `res.json()` on 204 (watchlist/router.py:72-73). 03-05 Task 3 specifies the raw-fetch option.

---

### `frontend/lib/format.ts` (utility, transform)

**Analog:** `backend/app/chat/prompts.py` shape (pure formatter module, no IO — 02-PATTERNS.md:173-188). **Partial match** — no existing frontend formatter module.

**Expected content** (03-RESEARCH.md:177, 260):
```typescript
// Intl.NumberFormat — never toFixed sprinkling (03-RESEARCH.md:260)
export const fmtCurrency = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
export const fmtPercent = (n: number) => new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 2 }).format(n / 100);
export function pnlColor(n: number): string { return n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-gray-400'; }
```

---

### `frontend/store/useStore.ts` (store, event-driven)

**Analog:** `backend/app/market/cache.py` (`PriceCache`, 75 lines) — the in-memory store with `update()`/`get()`/`get_all()`/`remove()` + monotonic `version` counter that the SSE router diffs against (cache.py:11-67, stream.py:78-80). The zustand store plays the identical role client-side.

**Store shape** (03-RESEARCH.md:202-215):
```typescript
interface Store {
  prices: Record<string, PriceUpdate>;          // latest per ticker (from SSE)
  histories: Record<string, number[]>;          // sparkline arrays, capped ~100 (A4)
  connection: 'connected' | 'reconnecting' | 'closed';
  selectedTicker: string | null;
  portfolio: PortfolioResponse | null;          // refetched after mutations
  watchlist: WatchlistTicker[];                 // ticker order + prices
  chatMessages: ChatMessage[];                  // {role, content, actions?, error?}
  chatLoading: boolean;
  // actions: applyPrices(update), setConnection, refetchPortfolio, ...
}
```

**Key patterns for the planner:**
- `applyPrices(data)` uses **functional `set(state => ...)`** so a full 10-ticker snapshot merges without clobbering concurrent updates (03-RESEARCH.md:198, 350).
- Cap `histories[ticker]` at ~100 points (03-RESEARCH.md:298, A4).
- Track a per-ticker `tickSeq` counter incremented on direction-changing ticks — the flash key-remount source (03-RESEARCH.md:382).
- **Prune on watchlist removal:** on successful `DELETE` 204, delete `histories[ticker]` and `prices[ticker]` too (Pitfall 5, 03-RESEARCH.md:290-293).
- Live total value = `cash_balance + Σ(quantity × live price)` recomputed client-side from SSE prices (03-RESEARCH.md:29) — a derived selector, not stored state.

---

### `frontend/hooks/usePriceStream.ts` (hook, event-driven SSE)

**Analog:** RESEARCH verbatim (03-RESEARCH.md:338-355) + frame format from `backend/app/market/stream.py:64-86` (verified this session: `retry: 1000` first, then `data: {"TICKER": {...}}\n\n` every ~500ms).

```typescript
// 03-RESEARCH.md:341-354 — verbatim
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

**Hard rules:** EventSource lives in `useEffect` only (never component body — StrictMode double-open), always `es.close()` in cleanup (03-RESEARCH.md:200). `JSON.parse` in try/catch (anti-pattern 03-RESEARCH.md:245). Connection state: OPEN→green, CONNECTING→yellow, CLOSED→red (03-RESEARCH.md:29, 140). Uses `useStore.getState()` (not the hook) to avoid subscribing the hook to the store.

---

### Components

All components are `'use client'` (imported under the page's `'use client'` boundary; lightweight-charts is client-only). **Shared rule: subscribe with zustand selectors — never read the whole store in a component body** (Pitfall 6, 03-RESEARCH.md:295-299).

#### `components/header/Header.tsx` (event-driven)

**Analog:** `TickerRow.tsx` pattern (this phase's planned analog — selector + flash). Renders live total value (derived selector: `cash + Σ(qty × live price)`), connection dot (map `store.connection` → green/yellow/red, 03-RESEARCH.md:29), cash balance. Subscribes to `s => s.connection` and `s => s.portfolio` slices.

#### `components/watchlist/TickerRow.tsx` (event-driven)

**Analog:** RESEARCH flash pattern verbatim (03-RESEARCH.md:379-390):
```tsx
// 03-RESEARCH.md:382-387
const seq = useStore(s => s.tickSeq[ticker]);            // increments per direction-changing tick
return (
  <span key={`${ticker}-${seq}`} className={flashClass(update.direction)}>
    {fmt(update.price)}
  </span>
);
// flashClass maps direction 'up'|'down'|'flat' → 'flash-up'|'flash-down'|'' (models.py:31-37)
```
Sparkline = `<Sparkline data={useStore(s => s.histories[ticker])} />` (receive only the array — 03-RESEARCH.md:298).

#### `components/watchlist/Sparkline.tsx` + `components/chart/MainChart.tsx` (event-driven, canvas)

**Analog:** RESEARCH lightweight-charts v5 wrapper verbatim (03-RESEARCH.md:357-377):
```tsx
// 03-RESEARCH.md:360-376 — v5 API: addSeries(AreaSeries), NOT v4 addAreaSeries()
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
  }, []);
  return <div ref={ref} />;
}
```
**Planner notes:** extract the `createChart`/`series`/`cleanup` lifecycle into `useLightweightChart.ts` (03-RESEARCH.md:168); live updates call `series.update({ time, value })` — **never `setData` per tick** (03-RESEARCH.md:248). `Math.floor(timestamp)` before passing to the series (backend sends float Unix seconds — Pitfall 3, 03-RESEARCH.md:279-282; models.py:14-16). Explicit container height `h-64`/`h-96` (Pitfall 2, 03-RESEARCH.md:273-277).

#### `components/portfolio/Heatmap.tsx` (request-response render)

**Analog:** RESEARCH Recharts treemap verbatim (03-RESEARCH.md:392-400):
```tsx
// 03-RESEARCH.md:395-399 — Recharts 3.10.1 Treemap (dataKey/nameKey verified in tarball)
<Treemap
  data={positions.map(p => ({ name: p.ticker, size: p.market_value, pnl: p.unrealized_pnl }))}
  dataKey="size" nameKey="name" stroke="#1a1a2e"
  content={(props) => <HeatmapCell {...props} />}   // custom rect colored by pnl sign/intensity
/>
```

#### `components/portfolio/PnlChart.tsx` (request-response, 30s poll)

**Analog:** `Heatmap.tsx` (Recharts render pattern, this phase). Data = `GET /api/portfolio/history` → `HistoryResponse.snapshots` (03-RESEARCH.md:321, verified service.py:179-195); poll every ~30s to match server snapshot cadence (A5, 03-RESEARCH.md:441; snapshots.py:46-48). Recharts `LineChart` with `Line dataKey="total_value"`, `XAxis dataKey="recorded_at"`, dark grid.

#### `components/portfolio/PositionsTable.tsx` (request-response + event-driven)

**Analog:** `PositionResponse` fields verbatim (03-RESEARCH.md:313-319; schemas.py:24-33). Columns: `ticker | quantity | avg_cost | current_price | market_value | unrealized_pnl | unrealized_pnl_percent`. **The `current_price` column is live** — read from `useStore(s => s.prices[ticker]?.price)` per row, fall back to `position.current_price` when no SSE price yet (03-RESEARCH.md:25, 145). Rows colored via `pnlColor()` (format.ts).

#### `components/trade/TradeBar.tsx` (request-response POST mutation)

**Analog:** `backend/app/portfolio/router.py:40-61` (trade contract) + RESEARCH apiUrl example (03-RESEARCH.md:412-416):
```typescript
// 03-RESEARCH.md:413-415 — verbatim
const portfolio = await apiFetch<PortfolioResponse>('/api/portfolio/trade', {
  method: 'POST', body: JSON.stringify({ ticker, quantity: Number(qty), side }),
});
```
**Planner notes:** client pre-validation is UX-only — `quantity > 0`, `ticker` ≤ 12 chars, uppercase-stripped (mirrors `TradeRequest` `Field(gt=0)` schemas.py:14 and `TickerStr` watchlist/schemas.py:12; 03-RESEARCH.md:249, 527). **Backend Pydantic is authoritative** — handle 400 (insufficient funds/shares) and 404 (unknown ticker) as inline errors (router.py:54-59). On 200: `set` the returned `PortfolioResponse` into the store (instant fill, 03-RESEARCH.md:26, 39).

#### `components/chat/ChatPanel.tsx` (request-response, 503 contract)

**Analog:** `backend/app/chat/router.py:14-35` (503-with-body contract) + RESEARCH Pattern 5 (03-RESEARCH.md:235-239):
```typescript
// Dedicated fetch for chat — reads the body on BOTH 200 and 503 (03-RESEARCH.md:287)
const res = await fetch(apiUrl('/api/chat'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
const data = (await res.json()) as ChatResponse;   // 503 still carries a valid ChatResponse body
```
**Render rules (03-RESEARCH.md:239):** `data.message` as text; `data.error` as a styled inline error line — **no special status handling**; `data.trades` / `data.watchlist_changes` as confirmation chips (`executed`/`failed` per action — `status` field); loading state while awaiting. **XSS guard: render `message`/`error` as text, never `dangerouslySetInnerHTML`** (03-RESEARCH.md:246, 534). After any successful response, `refetchPortfolio()` + `refetchWatchlist()` (the AI may have traded/edited — 03-RESEARCH.md:239). History: load from store `chatMessages`, append user + assistant turns, clear on error handled inline.

#### `components/watchlist/WatchlistPanel.tsx` (CRUD)

**Analog:** `backend/app/watchlist/router.py:32-73` — mirrors the exact 409/204/404 semantics:
- **Add:** `POST /api/watchlist {ticker}` → 200 `{ticker}` | 409 → inline "already on watchlist" (router.py:49-50).
- **Remove:** `DELETE /api/watchlist/{ticker}` → 204 → **prune store** `histories[ticker]`/`prices[ticker]` | 404 → inline error (router.py:71-72; Pitfall 5, 03-RESEARCH.md:290-293).
- Client pre-validates ticker ≤ 12 chars, uppercase (watchlist/schemas.py:12).

---

### Tests (`frontend/tests/`)

**Analog set:** backend test conventions (02-PATTERNS.md:275-408): fixture files (`tests/conftest.py`), helper factories (`_make_db`/`_http_client` in test_trade.py:22-47), class-per-behavior (`TestTradeEndpoint`), DB-verify assertions. Frontend equivalents: `tests/setup.ts` = conftest; per-test mocks = `_make_*` helpers; component test classes = endpoint test classes.

#### `frontend/tests/setup.ts` (test-fixture)

**Analog:** `backend/tests/conftest.py` (fixture module, 11 lines) + Phase 2 conftest conventions (02-PATTERNS.md:275-296). RESEARCH Wave 0 Gaps (03-RESEARCH.md:511): jest-dom matchers (`toBeInTheDocument`, `toHaveClass`), an `EventSource` class mock (constructor captures the instance; tests dispatch synthetic `message`/`open`/`error` events with backend-shaped JSON), global `fetch` mock via `vi.stubGlobal`.

#### `frontend/tests/usePriceStream.test.ts` (UI-02, UI-07)

**Analog:** `backend/tests/market/test_cache.py` (unit store test). Covers: `JSON.parse` of `{TICKER: PriceUpdate}` frames → store prices; malformed frame skipped (no crash); readyState CONNECTING/OPEN/CLOSED → `setConnection` yellow/green/red (03-RESEARCH.md:495, 500).

#### `frontend/tests/TickerRow.test.tsx` (UI-02)

**Analog:** component-behavior test class (`test_trade.py:50-57` style). Asserts flash class applied on direction change (`toHaveClass('flash-up'/'flash-down')`) and sparkline data accumulates.

#### `frontend/tests/Heatmap.test.tsx` + `PnlChart.test.tsx` + `PositionsTable.test.tsx` (UI-03)

**Analog:** `backend/tests/portfolio/test_portfolio.py` + `test_history.py` (render-from-mocked-data). Mock `GET /api/portfolio` and `/api/portfolio/history` (snapshot shape service.py:190-195); assert treemap/lines/rows render; live price column reads store prices (03-RESEARCH.md:496).

#### `frontend/tests/TradeBar.test.tsx` (UI-04)

**Analog:** `backend/tests/portfolio/test_trade.py` `TestTradeEndpoint` (fetch-mock POST). Asserts POST body `{ticker, quantity, side}`; 200 → store portfolio updated (cash/positions); 400/404 → inline error (03-RESEARCH.md:497).

#### `frontend/tests/ChatPanel.test.tsx` (UI-05)

**Analog:** `backend/tests/chat/test_chat_endpoint.py` (503-contract test). Asserts send → loading → renders `message` + per-action chips; **the 503-with-`ChatResponse`-body contract renders inline without special-casing** (03-RESEARCH.md:498, 287). Mock fetch returns 503 + valid body for the error case.

#### `frontend/tests/WatchlistPanel.test.tsx` (UI-06)

**Analog:** `backend/tests/watchlist/test_mutation.py` (409/204/404 tests). Asserts add POST 200 + 409-duplicate inline message; remove DELETE 204 → store pruned + 404 handled (03-RESEARCH.md:499).

#### `frontend/tests/TerminalApp.test.tsx` (UI-01)

**Analog:** `backend/tests/test_app.py` (app smoke test). Renders the shell (header/watchlist/chart/portfolio/chat panels present); asserts no `dangerouslySetInnerHTML` path (03-RESEARCH.md:494; T-03-04).

---

### `backend/app/main.py` (MODIFY — config)

**Analog:** itself. **Gated by assumption A1 — add only with `checkpoint:human-verify`** (03-RESEARCH.md:437, 447-451). The change is a **dev-only** `CORSMiddleware` so `next dev` (:3000) → FastAPI (:8000) works; production builds keep relative `/api` and stay same-origin (no CORS exercised). Mirror the existing middleware-free app construction (main.py:73-78):

```python
# DEV ONLY — gate behind A1 confirmation; inert in production (same-origin builds)
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # next dev only
    allow_methods=["*"],
    allow_headers=["*"],
)
```
**Fallback if rejected (03-RESEARCH.md:270, 449):** no backend change; dev loop serves built `frontend/out/` from FastAPI. Phase 3 does not require this change for the build/test gates — it only unlocks the fast `next dev` loop.

---

## Shared Patterns

### API Base Resolution (`NEXT_PUBLIC_API_BASE`)
**Source:** 03-RESEARCH.md:229-233 (Pattern 4) + Code Example 402-416
**Apply to:** `lib/api.ts`, `hooks/usePriceStream.ts`, and every component that fetches (TradeBar, ChatPanel, WatchlistPanel, Header, PnlChart, PositionsTable)
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';   // '' in prod builds → same origin
export const apiUrl = (p: string) => `${API_BASE}${p}`;
```

### Store Selector Isolation (20Hz re-render firewall)
**Source:** 03-RESEARCH.md:196-198, 247, 295-299 (Pattern 1 + Pitfall 6)
**Apply to:** every component under `page.tsx`
```typescript
const price = useStore(s => s.prices[ticker]?.price);       // per-row selector
const history = useStore(s => s.histories[ticker]);          // sparkline gets only its array
// never: const wholeStore = useStore()                       // re-renders the tree at 20Hz
```

### Client Validation Mirrors Backend (ASVS V5 — backend stays authoritative)
**Source:** `backend/app/portfolio/schemas.py:10-21` (`Field(gt=0)` + normalize_ticker), `backend/app/watchlist/schemas.py:12` (`TickerStr` ≤12), 03-RESEARCH.md:249, 527
**Apply to:** TradeBar (quantity > 0, ticker ≤ 12, uppercase), WatchlistPanel (ticker ≤ 12, uppercase), ChatPanel input (non-empty)
```typescript
const ticker = raw.trim().toUpperCase();
if (!/^[A-Z0-9.]{1,12}$/.test(ticker)) return 'Invalid ticker';   // UX-only gate
```

### Flash Animation by Key-Remount
**Source:** 03-RESEARCH.md:223-227 (Pattern 3) + 379-390; `direction` values from models.py:31-37
**Apply to:** TickerRow price cell, Header live value
```tsx
<span key={`${ticker}-${seq}`} className={flashClass(update.direction)}>{fmt(update.price)}</span>
```

### Chart Lifecycle (create in `useEffect`, remove in cleanup, resize listener)
**Source:** 03-RESEARCH.md:357-377 (official TradingView wrapper), Pitfall 2 (explicit height)
**Apply to:** `useLightweightChart.ts`, MainChart, Sparkline
```tsx
const chart = createChart(ref.current!, {...});
window.addEventListener('resize', onResize);
return () => { window.removeEventListener('resize', onResize); chart.remove(); };
```

### Error Handling (fetch → throw, per-call inline render; chat exempt)
**Source:** 03-RESEARCH.md:409-410 (`apiFetch` throw), 284-288 (Pitfall 4 — chat 503 exempt), backend router error-mapping convention (portfolio/router.py:54-59)
**Apply to:** api.ts + TradeBar/WatchlistPanel (400/404/409 → inline error), ChatPanel (503 → render body)
```typescript
if (!res.ok) throw new Error(`${path} -> ${res.status}`);   // apiFetch default
// ChatPanel only: read body on 200 AND 503; render error inline
```

### Defensive SSE Frame Parsing
**Source:** 03-RESEARCH.md:245, 348-350 (anti-pattern: bare `JSON.parse`), stream.py:84-86 (frame shape)
**Apply to:** usePriceStream.ts `onmessage`
```typescript
try { const data = JSON.parse(e.data) as Record<string, PriceUpdate>; store.applyPrices(data); }
catch { /* skip malformed frame — never crash the handler */ }
```

### Test Harness (mocked EventSource + mocked fetch)
**Source:** 03-RESEARCH.md:511, backend `_make_client`/`_make_db` helpers (test_trade.py:22-47)
**Apply to:** `tests/setup.ts` + all test files
```typescript
// setup.ts: EventSource mock capturing the instance + global fetch mock via vi.stubGlobal
// tests dispatch synthetic { data: JSON.stringify(frame) } messages / readyState changes
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `frontend/store/useStore.ts` | store | event-driven | No frontend state layer exists. Closest behavioral analog `backend/app/market/cache.py` (`PriceCache`) covers the store's *shape and role* (in-memory prices, version/update semantics) but not zustand API. Use RESEARCH store shape verbatim (03-RESEARCH.md:202-215) + Pattern 1. |
| `frontend/hooks/usePriceStream.ts` | hook | event-driven | No frontend hook exists. RESEARCH Code Example is verbatim (03-RESEARCH.md:338-355); backend `stream.py:54-90` documents the wire format it consumes. |
| `frontend/components/chat/ChatPanel.tsx` (503 rendering) | component | request-response | The 503-with-valid-body contract is unique (backend chat/router.py:33-34 is the source, not an analog). Use RESEARCH Pattern 5 + Code Example verbatim (03-RESEARCH.md:235-239, 287). |
| `frontend/components/chart/useLightweightChart.ts` + both chart components | hook/component | event-driven | No canvas/charting code exists. Official TradingView v5 React wrapper pattern is quoted verbatim in RESEARCH (03-RESEARCH.md:357-377) — copy from there, never from v4 snippets (`addAreaSeries` is gone). |
| `frontend/lib/format.ts` | utility | transform | No formatter module exists. `backend/app/chat/prompts.py` shape (pure formatters, no IO — 02-PATTERNS.md:173-188) is the structural analog; content per RESEARCH (03-RESEARCH.md:260: `Intl.NumberFormat`, no `toFixed` sprinkling). |

## Metadata

**Analog search scope:** `.planning/phases/03-frontend-trading-terminal/03-RESEARCH.md`, `.planning/PROJECT.md`, `.planning/phases/02-ai-chat-assistant/02-PATTERNS.md`, `backend/app/{main,market/{cache,models,stream},portfolio/{schemas,router,service},chat/{schemas,router},watchlist/{schemas,router,service}}`, `backend/tests/{conftest,portfolio/test_trade}`
**Files scanned:** 20 (5 planning/research artifacts, 12 backend source modules, 3 test files; glob-verified zero frontend files exist)
**Pattern extraction date:** 2026-08-26
