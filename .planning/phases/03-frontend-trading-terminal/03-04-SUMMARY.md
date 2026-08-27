---
phase: 03-frontend-trading-terminal
plan: 04
subsystem: ui
tags: [nextjs, react, typescript, recharts, treemap, linechart, portfolio, heatmap, pnl, sse, vitest]

# Dependency graph
requires:
  - phase: 03-frontend-trading-terminal
    provides: 03-01 store (portfolio slice, prices/applyPrices), lib/types Position/HistoryResponse, lib/api apiFetch, lib/format fmtCurrency/fmtPercent/pnlColor, vitest harness (fetch stub + RTL cleanup)
provides:
  - Heatmap treemap (market-value sized, pnl-colored cells) with 'No positions' empty state
  - PnlChart line chart over GET /api/portfolio/history with 30s poll + loading/empty states
  - PositionsTable (7 columns) with per-row live SSE price column and fallback
  - three component test files proving the UI-03 data contracts (10 tests)
affects: [03-06, 03-07, phase-04-docker]

# Actuals (#2632) — chars/4 over the realized diff (631 added lines across 6 files,
# ~57 chars/line avg → ≈ 36k chars). Plan estimate was 12000 tokens.
actuals:
  tokens: 9000
  tasks: 3
  commits: 7

# Tech tracking
tech-stack:
  added: [] # no new deps — recharts 3.10.1 (Treemap/LineChart) was pinned in 03-01
  patterns: [custom Treemap content renderer with alpha-scaled pnl rgba fills, per-row live price cell (prices[ticker] slice only), 30s poll effect with stale-guard + interval cleanup, jsdom ResizeObserver stub for ResponsiveContainer tests]

key-files:
  created: [frontend/components/portfolio/Heatmap.tsx, frontend/components/portfolio/PnlChart.tsx, frontend/components/portfolio/PositionsTable.tsx, frontend/tests/Heatmap.test.tsx, frontend/tests/PnlChart.test.tsx, frontend/tests/PositionsTable.test.tsx]
  modified: []

key-decisions:
  - "Heatmap `content` prop typed as recharts' exported TreemapContentType; HeatmapCell consumes Partial<TreemapNode> & {maxAbsPnl} because Recharts delivers nodeProps via React.cloneElement (typing discovered at the tsc gate)"
  - "PnlChart XAxis tickFormatter renders HH:MM in UTC — deterministic across machines/timezones while the backend emits ISO timestamps"
  - "jsdom has no layout engine, so every Recharts ResponsiveContainer test stubs ResizeObserver to fire a fixed 640x192 size synchronously on observe() — kept per-test-file (not shared setup.ts) to respect the plan's file list"
  - "PnlChart fetch errors keep the last data and let the next 30s poll retry — transient failures self-heal without an error UI (matches A5 cadence semantics)"

patterns-established:
  - "Custom Treemap content: <Treemap content={<HeatmapCell maxAbsPnl={n}/>}> — element form carries extra props through cloneElement; leaf nodes (depth 1) receive the mapped {name, size, pnl} fields"
  - "Per-row live price cell: LivePriceCell subscribes to s.prices[ticker]?.price only (Pitfall 6) with ?? position.current_price fallback — a 20Hz tick stream re-renders one cell, never the table"
  - "Polling hook pattern: useEffect { active-flag + load() + setInterval(load, 30_000) } with cleanup clearing interval and stale-guarding setState — the same shape future pollers (03-06) should use"
  - "Recharts-in-jsdom: stub ResizeObserver (synchronous fixed-size fire) + assert on data attributes / recharts CSS classes rather than pixel output"

requirements-completed: [UI-03]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "Heatmap — Recharts Treemap sized by market_value and colored by unrealized_pnl sign/intensity (emerald rgba alpha-scaled by |pnl|/maxAbsPnl, red for losses, #30363d zero); 'No positions' empty state for null/empty portfolio; spy content renderer proves the {name, size, pnl} data mapping"
    requirement: UI-03
    verification:
      - kind: unit
        ref: "frontend/tests/Heatmap.test.tsx#Test 1..3b"
        status: pass
    human_judgment: false
  - id: D2
    description: "PnlChart — Recharts LineChart over GET /api/portfolio/history snapshots (one line point per snapshot, HH:MM UTC XAxis ticks), re-polls every 30s under fake timers, clears the interval on unmount, 'Loading…'/'No history yet' states"
    requirement: UI-03
    verification:
      - kind: unit
        ref: "frontend/tests/PnlChart.test.tsx#Test 1..3"
        status: pass
    human_judgment: false
  - id: D3
    description: "PositionsTable — all seven columns per row, live SSE price superseding current_price per row with fallback for tickers without a frame, pnlColor classes on pnl/pnl% cells, 'No positions' empty state, per-row price slice subscription (no whole-store reads)"
    requirement: UI-03
    verification:
      - kind: unit
        ref: "frontend/tests/PositionsTable.test.tsx#Test 1..3"
        status: pass
    human_judgment: false

# Metrics
duration: 9min
completed: 2026-08-26
status: complete
---

# Phase 3 Plan 4: Portfolio Visualizations Summary

**Recharts portfolio visualizations — a pnl-colored market-value Treemap heatmap, a 30s-polled P&L line chart over `/api/portfolio/history`, and a positions table with a per-row live SSE price column, all proven by component tests (10 tests)**

## Performance

- **Duration:** 9 min
- **Started:** 2026-08-27T00:11:27Z
- **Completed:** 2026-08-27T00:19:35Z
- **Tasks:** 3 (all TDD: RED + GREEN)
- **Files modified:** 6 (3 components + 3 test files created)

## Accomplishments

- `Heatmap` — Recharts `Treemap` (`dataKey="size"` / `nameKey="name"` per 03-RESEARCH.md:395-399) with a custom `HeatmapCell` content renderer: rect fill is emerald `rgba(16,185,129,α)` alpha-scaled by `|pnl|/maxAbsPnl`, red `rgba(239,68,68,α)` for losses, `#30363d` for zero pnl; each cell labels ticker + `fmtCurrency(market_value)`; `'No positions'` empty state for null or empty portfolio (never crashes)
- `PnlChart` — `LineChart` over `apiFetch<HistoryResponse>('/api/portfolio/history')` with a 30,000ms re-poll matching the server snapshot cadence (A5; snapshots.py:46-48); `Line dataKey="total_value"` stroke `#209dd7`, `XAxis dataKey="recorded_at"` with an HH:MM (UTC) tickFormatter, `YAxis domain=['auto','auto']`, dark `CartesianGrid`; `'Loading…'` while the first fetch is in flight, `'No history yet'` for an empty array; fetch errors keep the last data (next poll retries); interval + stale-guard cleaned up on unmount
- `PositionsTable` — seven columns (`ticker | quantity | avg_cost | current_price | market_value | unrealized_pnl | unrealized_pnl_percent`); the current-price cell is a per-row `LivePriceCell` subscribing only to `s.prices[ticker]?.price` (Pitfall 6) with `?? position.current_price` fallback; pnl/pnl% cells use `pnlColor` + `fmtCurrency`/`fmtPercent`; `market_value` renders the server's authoritative value; `'No positions'` empty state; row key = ticker
- Test coverage of the UI-03 contracts: spy-content data mapping (leaf nodes at depth 1 carry `{name, size, pnl}`), exact rgba fill assertions for the pnl color scale, 30s re-poll under fake timers (30s advance refetches, 29s does not), live-price supersession per row, all seven column values, empty/loading states
- Full gates green: portfolio suite 10/10, full suite 32/32, `npx tsc --noEmit` exit 0, `npm run lint` exit 0, `npm run build` exit 0

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1: Heatmap treemap — sized by market_value, colored by P&L** — RED `dbc5f9c` (test), GREEN `a4478b1` (feat)
2. **Task 2: P&L line chart over /api/portfolio/history with 30s polling** — RED `e6179ce` (test), GREEN `466529b` (feat)
3. **Task 3: Positions table with live SSE price column** — RED `30fefea` (test), GREEN `73feb2f` (feat)

**Follow-up fix:** `7a3892a` (fix) — content prop typing aligned with recharts `TreemapContentType` for the tsc gate.

_No refactor commits needed — implementations were minimal on first pass (same as 03-01/03-02)._

## Files Created/Modified

- `frontend/components/portfolio/Heatmap.tsx` - Recharts Treemap heatmap: market_value size, pnl sign/intensity fills, custom HeatmapCell content, empty state (created)
- `frontend/components/portfolio/PnlChart.tsx` - Recharts LineChart over /api/portfolio/history with 30s poll, HH:MM UTC XAxis, loading/empty states (created)
- `frontend/components/portfolio/PositionsTable.tsx` - 7-column positions table with per-row live SSE price cell + fallback, pnlColor rows, empty state (created)
- `frontend/tests/Heatmap.test.tsx` - data mapping via spy content, rgba fill scale, empty states (created)
- `frontend/tests/PnlChart.test.tsx` - mount fetch + one-point-per-snapshot, 30s re-poll under fake timers, loading/empty states (created)
- `frontend/tests/PositionsTable.test.tsx` - seven columns, live price supersession + fallback, pnl colors, empty state (created)

## Decisions Made

- `Heatmap` accepts an optional `content` prop (default `HeatmapCell`) typed as recharts' exported `TreemapContentType` — the plan's test guidance explicitly calls for injecting a spy content renderer to assert the data mapping; the element form `content={<HeatmapCell maxAbsPnl={n}/>}` is how Recharts' cloneElement delivers extra props to cells
- PnlChart XAxis tickFormatter renders HH:MM in UTC — deterministic test assertions regardless of the machine timezone (backend timestamps are ISO with Z)
- Every Recharts test stubs `ResizeObserver` with a synchronous fixed-size fire — ResponsiveContainer renders its chart only once width/height are positive (recharts 3.10.1 ResponsiveContainer.js:25-47, Treemap.js:783-787), and jsdom has no layout engine; kept per-test-file to stay inside the plan's file list
- PnlChart errors are swallowed (keep last data) rather than rendering an error state — the 30s poll self-heals; matches the plan's A5 cadence semantics

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tsc gate rejected the Heatmap `content` prop union against recharts' TreemapContentType**
- **Found during:** Post-task gate (`npx tsc --noEmit` after Task 1)
- **Issue:** The plan's component sketch (`content={(props) => <HeatmapCell {...props} />}`) implies a generic function content prop, but recharts 3.10.1 types `content?: TreemapContentType = ReactNode | ((props: TreemapNode) => ReactElement)`. My initial `ReactElement | ((props: HeatmapNodeProps) => ReactNode)` failed TS2322 on the function branch (return ReactNode vs ReactElement; children `ReadonlyArray<TreemapNode> | null` vs `HeatmapNodeProps[] | undefined`), and `vi.fn(() => null)` made `mock.calls` type `[][]` (TS2493 on `c[0]`).
- **Fix:** Typed the component's `content` prop as recharts' exported `TreemapContentType`; `HeatmapCell` takes `Partial<TreemapNode> & { maxAbsPnl?: number }` (cells arrive via cloneElement so all node fields are optional at JSX creation); the test spy is typed `(props: TreemapNode) => <g/>` so `mock.calls` carries `TreemapNode[]`. Dropped unused `observe(_target)` params in both chart test files for lint.
- **Files modified:** frontend/components/portfolio/Heatmap.tsx, frontend/tests/Heatmap.test.tsx, frontend/tests/PnlChart.test.tsx
- **Verification:** `npx tsc --noEmit` exit 0; `npm run lint` exit 0; 32/32 tests green
- **Committed in:** `7a3892a` (follow-up fix)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The fix is a type-level alignment with the installed recharts 3.10.1 API surface — no behavior change (all four Heatmap tests still pass with identical runtime semantics). No scope creep.

## Issues Encountered

- The plan's `<verify>` commands use `npx vitest run ... -q`; vitest 4.1.11 dropped the `-q` flag (documented in 03-01-SUMMARY) — runs used plain `npx vitest run tests/<file>` with the same targeted intent.
- Recharts 3.10.1 renders charts only inside a ResponsiveContainer with positive dimensions; jsdom provides none — the synchronous ResizeObserver stub (640x192) in each chart test file is the enabling pattern for all future chart tests (03-06 shell wiring will reuse it).

## User Setup Required

None - no external service configuration required. The components consume REST/SSE surfaces already available from the Phase 1/2 backend (`GET /api/portfolio`, `GET /api/portfolio/history`, `GET /api/stream/prices`).

## Next Phase Readiness

- **03-06 (shell wiring):** the three components are standalone leafs — drop `<Heatmap />`, `<PnlChart />`, `<PositionsTable />` into the existing `portfolio-slot` testid; the 30s poll + per-row price selectors are store-driven, so no shell changes are needed for them to be live; the ResizeObserver stub pattern carries over to any shell-level chart assertions
- **03-07 (final shell/CORS):** no component-level coupling to layout; the h-48 chart containers and empty-state heights are self-contained
- **Phase 4 (Docker):** the components fetch same-origin `/api/*` in production builds (relative URLs) — no CORS impact

No blockers. Realized ≈ 9000 tokens vs the 12000 estimate — the plan's RESEARCH-verbatim patterns (Treemap snippet, PnlChart analog, live-price column) minimized authored surface.

---
*Phase: 03-frontend-trading-terminal*
*Completed: 2026-08-26*

## Self-Check: PASSED

- All 6 key files found on disk (3 components under frontend/components/portfolio/, 3 test files under frontend/tests/)
- All 7 commits present: `dbc5f9c`, `a4478b1`, `e6179ce`, `466529b`, `30fefea`, `73feb2f`, `7a3892a`
- Full gates green: `npx vitest run` (32/32), `npx tsc --noEmit` (0), `npm run lint` (0), `npm run build` (out/, exit 0)
