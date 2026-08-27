---
phase: 03-frontend-trading-terminal
plan: 02
subsystem: ui
tags: [nextjs, react, typescript, tailwind, zustand, vitest, eventsource, sse, realtime]

# Dependency graph
requires:
  - phase: 03-frontend-trading-terminal
    provides: 03-01 store (applyPrices/setConnection/selectLiveTotal), lib/api apiUrl, lib/types PriceUpdate, vitest harness (MockEventSource.instances + __emit, fetch stub)
provides:
  - usePriceStream hook (useEffect-only EventSource, defensive {TICKER: PriceUpdate} frame parse -> store, es.close() cleanup)
  - TickerRow component (per-row selectors, key-remount flash, change%, click-to-select, sparkline slot)
  - Header component (connection dot green/yellow/red, live total via selectLiveTotal, cash)
  - terminal shell page.tsx (five data-testid slots, mount-time portfolio + watchlist refetch)
  - three test files proving the realtime path with backend-shaped frames (10 tests)
affects: [03-03, 03-04, 03-05, 03-06, 03-07, phase-04-docker]

# Actuals (#2632) — chars/4 over the realized diff (515 added / 64 deleted lines
# across 8 files, est. ~55 chars/line). Plan estimate was 20000 tokens.
actuals:
  tokens: 8000
  tasks: 2
  commits: 5

# Tech tracking
tech-stack:
  added: [] # no new deps — consumed the 03-01 zustand/vitest/RTL stack
  patterns: [SSE consumer hook via useEffect-only EventSource + getState() (never the hook), per-row zustand selectors as the 20Hz re-render firewall, flash-by-key-remount (tickSeq key + direction flash class), derived selectLiveTotal subscription, afterEach(cleanup) test isolation in setup.ts]

key-files:
  created: [frontend/hooks/usePriceStream.ts, frontend/components/watchlist/TickerRow.tsx, frontend/components/header/Header.tsx, frontend/tests/usePriceStream.test.ts, frontend/tests/TickerRow.test.tsx, frontend/tests/TerminalApp.test.tsx]
  modified: [frontend/app/page.tsx, frontend/tests/setup.ts]

key-decisions:
  - "Tracer gate run autonomously: the plan is the phase tracer but carries no checkpoint tasks and the orchestrator directed full-plan execution; the tracer <verify> was re-run end-to-end (10 targeted tests + build) after Task 1 and before Task 2 — passed, so expansion proceeded"
  - "XSS guard asserted element-level (zero img/script elements, zero [onerror] attributes) instead of innerHTML substring checks — React serializes attribute VALUES raw in innerHTML but browsers never parse attribute values as markup, so element-level queries are the true security property"
  - "RTL cleanup registered centrally in tests/setup.ts (afterEach(cleanup)) — vitest globals are off, so RTL's auto-cleanup never fired; without it, mounted components from earlier tests stay subscribed to the shared store and re-render on later tests' setState (duplicate-match bleed)"
  - "header-slot wrapper div retained in page.tsx so the shell keeps its five data-testid slots across the Task 1 placeholder -> Task 2 <Header /> swap (stable TerminalApp assertions)"

patterns-established:
  - "Hook hard rule: EventSource constructed in useEffect only, es.close() in cleanup, onerror does NOT close (browser auto-reconnect with retry: 1000 honored), useStore.getState() — the hook never subscribes"
  - "Per-row selector isolation: TickerRow reads prices[ticker]/tickSeq[ticker]/selectedTicker; Header reads connection/portfolio/selectLiveTotal — no whole-store reads anywhere in the shell (Pitfall 6)"
  - "Flash restart: <span key={`${ticker}-${seq}`}> remounts on tickSeq change (direction-change frames), restarting the CSS animation — test-pinned via DOM node identity"
  - "Test-time DOM isolation: afterEach(cleanup) in tests/setup.ts is mandatory for any file that renders components (vitest has no globals)"

requirements-completed: [UI-01, UI-02, UI-07]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "usePriceStream SSE consumer — EventSource at apiUrl() path, backend-shaped {TICKER: PriceUpdate} frames -> store.prices/histories, malformed frames skipped without state change, open/error -> connected/reconnecting, unmount closes the EventSource exactly once"
    requirement: UI-02
    verification:
      - kind: unit
        ref: "frontend/tests/usePriceStream.test.ts#Test 1..3"
        status: pass
    human_judgment: false
  - id: D2
    description: "TickerRow — formatted price with direction flash class (flash-up/flash-down/flat), key-remount on tickSeq change (flash restart), change% via fmtPercent + pnlColor, click-to-select, sparkline + remove slots"
    requirement: UI-02
    verification:
      - kind: unit
        ref: "frontend/tests/TickerRow.test.tsx#Test 4..5"
        status: pass
    human_judgment: false
  - id: D3
    description: "Terminal shell page.tsx — header slot + watchlist rows + five data-testid slots (header/main-chart/portfolio/trade-bar/chat), mount-time portfolio + watchlist refetch, static export build with 'use client' preserved"
    requirement: UI-01
    verification:
      - kind: unit
        ref: "frontend/tests/TerminalApp.test.tsx#five slots + watchlist rows"
        status: pass
      - kind: other
        ref: "npm run build (out/ index.html, no Node server)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Header — connection dot green/yellow/red per readyState with connection aria-label, live total via selectLiveTotal (cash + Σ(qty × live price) with SSE-price supersession), cash balance; SSE frames re-render the total without touching other panels"
    requirement: UI-07
    verification:
      - kind: unit
        ref: "frontend/tests/TerminalApp.test.tsx#Test 1..3"
        status: pass
    human_judgment: false
  - id: D5
    description: "XSS guard — a forged HTML-shaped store string renders as an escaped text node; zero img/script elements and zero [onerror] attributes materialize (T-03-04 text-only rendering policy)"
    verification:
      - kind: unit
        ref: "frontend/tests/TerminalApp.test.tsx#XSS guard"
        status: pass
    human_judgment: false

# Metrics
duration: 16min
completed: 2026-08-26
status: complete
---

# Phase 3 Plan 2: Realtime Tracer Slice Summary

**SSE consumer hook → zustand store → flashing TickerRow → terminal shell page with Header connection dot and live total — the phase tracer proving the 20Hz realtime path end-to-end with backend-shaped frames**

## Performance

- **Duration:** 16 min
- **Started:** 2026-08-26T16:47:54Z
- **Completed:** 2026-08-26T17:03:45Z
- **Tasks:** 2 (both TDD: RED + GREEN)
- **Files modified:** 8 (6 created + 2 modified)

## Accomplishments

- `usePriceStream` hook — EventSource constructed in `useEffect` only (StrictMode double-open guard), `onopen`/`onerror` → `setConnection('connected'/'reconnecting')` (error does NOT close — browser auto-reconnect with `retry: 1000` honored), `onmessage` parses `{TICKER: PriceUpdate}` frames in try/catch and merges via `applyPrices` (malformed frames skipped silently, T-03-02), `es.close()` on unmount; uses `useStore.getState()` — the hook never subscribes
- `TickerRow` — per-row selectors only (`prices[ticker]`, `tickSeq[ticker]`, `selectedTicker`); price in `<span key={ticker}-{seq}>` with `flash-up`/`flash-down`/'' per direction (key-remount restarts the CSS animation); change% via `fmtPercent` + `pnlColor`; row click → `selectTicker`; `Remove ${ticker}` button (wired in 03-05) and `sparkline-${ticker}` slot (filled in 03-03)
- `Header` — connection dot `bg-emerald-500`/`bg-yellow-500`/`bg-red-500` with `aria-label={`connection: ${connection}`}` + title tooltip; live total via the `selectLiveTotal` derived selector (cash + Σ(qty × live price) with SSE-price supersession); cash via `fmtCurrency`; subscribes only to its slices
- `page.tsx` terminal shell — `'use client'`; mounts `usePriceStream()` once + a mount-effect refetching portfolio + watchlist; 3-column grid (watchlist | chart/portfolio/trade-bar | chat) with five data-testid slots, dark theme tokens (`bg-background`/`bg-panel`/`border-border`); static export builds to `out/`
- Tests: 10 new (3 hook + 2 TickerRow + 5 shell integration) driven by the capture-instance EventSource mock with real backend-shaped frames (float-second timestamps, `{TICKER: ...}` envelopes); full suite 22/22, build, tsc, lint all green

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1 (TRACER): SSE → store → TickerRow flash → shell** — RED `e474c9e` (test), GREEN `312238c` (feat)
2. **Task 2: Header (connection dot + live total + cash)** — RED `bc81825` (test), GREEN `790c7ad` (feat)

**Follow-up fix:** `287c88a` (fix) — test frame factory `overrides` made optional for the tsc gate.

**Plan metadata:** `70f824b` (docs: complete realtime tracer plan)

_Note: both tasks followed the RED→GREEN cycle; no refactor commits needed (implementations were minimal on first pass). The tracer feedback gate re-ran Task 1's `<verify>` end-to-end (10 targeted tests + build) before Task 2 — passed._

## Files Created/Modified

- `frontend/hooks/usePriceStream.ts` - SSE consumer hook (created)
- `frontend/components/watchlist/TickerRow.tsx` - flashing watchlist row (created)
- `frontend/components/header/Header.tsx` - connection dot + live total + cash (created)
- `frontend/app/page.tsx` - terminal shell grid, five slots, mount refetch (modified — replaced scaffold)
- `frontend/tests/usePriceStream.test.ts` - hook behaviors 1-3 (created)
- `frontend/tests/TickerRow.test.tsx` - flash class / key-remount / click-select (created)
- `frontend/tests/TerminalApp.test.tsx` - shell integration + XSS guard (created)
- `frontend/tests/setup.ts` - added `afterEach(cleanup)` (modified)

## Decisions Made

- Ran the tracer feedback gate autonomously (orchestrator-directed full-plan execution; no checkpoint tasks in the plan): Task 1's `<verify>` re-ran end-to-end and passed before Task 2 — the architectural dead-end detector cleared
- XSS guard asserted element-level (no `img`/`script` elements, no `[onerror]` attributes) rather than innerHTML substrings — React serializes attribute values raw in `innerHTML`, but browsers never parse attribute values as markup; the element-level query is the true security property
- `afterEach(cleanup)` added centrally to `tests/setup.ts` — vitest runs without `globals`, so RTL's auto-cleanup never registered; leaked mounted components caused cross-test DOM bleed through the shared store
- Kept the `data-testid="header-slot"` wrapper in page.tsx across the Task 1 placeholder → Task 2 `<Header />` swap, preserving the shell's five-slot structure for stable assertions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] RTL auto-cleanup never registered in the vitest harness**
- **Found during:** Task 1 GREEN (TickerRow Test 5 failed with "Found multiple elements with the text: $150.25")
- **Issue:** `vitest.config.ts` doesn't enable `globals`, so @testing-library/react's auto-cleanup never registered; a component mounted in Test 4 stayed subscribed to the shared zustand store, and Test 5's `setState` re-rendered it into a duplicate DOM match. The 03-01 harness never rendered components, so the gap was invisible.
- **Fix:** `afterEach(() => cleanup())` in `tests/setup.ts` — every test file (current and future) now gets DOM isolation.
- **Files modified:** frontend/tests/setup.ts
- **Verification:** TickerRow 2/2 pass; full suite 22/22
- **Committed in:** `312238c` (Task 1 GREEN)

**2. [Rule 1 - Bug] XSS-guard assertion defeated by React's raw attribute-value serialization**
- **Found during:** Task 2 GREEN (XSS guard test failed on `innerHTML` not containing `<img`)
- **Issue:** The plan's assertion mechanism (`container.innerHTML` lacks `<script`/`onerror=`) is mechanically unverifiable: React escapes TEXT nodes (`&lt;img...&gt;`) but serializes attribute VALUES raw (`data-ticker="<img src=x onerror=alert(1)>"`). Attribute values are set via `setAttribute` and never parsed as markup, so no element materializes — the string is inert.
- **Fix:** Asserted the real security property element-level: zero `img`/`script` elements and zero `[onerror]` attributes, plus the string present as a (React-escaped) text node via `getByText`. Test-only change; component code was already safe.
- **Files modified:** frontend/tests/TerminalApp.test.tsx
- **Verification:** TerminalApp 5/5 pass
- **Committed in:** `790c7ad` (Task 2 GREEN)

**3. [Rule 3 - Blocking] tsc gate rejected the test frame factory**
- **Found during:** Task 1 GREEN (next build's type-check failed: `TS2554: Expected 1 arguments, but got 0`)
- **Issue:** `frame()` was called with no arguments in two tests but declared `overrides: Partial<PriceUpdate>` (required param). Vitest ran fine (JS ignores arity); `next build`'s tsc pass did not.
- **Fix:** `overrides: Partial<PriceUpdate> = {}` — the factory is default-shaped by intent.
- **Files modified:** frontend/tests/usePriceStream.test.ts
- **Verification:** `npm run build` passes; tsc clean
- **Committed in:** `287c88a` (follow-up fix commit)

---

**Total deviations:** 3 auto-fixed (1 missing critical, 1 bug, 1 blocking)
**Impact on plan:** All fixes were necessary for the tests to be truthful and the build gate to pass. The cleanup fix is a 6-line harness change that protects every future component test file. No scope creep.

## TDD Gate Compliance

- **RED gates:** `e474c9e` (test: failing SSE-hook + TickerRow tests), `bc81825` (test: failing shell integration tests) — both committed before their implementations
- **GREEN gates:** `312238c` (feat), `790c7ad` (feat) — both follow their RED commits and pass the targeted suites
- RED tests failed for the right reason (missing modules → missing behaviors): the usePriceStream/TickerRow suite failed on unresolved imports; the TerminalApp suite failed on unimplemented header behaviors (cash/dot/live total) — 4 of 5 red, 5 of 5 green
- REFACTOR commits: none — implementations were minimal on first pass
- **Status: PASS** — no violations

## Issues Encountered

- The plan's `<verify>` commands use `npx vitest run ... -q`; vitest 4.1.11 dropped the `-q` flag (documented in 03-01-SUMMARY) — runs used plain `npx vitest run tests/<file>` with the same targeted intent.
- The XSS-guard assertion mechanism in the plan was mechanically flawed (see deviation 2) — corrected to the actual security property without weakening it.

## User Setup Required

None - no external service configuration required. The dev-only `frontend/.env.local` (`NEXT_PUBLIC_API_BASE=http://localhost:8000`) from 03-01 remains; production builds leave it unset → same-origin `/api/*`.

## Next Phase Readiness

- **03-03 (charts):** `histories` (capped 100) + `tickSeq` power sparklines/main chart; the `sparkline-${ticker}` slots in TickerRow are ready to receive the lightweight-charts Sparkline; the hoisted chart mock is in place
- **03-04 (portfolio viz):** `portfolio` slice + `selectLiveTotal` (live column semantics) feed the heatmap/P&L/positions; the portfolio-slot testid awaits them
- **03-05 (trade/watchlist UI):** the `Remove ${ticker}` button and watchlist rows are wired for DELETE/POST semantics; pruneTicker on 204 is already store-side
- **03-06 (chat):** chat-slot testid awaits ChatPanel; the 503-with-body contract renders without special-casing
- **03-07 (shell/CORS):** the shell skeleton is the final layout's base; the dev-only CORS decision (A1) still gates `next dev` against :8000

No blockers. Realized ≈ 8000 tokens vs the 20000 estimate — the tracer reused the 03-01 harness and research-verbatim patterns, so the authored surface was lighter than planned.

---
*Phase: 03-frontend-trading-terminal*
*Completed: 2026-08-26*

## Self-Check: PASSED

- All 8 key files found on disk (3 components/hooks, page.tsx, 3 test files, setup.ts modified)
- All 5 production commits present: `e474c9e`, `312238c`, `bc81825`, `790c7ad`, `287c88a`
- Full gates green: `npx vitest run` (22/22), `npm run build` (out/index.html), `npx tsc --noEmit` (0), `npm run lint` (0)
