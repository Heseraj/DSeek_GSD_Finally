---
phase: 04-deployment-e2e
plan: 01
subsystem: infra
tags: [docker, fastapi, uvicorn, node, uv, sqlite, frontend, deployment]

requires:
  - phase: 03-frontend-trading-terminal
    provides: Next.js static export (frontend/out/), backend pytest suite, FastAPI app entry point
provides:
  - Single-container Docker deployment: 3-stage image (node:22-slim build -> uv python3.12 deps -> non-root runtime) serving terminal + API + SSE on :8000
  - FINALLY_DB_PATH env-configurable SQLite path + app.frontend static mount (fastapi 0.141.1)
  - finally-data named volume persistence proven across docker restart
affects: [04-02 scripts, 04-03/04-04 E2E compose, docker-deployment, playwright-e2e]

actuals:
  tokens: 1696
  tasks: 3
  commits: 4

tech-stack:
  added:
    - fastapi 0.141.1 (app.frontend for static serving; was 0.128.7)
    - ghcr.io/astral-sh/uv:python3.12-trixie-slim base images (deps + runtime stages)
    - node:22-slim frontend build stage
  patterns:
    - 3-stage Dockerfile: frontend build -> two-phase uv sync (--no-install-project then --no-editable) -> venv-only non-root runtime
    - WORKDIR /app + cwd-relative db/finally.db -> named volume target /app/db/finally.db
    - app.frontend('/', directory='static', check_dir=False): backend-only contexts import without frontend/out

key-files:
  created:
    - Dockerfile
    - .dockerignore
    - db/.gitkeep
  modified:
    - backend/app/main.py (import os, DB_PATH env read, app.frontend)
    - backend/uv.lock (fastapi 0.141.1)
    - backend/pyproject.toml (fastapi==0.141.1)
    - backend/tests/test_app.py (env-read unit test)
    - .gitignore (db/finally.db, db/finally.db-journal, backend/db/ - landed via concurrent e24f758)

key-decisions:
  - "FINALLY_DB_PATH env read (default db/finally.db) converts the volume mount from WORKDIR coincidence into an explicit, testable contract (RESEARCH A4)"
  - "app.frontend() with check_dir=False replaces the StaticFiles+catch-all fallback; keeps backend pytest importable without a frontend build (RESEARCH A2/Pitfall 1)"
  - "fastapi pinned exactly 0.141.1 (uv add fastapi@0.141.1 -> pyproject fastapi==0.141.1) — litellm 1.98.0 declares no fastapi constraint, bump touches nothing else"
  - "node:22-slim build stage (A1 user-confirmed) over EOL Node 20; non-root USER app uid 1000 with chown'd /app/db (A5)"
  - "exec-form uvicorn CMD, never --workers > 1 — PriceCache/simulator/snapshot loop are process-local state"

patterns-established:
  - "Dockerfile inline comments after COPY/RUN instructions are invalid Docker syntax — comments must be on their own line"
  - "uv image tag order is python3.12-trixie-slim (python-{version}-{distro}-{variant}), not python3.12-slim-trixie"
  - "uv add in PowerShell: the @ spec must be quoted/escaped; == spec avoids the parse ambiguity"

requirements-completed: [DEPLOY-01, DEPLOY-02, DEPLOY-03]

coverage:
  - id: D1
    description: "Backend contract: FINALLY_DB_PATH env read, app.frontend static mount with check_dir=False, fastapi 0.141.1 bump, env-read unit test"
    requirement: DEPLOY-03
    verification:
      - kind: unit
        ref: "backend/tests/test_app.py#TestAppSmoke.test_db_path_reads_finally_db_path_env"
        status: pass
      - kind: other
        ref: "cd backend && uv run --extra dev pytest -q (159 passed)"
        status: pass
      - kind: other
        ref: "cd backend && uv run --extra dev ruff check app/main.py tests/test_app.py (exit 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "3-stage Dockerfile + .dockerignore; image builds successfully as non-root with exec-form uvicorn CMD"
    requirement: DEPLOY-02
    verification:
      - kind: other
        ref: "docker build -t finally:latest . (exit 0); docker image inspect: USER=app WORKDIR=/app CMD=[uvicorn...]"
        status: pass
    human_judgment: false
  - id: D3
    description: "Tracer end-to-end: container serves / (static export), /api/health, SSE prices; REST trade survives docker restart; non-root identity; volume lands at /app/db/finally.db"
    requirement: DEPLOY-01
    verification:
      - kind: e2e
        ref: "04-01-PLAN.md Task 3 verify chain (health poll, __next match, SSE frame, cash_balance<10000 after restart, docker exec whoami=app, ls /app/db=finally.db) — all asserted"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-08-26
status: complete
---

# Phase 4 Plan 01: Single-Container Deployment Tracer Summary

**Backend contract hardened (FINALLY_DB_PATH env read + app.frontend static mount on fastapi 0.141.1) and the phase tracer proven end-to-end: one 3-stage Docker image builds, boots as non-root, serves the Next.js terminal + REST + SSE on :8000, and persists a REST trade across `docker restart` through the `finally-data` named volume at /app/db/finally.db.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-26T22:17:00Z (approx)
- **Completed:** 2026-08-26T22:37:00Z (approx)
- **Tasks:** 3 (Task 1 TDD = 3 commits, Task 2 = 1 commit, Task 3 = verification-only)
- **Files modified:** 8 (5 mine, .gitignore via concurrent commit, Dockerfile + .dockerignore)

## Accomplishments

- **Backend contract** (Task 1, TDD RED→GREEN): `DB_PATH` now reads `FINALLY_DB_PATH` (default `db/finally.db`) via a new `import os`; `app.frontend("/", directory="static", check_dir=False)` serves the static export after all routers, keeping backend pytest importable without `frontend/out/`; fastapi pinned 0.141.1 in uv.lock (litellm 1.98.0 untouched); new env-read unit test green (159 total).
- **3-stage Docker image** (Task 2): node:22-slim frontend build (npm ci from committed lockfile → `npm run build` → out/) → uv python3.12 deps (two-phase `uv sync --locked` with cache mounts, `--no-editable` bakes app into venv) → non-root runtime (WORKDIR /app, USER app uid 1000, chown'd /app/db, exec-form uvicorn CMD, no --workers>1). `.dockerignore` excludes `.env.local`/build artifacts/.git/.venv/.planning.
- **Tracer chain green** (Task 3): image built → `docker run -d --name finally -v finally-data:/app/db -p 8000:8000` → health 200 within poll → `/` serves HTML with `__next` → SSE `data:` frame within 4s → POST buy 5 AAPL → `docker restart finally` → cash_balance 9050.20 (< 10000, trade survived) → `docker exec finally whoami` = `app` → `/app/db` lists `finally.db`. Container left running for 04-02's idempotency scripts.
- All plan `<verification>` gates pass: backend pytest 159 + ruff clean, frontend vitest 58 + `npm run build`, `docker build` exit 0.

## Task Commits

Each task was committed atomically (Task 1 split RED/GREEN per TDD):

1. **Task 1 (RED): env-read failing test** - `98ae73e` (test) — `TestAppSmoke.test_db_path_reads_finally_db_path_env` failed on hardcoded DB_PATH (1 failed, 158 passed)
2. **Task 1 (GREEN): backend contract** - `0f3747b` (feat) — main.py 3 edits, uv.lock fastapi 0.141.1, test now green (159 passed), db/.gitkeep
3. **Task 1 (manifest): fastapi pin** - `e6af092` (chore) — `uv add` rewrote pyproject.toml to `fastapi==0.141.1` (needed for `uv sync --locked` in the image)
4. **Task 2: Dockerfile + .dockerignore** - `187ea80` (feat) — 3-stage build, non-root runtime, 11-entry .dockerignore
5. **Task 3 (tracer): verification-only** - no new files (Dockerfile/main.py already committed); end-to-end chain asserted live

**Concurrent commit (not mine):** `e24f758 chore(03-07): ignore backend runtime SQLite db` landed on main mid-execution and carried the exact `.gitignore` entries the plan required (see Issues Encountered).

**Plan metadata:** final docs commit follows after state updates.

## Files Created/Modified

- `backend/app/main.py` - `import os` added; `DB_PATH = os.environ.get("FINALLY_DB_PATH", "db/finally.db")`; `app.frontend("/", directory="static", check_dir=False)` after `include_router(chat_router)`, before CORS block
- `backend/uv.lock` - fastapi 0.128.7 → 0.141.1 (regenerated by uv; litellm entry untouched)
- `backend/pyproject.toml` - `fastapi>=0.115.0` → `fastapi==0.141.1` (uv add side effect)
- `backend/tests/test_app.py` - new `test_db_path_reads_finally_db_path_env` (monkeypatch.setenv + importlib.reload pattern)
- `Dockerfile` - 3 stages: frontend-build (node:22-slim) / backend-deps (uv trixie-slim) / runtime (non-root)
- `.dockerignore` - .git, **/node_modules, frontend/.next, frontend/out, frontend/.env.local, backend/.venv, **/__pycache__, .pytest_cache, .ruff_cache, .planning/, .env
- `db/.gitkeep` - empty placeholder so db/ survives git while finally.db is ignored
- `.gitignore` - `db/finally.db`, `db/finally.db-journal`, `backend/db/` (committed via concurrent e24f758; meets Task 1 criterion)

## Decisions Made

- FINALLY_DB_PATH env read adopted (RESEARCH A4) — makes the volume mount explicit and gives E2E a trivial DB isolation switch; module-attribute overrides in the 10+ existing monkeypatch call sites still win (test-compat guaranteed).
- `check_dir=False` on app.frontend (Pitfall 1) — never the default `"auto"`; backend-only pytest must import without a frontend build present.
- fastapi exactly 0.141.1 — app.frontend requires ≥0.138.0; litellm 1.98.0 declares no fastapi constraint (verified in uv.lock).
- node:22-slim + non-root USER app (A1/A5, user-confirmed) — Node 20 is EOL; non-root hardening with chown'd volume target.
- Single uvicorn worker (exec-form CMD, no --workers) — process-local PriceCache/simulator/snapshot-loop state would diverge across workers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stale uvicorn dev server held port 8000**
- **Found during:** Pre-task environment check (tracer prerequisite)
- **Issue:** Instructions stated port 8000 was freed, but a leftover Phase 3 dev server (`uvicorn app.main:app --host 127.0.0.1 --port 8000`, pid 41344) was still listening — `docker run -p 8000:8000` would have failed with a port conflict.
- **Fix:** Killed the stale process; verified 8000 free.
- **Files modified:** none (process-level)
- **Verification:** `Get-NetTCPConnection -LocalPort 8000 -State Listen` empty; tracer `-p 8000:8000` bound cleanly.
- **Committed in:** n/a (no file change)

**2. [Rule 1 - Bug] Docker build failed on trailing `#` comments in COPY/RUN lines**
- **Found during:** Task 2 (`docker build` first attempt)
- **Issue:** The RESEARCH skeleton's inline comments (`COPY frontend/ .  # .env.local excluded`) are invalid Dockerfile syntax — build failed with `lstat /#: no such file or directory`.
- **Fix:** Moved all comments to standalone lines in Dockerfile.
- **Files modified:** Dockerfile
- **Verification:** `docker build -t finally:latest .` exit 0.
- **Committed in:** 187ea80

**3. [Rule 1 - Bug] Nonexistent uv base image tag in RESEARCH skeleton**
- **Found during:** Task 2 (`docker build` first attempt)
- **Issue:** `ghcr.io/astral-sh/uv:python3.12-slim-trixie` does not exist in the registry (`not found`). Official uv Docker docs list derived tags as `ghcr.io/astral-sh/uv:python3.12-trixie-slim` (python-{version}-{distro}-{variant}).
- **Fix:** Corrected both FROM lines to `ghcr.io/astral-sh/uv:python3.12-trixie-slim`; verified via `docker manifest inspect` and the uv docs.
- **Files modified:** Dockerfile
- **Verification:** build succeeded; image history shows both stages from the corrected base.
- **Committed in:** 187ea80

**4. [Rule 3 - Blocking] `uv add fastapi@0.141.1` parse failure in PowerShell**
- **Found during:** Task 1 (GREEN)
- **Issue:** pwsh treats `@` specially; uv also parsed the unquoted spec as a path. Plan assumed "no manifest edit," but `uv add` inherently rewrites pyproject.toml to pin the requested version.
- **Fix:** Used `uv add "fastapi==0.141.1"` (identical result); committed the resulting pyproject.toml pin as `e6af092` so `uv sync --locked` in the Docker build stays consistent.
- **Files modified:** backend/pyproject.toml, backend/uv.lock
- **Verification:** `uv run python -c "import fastapi; print(fastapi.__version__)"` → 0.141.1; pytest green.
- **Committed in:** e6af092

---

**Total deviations:** 4 auto-fixed (2 blocking, 2 bugs)
**Impact on plan:** All fixes were necessary for the build/tracer to run at all — no scope creep, no architectural changes. The tag-order and trailing-comment fixes were latent bugs in the RESEARCH skeleton; the port kill and uv spec quoting were environment/tooling frictions. Everything else executed exactly as planned.

## Issues Encountered

- **Concurrent commit landed on main mid-execution:** `e24f758 chore(03-07): ignore backend runtime SQLite db` (author heseraj, 22:22:58) appeared between my RED (22:19:30) and GREEN (22:23:10) commits. It carried exactly the `.gitignore` entries the plan required (`db/finally.db`, `db/finally.db-journal`, plus `backend/db/` and an explanatory comment) — so my GREEN commit staged no `.gitignore` diff and the criterion was satisfied by the concurrent commit instead. No content conflict; the final `.gitignore` state matches the plan's intent. Root cause appears to be a Phase 3 hook/session still flushing a pending chore commit; noted for awareness but non-blocking.
- **uv image tag versioning:** the RESEARCH.md skeleton's `python3.12-slim-trixie` ordering was wrong; verified against the official uv docs and the ghcr.io registry (see deviation 3).

## User Setup Required

None - no external service configuration required (LLM keys optional at runtime via `--env-file .env`, never baked into the image).

## Next Phase Readiness

- `finally:latest` image built and cached; `finally` container running on :8000 with `finally-data` volume (left live deliberately for 04-02's idempotent start/stop script tests — they begin with `docker rm -f finally`).
- 04-02 can layer `scripts/start_*.sh/ps1` + `stop_*.sh/ps1` on top of the proven `docker run -v finally-data:/app/db -p 8000:8000 finally:latest` invocation (RESEARCH Pattern 3).
- 04-03/04-04 E2E compose will reuse the same image with `LLM_MOCK=true` and the dedicated `finally-test-data` volume.

## Self-Check: PASSED

- Dockerfile exists: FOUND
- .dockerignore exists: FOUND
- db/.gitkeep exists: FOUND
- Commit 98ae73e (test 04-01): FOUND
- Commit 0f3747b (feat 04-01): FOUND
- Commit e6af092 (chore 04-01): FOUND
- Commit 187ea80 (feat 04-01 Dockerfile): FOUND
- `docker build -t finally:latest .` exit 0: VERIFIED
- Tracer chain (health/static/SSE/persistence/whoami/volume): VERIFIED live

---
*Phase: 04-deployment-e2e*
*Completed: 2026-08-26*
