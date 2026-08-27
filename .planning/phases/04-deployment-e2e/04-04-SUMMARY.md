---
phase: 04-deployment-e2e
plan: 04
subsystem: testing
tags: [playwright, e2e, docker-compose, sse, event-source, chromium, vitest, pytest]

# Dependency graph
requires:
  - phase: 04-deployment-e2e
    provides: test/ compose stack (app + playwright containers, LLM_MOCK=true, finally-test-data volume, run-e2e scripts)
provides:
  - six TEST-02 E2E specs (01-fresh-start → 06-sse-reconnect) with numeric-prefix mutation-safe serial ordering
  - deterministic fresh-state full-suite gate via test/run-e2e.ps1 (down -v → up --build -d app → playwright → down -v), green twice consecutively
  - resolved SSE-reconnect trigger (EventSource socket-drop wrapper; setOffline and CDP emulation cannot kill established sockets in the pinned Chromium)
  - test-compose fixes: playwright.config.ts volume-mount + app.test network alias (Chromium HTTPS-upgrade workaround)
affects: [04-deployment-e2e verification, ship]

# Actuals (#2632) — pairs with the plan's estimate (20000 tokens, low confidence)
actuals:
  tokens: 4500      # chars/4 over the realized diff (255 added lines ≈ 17.9KB)
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []         # no new dependencies — @playwright/test 1.62.0 from 04-03
  patterns:
    - "numeric-prefix spec naming (01-06) so Playwright's alphabetical file discovery equals the mutation-safe serial order"
    - "EventSource init-script wrapper for a deterministic SSE socket drop + reconnect with the same onopen/onerror/onmessage handlers"
    - "getByLabel(..., { exact: true }) where one accessible name is a substring of another ('Add ticker' contains 'Ticker')"
    - "SVG path visibility: assert the recharts wrapper visible + the curve attached (path reports 'hidden' despite real geometry)"

key-files:
  created:
    - test/tests/01-fresh-start.spec.ts
    - test/tests/02-watchlist.spec.ts
    - test/tests/03-trading.spec.ts
    - test/tests/04-visualizations.spec.ts
    - test/tests/05-chat.spec.ts
    - test/tests/06-sse-reconnect.spec.ts
  modified:
    - test/docker-compose.test.yml (config volume-mount, app.test alias, PLAYWRIGHT_BASE_URL)

key-decisions:
  - "app.test network alias + PLAYWRIGHT_BASE_URL=http://app.test:8000 — the pinned Chromium HTTPS-upgrades the single-label service name 'app' (307 -> https -> ERR_SSL_PROTOCOL_ERROR against plain HTTP); .test is RFC 2606 reserved and dotted hostnames are exempt (verified empirically)"
  - "playwright.config.ts delivered by volume mount, not image COPY — matches 04-03's live spec-delivery design; config changes need no image rebuild"
  - "SSE reconnect trigger: an init-script EventSource wrapper drops the real socket and re-creates with the same handlers while offline. context.setOffline AND CDP Network.emulateNetworkConditions both leave established SSE sockets alive in the pinned Chromium (verified: a page fetch fails while the dot stays 'connection: connected')"
  - "04-visualizations buys 1 TSLA — the fresh seed has NO positions (database.py:92-105), so a second heatmap cell requires a deliberate mutation"
  - "05-chat runs 5th and 06 last — after 01's $10,000.00 assertion, so their deterministic AAPL buys never precede fresh-start"

patterns-established:
  - "specs assert ONLY shipped selectors: connection-dot aria-label, sparkline-{TICKER}, heatmap-cell-{NAME}, getByLabel Ticker/Quantity (exact), role buttons Add/Buy/Sell/Send/Remove {TICKER}, placeholder 'Ask the AI to trade…'"
  - "full-suite determinism comes from run-e2e's leading down -v (finally-test-data reset), never from within-suite isolation"

requirements-completed: [TEST-02]

# Coverage metadata (#1602) — one entry per shipped deliverable
coverage:
  - id: D1
    description: "Fresh-start E2E: $10,000.00 cash, ten sparkline testids, connection dot connected, live price change"
    requirement: TEST-02
    verification:
      - kind: e2e
        ref: "test/tests/01-fresh-start.spec.ts#fresh start: $10k cash, ten sparklines, connected dot, live prices"
        status: pass
    human_judgment: false
  - id: D2
    description: "Watchlist E2E: add PYPL -> sparkline + streaming price -> Remove PYPL -> gone"
    requirement: TEST-02
    verification:
      - kind: e2e
        ref: "test/tests/02-watchlist.spec.ts#watchlist: add PYPL streams then remove it"
        status: pass
    human_judgment: false
  - id: D3
    description: "Trading E2E: buy 10 AAPL (cash below $10k, position row) then sell 5 (cash up, quantity 5)"
    requirement: TEST-02
    verification:
      - kind: e2e
        ref: "test/tests/03-trading.spec.ts#trading: buy 10 AAPL then sell 5"
        status: pass
    human_judgment: false
  - id: D4
    description: "Visualizations E2E: heatmap cells (AAPL + TSLA), P&L chart, positions table"
    requirement: TEST-02
    verification:
      - kind: e2e
        ref: "test/tests/04-visualizations.spec.ts#visualizations: heatmap cells, P&L chart, positions table"
        status: pass
    human_judgment: false
  - id: D5
    description: "Mocked chat E2E: '[mock] Acknowledged' message + inline 'AAPL buy 1 — executed' confirmation + cash decreased"
    requirement: TEST-02
    verification:
      - kind: e2e
        ref: "test/tests/05-chat.spec.ts#chat: [mock] Acknowledged + inline AAPL buy confirmation"
        status: pass
    human_judgment: false
  - id: D6
    description: "SSE reconnect E2E: connected -> socket dropped -> reconnecting -> online -> connected with a changed price cell"
    requirement: TEST-02
    verification:
      - kind: e2e
        ref: "test/tests/06-sse-reconnect.spec.ts#SSE reconnects after network loss"
        status: pass
    human_judgment: false
  - id: D7
    description: "Deterministic full-suite gate: all six specs pass serially from a down -v fresh state, twice consecutively, host left clean"
    verification:
      - kind: other
        ref: "& ./test/run-e2e.ps1 — exit 0 twice consecutively; docker ps/volume ls show no test containers/volumes after"
        status: pass
    human_judgment: false

# Metrics
duration: 40min
completed: 2026-08-26
status: complete
---

# Phase 04 Plan 04: E2E Test Scenarios Summary

**Six Playwright E2E specs — fresh start, watchlist add/remove, buy/sell, visualizations, mocked AI chat, and SSE reconnection — covering TEST-02, green twice consecutively from a deterministic down -v fresh state via test/run-e2e.ps1**

## Performance

- **Duration:** 40 min
- **Started:** 2026-08-26T22:58:00-07:00
- **Completed:** 2026-08-26T23:40:00-07:00
- **Tasks:** 2
- **Files modified:** 7 (6 specs created, 1 compose file modified)

## Accomplishments

- Six TEST-02 E2E specs authored against the real Phase-3 selectors, each starting `page.goto('/')` and committed with numeric prefixes (01-06) so Playwright's alphabetical discovery order equals the mutation-safe serial order — fresh-start's $10,000.00 assertion always runs before chat.spec's deterministic AAPL buy.
- Deterministic fresh-state full-suite gate: `test/run-e2e.ps1` exits 0 **twice consecutively** (each run's leading `down -v` wipes `finally-test-data`); the host is left with no containers and no test volume — only the pre-existing production `finally-data` volume remains.
- A3 resolved and recorded: `context.setOffline` AND CDP `Network.emulateNetworkConditions` both fail to tear down an established SSE socket in the pinned Chromium (emulated offline kills new connections only — a page fetch fails while the dot stays 'connection: connected'). The working trigger is an init-script `EventSource` wrapper that drops the real socket (the backend's `request.is_disconnected()` loop breaks the stream) and re-creates a fresh native EventSource with the same handlers while offline — the real `onerror` path sets `reconnecting`, and the browser's built-in retry reconnects once the network returns.
- Two blocker fixes to the 04-03 test infrastructure: `playwright.config.ts` is now volume-mounted into the playwright container (it was never COPY'd into the image → no baseURL and default 3-worker parallelism instead of the mandatory `workers: 1` serial mode), and the app service got an `app.test` network alias (the pinned Chromium HTTPS-upgrades the single-label service name `app`).
- Unit regressions green on the committed state: backend `uv run --extra dev pytest -q` 159 passed, frontend `npx vitest run` 58 passed, frontend `npm run build` exit 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: 01-fresh-start, 02-watchlist, 03-trading specs + targeted run** - `4d3aa24` (test: 3 specs + compose baseURL fixes)
2. **Task 2: 04-visualizations, 05-chat, 06-sse-reconnect specs + full-suite gate** - `4e946c5` (test: 3 specs, full suite green)

**Plan metadata:** `ccf50cf` (docs: complete plan)

## Files Created/Modified

- `test/tests/01-fresh-start.spec.ts` - $10k cash, ten sparkline testids, connected dot, live price change
- `test/tests/02-watchlist.spec.ts` - add PYPL streams → remove PYPL disappears
- `test/tests/03-trading.spec.ts` - buy 10 AAPL (cash < $10k + position) → sell 5 (cash up, qty 5)
- `test/tests/04-visualizations.spec.ts` - heatmap cells (AAPL+TSLA), P&L chart, positions table
- `test/tests/05-chat.spec.ts` - `[mock] Acknowledged` + inline `AAPL buy 1 — executed` + cash decreased
- `test/tests/06-sse-reconnect.spec.ts` - connected → socket drop → reconnecting → online → connected + price change
- `test/docker-compose.test.yml` - playwright.config.ts volume-mount; `app.test` alias on the app service; `PLAYWRIGHT_BASE_URL=http://app.test:8000`

## Decisions Made

- **`app.test` network alias + baseURL** — the pinned Chromium HTTPS-upgrades the single-label compose service name `app` (internal 307 to `https://app:8000` → `ERR_SSL_PROTOCOL_ERROR` against plain HTTP uvicorn). `.test` is an RFC 2606 reserved TLD and dotted hostnames are exempt; the workaround was verified empirically before wiring.
- **Config delivered by volume mount** — consistent with 04-03's live spec-delivery design; config changes need no playwright image rebuild.
- **SSE reconnect trigger** — the socket must be dropped at the connection level (both emulation approaches leave established sockets alive). The EventSource wrapper keeps the page mounted and re-uses the app's own handlers, exercising the unmodified frontend reconnect machinery.
- **04-visualizations buys 1 TSLA** — the fresh seed has no positions, so a second heatmap cell requires a deliberate, documented mutation (safe: it runs after 03-trading and before 05-chat).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] playwright.config.ts absent from the playwright container**
- **Found during:** Task 1 (targeted run)
- **Issue:** 04-03's `playwright.Dockerfile` never COPY'd `playwright.config.ts` and the compose only mounted `./tests` — the container ran with NO config: `page.goto('/')` → "Cannot navigate to invalid URL" (no baseURL), and the default 3-worker parallelism violated the mandatory `workers: 1` + `fullyParallel: false` serial contract.
- **Fix:** Volume-mounted `./playwright.config.ts:/test/playwright.config.ts` on the playwright service.
- **Files modified:** test/docker-compose.test.yml
- **Verification:** "Running 3 tests using 1 worker" + baseURL applied (goto reaches http://app.test:8000)
- **Committed in:** 4d3aa24 (part of Task 1 commit)

**2. [Rule 3 - Blocking] Chromium HTTPS-upgrades the single-label service name `app`**
- **Found during:** Task 1 (targeted run, after fix 1)
- **Issue:** `page.goto` → `net::ERR_SSL_PROTOCOL_ERROR`; the app returned a 307 to `https://app:8000` for Chromium only (curl 200 with identical headers). Feature flags `HttpsUpgrades`/`HttpsFirstModeV2`/`AutomaticHttpsDefaultPort`/`HttpsOnlyMode` did not stop it; IP literals and dotted hostnames (`test-app-1`, `app.test`) navigated 200.
- **Fix:** Added a `networks.default.aliases: [app.test]` entry to the app service and pointed `PLAYWRIGHT_BASE_URL` at `http://app.test:8000`.
- **Files modified:** test/docker-compose.test.yml
- **Verification:** full suite green via run-e2e
- **Committed in:** 4d3aa24 (part of Task 1 commit)

**3. [Rule 1 - Bug] getByLabel('Ticker') strict-mode violation**
- **Found during:** Task 1 (targeted run)
- **Issue:** `getByLabel('Ticker')` substring-matched BOTH the trade-bar input and the watchlist "Add ticker" input ("Add **Ticker**" contains "Ticker").
- **Fix:** `getByLabel('Ticker', { exact: true })` and `getByLabel('Quantity', { exact: true })` in 03-trading and 04-visualizations.
- **Files modified:** test/tests/03-trading.spec.ts
- **Verification:** targeted run green
- **Committed in:** 4d3aa24

**4. [Rule 1 - Bug] RESEARCH skeleton's page-wide price probe lands on the static header cash cell**
- **Found during:** Task 2 authoring (06-sse-reconnect)
- **Issue:** `page.locator('span').filter({ hasText: /^\$?[0-9]+\./ }).first()` matches the header "Cash" value span first in DOM order — that cell is STATIC between trades, so the "changed price cell" assertion could never pass even with a working reconnect.
- **Fix:** Scoped the probe to the AAPL watchlist row's price span (a live 20Hz cell). Same pattern used in 01/02 for the live-price assertions.
- **Files modified:** test/tests/06-sse-reconnect.spec.ts
- **Verification:** 06 passes (3.8s)
- **Committed in:** 4e946c5

**5. [Rule 1 - Bug] .recharts-line-curve toBeVisible "hidden" + .recharts-wrapper strict-mode**
- **Found during:** Task 2 (full-suite run)
- **Issue:** (a) Playwright reports the SVG `<path class="recharts-line-curve">` "hidden" despite real geometry (stroke-dasharray render quirk) even after the chart data renders; (b) `.recharts-wrapper` matches BOTH the Heatmap Treemap and the PnlChart LineChart.
- **Fix:** Assert `.recharts-wrapper` nth(1) visible (the P&L chart, second in DOM) + the curve attached.
- **Files modified:** test/tests/04-visualizations.spec.ts
- **Verification:** 04 passes (612ms)
- **Committed in:** 4e946c5

**6. [A3 resolved] SSE-reconnect trigger: emulated offline cannot kill an established SSE socket**
- **Found during:** Task 2 (full-suite run, first attempt)
- **Issue:** With `context.setOffline(true)` the dot stayed `connection: connected` for 10s (assertion timed out). The CDP fallback `Network.emulateNetworkConditions {offline:true}` had the same result — a page `fetch` FAILED while the established socket kept the dot green. Emulated offline blocks new connections but does not tear down established ones in the pinned Chromium.
- **Fix:** Init-script `EventSource` wrapper: stash the live instance; on `reconnect()` close the real socket (server `request.is_disconnected()` breaks the stream) and create a fresh native EventSource with the SAME onopen/onerror/onmessage handlers while the context is offline — the failed connection fires the app's real `onerror` (`reconnecting`), and the browser's built-in retry (`retry: 1000`) reconnects once online.
- **Files modified:** test/tests/06-sse-reconnect.spec.ts
- **Verification:** 06 passes (3.8s); transition + price-change assertions hold
- **Committed in:** 4e946c5

---

**Total deviations:** 6 auto-fixed (2 blocking infra fixes [Rule 3], 3 bugs [Rule 1], 1 planned-assumption resolution [A3])
**Impact on plan:** All fixes were required to make the phase gate runnable and deterministic on the pinned toolchain. No scope creep; no production code changed.

## Issues Encountered

- The SSE-reconnect trigger consumed the most investigation: three candidate mechanisms were probed empirically in the container (setOffline, page-level CDP emulation, feature-flag disabling) before the socket-drop wrapper was chosen. The probe evidence is documented in the deviation above so future maintainers do not re-investigate.
- Playwright's visibility semantics for SVG `<path>` elements (stroke-dasharray animated render) report "hidden" despite a non-empty bounding box — worked around by asserting the wrapper element instead.

## User Setup Required

None - no external service configuration required (LLM_MOCK=true keeps the suite keyless).

## Next Phase Readiness

- TEST-02 complete: the six E2E scenarios cover all phase success criteria (fresh start, watchlist CRUD, buy/sell, visualizations, mocked AI chat, SSE reconnection).
- Phase-gate prerequisites verified on the committed state: E2E suite green (twice), backend pytest 159 passed, frontend vitest 58 passed, frontend build exit 0.
- Phase 04 (Deployment & E2E) is the final phase — ready for phase verification and `/gsd-ship`.

---
*Phase: 04-deployment-e2e*
*Completed: 2026-08-26*

## Self-Check: PASSED

- FOUND: test/tests/01-fresh-start.spec.ts, 02-watchlist.spec.ts, 03-trading.spec.ts, 04-visualizations.spec.ts, 05-chat.spec.ts, 06-sse-reconnect.spec.ts
- FOUND: commits 4d3aa24 (Task 1), 4e946c5 (Task 2)
- E2E suite green via run-e2e twice (exit 0); unit regressions green (backend pytest 159, frontend vitest 58, frontend build exit 0)
