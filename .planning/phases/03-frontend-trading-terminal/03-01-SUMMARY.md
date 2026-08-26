---
phase: 03-frontend-trading-terminal
plan: 01
subsystem: ui
tags: [nextjs, react, typescript, tailwind, zustand, vitest, lightweight-charts, recharts, static-export]

# Dependency graph
requires:
  - phase: 02-ai-chat-assistant
    provides: ChatResponse 503-with-body contract, portfolio/watchlist/chat REST surface
provides:
  - frontend/ scaffold (Next 16.3.3 static export, Tailwind 4, pinned deps)
  - lib/types.ts verbatim backend contract types (all eight interfaces)
  - lib/api.ts (apiUrl/apiFetch), lib/format.ts (fmtCurrency/fmtPercent/pnlColor)
  - store/useStore.ts zustand store with all actions later plans call
  - vitest harness (vitest.config.ts + tests/setup.ts with EventSource/fetch/lightweight-charts mocks)
affects: [03-02, 03-03, 03-04, 03-05, 03-06, 03-07, phase-04-docker]

# Actuals (#2632) — chars/4 over the realized diff (10096 added lines incl. the
# 9200-line generated package-lock.json; hand-written code ≈ 1300 lines ≈ 8250 tokens).
actuals:
  tokens: 84742
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: [next 16.3.3, react 19.2.8, tailwindcss 4.3.3, lightweight-charts 5.2.1, recharts 3.10.1, zustand 5.0.15, vitest 4.1.11, @testing-library/react 16.3.2, @testing-library/jest-dom 7.0.1, jsdom 30.0.1]
  patterns: [static-export SPA with NEXT_PUBLIC_API_BASE base resolution, zustand functional-set SSE merge with 100-point history cap + tickSeq flash keys, capture-instance EventSource mock + hoisted lightweight-charts module mock, verbatim backend-contract TypeScript interfaces]

key-files:
  created: [frontend/next.config.ts, frontend/.env.local, frontend/app/globals.css, frontend/lib/types.ts, frontend/lib/api.ts, frontend/lib/format.ts, frontend/store/useStore.ts, frontend/vitest.config.ts, frontend/tests/setup.ts, frontend/tests/useStore.test.ts]
  modified: [.gitignore]

key-decisions:
  - "Store lives at frontend/store/useStore.ts per PLAN.md files_modified (03-PATTERNS.md's lib/useStore.ts is a structural sketch; the plan is authoritative)"
  - "npm 11 project-scoped allowScripts policy blocks create-next-app's postinstall — added \"allowScripts\": {\"next\": true} to frontend/package.json and installed manually with --skip-install scaffold"
  - "Root .gitignore's unanchored lib/ (pip virtualenv rule) ignored frontend/lib/ — anchored to /lib/ so frontend contract types are tracked"
  - "tickSeq initializes to 0 on a ticker's first frame so the flash key-remount sequence starts at a stable base"
  - "vitest 4 dropped the -q flag — targeted runs use plain `npx vitest run tests/<file>`"

patterns-established:
  - "API base resolution: const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? ''; apiUrl(path) prefixes every fetch/EventSource URL"
  - "Store SSE merge: functional set(state => ...) merging {TICKER: PriceUpdate} frames, histories capped at 100 (slice(-100)), per-ticker tickSeq incremented only on direction change"
  - "Defensive frame guard: isPriceUpdate() type guard skips malformed entries before they reach state (threat T-03-02)"
  - "Test harness contract: tests/setup.ts exposes MockEventSource.instances + __emit, global fetch stub via vi.stubGlobal, and a vi.hoisted lightweight-charts createChart registry — every later test file depends on these"
  - "Derived live total: selectLiveTotal = cash + Σ(qty × (prices[t].price ?? current_price)) — computed, never stored"

requirements-completed: [UI-01, UI-02, UI-07]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "Next.js 16 static-export scaffold with pinned deps, dark theme tokens and flash keyframes"
    requirement: UI-01
    verification:
      - kind: other
        ref: "npm run build in frontend/ (exits 0, out/index.html produced)"
        status: pass
      - kind: other
        ref: "npm ls lightweight-charts recharts zustand → 5.2.1 / 3.10.1 / 5.0.15"
        status: pass
    human_judgment: false
  - id: D2
    description: "Backend contract types + apiUrl/apiFetch helpers + formatters, type-checked"
    verification:
      - kind: other
        ref: "npx tsc --noEmit in frontend/ (exits 0)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Vitest harness (jsdom + jest-dom + EventSource/fetch/lightweight-charts mocks)"
    verification:
      - kind: unit
        ref: "frontend/tests/useStore.test.ts (12 tests pass; harness exercised)"
        status: pass
    human_judgment: false
  - id: D4
    description: "zustand store with applyPrices cap/tickSeq/prune semantics and portfolio/watchlist/chat actions"
    requirement: UI-02
    verification:
      - kind: unit
        ref: "frontend/tests/useStore.test.ts#Test 1..9 + selectLiveTotal (12/12 pass)"
        status: pass
    human_judgment: false
  - id: D5
    description: "selectLiveTotal derived live portfolio value with SSE-price fallback"
    requirement: UI-07
    verification:
      - kind: unit
        ref: "frontend/tests/useStore.test.ts#selectLiveTotal (cash + Σ(qty × live price))"
        status: pass
    human_judgment: false

# Metrics
duration: 50min
completed: 2026-08-26
status: complete
---

# Phase 3 Plan 1: Frontend Foundation Summary

**Next.js 16 static-export SPA scaffold with pinned deps, verbatim backend contract types, zustand SSE-merge store, and a full vitest harness — the Wave-0 layer every later frontend plan imports from**

## Performance

- **Duration:** 50 min
- **Started:** 2026-08-26T16:25:17Z
- **Completed:** 2026-08-26T17:15:00Z
- **Tasks:** 3
- **Files modified:** 27 (26 created + 1 modified — .gitignore)

## Accomplishments

- `frontend/` scaffolded with Next 16.3.3 + React 19.2.8 + Tailwind 4 (create-next-app), `output: 'export'` producing `out/index.html` with no Node server, and exactly the three locked runtime deps pinned (lightweight-charts 5.2.1, recharts 3.10.1, zustand 5.0.15)
- Dark terminal theme tokens (`#0d1117` / `#1a1a2e` / `#30363d`) and `flash-up`/`flash-down` keyframes in `globals.css`
- `lib/types.ts` — verbatim transcription of all eight backend contracts (PriceUpdate, Position, PortfolioResponse, HistoryResponse, WatchlistResponse, TradeActionResult, WatchlistChangeResult, ChatResponse with optional `error`)
- `lib/api.ts` (API_BASE/apiUrl/apiFetch with `${path} -> ${status}` throws), `lib/format.ts` (Intl-based fmtCurrency/fmtPercent + pnlColor)
- `store/useStore.ts` — zustand store with applyPrices (functional merge, 100-point cap, tickSeq on direction change, malformed-entry type guard), connection state, pruneTicker (all three slices), refetchPortfolio/refetchWatchlist via apiFetch, chat slices, and the selectLiveTotal derived selector
- Vitest 4.1.11 harness: `vitest.config.ts` (jsdom + setupFiles), `tests/setup.ts` with jest-dom matchers, capture-instance EventSource mock (`__emit` dispatch, closed flag, mutable readyState), global fetch stub, and a hoisted lightweight-charts module mock
- 12 unit tests green; full gates pass: `npm run build` (exit 0), `npx tsc --noEmit` (exit 0), `npm run lint` (exit 0), `npx vitest run` (12/12)

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold frontend/ (create-next-app), lock deps, static-export config, dark theme tokens** - `7aadebf` (feat)
2. **Task 2: Backend contract types, apiUrl/apiFetch helpers, formatters, vitest harness** - `25074a7` (feat)
3. **Task 3 (TDD): zustand store** — RED `a79326b` (test) → GREEN `b0ee6b2` (feat)

**Plan metadata:** `(final commit below)`

_Note: Task 3 followed the RED→GREEN cycle — failing test commit `a79326b` preceded the passing implementation commit `b0ee6b2`. No refactor commit needed (implementation was minimal on first pass)._

## Files Created/Modified

- `frontend/package.json` - scaffold + pinned runtime/dev deps + `allowScripts.next` for npm 11 policy
- `frontend/next.config.ts` - `output: 'export'` (no rewrites/proxy)
- `frontend/.env.local` - `NEXT_PUBLIC_API_BASE=http://localhost:8000` (dev-only, git-ignored)
- `frontend/app/globals.css` - Tailwind import + dark @theme tokens + flash-up/flash-down keyframes
- `frontend/lib/types.ts` - verbatim backend contract interfaces
- `frontend/lib/api.ts` - API_BASE, apiUrl(), apiFetch\<T\>()
- `frontend/lib/format.ts` - fmtCurrency, fmtPercent, pnlColor
- `frontend/store/useStore.ts` - zustand store + WatchlistTicker + selectLiveTotal
- `frontend/vitest.config.ts` - jsdom + setupFiles
- `frontend/tests/setup.ts` - jest-dom, EventSource mock, fetch stub, lightweight-charts mock
- `frontend/tests/useStore.test.ts` - nine store behaviors + selectLiveTotal (12 tests)
- `.gitignore` - anchored `lib/` to repo root (was ignoring `frontend/lib/`)

## Decisions Made

- Store at `frontend/store/useStore.ts` — PLAN.md's `files_modified` is authoritative; PATTERNS' `lib/useStore.ts` sketch not followed (later plans' imports reference the store path, and the two later plans that use the store do so through the documented shape, not the sketch path)
- npm 11 `allowScripts` policy handled in-repo via `package.json` `allowScripts: { next: true }` — keeps the repo self-contained without relying on machine-level npm config
- `.gitignore` `lib/` anchored (`/lib/`) — preserves the pip-virtualenv intent while letting `frontend/lib/` be tracked
- `tickSeq` initialized to 0 on first sight (test-pinned semantics: same-direction frames keep the flash sequence stable)
- vitest 4 removed `-q` — plan's verify commands adapted to `npx vitest run tests/<file>` (same targeted-run intent)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] npm 11 project-scoped allowScripts policy aborts create-next-app's install**
- **Found during:** Task 1 (scaffold)
- **Issue:** `npm install` failed with `EALLOWSCRIPTS: --allow-scripts is not allowed in project-scoped installs` — create-next-app passed `--allow-scripts` which npm 11 rejects unless packages are listed in `package.json`'s `allowScripts` field. The scaffold directory existed but had no node_modules.
- **Fix:** Re-scaffolded with `--skip-install`, added `"allowScripts": { "next": true }` to `frontend/package.json`, then ran `npm install` manually (followed by the pinned-dep installs). `unrs-resolver` postinstall (eslint dep, optional cache) left unapproved — warning only, build/lint/tests all pass.
- **Files modified:** frontend/package.json (allowScripts field)
- **Verification:** npm install succeeds; build + lint + tsc + vitest all green
- **Committed in:** `7aadebf` (Task 1 commit)

**2. [Rule 3 - Blocking] Root .gitignore `lib/` pattern silently ignored `frontend/lib/`**
- **Found during:** Task 2 (staging lib/types.ts, lib/api.ts, lib/format.ts)
- **Issue:** The Python/pip section's unanchored `lib/` matched any directory named lib at any depth — `git add frontend/lib` refused with "paths are ignored by one of your .gitignore files".
- **Fix:** Anchored to `/lib/` in the root `.gitignore` (pip's virtualenv layout is repo-root-only; no root `lib/` exists and backend has no `lib/`).
- **Files modified:** `.gitignore`
- **Verification:** `git check-ignore frontend/lib/types.ts` exits 1 (no longer ignored); files committed
- **Committed in:** `25074a7` (Task 2 commit)

**3. [Rule 1 - Bug] tickSeq never initialized on a ticker's first frame**
- **Found during:** Task 3 GREEN (Test 3 failed: expected 0, got undefined)
- **Issue:** `tickSeq[ticker]` was only written on direction-change increments; the test pins `toBe(0)` after two same-direction frames (the flash key-remount sequence must be stable and start at 0).
- **Fix:** Initialize `tickSeq[ticker] = tickSeq[ticker] ?? 0` on the non-increment path (first sight / same direction).
- **Files modified:** frontend/store/useStore.ts
- **Verification:** All 12 tests pass; tsc clean
- **Committed in:** `b0ee6b2` (Task 3 GREEN commit)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All fixes were necessary for the plan's stated artifacts to exist (scaffold install, tracked lib types, test-pinned store semantics). No scope creep; the .gitignore fix is a 1-line root-file change that unlocks all future `frontend/lib/` work.

## Issues Encountered

- vitest 4.1.11 removed the `-q` (quiet) CLI flag the plan's verify commands used — adapted to plain `npx vitest run tests/<file>`; the `<automated>` intent (targeted, quiet run) is preserved.
- The intentional malformed-entry test data (`direction: 'sideways'`) tripped `tsc`'s object-literal check — recast via `as unknown as Record<string, PriceUpdate>` so the runtime type-guard test stays meaningful and type-checks.

## User Setup Required

None - no external service configuration required. Dev-only `frontend/.env.local` (`NEXT_PUBLIC_API_BASE=http://localhost:8000`) is already in place and git-ignored; production builds leave it unset → same-origin `/api/*`.

## Next Phase Readiness

- **03-02 (SSE hook + watchlist components):** imports `useStore.applyPrices/setConnection`, `lib/api.ts apiUrl`, `lib/types.ts PriceUpdate`, and the `tests/setup.ts` EventSource mock contract (capture-instance registry + `__emit`) — all present and unit-proven
- **03-03 (chart):** `histories` arrays (capped 100) and `tickSeq` power the lightweight-charts sparklines/area and flash keys; the hoisted chart mock in setup.ts is ready for canvas-component tests
- **03-04/03-05 (portfolio/trade/watchlist):** `refetchPortfolio`, `refetchWatchlist`, `pruneTicker`, `selectLiveTotal`, and the watchlist-union mapping are implemented with the RESEARCH-documented semantics
- **03-06 (chat):** `chatMessages`/`chatLoading` slices and the optional `error` ChatResponse type support the 503-with-body contract without special-casing
- **03-07 (shell/CORS):** the scaffold's `page.tsx`/`layout.tsx` are scaffold defaults ready to be replaced by the terminal shell; the dev-only CORS decision (A1) still gates `next dev` against :8000

No blockers. Estimate was 22000 tokens against 84742 realized (hand-written ≈ 8250 tokens; the delta is the 9200-line generated `package-lock.json` in the scaffold commit — the hand-written surface was lighter than estimated because the scaffold + verbatim transcription approach minimized authored code).

---
*Phase: 03-frontend-trading-terminal*
*Completed: 2026-08-26*

## Self-Check: PASSED

- All 10 key files found on disk (frontend scaffold, lib/, store/, vitest harness, SUMMARY)
- All 4 commits present: `7aadebf`, `25074a7`, `a79326b`, `b0ee6b2`
- `frontend/.env.local` git-ignored: True
- Full gates green: `npm run build` (0), `npx tsc --noEmit` (0), `npm run lint` (0), `npx vitest run` (12/12)
