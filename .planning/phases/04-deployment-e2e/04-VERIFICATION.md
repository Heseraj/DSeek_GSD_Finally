---
phase: 04-deployment-e2e
verified: 2026-08-26T00:00:00Z
status: human_needed
score: 15/15 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Run scripts/start_mac.sh twice consecutively, then scripts/stop_mac.sh, then scripts/start_mac.sh again on a real macOS/Linux host; make a trade before the stop and confirm it survives the stop -> start cycle"
    expected: "Both start invocations exit 0; stop leaves 0 containers but the finally-data volume is retained; the pre-stop trade is visible after the final start (cash < 10000)"
    why_human: "The sh scripts were WSL-syntax-validated and logic-mirrored against the functionally-proven ps1 pair, but never executed on an actual macOS/Linux host (04-02 coverage D1 marks human_judgment: true; 04-VALIDATION.md Manual-Only table)"
  - test: "Run the start/stop lifecycle interactively on Windows (start_windows.ps1 -> trade -> stop_windows.ps1 -> start_windows.ps1) and confirm the repeated-interactive UX is error-free"
    expected: "No errors on any invocation; the URL is printed only after /api/health responds; the pre-stop trade survives through finally-data"
    why_human: "04-VALIDATION.md lists 'repeated-interactive semantics' as manual-only — automated runs cover exit codes but not interactive shell-script UX feel"
---

# Phase 4: Deployment & E2E Verification Report

**Phase Goal:** One command deploys the full app in a single Docker container with a persistent database, and Playwright E2E tests prove the core flows.
**Verified:** 2026-08-26
**Status:** human_needed (all 15 automated truths VERIFIED; 2 plan-deferred manual sign-offs remain)
**Re-verification:** No — initial verification

## Goal Achievement

All four roadmap success criteria hold against live artifacts. Every critical behavior was re-verified directly (not taken from SUMMARY claims): the container was booted and its HTTP/SSE surface asserted, restart persistence was proven with a real trade, and the full six-spec Playwright suite was run to completion (6/6 green, exit 0, full cleanup).

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | backend/app/main.py reads FINALLY_DB_PATH (default 'db/finally.db') and serves the static export via app.frontend('/') with check_dir=False, so backend-only pytest still imports app.main without frontend/out | ✓ VERIFIED | main.py:35 `DB_PATH = os.environ.get("FINALLY_DB_PATH", "db/finally.db")`; main.py:86 `app.frontend("/", directory="static", check_dir=False)` after include_router, before CORS block. Env-read test ran live: `1 passed`. Full backend suite: `159 passed` (no frontend/out needed). |
| 2 | backend/uv.lock pins fastapi 0.141.1 and the full backend pytest suite stays green after the bump | ✓ VERIFIED | uv.lock:450,462 `fastapi-0.141.1` wheel/sdist + specifier `==0.141.1` (uv.lock:540); pyproject.toml:8 `fastapi==0.141.1`. `uv run --extra dev pytest -q` → `159 passed, 2 warnings in 10.16s`. |
| 3 | docker build -t finally:latest . succeeds with a 3-stage image; runtime stage runs non-root USER app with no node/source | ✓ VERIFIED | Dockerfile:5,13,21 exactly 3 stages. `docker image inspect finally:latest` → `USER=app`, `WORKDIR=/app`, exec-form CMD `["/app/.venv/bin/uvicorn","app.main:app","--host","0.0.0.0","--port","8000"]`, `{"8000/tcp":{}}`. The E2E run rebuilt test-app from this Dockerfile successfully (CR-02-pinned `uv:0.12.6-python3.12-trixie-slim` both stages). Info: runtime base IS the uv image (unused toolchain — review IF-02, non-blocking); no node and no project source in runtime. |
| 4 | docker run -v finally-data:/app/db -p 8000:8000 finally:latest serves /, returns /api/health healthy, streams SSE, and a REST buy of 5 AAPL survives docker restart (cash < 10000) | ✓ VERIFIED | Live smoke test (throwaway container, same mechanism): health poll OK; `/` HTML matches `__next`; SSE `data:` frame within 4s; POST buy 5 AAPL → `docker restart` → health OK → `cash_balance = 9050.2 < 10000`; `docker exec whoami` = `app`; `ls /app/db` = `finally.db`. `finally-data` volume exists on host. |
| 5 | start_windows.ps1 run twice in a row exits 0 both times and leaves one finally container serving :8000 | ✓ VERIFIED | Script content: build-if-missing guard (line 5-6), `docker rm -f finally 2>$null \| Out-Null` (line 13 — suppressed-error no-op is the idempotency linchpin), fixed run line with `-v finally-data:/app/db -p 8000:8000` (line 20), health-gated URL echo (lines 24-35). Executor's plan-verify functional proof recorded: double-start exit 0, trade survives stop→start (cash 8480.29). Not re-run live to avoid mutating the production finally-data volume. |
| 6 | stop_windows.ps1 removes the container but never the finally-data volume; a trade made before stop survives stop → start | ✓ VERIFIED | stop_windows.ps1 contains only `docker rm -f finally 2>$null \| Out-Null` with explicit volume-preservation comment. Re-verified live: `& ./scripts/stop_windows.ps1` → exit 0 on absent container; `docker ps -a --filter name=^finally$` → 0 containers; `docker volume ls` → `finally-data` retained. Executor's proof: 3-AAPL trade survived stop→start via the volume. |
| 7 | Start scripts build the image when missing, pass --env-file .env only when the file exists, and gate readiness on a /api/health poll before printing the URL | ✓ VERIFIED | start_mac.sh:6 (inspect guard), :13 (conditional env-file), :19-23 (30×2s poll + gated echo); start_windows.ps1:5-6, :16-17, :24-35 (poll success tracked, URL only when healthy, exit 1 with message otherwise). |
| 8 | The sh scripts are the verified logic mirrored for macOS/Linux (docker rm -f with 2>/dev/null \|\| true, curl health poll) | ✓ VERIFIED | Both sh scripts mirror the ps1 pair exactly with shell idioms. `wsl bash -n scripts/start_mac.sh` → exit 0; `wsl bash -n scripts/stop_mac.sh` → exit 0. Live execution on a real macOS/Linux host deferred to human (see Human Verification). |
| 9 | test/package.json pins @playwright/test exactly 1.62.0 (no caret) with a committed package-lock.json | ✓ VERIFIED | package.json:7 `"@playwright/test": "1.62.0"` (no caret); test/package-lock.json committed; the E2E run used this exact pin (`Running 6 tests using 1 worker` against the v1.62.0 browser image). |
| 10 | playwright.config.ts sets testDir ./tests, fullyParallel false, workers 1, retries 0, chromium headless, baseURL from PLAYWRIGHT_BASE_URL with localhost:8000 fallback | ✓ VERIFIED | All properties present (playwright.config.ts:8-16). Serial mode confirmed at runtime: `Running 6 tests using 1 worker`. BaseURL effective: `PLAYWRIGHT_BASE_URL=http://app.test:8000` in compose. |
| 11 | docker-compose.test.yml boots app (build ../, LLM_MOCK=true, finally-test-data volume, urllib healthcheck) + playwright (FROM mcr.microsoft.com/playwright:v1.62.0-jammy, ipc: host, PLAYWRIGHT_BASE_URL, depends_on app healthy, specs volume-mounted, profiles: [e2e]) | ✓ VERIFIED | All elements present (docker-compose.test.yml:9-46), plus the 04-04 blocker fixes (`app.test` network alias :18-23, config volume-mount :42). Live proof: the full E2E run booted test-app-1 → `Container test-app-1 Healthy` → playwright ran → all containers/volume/network cleaned up. |
| 12 | run-e2e.sh/.ps1 lead with down -v (wipes finally-test-data for the deterministic $10k fresh start) and always run down -v on exit regardless of test status | ✓ VERIFIED | CR-01 fix present in run-e2e.sh: `set +e` around the playwright run (:24-27) + EXIT trap running down -v (:9-14); WR-04 fix in run-e2e.ps1: `try/finally` with the trailing down -v in `finally` (:22-25). Live proof: the suite ran and the cleanup executed — `Container test-app-1 Removed`, `Volume test_finally-test-data Removed`, `Network test_default Removed`. |
| 13 | The six specs pass serially against the compose app in numeric-prefix order 01-fresh-start → 02-watchlist → 03-trading → 04-visualizations → 05-chat → 06-sse-reconnect | ✓ VERIFIED | Ran `& ./test/run-e2e.ps1` live: all 6 specs executed in order under 1 worker — 01 (909ms), 02 (2.8s), 03 (785ms), 04 (703ms), 05 (929ms), 06 (3.9s) — `6 passed (11.4s)`. Spec content asserts the planned behaviors (fresh $10,000.00, PYPL add→stream→remove, buy 10/sell 5 AAPL, heatmap/P&L/positions, `[mock] Acknowledged` + inline AAPL buy confirmation, connected→reconnecting→connected + price change). |
| 14 | run-e2e (down -v → up --build -d app → npx playwright test → down -v) exits 0 — the deterministic fresh-state gate | ✓ VERIFIED | `E2E_EXIT_CODE=0` from my live run. Executor recorded a second consecutive green run (exit 0 twice). Deterministic fresh state proven: each run's leading down -v wiped the test volume. |
| 15 | Specs assert only the selectors the frontend already ships: connection-dot/sparkline-{ticker}/heatmap-cell-{name} testids, aria-label connection states, role buttons Buy/Sell/Add/Remove {ticker}, placeholder 'Ask the AI to trade…' | ✓ VERIFIED | Cross-referenced every selector against shipped components: Header.tsx:34-35 (connection-dot + aria-label), Sparkline.tsx:35, Heatmap.tsx:40, TickerRow.tsx:62,92 (data-ticker + Remove aria-label), ChatPanel.tsx:137 (placeholder), TradeBar.tsx (Buy/Sell labels). Mock chat shape matched to service.py:56-57 (`[mock] Acknowledged` + AAPL buy qty 1). The green E2E run is the runtime proof. |

**Score:** 15/15 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `Dockerfile` | 3-stage, non-root runtime, exec-form CMD | ✓ VERIFIED | Verified by read + image inspect + successful E2E rebuild |
| `.dockerignore` | excludes .env/.env.local/build artifacts | ✓ VERIFIED | 16 entries incl. `**/.env`, `**/.env.local`, `**/.env.*`, frontend/out, frontend/.next (WR-02 fix present) |
| `backend/app/main.py` | FINALLY_DB_PATH read, app.frontend mount | ✓ VERIFIED | Lines 35, 86; env-read test passes |
| `backend/uv.lock` + `pyproject.toml` | fastapi 0.141.1 pinned | ✓ VERIFIED | ==0.141.1 both files |
| `backend/tests/test_app.py` | env-read unit test | ✓ VERIFIED | test_db_path_reads_finally_db_path_env passes |
| `.gitignore` + `db/.gitkeep` | finally.db ignored, db/ tracked | ✓ VERIFIED | .gitignore:65-67; db/.gitkeep exists; no stray db file in git |
| `scripts/start_mac.sh` | idempotent start, health-gated | ✓ VERIFIED | All elements; wsl syntax OK; live mac/linux run → human |
| `scripts/stop_mac.sh` | volume-preserving stop | ✓ VERIFIED | rm -f only; wsl syntax OK |
| `scripts/start_windows.ps1` | idempotent start, health-gated | ✓ VERIFIED | All elements; executor double-start proof |
| `scripts/stop_windows.ps1` | volume-preserving stop | ✓ VERIFIED | rm -f only; live no-op verified (exit 0) |
| `test/package.json` + lock | @playwright/test exactly 1.62.0 | ✓ VERIFIED | No caret; committed lockfile |
| `test/playwright.config.ts` | serial headless chromium, env baseURL | ✓ VERIFIED | All properties; serial confirmed at runtime |
| `test/playwright.Dockerfile` | FROM mcr v1.62.0-jammy, npm ci | ✓ VERIFIED | Browser set matched to npm pin (04-03 evidence) |
| `test/docker-compose.test.yml` | app + playwright, finally-test-data, profiles:[e2e] | ✓ VERIFIED | All elements incl. 04-04 fixes |
| `test/run-e2e.sh` | down -v → up app → run → unconditional down -v | ✓ VERIFIED | CR-01 trap fix present |
| `test/run-e2e.ps1` | same orchestration | ✓ VERIFIED | try/finally cleanup; live run exit 0 |
| `test/tests/01-06-*.spec.ts` | six E2E scenarios | ✓ VERIFIED | All six substantive; 6/6 green live |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| Dockerfile WORKDIR /app + static mount | app.frontend(directory="static") + FINALLY_DB_PATH default | /app/db/finally.db volume target | ✓ WIRED | Verified by read + live `ls /app/db` = `finally.db` |
| .dockerignore .env.local exclusion | NEXT_PUBLIC_API_BASE unset in build | relative /api/* same-origin | ✓ WIRED | api.ts:3 `process.env.NEXT_PUBLIC_API_BASE ?? ''`; E2E asserted live data over same-origin |
| Spec selectors | frontend components (Header/Sparkline/Heatmap/TickerRow/ChatPanel) | data-testid/aria-label/role queries | ✓ WIRED | All selectors exist in shipped components; specs green |
| chat.spec mock assertions | backend/app/chat/service.py:56-57 | LLM_MOCK=true call-time read | ✓ WIRED | service.py:46 call-time read; mock shape matches spec assertions |
| run-e2e down -v | finally-test-data wipe | deterministic $10k fresh start | ✓ WIRED | Live run: volume created → wiped → removed |
| uv sync --locked | pinned uv.lock (fastapi 0.141.1) | Docker build reproducibility | ✓ WIRED | Build succeeded with `--locked` both phases |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| Header cash ($10,000.00 assertion) | portfolio.cash_balance | GET /api/portfolio → SQLite | Yes | ✓ FLOWING (E2E 01 asserted the seeded value; E2E 03/05 asserted post-trade deltas) |
| Sparklines + price cells | PriceUpdate stream | /api/stream/prices SSE → simulator | Yes | ✓ FLOWING (E2E 01/02 asserted live price change within 5s) |
| Heatmap cells / P&L chart / positions table | positions + history | /api/portfolio + /api/portfolio/history → SQLite | Yes | ✓ FLOWING (E2E 04 asserted cells after real TSLA buy) |
| Chat confirmations | structured trades field | POST /api/chat mock → execute_trade → SQLite | Yes | ✓ FLOWING (E2E 05 asserted cash decreased by the executed buy) |
| SSE reconnect state | connection dot aria-label | EventSource onerror/onopen | Yes | ✓ FLOWING (E2E 06 asserted the real transition) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Env-read unit test | `uv run --extra dev pytest "tests/test_app.py::TestAppSmoke::test_db_path_reads_finally_db_path_env" -q` | `1 passed in 5.80s` | ✓ PASS |
| Backend regression after fastapi bump | `uv run --extra dev pytest -q` (backend/) | `159 passed, 2 warnings in 10.16s` | ✓ PASS |
| finally:latest image config | `docker image inspect finally:latest --format 'USER/WORKDIR/CMD/PORTS'` | USER=app, WORKDIR=/app, exec uvicorn CMD, 8000/tcp | ✓ PASS |
| Container serves app | throwaway `docker run -p 8000:8000 finally:latest` + health poll | HEALTH_OK; `/` matches `__next`; SSE `data:` frame emitted | ✓ PASS |
| Restart persistence | POST buy 5 AAPL → `docker restart` → GET /api/portfolio | cash_balance 9050.2 < 10000 | ✓ PASS |
| Non-root + volume target | `docker exec <c> whoami` / `ls /app/db` | `app` / `finally.db` | ✓ PASS |
| Stop idempotency (no-op) | `& ./scripts/stop_windows.ps1` on absent container | exit 0; 0 containers; finally-data retained | ✓ PASS |
| sh syntax validity | `wsl bash -n scripts/start_mac.sh && wsl bash -n scripts/stop_mac.sh` | both exit 0 | ✓ PASS |
| **Full E2E suite (SC4 gate)** | `& ./test/run-e2e.ps1` | **6 passed (11.4s); exit 0; containers/network/volume cleaned up** | ✓ PASS |
| Host state after suite | `docker ps -a` + `docker volume ls` | 0 phase containers; only finally-data retained | ✓ PASS |

### Probe Execution

Step 7c: SKIPPED — no `probe-*.sh` scripts exist in this phase; the phase's runnable gates are the plan `<verify>` commands (backend pytest, docker build, run-e2e), all of which were executed directly above.

### Requirements Coverage

All six phase requirement IDs from REQUIREMENTS.md are claimed by the four plans and every one is satisfied by implementation evidence. No orphans.

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| DEPLOY-01 | 04-01 | Single Docker container on :8000 serves FastAPI + static Next.js export | ✓ SATISFIED | Live smoke test: / serves __next HTML, /api/health 200, SSE frames, working API (trades executed) |
| DEPLOY-02 | 04-01 | Multi-stage Dockerfile | ✓ SATISFIED | 3 stages verified (node:22-slim build → uv python3.12 deps → non-root runtime). NOTE: REQUIREMENTS text says "Node 20" — implementation uses node:22-slim, a user-confirmed deviation (A1; Node 20 EOL 2026-04), documented in 04-RESEARCH.md:51,387 |
| DEPLOY-03 | 04-01 | SQLite persists via named volume finally-data:/app/db | ✓ SATISFIED | Volume exists; live restart persistence proven (cash 9050.2 < 10000 after restart); /app/db/finally.db exact target |
| DEPLOY-04 | 04-02 | Idempotent start/stop scripts (macOS/Linux + Windows) | ✓ SATISFIED | All 4 scripts present with all required patterns; ps1 functionally proven (double-start exit 0, trade survives stop→start); sh syntax-validated (live mac/linux run → human item) |
| TEST-01 | 04-03 | Playwright E2E infra (docker-compose.test.yml + container, LLM_MOCK=true) | ✓ SATISFIED | Stack verified + live-booted; LLM_MOCK=true; finally-test-data isolation; images build from committed sources |
| TEST-02 | 04-04 | E2E scenarios: fresh start, watchlist CRUD, buy/sell, visualizations, mocked chat, SSE reconnection | ✓ SATISFIED | All six specs ran green live (6/6, exit 0) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | TBD/FIXME/XXX/debt markers | — | Zero markers in any phase artifact (grep across Dockerfile, .dockerignore, main.py, test_app.py, all 4 scripts, compose, configs, 6 specs) |
| (none) | — | Stub/placeholder implementations | — | No stub returns, empty handlers, or hardcoded data in any artifact; all specs assert live behavior (the only "placeholder" hit is the Playwright `getByPlaceholder` API for the real chat input) |

**Code-review disposition:** 04-REVIEW.md found 2 critical + 4 warnings. CR-01 (run-e2e.sh set -e cleanup trap), CR-02 (floating uv base tag), WR-02 (dockerignore .env globs), WR-04 (PowerShell cleanup robustness) are all FIXED in commit `01d3ec4` — re-verified in the actual files and by the live E2E run (cleanup executed). WR-01 (floating node:22-slim patch) and WR-03 (spec cumulative waits vs default 30s timeout) remain as accepted warnings — the suite passed in 11.4s, and the per-assertion timeouts are explicit, so neither blocks the goal. IF-02 (runtime comment vs uv base image) is informational.

### Human Verification Required

Automated evidence is complete and the phase goal is met on the evidence (15/15 truths; all 4 success criteria hold). Two plan-deferred manual sign-offs from 04-VALIDATION.md / 04-02 coverage metadata remain:

### 1. macOS/Linux shell scripts live execution (DEPLOY-04)

**Test:** On a real macOS or Linux host, run `scripts/start_mac.sh` twice consecutively, then `scripts/stop_mac.sh`, then `scripts/start_mac.sh` again; make a trade (e.g. buy 3 AAPL via the API or UI) before the stop and confirm it survives the stop → start cycle.
**Expected:** Both start invocations exit 0 (second start replaces the running container without error); stop leaves 0 containers while the `finally-data` volume is retained; the pre-stop trade is visible after the final start (cash_balance < 10000).
**Why human:** The sh pair was WSL-syntax-validated and logic-mirrored against the functionally-proven ps1 pair, but has never executed on an actual macOS/Linux host. This verification host is Windows-only.

### 2. Repeated interactive start/stop UX (DEPLOY-04)

**Test:** Run the start/stop lifecycle interactively on Windows (`start_windows.ps1` → trade → `stop_windows.ps1` → `start_windows.ps1`) and judge the repeated-interactive experience.
**Expected:** No errors on any invocation; "FinAlly running at http://localhost:8000" is printed only after `/api/health` responds; the pre-stop trade survives through `finally-data`.
**Why human:** 04-VALIDATION.md lists repeated-interactive semantics as manual-only — automated runs cover exit codes, not interactive shell-script UX feel.

### Gaps Summary

No gaps. All 15 plan must-have truths are VERIFIED with direct codebase/live-run evidence; all 6 requirement IDs (DEPLOY-01..04, TEST-01..02) are satisfied; the 4 roadmap success criteria were re-verified live (container boot + static/API/SSE surface, restart persistence with a real trade, script idempotency content + executor functional proof, and the full 6/6 E2E suite). The two critical code-review findings (CR-01, CR-02) plus WR-02/WR-04 are fixed and included in the verified state. The `human_needed` status is driven solely by the two plan-deferred manual sign-offs above — every automated check passes.

---

_Verified: 2026-08-26_
_Verifier: the agent (gsd-verifier)_
