---
phase: 04-deployment-e2e
plan: 03
subsystem: testing
tags: [playwright, docker, docker-compose, e2e, test-infra]

# Dependency graph
requires:
  - phase: 04-01
    provides: Root 3-stage Dockerfile + .dockerignore consumed by compose `build: ..`
provides:
  - test/ npm package with @playwright/test exact-pinned 1.62.0 (committed lockfile)
  - test/playwright.config.ts — serial (workers 1, fullyParallel false), headless chromium, env baseURL
  - test/playwright.Dockerfile — official mcr.microsoft.com/playwright:v1.62.0-jammy + npm ci
  - test/docker-compose.test.yml — app (LLM_MOCK, finally-test-data, urllib healthcheck) + profile-guarded playwright service
  - test/run-e2e.sh / run-e2e.ps1 — down -v fresh-state orchestration
  - Volume contract: finally-test-data (test-only; production stays finally-data)
affects: [04-04 (six E2E specs land on this stack), verify-work]

actuals:
  tokens: 1604    # chars/4 over the 8 realized files (plan estimate: 12000)
  tasks: 2
  commits: 2

tech-stack:
  added:
    - "@playwright/test" (exact 1.62.0, npm, devDependency in test/)
    - "mcr.microsoft.com/playwright:v1.62.0-jammy" (official browser image)
    - "Docker Compose v2 test stack" (test-only; production stays single-container)
  patterns:
    - Profile-guarded test service: playwright behind `profiles: ["e2e"]` so bare `up` never auto-runs the suite
    - Disposable test volume + leading `down -v` = deterministic seeded $10k fresh start (Pattern 4 / Pitfall 4)
    - Service-scoped `up --build -d app` + explicit `run --rm playwright` orchestration

key-files:
  created:
    - test/package.json — finally-e2e, private, exact pin 1.62.0
    - test/package-lock.json — committed lockfile (npm ci in image)
    - test/playwright.config.ts — testDir ./tests, fullyParallel false, workers 1, retries 0, headless chromium, PLAYWRIGHT_BASE_URL ?? localhost:8000
    - test/playwright.Dockerfile — FROM mcr.microsoft.com/playwright:v1.62.0-jammy, npm ci only
    - test/docker-compose.test.yml — app + playwright services, finally-test-data volume
    - test/run-e2e.sh — down -v -> up --build -d app -> run --rm playwright -> down -v
    - test/run-e2e.ps1 — PowerShell mirror (--remove-orphans, $LASTEXITCODE)
    - test/.gitignore — node_modules + Playwright artifacts (Rule 2)
  modified: []

key-decisions:
  - "Playwright service sits behind profiles: [e2e] so `docker compose up` never auto-runs the suite; run-e2e invokes it explicitly via `run --rm playwright` (BLOCKER FIX per plan)"
  - "Bare `docker compose build` skips profile-guarded services by design — the playwright image requires `--profile e2e build` (or is auto-built by `docker compose run` when missing)"
  - "test/.gitignore added — the root .gitignore is Python-oriented with no node_modules pattern; without it a dry-run `git add test/` staged ~300 node_modules files"
  - "Compose stack uses its own images (test-app / test-playwright under project 'test') and its own finally-test-data volume — independent of finally:latest / finally-data; stale v1.48.0-jammy image untouched"

patterns-established:
  - "E2E determinism via dedicated test volume + leading down -v: run-e2e always wipes finally-test-data so every suite starts from the seeded $10k profile"
  - "Service-scoped compose ops: `up --build -d app` targets only the app service; the profile-guarded playwright service is started solely by explicit `run --rm playwright`"

requirements-completed: [TEST-01]

coverage:
  - id: D1
    description: "test/ npm package with @playwright/test exact-pinned 1.62.0 + committed lockfile + serial headless playwright.config.ts (testDir ./tests, fullyParallel false, workers 1, retries 0, baseURL PLAYWRIGHT_BASE_URL ?? http://localhost:8000)"
    requirement: TEST-01
    verification:
      - kind: manual_procedural
        ref: "cd test && npm ls @playwright/test -> @playwright/test@1.62.0; npx playwright --version -> Version 1.62.0"
        status: pass
    human_judgment: false
  - id: D2
    description: "Compose test stack builds both images — test-app (root Dockerfile, LLM_MOCK=true, finally-test-data, urllib healthcheck) and test-playwright (FROM mcr.microsoft.com/playwright:v1.62.0-jammy with the matching 1.62.0 browser set)"
    requirement: TEST-01
    verification:
      - kind: manual_procedural
        ref: "docker compose -f test/docker-compose.test.yml config --quiet (exit 0); docker compose -f test/docker-compose.test.yml --profile e2e build playwright (exit 0)"
        status: pass
    human_judgment: false
  - id: D3
    description: "run-e2e.sh / run-e2e.ps1 orchestration — leading down -v (wipes finally-test-data), service-scoped up --build -d app, explicit run --rm playwright, trailing unconditional down -v; compose run auto-builds the missing playwright image"
    requirement: TEST-01
    verification:
      - kind: manual_procedural
        ref: "content grep (4 required elements per script) + docker compose run --rm --no-deps playwright npx playwright --version (auto-build + Version 1.62.0, exit 0)"
        status: pass
    human_judgment: true
    rationale: "Full run-e2e.sh suite execution is deferred to the 04-04 phase gate (the six specs land next wave; an empty testDir makes playwright exit 1 by design). This plan verified script content, compose validity, both image builds, and the run auto-build path."

# Metrics
duration: 15min
completed: 2026-08-26
status: complete
---

# Phase 4 Plan 03: E2E Test Infrastructure (TEST-01) Summary

**Playwright E2E test stack: exact-pinned @playwright/test 1.62.0 npm package + serial headless config, official v1.62.0-jammy browser image, profile-guarded two-service test compose stack, and down -v fresh-state run-e2e orchestration in sh + PowerShell**

## Performance

- **Duration:** 15 min
- **Started:** 2026-08-26T22:39:00Z
- **Completed:** 2026-08-26T22:54:15Z
- **Tasks:** 2
- **Files modified:** 8 created

## Accomplishments

- **test/ npm package** — `finally-e2e` (private, `test` → `playwright test`) with `@playwright/test` pinned **exactly** `1.62.0` (no caret) and a committed `package-lock.json` for reproducible `npm ci` in the browser image; `npx playwright --version` prints `Version 1.62.0`
- **test/playwright.config.ts** — `testDir ./tests`, `fullyParallel: false`, `workers: 1`, `retries: 0`, headless chromium, `baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8000'` (A7 serial-only — the six specs share one mutable SQLite DB)
- **test/playwright.Dockerfile** — `FROM mcr.microsoft.com/playwright:v1.62.0-jammy` (tag matched to the npm pin, A6), `WORKDIR /test`, `COPY package.json package-lock.json ./` + `RUN npm ci`. No `playwright install` (browsers preinstalled), no tests COPY (specs volume-mounted so 04-04 needs no image rebuild). Verified: in-image browsers `chromium-1234 / firefox-1538 / webkit-2336 / ffmpeg-1011` **exactly** match playwright-core 1.62.0's expected revisions
- **test/docker-compose.test.yml** — `app` (`build: ..` from the root Dockerfile, `LLM_MOCK=true`, `finally-test-data:/app/db` — a different volume from production `finally-data`, python-urllib healthcheck 2s/3s/30 since the slim image ships no curl) + `playwright` (**`profiles: ["e2e"]`** so bare `docker compose up` never auto-runs the suite, `ipc: host`, `depends_on app: service_healthy`, `PLAYWRIGHT_BASE_URL=http://app:8000`, `./tests:/test/tests`, `working_dir /test`, `command: npx playwright test`)
- **test/run-e2e.sh + test/run-e2e.ps1** — leading `down -v` (wipes finally-test-data → deterministic seeded $10k fresh start, Pitfall 4), **service-scoped** `up --build -d app` (explicit given the profile), explicit `run --rm playwright npx playwright test`, trailing **unconditional** `down -v` before `exit $status`; the .ps1 mirror adds `--remove-orphans` and `$LASTEXITCODE`
- **Runtime-path proof** — `docker compose run` auto-builds a missing playwright image (verified by removing `test-playwright` then re-running — image rebuilt from cached MCR base, `Version 1.62.0` printed): run-e2e is self-sufficient on a fresh machine

## Task Commits

Each task was committed atomically:

1. **Task 1: test/ npm package (@playwright/test@1.62.0 exact) + playwright.config.ts** - `ae9e359` (feat)
2. **Task 2: playwright.Dockerfile + docker-compose.test.yml + run-e2e.sh/.ps1** - `433029a` (feat)

**Plan metadata:** (pending final metadata commit)

## Files Created/Modified

- `test/package.json` - finally-e2e package, exact `"@playwright/test": "1.62.0"` pin
- `test/package-lock.json` - committed lockfile, lockfileVersion 3, root pin 1.62.0
- `test/playwright.config.ts` - serial headless chromium config with env baseURL fallback
- `test/playwright.Dockerfile` - official v1.62.0-jammy browser image + npm ci
- `test/docker-compose.test.yml` - app + playwright services, finally-test-data volume
- `test/run-e2e.sh` - deterministic E2E orchestration (sh)
- `test/run-e2e.ps1` - deterministic E2E orchestration (PowerShell)
- `test/.gitignore` - node_modules + Playwright test artifacts (Rule 2 addition)

## Decisions Made

- **Profile-guarded playwright service** (per plan BLOCKER FIX): `profiles: ["e2e"]` keeps `docker compose up` scoped to the app service so the suite never auto-runs and mutates the test DB before the explicit invocation
- **Bare `build` skips profile services**: `docker compose -f test/docker-compose.test.yml build` exits 0 but only produces `test-app`; the playwright image needs the profile-aware `--profile e2e build playwright` (or is auto-built by `run --rm playwright`). No code change — a natural consequence of the profile design
- **test/.gitignore added (Rule 2)**: the root .gitignore is Python-oriented and has no `node_modules` pattern; a dry-run `git add test/` staged ~300 node_modules files. Per-repo convention (frontend/.gitignore) applied
- **Independent compose project**: the stack builds its own `test-app`/`test-playwright` images and `test_finally-test-data` volume — independent of `finally:latest`/`finally-data`; the stale `mcr.microsoft.com/playwright:v1.48.0-jammy` image is not reused

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added test/.gitignore (node_modules + Playwright artifacts)**
- **Found during:** Task 1 (test/ npm package)
- **Issue:** The root .gitignore has no `node_modules` pattern (it is Python-oriented); `git add -n test/` dry-run showed ~300 files under `test/node_modules/` would be staged — committing the dependency tree would bloat the repo and defeat `npm ci`
- **Fix:** Created `test/.gitignore` following the repo's per-package convention (`frontend/.gitignore`) with `/node_modules` plus Playwright's standard output ignores (`/test-results/`, `/playwright-report/`, `/blob-report/`, `/playwright/.cache/`) so 04-04's test runs never leave untracked artifacts
- **Files modified:** test/.gitignore
- **Verification:** `git add -n test/` now shows only the 4 intended files
- **Committed in:** ae9e359 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary correctness guard — without it the task commit would have shipped node_modules. No scope creep.

## Issues Encountered

- **Bare `docker compose build` omits the playwright image** — expected compose behavior: profile-guarded services are skipped by multi-service commands unless the profile is enabled or the service is named. Resolved by building with `--profile e2e build playwright`; the run-e2e script's `run --rm playwright` auto-build path (empirically verified) covers fresh machines. Documented for 04-04: run `docker compose -f test/docker-compose.test.yml --profile e2e build` (or just `test/run-e2e.sh`) rather than bare `build` to produce both images.

## User Setup Required

None - no external service configuration required (LLM_MOCK=true needs no API key).

## Next Phase Readiness

- 04-04 can drop the six specs into `test/tests/` (volume-mounted — no image rebuild) and run `test/run-e2e.sh`
- Both images build cleanly from committed sources; playwright image carries the 1.62.0 browser set matching the npm pin
- Full-suite execution is the 04-04 phase gate, as planned

## Self-Check: PASSED

- All 8 created files exist on disk (test/package.json, package-lock.json, playwright.config.ts, playwright.Dockerfile, docker-compose.test.yml, run-e2e.sh, run-e2e.ps1, .gitignore) + SUMMARY.md
- Commit `ae9e359` (Task 1) and `433029a` (Task 2) present in git log
- Acceptance criteria re-verified: `npm ls @playwright/test` → 1.62.0; `npx playwright --version` → 1.62.0; `docker compose -f test/docker-compose.test.yml config --quiet` → exit 0; `docker compose ... build` → exit 0; playwright image browser set matches playwright-core 1.62.0 revisions; both run-e2e scripts contain all four required elements

---
*Phase: 04-deployment-e2e*
*Completed: 2026-08-26*
