---
phase: 04-deployment-e2e
reviewed: 2026-08-26T12:00:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - Dockerfile
  - .dockerignore
  - backend/app/main.py
  - backend/tests/test_app.py
  - scripts/start_mac.sh
  - scripts/stop_mac.sh
  - scripts/start_windows.ps1
  - scripts/stop_windows.ps1
  - test/package.json
  - test/playwright.config.ts
  - test/playwright.Dockerfile
  - test/docker-compose.test.yml
  - test/run-e2e.sh
  - test/run-e2e.ps1
  - test/tests/01-fresh-start.spec.ts
  - test/tests/02-watchlist.spec.ts
  - test/tests/03-trading.spec.ts
  - test/tests/04-visualizations.spec.ts
  - test/tests/05-chat.spec.ts
  - test/tests/06-sse-reconnect.spec.ts
findings:
  critical: 2
  warning: 4
  info: 6
  total: 12
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-08-26T12:00:00Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Reviewed the FinAlly deployment surface: 3-stage Dockerfile (Next static export + uv-managed FastAPI), idempotent start/stop scripts for macOS and Windows, the compose-based Playwright E2E stack (`finally-test-data` isolation, `LLM_MOCK=true`, `app.test` alias), and six E2E specs plus backend smoke tests.

The core security model is largely honored: keys flow only via `--env-file` at runtime, the container runs as non-root `USER app` with a writable `/app/db` volume, `.dockerignore` excludes the root `.env` and `frontend/.env.local`, the Playwright base image is exactly version-matched to `@playwright/test@1.62.0`, and the E2E volume is separate from production. Lockfiles for all three ecosystems are tracked in git (`backend/uv.lock`, `frontend/package-lock.json`, `test/package-lock.json`).

The two critical findings: (1) `test/run-e2e.sh` has a `set -e` trap — a failing test run aborts the script *before* the trailing `down -v`, directly contradicting the script's own "ALWAYS runs" comment and breaking the deterministic-cleanup contract; (2) the `ghcr.io/astral-sh/uv:python3.12-trixie-slim` base image carries **no version component at all**, floating to the latest uv release on every rebuild — a supply-chain/reproducibility violation of the phase's own "pinned base images" requirement (the playwright image proves the project knows how to pin). Several WARNINGs cover the floating `node:22-slim` tag, `.dockerignore` gaps for non-root `.env` files, E2E specs whose cumulative waits exceed Playwright's default 30s test timeout, and a PowerShell `$ErrorActionPreference`/native-command interplay that can silently break the same cleanup path in `run-e2e.ps1`.

## Critical Issues

### CR-01: run-e2e.sh — `set -e` aborts before the trailing `down -v`, breaking the deterministic-cleanup contract

**File:** `test/run-e2e.sh:4,14-18`
**Issue:** The script sets `set -e` (line 4). When `docker compose run --rm playwright npx playwright test` (line 14) fails — which is the *normal* outcome during development of failing specs — the shell exits immediately with the test's exit code. `status=$?` (line 15), the trailing `down -v` (line 17), and `exit $status` (line 18) are **never executed**. The comment on line 13 ("Capture the exit status so the trailing down -v ALWAYS runs, even on test failure") states the exact opposite of what `set -e` does. Consequence: after every failed E2E run, the `app` container, its network, and the seeded `finally-test-data` volume are left running. While the next run's leading `down -v` self-heals, the stray stack holds the project's compose network and test volume, and any manual `docker compose` invocation against that project picks up stale state. The analogous PowerShell script (`run-e2e.ps1`) does not suffer this by default because `$ErrorActionPreference='Stop'` does not fire on native command exit codes (see WR-04 for the opt-in exception).
**Fix:**
```bash
set -e
...
# Disable errexit for the command whose failure must NOT skip cleanup
set +e
docker compose -f test/docker-compose.test.yml run --rm playwright npx playwright test
status=$?
set -e
docker compose -f test/docker-compose.test.yml down -v
exit $status
```

### CR-02: Unpinned `ghcr.io/astral-sh/uv` base image in both backend stages

**File:** `Dockerfile:13,21`
**Issue:** `FROM ghcr.io/astral-sh/uv:python3.12-trixie-slim` (used for both `backend-deps` and the runtime stage) contains **no uv version in the tag** — it resolves to the latest published uv release on every rebuild. uv ships frequent minor releases with behavior changes; two rebuilds weeks apart silently produce different toolchains, breaking reproducibility and pulling untested uv releases into the production image. This directly violates the phase's stated security model ("pinned base images + lockfiles") — note the same file correctly pins the Playwright image to `v1.62.0-jammy` and the frontend to `node:22`, so the project's own convention is being missed here. Since the tag is unpinned, it also means the deps stage and runtime stage could theoretically resolve to different digests if the tag moves mid-build.
**Fix:**
```dockerfile
# Pick one concrete uv release and use the identical tag in both stages
FROM ghcr.io/astral-sh/uv:0.8.4-python3.12-trixie-slim AS backend-deps
...
FROM ghcr.io/astral-sh/uv:0.8.4-python3.12-trixie-slim
```
(Or pin by digest: `FROM ghcr.io/astral-sh/uv:python3.12-trixie-slim@sha256:...`.)

## Warnings

### WR-01: Floating `node:22-slim` frontend-build base image

**File:** `Dockerfile:5`
**Issue:** `node:22-slim` tracks the latest 22.x patch release. The build is not reproducible: a rebuild next month gets a different Node patch level, and any compromised or faulty 22.x tag update would be pulled without review. The project's pattern elsewhere is exact pinning (`@playwright/test 1.62.0`, `next 16.3.3`).
**Fix:** Pin to a concrete patch: `FROM node:22.17.0-slim` (or pin by digest). Record the chosen version in a comment next to the `node` major requirement.

### WR-02: `.dockerignore` only excludes the root `.env` — `backend/.env` / `frontend/.env` would enter the build

**File:** `.dockerignore:8,13`
**Issue:** Dockerignore patterns are anchored to the context root: `.env` excludes only the root file, and `frontend/.env.local` only that exact path. A `backend/.env` (plausible — backend devs run from `backend/` and `load_dotenv()` walks up from CWD, so a `backend/.env` would be read) would be copied by `COPY backend/ .` (Dockerfile:17) into the `backend-deps` image layers and the local build cache — a secret-leak vector if that image is ever pushed or cached layers inspected. A `frontend/.env` would be copied by `COPY frontend/ .` (Dockerfile:9) and its `NEXT_PUBLIC_*` values inlined into the static export baked into the image — the exact Pitfall 3 the file's own comment warns about. The current `.gitignore` ignores `.env` at every level, so git history is safe; the build context is not.
**Fix:**
```dockerignore
**/.env
**/.env.local
```
(Keep `frontend/.env.local` explicit or rely on `**/.env.local`; the `.env.example` file at the root is documentation and may be excluded or not — it contains no secrets.)

### WR-03: E2E specs' cumulative per-assertion waits exceed Playwright's default 30s test timeout

**File:** `test/playwright.config.ts:11`, `test/tests/02-watchlist.spec.ts:10-28`, `test/tests/05-chat.spec.ts:27-35`, `test/tests/06-sse-reconnect.spec.ts:54-70`
**Issue:** The config does not set a test `timeout`, so Playwright's default 30,000 ms per test applies. Several specs chain assertions whose worst-case waits sum past that budget: 02-watchlist ≈ 10+10+10+5+10 = 55s; 06-sse-reconnect ≈ 15+10+15+10 = 50s; 05-chat ≈ 15+5+10 = 30s plus `goto`/input overhead. In a slow environment (cold container boot, reconnect delays) the test is killed with a generic "Test timeout of 30000ms exceeded" instead of a meaningful assertion failure, making failures hard to diagnose and adding flake under load. The happy path is fast, so the suite passed — the risk is exactly when it matters.
**Fix:** In `test/playwright.config.ts`:
```ts
export default defineConfig({
  timeout: 90_000,
  ...
```
and/or `test.setTimeout(90_000)` in the specs with the longest chains.

### WR-04: PowerShell scripts assume native commands never throw under `$ErrorActionPreference = 'Stop'`

**File:** `scripts/start_windows.ps1:2,5,13`, `scripts/stop_windows.ps1:3`, `test/run-e2e.ps1:3,12-16`
**Issue:** All three .ps1 files set `$ErrorActionPreference = 'Stop'` and then rely on `$LASTEXITCODE` checks after `docker ...` commands (the correct classic pattern). However, PowerShell 7.3+ added `$PSNativeCommandUseErrorActionPreference`; when enabled (an opt-in that tooling/profiles increasingly set), a nonzero exit from `docker image inspect`/`docker compose run` becomes a **terminating error**. In `start_windows.ps1` the script then dies at line 5 instead of entering the build branch; in `run-e2e.ps1` the fatal case is worse — `docker compose run` failing would abort before `$status = $LASTEXITCODE` and the trailing `down -v`, reproducing the CR-01 cleanup bug in PowerShell. Behavior currently differs silently between the two run-e2e scripts.
**Fix:** Pin the intended semantics at the top of each script:
```powershell
$PSNativeCommandUseErrorActionPreference = $false
$ErrorActionPreference = 'Stop'
```
For extra robustness in `run-e2e.ps1`, wrap the run+cleanup in `try/finally`.

## Info

### IF-01: `/api/health` does not verify the database is writable

**File:** `backend/app/main.py:98-101`
**Issue:** The health endpoint returns `{"status": "healthy"}` regardless of SQLite state. A container booted with a read-only or corrupted `/app/db` volume still reports healthy, so the start-script gates and compose `service_healthy` declare the app ready while trades/chat then fail.
**Fix:** Optionally touch the DB inside the health handler, e.g. `sqlite3.connect(DB_PATH).execute("SELECT 1 FROM users_profile").fetchone()` inside a try/except returning 503.

### IF-02: Runtime stage comment claims "no uv" but the runtime base image is the uv image

**File:** `Dockerfile:20-21`
**Issue:** Stage 3's comment ("runtime: venv + static export only; no uv, no source, no node") is inaccurate: the runtime `FROM ghcr.io/astral-sh/uv:...` image ships the full uv toolchain, which is unused. Either switch the runtime base to a plain `python:3.12-slim` (smaller, fewer attack-surface packages) or fix the comment.
**Fix:** Prefer a `python:3.12-slim` runtime base (the venv is self-contained) and update the comment; keep the same base for the deps stage.

### IF-03: Dead statement in `test_db_path_reads_finally_db_path_env`

**File:** `backend/tests/test_app.py:100`
**Issue:** `main.DB_PATH = None` is a no-op — `importlib.reload(main)` immediately re-executes the module body and overwrites it. The comment "force re-read path" misattributes the work to the assignment. (Also note `reload()` re-executes module-level `FastAPI()`/`load_dotenv()`, leaving a second `app` object — fragile if this test's file ever grows more tests that import `app.main.app`.)
**Fix:** Delete the assignment line; optionally reorder the test last in the class (it already is) and add a comment warning that `reload` re-creates the app object.

### IF-04: `start_mac.sh` exits silently when the app never becomes healthy

**File:** `scripts/start_mac.sh:18-23`
**Issue:** If the 30×2s health poll exhausts, the final `curl` fails and `set -e` exits with code 1 and **no diagnostic message**. The Windows script prints "FinAlly failed to become healthy within 60s" — the macOS script should match.
**Fix:**
```bash
curl -sf http://localhost:8000/api/health >/dev/null && echo "FinAlly running at http://localhost:8000" \
  || { echo "FinAlly failed to become healthy within 60s" >&2; exit 1; }
```

### IF-05: Playwright test artifacts are discarded by `run --rm`

**File:** `test/docker-compose.test.yml:44`, `test/run-e2e.sh:14`
**Issue:** Playwright writes `test-results/`/`playwright-report/` into the container's `/test`; `run --rm` deletes the container, so failure artifacts (screenshots, traces, HTML report) are lost. Debugging a failing spec requires re-running with `--trace on` and reading stdout.
**Fix:** Mount `./test-results:/test/test-results` (and `./playwright-report:/test/playwright-report`) in the playwright service, and ensure the local `test/.gitignore` keeps them out of git (it already does).

### IF-06: `ipc: host` grants the test container host IPC access

**File:** `test/docker-compose.test.yml:34`
**Issue:** `ipc: host` is a broad escape hatch; the common need is only enlarged `/dev/shm` for Chromium. On a shared/CI host this weakens the isolation the compose file otherwise carefully builds. On a local dev machine the risk is negligible.
**Fix:** Prefer `shm_size: 2gb` on the playwright service; keep `ipc: host` only if empirically required by the pinned Chromium.

---

_Reviewed: 2026-08-26T12:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
