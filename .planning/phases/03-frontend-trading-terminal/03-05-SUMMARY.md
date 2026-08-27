---
phase: 03-frontend-trading-terminal
plan: 05
subsystem: ui
tags: [nextjs, react, typescript, tailwind, zustand, vitest, apiFetch, trade, chat, watchlist, 503-contract]

# Dependency graph
requires:
  - phase: 03-frontend-trading-terminal
    provides: 03-01 store actions (pruneTicker/refetchPortfolio/refetchWatchlist), apiUrl/apiFetch, verbatim contract types (PortfolioResponse/ChatResponse/WatchlistResponse)
  - phase: 02-ai-chat-assistant
    provides: locked 503-with-ChatResponse contract (02-03-SUMMARY.md:204-207) — the ChatPanel renders it without special-casing
provides:
  - TradeBar — buy/sell with instant fill (POST /api/portfolio/trade → store.portfolio set) and inline 400/404 errors
  - ChatPanel — the sole apiFetch exemption (fetchChat reads the body on 200 AND 503), loading state, text-only LLM rendering, structured trade/watchlist confirmation chips, post-response refetch
  - WatchlistPanel — add (POST 200/409) / remove (raw DELETE 204 prune/404) with exact backend semantics
  - three TDD component test files (17 tests) proving every behavior with mocked fetch
affects: [03-06, 03-07, phase-04-docker]

# Actuals (#2632) — chars/4 over the realized diff (35888 chars / 6 files,
# 834 added lines). Plan estimated 14000 estimateTokens (low confidence).
actuals:
  tokens: 8972
  tasks: 3
  commits: 7

# Tech tracking
tech-stack:
  added: [] # no new deps — consumed the 03-01 zustand/vitest/RTL stack
  patterns: [dedicated fetchChat exemption reading ChatResponse on 200 AND 503 (only non-apiFetch POST), raw fetch with res.status check before body read for 204-empty-body DELETEs, render-time state adjustment (prevSelected tracking) for store→input prefill (no setState-in-effect), URL-routed fetch mocks per test file]

key-files:
  created: [frontend/components/trade/TradeBar.tsx, frontend/components/chat/ChatPanel.tsx, frontend/components/watchlist/WatchlistPanel.tsx, frontend/tests/TradeBar.test.tsx, frontend/tests/ChatPanel.test.tsx, frontend/tests/WatchlistPanel.test.tsx]
  modified: []

key-decisions:
  - "TradeBar ticker pre-fill uses the React 'adjust state during render' pattern (track prevSelected, initialize state from selectedTicker) instead of a useEffect — the next 16 / react 19 react-hooks/set-state-in-effect lint rule rejects setState in effects; the mount pre-fill survives because state initializes from the store value"
  - "ChatPanel refetches portfolio+watchlist with .catch(() => {}) so a refetch failure after a successful chat response cannot mislabel the turn as a network-error banner"
  - "WatchlistPanel DELETE uses a raw fetch with a res.status check before ANY body read — apiFetch's unconditional res.json() rejects on the backend's 204 empty body (03-PATTERNS.md:143); the 204 branch never touches the body"
  - "Confirmations render only from the structured trades/watchlist_changes fields (never from message text); LLM message/error render as React text children — T-03-01 mitigated (XSS test asserts zero parsed elements)"

patterns-established:
  - "Sole apiFetch exemption: fetchChat bypasses the generic !res.ok throw for 503 — status is checked against 200|503 before res.json(); any other status throws for the network banner"
  - "204 handling: raw fetch + res.status check BEFORE parsing; apiFetch's res.json() path is never used for bodyless 204 responses"
  - "Store→local-state sync without effects: initialize useState from the store slice and adjust during render on change (prevSelected guard)"
  - "Test fetch routing: a per-file routeFetch(url, init) helper dispatches chat POSTs to a deferred/custom handler and portfolio/watchlist GETs to canned 200s — the refetch side effects stay observable"

requirements-completed: [UI-04, UI-05, UI-06]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "TradeBar — POST {ticker, quantity, side} to /api/portfolio/trade; 200 PortfolioResponse → store.portfolio instant fill + qty clear; inline 400/404 errors; UX-only client pre-validation (no fetch on invalid input); selectedTicker pre-fills the input"
    requirement: UI-04
    verification:
      - kind: unit
        ref: "frontend/tests/TradeBar.test.tsx#Tests 1-5 (7 tests pass)"
        status: pass
    human_judgment: false
  - id: D2
    description: "ChatPanel — loading state while pending; 200 renders message text + executed trade/watchlist chips + refetches portfolio/watchlist; 503-with-ChatResponse body renders error inline without special-casing; failed per-action chips show error text; LLM content text-only (XSS: zero parsed elements); non-503 non-2xx network failure → inline banner"
    requirement: UI-05
    verification:
      - kind: unit
        ref: "frontend/tests/ChatPanel.test.tsx#Tests 1-5 (5 tests pass)"
        status: pass
    human_judgment: false
  - id: D3
    description: "WatchlistPanel — add POST {ticker} → 200 clears + refreshes, 409 inline 'already on watchlist'; remove raw DELETE → 204 prunes prices/histories/tickSeq + refetches, 404 inline error with state unchanged; invalid ticker blocked client-side; self-contained row shell (per-row price selector)"
    requirement: UI-06
    verification:
      - kind: unit
        ref: "frontend/tests/WatchlistPanel.test.tsx#Tests 1-5 (5 tests pass)"
        status: pass
    human_judgment: false

# Metrics
duration: 10min
completed: 2026-08-26
status: complete
---

# Phase 3 Plan 5: Mutation Controls Summary

**TradeBar with instant fill, ChatPanel with the locked 503-with-ChatResponse contract and text-only rendering, and WatchlistPanel with exact 409/204/404 semantics — three TDD-proven mutation controls ready for shell wiring in 03-06**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-26T17:25:50-07:00
- **Completed:** 2026-08-26T17:35:17-07:00
- **Tasks:** 3 (all TDD: RED + GREEN)
- **Files modified:** 6 (3 components + 3 test files, all created)

## Accomplishments

- `TradeBar` — reads `selectedTicker` (pre-fills the ticker input via the render-time adjust pattern), Buy/Sell POST `{ticker, quantity, side}` to `/api/portfolio/trade` through `apiFetch`; a 200 `PortfolioResponse` is set into the store (`useStore.setState({ portfolio })`) for an instant fill and the quantity input clears; `apiFetch`'s `${path} -> ${status}` throw maps 400 → 'Trade rejected: insufficient funds/shares' and 404 → 'Unknown ticker' as inline errors; client pre-validation (`/^[A-Z0-9.]{1,12}$/` + quantity > 0) is UX-only — the backend Pydantic schemas stay authoritative (T-03-08); both buttons disabled while pending
- `ChatPanel` — the **sole apiFetch exemption**: a dedicated `fetchChat` reads the `ChatResponse` body on BOTH 200 and 503 (the locked Phase 2 contract, 02-03-SUMMARY.md:204-207) and throws for any other status → inline network banner; loading state (spinner + disabled input) while awaiting; LLM `message`/`error` render as React text children (never `dangerouslySetInnerHTML` — T-03-01, ASVS V5); confirmation chips derive exclusively from the structured `trades`/`watchlist_changes` fields (`ticker side qty — executed` emerald / `— failed: error` red); after any successful response `refetchPortfolio()` + `refetchWatchlist()` fire (the AI may have traded — Pattern 5); Enter submits, non-empty trim required
- `WatchlistPanel` — add form POSTs `{ticker}` via `apiFetch`; 200 clears the input + `refetchWatchlist()`, 409 maps to the inline 'already on watchlist' with no refetch; remove uses a **raw fetch** (NOT apiFetch — its unconditional `res.json()` rejects on the backend's 204 empty body) with `res.status` checked BEFORE any body read: 204 → `pruneTicker(ticker)` (prices + histories + tickSeq — Pitfall 5) + `refetchWatchlist()`, 404 → inline error with state unchanged; per-row price via a per-ticker store selector rendered with `fmtCurrency`; the row shell is self-contained by design — 03-06 Task 1 swaps it for the real `TickerRow` (same-wave dependency risk)
- Tests: 17 new component tests (7 TradeBar + 5 ChatPanel + 5 WatchlistPanel) all mocking fetch; full frontend suite 49/49 green; build, tsc, and lint all exit 0

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1: TradeBar — buy/sell with instant fill and inline error handling** — RED `661fb02` (test), GREEN `0878b8b` (feat), fix `295b89e` (lint-restructure)
2. **Task 2: ChatPanel — loading, inline confirmations, 503-with-ChatResponse contract, text-only rendering** — RED `c1a4023` (test), GREEN `092e093` (feat)
3. **Task 3: WatchlistPanel — add (200/409) and remove (204/404) with store pruning** — RED `0ae1ab2` (test), GREEN `e88d00c` (feat)

**Plan metadata:** committed after this SUMMARY (docs: complete plan)

_Note: all three tasks followed the RED→GREEN cycle. The TradeBar GREEN needed one follow-up fix commit (lint rule — see Deviations). No refactor commits needed (implementations were minimal on first pass)._

## Files Created/Modified

- `frontend/components/trade/TradeBar.tsx` - Buy/Sell trade bar: selectedTicker pre-fill, POST /api/portfolio/trade, store instant fill, inline 400/404 errors, UX-only pre-validation (created)
- `frontend/components/chat/ChatPanel.tsx` - chat panel: fetchChat 200/503 body read, loading state, text-only message/error, structured confirmation chips, post-response refetch (created)
- `frontend/components/watchlist/WatchlistPanel.tsx` - add/remove watchlist UI: 409 inline duplicate, raw DELETE 204 prune + 404 inline error, self-contained row shell (created)
- `frontend/tests/TradeBar.test.tsx` - five behaviors, 7 tests (created)
- `frontend/tests/ChatPanel.test.tsx` - five behaviors incl. XSS element-level guard, 5 tests (created)
- `frontend/tests/WatchlistPanel.test.tsx` - five behaviors incl. prune assertions, 5 tests (created)

## Decisions Made

- TradeBar's ticker pre-fill uses the React "adjust state during render" pattern (track `prevSelected`, initialize `useState(selectedTicker ?? '')`) instead of a `useEffect` — `react-hooks/set-state-in-effect` (react 19 / next 16 eslint-config) rejects `setTicker` inside an effect; initializing state from the store preserves the mount-time pre-fill (Test 5).
- ChatPanel refetch side effects use `.catch(() => {})` — a portfolio/watchlist refetch failure after a successful chat must not mislabel the turn as a network-error banner.
- WatchlistPanel DELETE deliberately does not use `apiFetch` — the backend's 204 empty body would reject `res.json()`; the raw fetch checks `res.status` before any body read, mirroring the fetchChat bypass pattern from Task 2 (03-PATTERNS.md:143).
- Confirmations render only from structured `trades`/`watchlist_changes` fields; LLM `message`/`error` render as text children (T-03-01 mitigation, asserted element-level in the XSS test).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Lint gate rejected setState inside useEffect (TradeBar pre-fill)**
- **Found during:** Task 1 GREEN (post-commit full gate run — `npm run lint` failed)
- **Issue:** The plan's `useEffect(() => { if (selectedTicker) setTicker(selectedTicker); }, [selectedTicker])` pre-fill trips the new react-hooks/set-state-in-effect rule in next 16's eslint-config (React 19 era rule) — lint exit 1, blocking the plan's lint gate.
- **Fix:** Replaced the effect with the React-recommended "adjust state during render" pattern (track `prevSelected`, adjust during render) and initialized `useState(selectedTicker ?? '')` so a pre-selected ticker at mount still pre-fills (Test 5 behavior preserved).
- **Files modified:** frontend/components/trade/TradeBar.tsx
- **Verification:** `npm run lint` exit 0; TradeBar 7/7 tests pass; full suite 49/49
- **Committed in:** `295b89e` (follow-up fix commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** A single-component lint compliance fix required for the plan's own lint gate; no behavioral or scope change — all five TradeBar behaviors (incl. Test 5 pre-fill) still pass.

## TDD Gate Compliance

- **RED gates:** `661fb02`, `c1a4023`, `0ae1ab2` (test commits) — each committed before its implementation
- **GREEN gates:** `0878b8b`, `092e093`, `e88d00c` (feat commits) — each follows its RED commit and passes its targeted suite
- RED tests failed for the right reason (unresolved module imports — missing components)
- REFACTOR commits: none — implementations were minimal on first pass
- **Status: PASS** — no violations

## Issues Encountered

- **vitest 4 removed `-q`** (documented in 03-01-SUMMARY) — plan `<verify>` commands adapted to plain `npx vitest run tests/<file>` with the same targeted intent.
- **jest-dom `toHaveValue` reports empty `type="number"` inputs as `null`** — the quantity-clear assertion (TradeBar Test 2) asserted the raw `HTMLInputElement.value` instead.
- **Input-clear assertion needed `waitFor`** — the quantity clear and the store portfolio update land in different render phases; asserting immediately after the store waitFor raced the React re-render.
- **Test 5 (selectedTicker pre-fill) initially regressed after the lint fix** — the render-adjust pattern only fires on post-mount changes, missing a pre-selected ticker at mount; fixed by initializing the state from `selectedTicker` (folded into the `295b89e` fix).

## User Setup Required

None - no external service configuration required. Dev-only `frontend/.env.local` (`NEXT_PUBLIC_API_BASE=http://localhost:8000`) from 03-01 remains; production builds leave it unset → same-origin `/api/*`. Live chat still requires `OPENROUTER_API_KEY` + `LLM_MOCK` unset (backend user_setup, 02-USER-SETUP.md) — the panel is fully tested against the mock path.

## Next Phase Readiness

- **03-06 (shell wiring):** the three components land in the terminal shell — `TradeBar` in the `trade-bar-slot`, `ChatPanel` in the `chat-slot`; `WatchlistPanel` replaces the bare `TickerRow` list in the left column. WatchlistPanel's self-contained row shell is the documented swap point for the real `TickerRow` composition (03-06 Task 1). The 503 contract renders without special-casing, so shell integration needs no chat-error special-casing.
- **03-07 (CORS/shell polish):** the dev-only CORS decision (A1) still gates `next dev` against :8000; nothing in this plan changed the backend surface.
- The store already carries everything the components call (`pruneTicker`, `refetchPortfolio`, `refetchWatchlist`, `setChatLoading`, `appendChatMessage`, `selectedTicker`) — no store changes were needed.

No blockers. Realized ≈ 8970 tokens vs the 14000 estimate (low confidence) — the components consumed the 03-01 apiFetch/store/harness surface directly, keeping the authored surface leaner than estimated.

---
*Phase: 03-frontend-trading-terminal*
*Completed: 2026-08-26*

## Self-Check: PASSED

- All 6 key files found on disk (3 components + 3 test files) plus the SUMMARY itself
- All 7 production commits present: `661fb02` (RED), `0878b8b` (GREEN), `295b89e` (fix), `c1a4023` (RED), `092e093` (GREEN), `0ae1ab2` (RED), `e88d00c` (GREEN)
- Full gates green: `npx vitest run` (49/49), `npm run build` (exit 0), `npx tsc --noEmit` (exit 0), `npm run lint` (exit 0)
- Controls suite (plan <verification>): TradeBar 7/7, ChatPanel 5/5, WatchlistPanel 5/5 (17/17)
