---
phase: 03-frontend-trading-terminal
plan: 06
subsystem: ui
tags: [nextjs, react, typescript, tailwind, zustand, vitest, rtl, lightweight-charts, recharts, eventsource, apiFetch, watchlist, sse]

# Dependency graph
requires:
  - phase: 03-frontend-trading-terminal
    provides: 03-01 store (pruneTicker/refetchPortfolio/refetchWatchlist, apiUrl/apiFetch, verbatim contract types), 03-02 Header/TickerRow/usePriceStream/shell, 03-03 MainChart/Sparkline, 03-04 Heatmap/PnlChart/PositionsTable, 03-05 TradeBar/ChatPanel/WatchlistPanel add/remove semantics
provides:
  - page.tsx final composition root — all eight components wired into the dark terminal grid (Header / WatchlistPanel with real TickerRow rows / MainChart / Heatmap / PnlChart / PositionsTable / TradeBar / ChatPanel)
  - TickerRow remove button wired (UI-06 single delivery point): raw fetch DELETE /api/watchlist/{ticker} → 204 prune+refetch, 404 tolerated prune+refetch
  - Full-terminal integration smoke test (8 assertions incl. SSE → live total, trade click-through, remove click-through on 204 and 404, composed-page XSS guard)
  - Phase gate results: full vitest suite 58/58, static export build, tsc, lint
affects: [03-07, phase-04-docker, gsd-verify-work]

# Actuals (#2632) — chars/4 over the realized diff (5 files, ~24k chars).
actuals:
  tokens: 6200
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: [] # no new deps — consumed the 03-01 zustand/vitest/RTL stack + 03-03 lightweight-charts + 03-04 recharts
  patterns: [composition root mirrors backend main.py include_router wiring, slot wrappers retained as stable integration anchors across slot→component swaps, URL-routed fetch mock for full-page tests (portfolio/watchlist/history/trade/DELETE), raw fetch with res.status check before body read for 204-empty-body DELETEs]

key-files:
  created: []
  modified: [frontend/app/page.tsx, frontend/components/watchlist/WatchlistPanel.tsx, frontend/components/watchlist/TickerRow.tsx, frontend/tests/TerminalApp.test.tsx, frontend/tests/WatchlistPanel.test.tsx]

key-decisions:
  - "Remove wiring lives in TickerRow (not the panel): WatchlistPanel renders the real TickerRow per watchlist entry (03-05 row-shell swap), and each row owns its DELETE — raw fetch, res.status checked BEFORE any body read (204 empty body would reject apiFetch's res.json, 03-PATTERNS.md:143); 204 and 404 both prune locally (pruneTicker) + refetchWatchlist"
  - "TickerRow stopPropagation on the remove button so the row's click-to-select handler never fires from a remove click"
  - "The five data-testid slot wrappers are retained as stable integration anchors (03-02 decision) — each wraps a real component now; no stub slots remain"
  - "Full-page tests stub ResizeObserver (fixed 640x192 synchronous fire) so recharts ResponsiveContainer renders in jsdom, and route fetches by URL — /api/portfolio/history must NOT receive the portfolio object (PnlChart expects snapshots)"

patterns-established:
  - "Composition root: page.tsx mirrors backend/app/main.py's include_router wiring — one import + one mount per component, zero store reads at page level (Pitfall 6 firewall)"
  - "URL-routed fetch mock: a per-file routeFetch dispatches /api/portfolio/trade POST, /api/portfolio/history GET, /api/portfolio GET, watchlist GET/DELETE — the refetch side effects stay observable and PnlChart gets its own history shape"
  - "jsdom recharts: ResizeObserver stubbed per test file that mounts a full terminal (same pattern as Heatmap/PnlChart unit tests)"
  - "204 handling in composed tree: raw fetch + res.status check before parsing, carried from 03-05 into the final TickerRow delivery point"

requirements-completed: [UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "page.tsx composes all eight components (Header, WatchlistPanel with real TickerRow rows, MainChart, Heatmap, PnlChart, PositionsTable, TradeBar, ChatPanel) into the dark terminal grid; per-slice selector subscriptions only; TickerRow remove button wired to raw DELETE /api/watchlist/{ticker} with 204/404 prune+refetch (UI-06 remove path)"
    requirement: UI-06
    verification:
      - kind: integration
        ref: "frontend/tests/TerminalApp.test.tsx#Test 4 (all panels present), Test 6 (remove 204), Test 7 (remove 404)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Integration smoke test under mocked fetch + EventSource: header cash + green connection dot, one SSE frame re-renders the header live total, ticker click -> chart re-seed, trade click-through POST -> portfolio reflected, remove click-through on 204 and 404, composed-page XSS guard"
    requirement: UI-01
    verification:
      - kind: integration
        ref: "frontend/tests/TerminalApp.test.tsx#Tests 1-8 (8 tests pass)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Phase gates green before manual verification: full vitest suite (58/58 across 11 files), npm run build static export compiles out/index.html, npx tsc --noEmit clean, npm run lint clean — every UI-XX requirement now has an automated test path"
    verification:
      - kind: other
        ref: "npx vitest run && npm run build && npx tsc --noEmit && npm run lint (all exit 0)"
        status: pass
    human_judgment: false

# Metrics
duration: 6min
completed: 2026-08-26
status: complete
---

# Phase 3 Plan 6: Terminal Integration Summary

**The complete Bloomberg-style terminal on one page — all eight components composed into the dark grid, the UI-06 remove path delivered through TickerRow's raw-fetch DELETE (204/404 prune + refetch), proven by a full-terminal integration smoke test, with the phase gates green (58 tests, static export build, tsc, lint)**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-26T18:01:30Z
- **Completed:** 2026-08-26T18:07:45Z
- **Tasks:** 2
- **Files modified:** 5 (3 components + 2 test files)

## Accomplishments

- `page.tsx` is now the final composition root: `Header` (top bar, full width), `WatchlistPanel` (left column — add form + real `TickerRow` rows), `MainChart` (center, h-96), the portfolio section (`Heatmap` + `PnlChart` side-by-side in a sub-grid, `PositionsTable` below), `TradeBar` (center bottom), `ChatPanel` (right column, fixed 20rem width with its own scroll). The page body reads **zero** store slices — every component keeps its per-slice selector subscription (20Hz re-render firewall, Pitfall 6). `usePriceStream` mounts once; the mount-time `refetchPortfolio()` + `refetchWatchlist()` effect is preserved.
- The **UI-06 remove path's single delivery point** is wired in `TickerRow`: its remove button (created unwired in 03-02) now triggers a **raw fetch** `DELETE /api/watchlist/{ticker}` with `res.status` checked BEFORE any body read (the backend's 204 empty body would reject `apiFetch`'s unconditional `res.json()` — 03-PATTERNS.md:143). On **204** → `pruneTicker(ticker)` (prices + histories + tickSeq, Pitfall 5) + `refetchWatchlist()`; on **404** (ticker not on the watchlist) → tolerated, same prune + refetch. The button stops propagation so remove never triggers the row's click-to-select.
- `WatchlistPanel` swaps its 03-05 self-contained row shell for the real `TickerRow` composition (the documented same-wave swap): per-entry `<TickerRow ticker={w.ticker} fallbackPrice={w.price} />`. The add flow (POST 200/409, inline 'already on watchlist', UX-only client validation) is unchanged.
- **Integration smoke test** (`TerminalApp.test.tsx`, 8 tests) renders the full page under mocked fetch + the capture-instance EventSource mock: connection dot open/error → green/yellow/red; header cash `$10,000.00` + live total `$12,500.00` from the refetched portfolio; one SSE frame (AAPL 160) re-renders the live total to `$12,600.00` (cash + Σ qty × live price — selector isolation); all panels present (watchlist rows with sparklines, main chart container, heatmap cells, P&L curve, positions table, trade bar, chat panel); ticker click → `selectedTicker` set (chart re-seed) + trade click-through (POST `{ticker, quantity, side}` → header cash reflects the returned portfolio); **remove click-through on 204** (DELETE fired, ticker pruned + row disappears) and **on 404** (still pruned + refetched); composed-page XSS guard (T-03-01 — a forged tag-shaped string renders as text, zero parsed elements).
- **Phase gates green and recorded:** `npx vitest run` — 58/58 tests across 11 files; `npm run build` — static export compiles (`out/index.html`); `npx tsc --noEmit` — clean; `npm run lint` — clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Compose the terminal grid in page.tsx (incl. remove wiring)** - `923b3fc` (feat)
2. **Task 2: Integration smoke test + phase gates** - `6b64c4f` (test)

**Plan metadata:** committed after this SUMMARY (docs: complete plan)

## Files Created/Modified

- `frontend/app/page.tsx` - final composition root: all eight components in the dark terminal grid; zero whole-store reads; `usePriceStream` mounted once + mount-time refetch effect (modified)
- `frontend/components/watchlist/TickerRow.tsx` - remove button wired (UI-06): raw fetch DELETE → 204/404 prune + refetch, stopPropagation, disabled-while-removing, optional `fallbackPrice` prop (modified)
- `frontend/components/watchlist/WatchlistPanel.tsx` - renders the real TickerRow per watchlist entry (row-shell swap); add flow unchanged (modified)
- `frontend/tests/TerminalApp.test.tsx` - 8 integration tests: full terminal render, SSE → live total, interactions (select/trade/remove 204/404), XSS guard (modified)
- `frontend/tests/WatchlistPanel.test.tsx` - remove tests replaced by the real-TickerRow composition check; add (200/409) + pre-validation retained (modified)

## Decisions Made

- **Remove wiring lives in TickerRow, not the panel** — the plan names TickerRow as the single delivery point; WatchlistPanel renders the composition and each row owns its DELETE. A 404 is silently tolerated (prune + refetch) rather than surfaced as an inline error, per the plan's "tolerated: prune locally and refetch".
- **stopPropagation on the remove click** — the row's `onClick` selects the ticker; without it a remove click would also re-select the row being deleted.
- **Slot wrappers retained** — the five `data-testid` slots from 03-02 are kept as stable integration anchors; each now wraps a real component (header-slot wraps Header, main-chart-slot wraps MainChart, etc.). No stub slots remain — this satisfies the plan's "no unused-slot leftovers" criterion.
- **`fallbackPrice` prop added to TickerRow** — preserves the 03-05 row shell's behavior of showing the server's watchlist price before the first SSE frame arrives; undefined shows `--` (existing TickerRow tests unaffected).
- **URL-routed fetch mock + ResizeObserver stub for the full-page test** — `/api/portfolio/history` must return a `HistoryResponse` (PnlChart), never the portfolio object; recharts ResponsiveContainer needs a positive measured size in jsdom (same stub as the Heatmap/PnlChart unit tests).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] WatchlistPanel remove tests targeted the swapped-out row shell**
- **Found during:** Task 1 (first full-suite run — 2 remove tests failed)
- **Issue:** WatchlistPanel.test.tsx Tests 3/4 drove the 03-05 self-contained `Row` shell's remove handler; Task 1 replaced that shell with the real TickerRow composition, so the DELETE now lives in TickerRow with 404-tolerance (no inline 404 error). The old assertions (inline 'Ticker not on watchlist' + unchanged state) no longer matched the intended 03-06 behavior.
- **Fix:** Replaced the two remove tests with a real-TickerRow composition check (ticker text, sparkline testid, remove button per entry) in WatchlistPanel.test.tsx; the remove click-through on BOTH 204 and 404 is now asserted at the composed-page level in TerminalApp.test.tsx (Tests 6/7) — strictly stronger coverage.
- **Files modified:** frontend/tests/WatchlistPanel.test.tsx
- **Verification:** `npx vitest run` 58/58; the 404 prune+refetch behavior is explicitly pinned by TerminalApp Test 7
- **Committed in:** `6b64c4f` (Task 2 commit)

**2. [Rule 1 - Bug] 404 integration test consumed PnlChart's mount fetch**
- **Found during:** Task 2 (Test 7 first run)
- **Issue:** `mockImplementationOnce` (the 404 response) was registered before render, so PnlChart's mount `GET /api/portfolio/history` consumed it — the fallback `{ok:200, body:{}}` had no `snapshots` array and PnlChart crashed (`Cannot read properties of undefined (reading 'length')`).
- **Fix:** Test 7's one-shot mock now routes every non-DELETE call through the default URL-routed implementation (`getMockImplementation()`), overriding only `DELETE /api/watchlist/AAPL` with the 404.
- **Files modified:** frontend/tests/TerminalApp.test.tsx
- **Verification:** Test 7 passes — DELETE 404 → prune + refetch → row disappears
- **Committed in:** `6b64c4f` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes were required to land the plan's own intended behavior (404-tolerant remove at the TickerRow delivery point) in the test suite; no scope creep, no behavioral change to the shipped components.

## Issues Encountered

- The pre-Task-2 `TerminalApp.test.tsx` fetch mock matched `/api/portfolio` broadly, so the composed PnlChart received a portfolio object for its `/api/portfolio/history` call and crashed — fixed by the URL-routed mock (routing order: trade POST → history → portfolio → watchlist DELETE → watchlist GET).
- The initial full-suite run reported 6 failures (5 from the composed-page crash, 1 from the row-shell swap) — all resolved by the two deviations above; the final run is 58/58.

## User Setup Required

None - no external service configuration required. Dev-only `frontend/.env.local` (`NEXT_PUBLIC_API_BASE=http://localhost:8000`) from 03-01 remains; production builds leave it unset → same-origin `/api/*`. Live chat still requires `OPENROUTER_API_KEY` + `LLM_MOCK` unset (backend user_setup, 02-USER-SETUP.md) — the panel is fully tested against the mock path.

## Next Phase Readiness

- **03-07 (CORS/shell polish + manual browser verification):** the integrated terminal is proven end-to-end by tests; the manual browser check now verifies the composed page against the live backend (dev-only CORS decision A1 gates `next dev` against :8000 — 03-RESEARCH.md). Everything 03-06 built is ready for that browser pass.
- **/gsd-verify-work:** every UI-XX requirement now has an automated test path — the 03-VALIDATION.md per-task map rows for plans 01-06 are all green (this plan closes the remaining UI-01/UI-06 composed-page entries). No plan-level MISSING verification entries remain.
- No blockers. Realized ≈ 6200 tokens vs the 10000 estimate (low confidence) — the composition consumed the existing component/store surface directly.

---
*Phase: 03-frontend-trading-terminal*
*Completed: 2026-08-26*

## Self-Check: PASSED

- All 5 modified files found on disk (page.tsx, TickerRow.tsx, WatchlistPanel.tsx, TerminalApp.test.tsx, WatchlistPanel.test.tsx) plus the SUMMARY itself
- Both production commits present: `923b3fc` (Task 1 feat), `6b64c4f` (Task 2 test)
- Full gates green on the committed state: `npx vitest run` (58/58), `npm run build` (out/index.html emitted), `npx tsc --noEmit` (exit 0), `npm run lint` (exit 0)
- Acceptance criteria: page.tsx imports all 8 components, no whole-store reads in page.tsx, no data-testid slot stubs (all five slots wrap real components), out/index.html emitted, integration test asserts all four plan behaviors + XSS guard
