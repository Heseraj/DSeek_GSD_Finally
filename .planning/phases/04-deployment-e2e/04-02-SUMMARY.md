---
phase: 04-deployment-e2e
plan: 02
subsystem: infra
tags: [docker, shell, powershell, idempotency, healthcheck, deployment]

# Dependency graph
requires:
  - phase: 04-deployment-e2e
    provides: 04-01 tracer (Dockerfile, finally:latest image, finally-data volume, live container on :8000)
provides:
  - Idempotent start/stop lifecycle scripts (macOS/Linux sh + Windows PowerShell) for the single-container deployment
  - Health-poll-gated readiness (30x2s /api/health) before the URL is printed
  - Volume-preserving stop contract (finally-data never removed)
affects:
  - 04-03 (E2E stack — host left clean for wave 3)
  - Phase gate / 04-VALIDATION.md (manual repeated start/stop UX sign-off)

# Actuals (#2632) — pairs with the plan estimate (8000 tokens) to calibrate future estimates
actuals:
  tokens: 800
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotent docker lifecycle: fixed container name + suppressed-error rm -f (no-op when absent)"
    - "Health-poll gate: 30x2s /api/health poll before declaring ready (Pitfall 6)"
    - "Volume-preserving stop: stop removes the container, never finally-data (DEPLOY-03)"
    - "sh <-> PowerShell mirroring: 2>/dev/null -> 2>$null, curl -> Invoke-WebRequest -UseBasicParsing"
    - "Build-if-missing guard: docker image inspect finally:latest before docker build"

key-files:
  created:
    - scripts/start_mac.sh
    - scripts/stop_mac.sh
    - scripts/start_windows.ps1
    - scripts/stop_windows.ps1

key-decisions:
  - "Build-if-missing guard (docker image inspect finally:latest >/dev/null 2>&1 || docker build) in both start scripts — a second run skips the build"
  - "Health-gated URL echo in BOTH script pairs: URL prints only after /api/health responds; PowerShell exits 1 when the 30x2s poll is exhausted (mirrors sh set -e fail-fast)"
  - "No --rm and no --workers anywhere: named container is the stop model; single-process invariant preserved"
  - "Conditional --env-file .env only when the file exists — keys reach the container at runtime, never baked (T-04-01)"

patterns-established:
  - "Pattern 1: fixed-name container lifecycle with suppressed errors = idempotency (double-start exits 0)"
  - "Pattern 2: stop never removes finally-data; trade survives stop -> start via the volume"

requirements-completed: [DEPLOY-04]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "macOS/Linux start/stop scripts (start_mac.sh, stop_mac.sh) — idempotent lifecycle with build-if-missing guard, suppressed rm -f finally, conditional --env-file, health-poll gate, volume-preserving stop"
    requirement: DEPLOY-04
    verification:
      - kind: other
        ref: "wsl bash -n scripts/start_mac.sh && wsl bash -n scripts/stop_mac.sh (both exit 0)"
        status: pass
    human_judgment: true
    rationale: "sh pair is WSL-syntax-validated and logic-mirrors the functionally-proven ps1 pair, but was not executed on a macOS/Linux host; the 04-02 SUMMARY's line-by-line mirror review is the evidence, not a real run"
  - id: D2
    description: "Windows start/stop scripts (start_windows.ps1, stop_windows.ps1) — functional idempotency and persistence proof on the host: double-start exit 0, stop leaves 0 containers with volume retained, 3 AAPL trade survives stop -> start (cash < 10000)"
    requirement: DEPLOY-04
    verification:
      - kind: e2e
        ref: "& ./scripts/start_windows.ps1; ... (plan 04-02 Task 2 <verify> command, ran verbatim — ALL PASSED)"
        status: pass
    human_judgment: false

# Metrics
duration: 10min
completed: 2026-08-27
status: complete
---

# Phase 4 Plan 2: Idempotent Start/Stop Scripts Summary

**Idempotent start/stop lifecycle for the single-container FinAlly deployment: four scripts (macOS/Linux sh + Windows PowerShell) with build-if-missing guard, suppressed `docker rm -f finally`, conditional `--env-file .env`, 30x2s `/api/health` poll gate, and a volume-preserving stop — proven on the Windows host (double-start exit 0; a 3-AAPL trade survives stop → start through `finally-data`).**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-27T05:31:00Z (approx)
- **Completed:** 2026-08-27T05:41:18Z
- **Tasks:** 2
- **Files modified:** 4 created

## Accomplishments

- **start_mac.sh / start_windows.ps1**: `set -e`/`$ErrorActionPreference = 'Stop'`; build-if-missing (`docker image inspect finally:latest` guard); `docker rm -f finally 2>/dev/null || true` / `2>$null` (the idempotency linchpin — cleanly replaced the live 04-01 tracer container on first run); conditional `--env-file .env` (runtime-only key injection, T-04-01); fixed run line `-v finally-data:/app/db -p 8000:8000` with no `--rm`; 30x2s `/api/health` poll gate before the URL echo.
- **stop_mac.sh / stop_windows.ps1**: suppressed `docker rm -f finally` only — the `finally-data` volume is deliberately never removed (DEPLOY-03).
- **Functional proof (plan's `<verify>` verbatim, ALL PASSED):** double-start exits 0 both times; stop leaves 0 `^finally$` containers while `finally-data` volume is retained; a buy of 3 AAPL (cash 9050.2 → 8480.29) survives stop → start with cash_balance 8480.29 < 10000; host left clean for wave 3.
- **sh pair validation:** `wsl bash -n` syntax checks pass (exit 0) on both scripts; content verified against every plan acceptance criterion.

## Task Commits

Each task was committed atomically:

1. **Task 1: scripts/start_mac.sh + scripts/stop_mac.sh (macOS/Linux, idempotent, health-poll gated)** - `e411563` (feat)
2. **Task 2: scripts/start_windows.ps1 + scripts/stop_windows.ps1 + functional idempotency/persistence proof** - `359c84c` (feat)

**Plan metadata:** `(docs: complete plan)` — committed in the close-out commit below.

## Files Created/Modified

- `scripts/start_mac.sh` - macOS/Linux idempotent start: build-if-missing → suppressed rm -f finally → run -d with finally-data:/app/db + optional --env-file .env → 30x2s /api/health gate → URL echo
- `scripts/stop_mac.sh` - macOS/Linux idempotent stop: suppressed docker rm -f finally only; volume never removed
- `scripts/start_windows.ps1` - PowerShell mirror (2>$null, Invoke-WebRequest -UseBasicParsing) with identical lifecycle semantics
- `scripts/stop_windows.ps1` - PowerShell mirror of the stop; volume never removed

## Decisions Made

- **Build-if-missing guard** in both start scripts: `docker image inspect finally:latest >/dev/null 2>&1 || docker build -t finally:latest .` — second runs skip the build (matches plan action; extends the RESEARCH skeleton which lacked the guard).
- **Health-gated URL echo in both pairs**: PowerShell mirrors the sh `set -e` fail-fast — if the 30x2s poll is exhausted the ps1 prints a failure message and exits 1 instead of printing "running" against a dead port (plan must-have truth: "gate readiness on a /api/health poll before printing the URL").
- **No `--rm`, no `--workers`** anywhere — named container is the stop model; single-process invariant preserved.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] PowerShell build/run failure fast-exit**
- **Found during:** Task 2 (start_windows.ps1)
- **Issue:** With `$ErrorActionPreference = 'Stop'`, native command failures (docker build/run) do NOT throw in PowerShell 7 — a failed `docker build` would cascade into the 60s health-poll timeout and exit 1 only after a confusing delay, instead of failing immediately at the source.
- **Fix:** Added `if ($LASTEXITCODE -ne 0) { Write-Host ...; exit 1 }` after both `docker build` and `docker run` — mirrors the sh script's `set -e` fail-fast semantics exactly.
- **Files modified:** scripts/start_windows.ps1
- **Verification:** canonical verify passed; failure paths short-circuit without the health-poll wait
- **Committed in:** 359c84c (Task 2 commit)

**2. [Rule 2 - Missing Critical] PowerShell health-gate before URL echo**
- **Found during:** Task 2 (start_windows.ps1)
- **Issue:** The plan's action snippet showed an unconditional `Write-Host "FinAlly running..."` after the poll loop, which contradicts the plan's own must-have truth ("start scripts ... gate readiness on a /api/health poll (Pitfall 6) before printing the URL") and the sh script's `curl -sf ... && echo` gate.
- **Fix:** Tracked poll success (`$healthy`) and print the URL only when the final check succeeded; exit 1 with a clear message when the 30x2s budget is exhausted.
- **Files modified:** scripts/start_windows.ps1
- **Verification:** canonical verify passed — "FinAlly running at http://localhost:8000" printed only after health
- **Committed in:** 359c84c (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 missing critical)
**Impact on plan:** Both are fail-fast/readiness-accuracy fixes for the PowerShell mirror — no scope creep, no behavior change to the proven sh semantics.

## Issues Encountered

- PowerShell string interpolation parse errors during the manual proof loop (literal `^finally$` filter needed backtick-escaping in double-quoted strings) — fixed in the command itself, no artifact impact.
- The plan's Task 2 `<verify>` command's `$LASTEXITCODE` checks ran correctly in the host session; the full canonical verify passed end-to-end (logged above).

## User Setup Required

None - no external service configuration required. `.env` is optional and only wired through when present (runtime-only key injection).

## Next Phase Readiness

- Host left clean for wave 3: 0 `finally` containers; `finally-data` volume retained with the trade persisted.
- The container contract is locked: fixed name `finally`, volume `finally-data`, port 8000, env via `--env-file` only when present — 04-03's E2E stack uses the separate `finally-test-data` volume (T-04-06).
- Manual-only items from 04-VALIDATION.md (repeated interactive start/stop UX feel, docker-run restart persistence) remain surfaced for human sign-off at the phase gate; the automated checks cover their substance.

## Self-Check: PASSED

- Files verified on disk: scripts/start_mac.sh, scripts/stop_mac.sh, scripts/start_windows.ps1, scripts/stop_windows.ps1, 04-02-SUMMARY.md — all FOUND
- Commits verified in git log: e411563 (Task 1), 359c84c (Task 2) — both FOUND

---
*Phase: 04-deployment-e2e*
*Completed: 2026-08-27*
