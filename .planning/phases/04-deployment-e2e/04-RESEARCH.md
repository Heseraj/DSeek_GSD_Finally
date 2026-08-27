# Phase 4: Deployment & E2E — Research

**Researched:** 2026-08-27
**Domain:** Single-container Docker deployment (multi-stage Node→Python build, FastAPI serving static Next.js export, SQLite named-volume persistence, idempotent start/stop scripts) + Playwright E2E against the containerized app
**Confidence:** HIGH

## Summary

Phase 4 is a **greenfield deployment phase**: the repo today has **no** `Dockerfile`, no `test/` directory, no `scripts/`, no root `db/` directory, no `.dockerignore`, and no Playwright anywhere (the research brief's claim of "an existing test/ directory with playwright installed" is **wrong** — verified: only `backend/tests` and `frontend/tests` exist, zero `playwright.config.*` files, zero playwright packages in any `package.json`). Everything in DEPLOY-01..04 and TEST-01..02 must be created. The good news: a **stale `finally:latest` image** built 2026-08-26 (an earlier exploratory attempt) is cached on this machine with the Python deps layer intact (image size 152MB, WORKDIR `/app/backend`, CMD `uv run uvicorn app.main:app --host 0.0.0.0 --port 8000`, an **inert** `ENV FINALLY_DB_PATH=/app/db/finally.db` that today's `main.py` does not read), plus a stale `mcr.microsoft.com/playwright:v1.48.0-jammy` pull — neither should be trusted; the image gets rebuilt, the Playwright image re-pulled at the correct version.

The central architectural decision is **how FastAPI serves the Next.js static export**, and the research resolves the Phase 3 flag (RESEARCH A2, 03-07: "installed fastapi 0.128.7 lacks `app.frontend()`"). The official FastAPI release history is now pinned: **`app.frontend()` was introduced in 0.138.0** (PR #15800, 2026-07) and the current stable is **0.141.1** (2026-07-29). `backend/pyproject.toml` already allows the bump (`fastapi>=0.115.0`) and **litellm 1.98.0 declares no fastapi dependency** (verified in `backend/uv.lock`), so bumping is safe. Recommendation: **bump fastapi to 0.141.1 (`uv lock` + `uv sync`) and use `app.frontend("/", directory="static", check_dir=False)`** — one call that serves `index.html` at `/`, `_next/*` assets, `404.html` for missing paths, and leaves `/api/*` path operations untouched (the docs state path operations take priority). This replaces the clunky `StaticFiles` + catch-all-route fallback. `check_dir=False` keeps the app importable in backend-only contexts (tests, `uvicorn` dev without a frontend build) — the default `check_dir="auto"` **raises at app creation** when the directory is missing, which would break every backend pytest run in a fresh checkout.

**SQLite persistence** needs one small deliberate code change. Today `backend/app/main.py:33` hardcodes `DB_PATH: str = "db/finally.db"` (relative to cwd) and **does not read any env var** — so the volume mount `finally-data:/app/db` from PLAN.md §11 / DEPLOY-03 only works if the container's WORKDIR is `/app` (then `db/finally.db` → `/app/db/finally.db`). The previous attempt's `ENV FINALLY_DB_PATH` proves the intent; the code never honored it. Recommendation: `DB_PATH: str = os.environ.get("FINALLY_DB_PATH", "db/finally.db")` (2 lines; existing tests that `monkeypatch.setattr("app.main.DB_PATH", ...)` are unaffected because they override the module attribute after import). This makes the volume mount explicit, matches DEPLOY-03, and gives the E2E stack a trivial way to isolate test data.

**Playwright E2E (TEST-01/02)** follows the locked requirement: `test/docker-compose.test.yml` + a Playwright container. Current versions pinned from the registry this session: `@playwright/test@1.62.0` paired with the official `mcr.microsoft.com/playwright:v1.62.0-jammy` image (Ubuntu 22.04, browsers + system deps preinstalled; the npm package is NOT in the image, and **the version must match the image tag or Playwright cannot find browser executables** — Playwright docs are explicit). A small `test/playwright.Dockerfile` (`FROM mcr...:v1.62.0-jammy` + `npm ci` + copy tests) keeps `node_modules` out of the host. The compose file runs two services: `app` (built from the root Dockerfile, `LLM_MOCK=true`, test volume, `ipc: host` not needed there) and `playwright` (`depends_on: app: condition: service_healthy`, `PLAYWRIGHT_BASE_URL=http://app:8000`, `ipc: host` for Chromium, `command: npx playwright test`). A `test/run-e2e` orchestration script does `docker compose -f test/docker-compose.test.yml down -v` first — **the `-v` is what makes the "fresh start" scenario deterministic** (removes the test volume so the seeded $10k profile returns every run). Tests run serial (`fullyParallel: false`, `workers: 1`) because they share one mutable SQLite DB.

**Primary recommendation:** Bump `fastapi` to 0.141.1, add `app.frontend()` + the `FINALLY_DB_PATH` env read to `main.py`, build a 3-stage Dockerfile (node:22-slim → uv/python:3.12-slim → final Python image with `.venv` + `out/` + uvicorn CMD), mount `finally-data:/app/db` at runtime via idempotent `scripts/start_*.sh/ps1` + `stop_*.sh/ps1`, and prove the whole thing with `test/docker-compose.test.yml` (LLM_MOCK) running the six TEST-02 scenarios.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEPLOY-01 | Single Docker container on port 8000 serves FastAPI + static Next.js export | `app.frontend("/", directory=...)` official pattern [CITED: fastapi.tiangolo.com/tutorial/frontend]; path operations win over static files so `/api/*` + `/api/stream/*` unaffected; export verified at `frontend/out/` (index.html + `_next/static/...` + 404.html) with **absolute** `/`-rooted asset paths [VERIFIED: frontend/out/index.html] — must be served at root, which `app.frontend("/")` does |
| DEPLOY-02 | Multi-stage Dockerfile (Node 20 build → Python 3.12 runtime) | uv's official Docker guide (intermediate `--no-install-project` layer, `.venv` copy, cache mounts) [CITED: docs.astral.sh/uv/guides/integration/docker]; FastAPI's container guidance (exec-form CMD for lifespan, deps-before-code cache ordering) [CITED: fastapi.tiangolo.com/deployment/docker]; **deviation to confirm:** REQUIREMENTS names Node 20 but Node 20 is EOL (Apr 2026) — recommend `node:22-slim` (Assumption A1) |
| DEPLOY-03 | SQLite persists via named volume (`finally-data:/app/db`) | `DB_PATH="db/finally.db"` is cwd-relative and **not env-configurable** [VERIFIED: backend/app/main.py:33]; `init_db` does `os.makedirs(parent, exist_ok=True)` [VERIFIED: backend/app/db/database.py:76-77]; seed-only-when-profile-absent means a persisted volume is never double-seeded [VERIFIED: database.py:84-87]; WORKDIR `/app` + optional `FINALLY_DB_PATH` env read makes `finally-data:/app/db` exact (A4) |
| DEPLOY-04 | Idempotent start/stop scripts (macOS/Linux shell + Windows PowerShell) | Pattern: `docker rm -f finally` (error suppressed) → `docker run -d --name finally -v finally-data:/app/db -p 8000:8000 --env-file .env`; health-poll `/api/health` before declaring ready [VERIFIED: backend/app/main.py:91-94 `{"status": "healthy"}`]; stop = `docker rm -f finally`, never removes the volume |
| TEST-01 | Playwright E2E infrastructure (`docker-compose.test.yml` + Playwright container, `LLM_MOCK=true`) | Official Playwright image `mcr.microsoft.com/playwright:v1.62.0-jammy`; version must match `@playwright/test` [CITED: playwright.dev/docs/docker]; `--ipc=host` for Chromium; `LLM_MOCK` read at call time from env, truthy set `{"true","1","yes"}` [VERIFIED: backend/app/chat/service.py:46]; mock response is deterministic — any message buys 1 AAPL [VERIFIED: service.py:55-59] |
| TEST-02 | E2E scenarios: fresh start, watchlist CRUD, buy/sell, visualizations, mocked AI chat, SSE reconnection | All selectors verified: `data-testid` slots header-slot/main-chart-slot/portfolio-slot/trade-bar-slot/chat-slot/sparkline-{ticker}/heatmap-cell-{name}, connection-dot `aria-label="connection: connected\|reconnecting\|closed"` + bg colors [VERIFIED: frontend/components/header/Header.tsx:12-38]; role/name buttons Add/Buy/Sell/Send; SSE reconnect: `context.setOffline()` + `route.abort()` + CDP emulation [CITED: playwright.dev/api/class-browsercontext, class-route]; fresh DB per run via `down -v` |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Serve static frontend (`/`, `/_next/*`) | API / Backend | — | FastAPI `app.frontend()` is the single origin; no CDN/static host — locked single-container architecture |
| REST + SSE APIs (`/api/*`, `/api/stream/*`) | API / Backend | — | Existing routers included in `main.py`; `app.frontend()` never shadows them (path operations win) |
| SQLite persistence | Database / Storage | — | `finally-data:/app/db` named volume; backend lazily inits/seeds on first boot |
| Market data + snapshot background tasks | API / Backend | — | In-process asyncio tasks inside the single uvicorn worker — **never `--workers > 1`** (price cache, snapshot loop, and simulator are process-local state) |
| Container image build | Build tooling | — | Multi-stage Dockerfile (node:22 build → uv/python:3.12 runtime) |
| Start/stop lifecycle | Dev tooling | — | `scripts/` wrapper scripts (idempotent docker commands, health poll, browser hint) |
| E2E verification | Test tooling | API / Backend | `test/docker-compose.test.yml`: app service + Playwright container on the compose network; tests assert against `data-testid`/aria selectors the frontend already ships |
| LLM behavior | API / Backend | — | `LLM_MOCK=true` env in the test compose → deterministic chat; no OpenRouter key needed |

## Standard Stack

### Core

| Library / Image | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `fastapi` | `0.141.1` (bump from 0.128.7) | API + static serving via `app.frontend()` | `app.frontend()` introduced 0.138.0, hardened through 0.141.1 (PRs #15800/#15863/#15908/#16011/#16102/#16105 — release notes this session); `pyproject.toml` already allows `>=0.115.0`; litellm 1.98.0 declares no fastapi dep [VERIFIED: backend/uv.lock:910-937] |
| `python:3.12-slim` (trixie) + uv | 3.12.14 base / uv 0.12.6 | Backend runtime stage | Matches the project's Python 3.12 [VERIFIED: backend/.python-version, pyproject requires-python >=3.12]; uv images `ghcr.io/astral-sh/uv:python3.12-slim-trixie` or `COPY --from=ghcr.io/astral-sh/uv:0.12.6 /uv /uvx /bin/` [CITED: docs.astral.sh/uv/guides/integration/docker] |
| `node` | `22-slim` (deviation from REQUIREMENTS' "Node 20" — A1) | Frontend build stage | Node 20 EOL Apr 2026; Next 16 requires >=20.9; node:22 LTS is security-maintained. npm 10 (ships with node:22) runs lifecycle scripts normally — no npm-11 allowScripts interference |
| `@playwright/test` | `1.62.0` | E2E runner | Latest 1.62.1 on npm this session; **pin 1.62.0** to match the official `mcr.microsoft.com/playwright:v1.62.0-jammy` image tag [CITED: playwright.dev/docs/docker — version mismatch = browsers not found] |
| `mcr.microsoft.com/playwright:v1.62.0-jammy` | 1.62.0 (Ubuntu 22.04) | E2E browser container | Official image: Chromium + system deps preinstalled; root user acceptable for trusted E2E [CITED: playwright.dev/docs/docker] |
| uvicorn | `[standard]>=0.32.0` (locked) | ASGI server | Already a dependency; CMD `/app/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000` (exec form — FastAPI docs: required for graceful shutdown/lifespan) [CITED: fastapi.tiangolo.com/deployment/docker] |

### Supporting

| Library / Image | Version | Purpose | When to Use |
|---------|---------|---------|--------------|
| Docker Compose (v2 `docker compose`) | CLI v5.3.1 on machine | `test/docker-compose.test.yml` orchestration | E2E only — production stays single-container (PROJECT.md locked decision) |
| `typescript` (dev) | — | `playwright.config.ts` | Test config in TS per Playwright convention |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `app.frontend()` after bumping fastapi ≥0.138 | `StaticFiles(directory=...)` + catch-all `@app.get("/{full_path:path}")` fallback | Works on 0.128.7 with zero bump — but hand-rolls SPA fallback, must exclude `/api/*` manually, and re-implements what FastAPI now ships (404.html vs index.html selection, GET/HEAD-only fallback, API-priority). The bump is one `uv lock` away and conflict-free |
| Official `mcr.microsoft.com/playwright:v1.62.0-jammy` | `FROM node:20-bookworm RUN npx playwright install --with-deps` | Custom image = longer build, same result; official image has browsers cached on MCR |
| Compose test stack (`docker-compose.test.yml`) | Run Playwright on the host against `localhost:8000` | Host-side needs a local Chromium install + `npx playwright install` (~150MB download) and pollutes the host; TEST-01 **locks** the compose+container design |
| `test/run-e2e.sh` orchestration (`down -v` → `up` → run → `down -v`) | Playwright `webServer` config starting the app itself | `webServer` would need `docker run` from the test process and can't reset the named volume deterministically; explicit orchestration is transparent and matches TEST-01's compose design |

**Installation (new artifacts, all created this phase — nothing pre-exists):**
```bash
# test/ (E2E)
cd test && npm init -y && npm i -D @playwright/test@1.62.0
# backend bump (in backend/)
uv add fastapi@0.141.1        # or: edit pyproject.toml to fastapi>=0.138.0 then uv lock && uv sync --extra dev
```

**Version verification (performed this session):** fastapi 0.141.1 (2026-07-29, PyPI + GitHub releases verified); uv 0.12.6 (host + `ghcr.io/astral-sh/uv:0.12.6` tag exists per official docs); @playwright/test 1.62.1/1.62.0 (npm registry); playwright 1.62.1; Docker 29.6.2 CLI + Compose v5.3.1 (host); Node 24.19.0/npm 11.17.0 (host, dev only). All `[VERIFIED: npm registry]` / `[CITED: official docs]`.

## Package Legitimacy Audit

> Gate protocol run 2026-08-27. Both packages return `SUS` for the **same documented heuristic artifact** as Phases 2/3 (the seam reads latest-release date as package age → "too-new"). Counter-evidence per row. `postinstall: null` on both — no postinstall-script risk.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@playwright/test` | npm | 6+ yrs (Microsoft) | 56.9M/wk | github.com/microsoft/playwright | SUS (artifact) | Approved — first-party Microsoft package; version pinned 1.62.0 to match the official MCR image |
| `playwright` | npm | 6+ yrs (Microsoft) | 85.9M/wk | github.com/microsoft/playwright | SUS (artifact) | Approved — same; only `@playwright/test` is needed for the test runner |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none in substance — both `SUS` rows are the release-date-heuristic artifact with first-party repo + 57M/86M weekly downloads and no postinstall; no `checkpoint:human-verify` warranted (mirrors Phases 2/3 resolution).
*Note: names verified on the npm registry this session; version-to-image pairing from [CITED: playwright.dev/docs/docker].*

## Architecture Patterns

### System Architecture Diagram

```
                          ┌────────────────────────────────────────────────────────────┐
                          │  DOCKER (single container, EXPOSE 8000)                   │
                          │                                                            │
   http://localhost:8000  │  uvicorn (exec-form CMD, 1 worker — process-local state)   │
   ─────────────────────► │  FastAPI app (0.141.1)                                     │
                          │   ├─ app.frontend("/", directory="static", check_dir=False)│
                          │   │    static/ = COPY --from=frontend-build .../out        │
                          │   │    ├─ index.html   (served at /)                       │
                          │   │    ├─ _next/static/* (hashed JS/CSS/fonts)             │
                          │   │    └─ 404.html     (missing paths → 404, fallback auto)│
                          │   ├─ /api/health        GET   (health poll for scripts)    │
                          │   ├─ /api/portfolio     GET/POST (rest routers win over    │
                          │   ├─ /api/watchlist     GET/POST/DELETE   static — path     │
                          │   ├─ /api/chat          POST     operations take priority) │
                          │   └─ /api/stream/prices GET    SSE (EventSource, retry:1000)│
                          │                                                            │
                          │  Background asyncio: simulator-loop (500ms) → PriceCache,   │
                          │  snapshot-loop (30s) → SQLite                               │
                          │                                                            │
                          │  SQLite: /app/db/finally.db   ← WORKDIR /app +              │
                          │            FINALLY_DB_PATH default = "db/finally.db"        │
                          └──────────────────────┬─────────────────────────────────────┘
                                                 │  named volume
                                                 ▼
                                   finally-data:/app/db  (persists across restarts;
                                   seeded only when users_profile row absent)

  E2E (test/docker-compose.test.yml — separate network):
    app:8000  ◄──(PLAYWRIGHT_BASE_URL)──  playwright container (mcr ...:v1.62.0-jammy,
                                          npx playwright test, ipc: host, LLM_MOCK=true)
    run-e2e: compose down -v  →  up --build -d  →  npx playwright test  →  down -v
```

### Recommended Project Structure (new files this phase)

```
├── Dockerfile                     # 3 stages: frontend-build → backend-deps → runtime
├── .dockerignore                  # .git, **/node_modules, frontend/.next, frontend/out,
│                                  # frontend/.env.local, backend/.venv, **/__pycache__,
│                                  # .pytest_cache, .ruff_cache, .planning/, .env
├── db/
│   └── .gitkeep                   # runtime volume-mount target (PLAN.md §4); finally.db gitignored
├── scripts/
│   ├── start_mac.sh               # build-if-missing, rm -f finally, run -d --name finally,
│   ├── stop_mac.sh                #   -v finally-data:/app/db -p 8000:8000 --env-file .env,
│   ├── start_windows.ps1          #   health-poll /api/health, print URL
│   └── stop_windows.ps1           # docker rm -f finally (never removes the volume)
└── test/
    ├── package.json               # @playwright/test@1.62.0 (exact pin)
    ├── package-lock.json
    ├── playwright.config.ts       # baseURL env PLAYWRIGHT_BASE_URL ?? http://localhost:8000;
    │                              #   chromium, headless, fullyParallel:false, workers:1
    ├── playwright.Dockerfile      # FROM mcr.microsoft.com/playwright:v1.62.0-jammy; npm ci; COPY tests
    ├── docker-compose.test.yml    # app (build ../, LLM_MOCK=true, finally-test-data volume,
    │                              #   healthcheck /api/health) + playwright (depends_on healthy)
    ├── run-e2e.sh / run-e2e.ps1   # down -v → up --build -d → npx playwright test → down -v
    └── tests/
        ├── fresh-start.spec.ts    # seed watchlist, $10k, streaming, connection dot green
        ├── watchlist.spec.ts      # add PYPL → appears + streams; remove → gone
        ├── trading.spec.ts        # buy 10 AAPL → cash↓ position; sell 5 → cash↑ qty 5
        ├── visualizations.spec.ts # heatmap-cell-AAPL, P&L chart, positions table
        ├── chat.spec.ts           # LLM_MOCK: "[mock] Acknowledged:" + AAPL buy confirmation
        └── sse-reconnect.spec.ts  # connected → setOffline → reconnecting → online → connected
```

### Pattern 1: FastAPI `app.frontend()` — official static-export serving

**What:** One call serves the entire Next.js `out/` directory with framework-correct semantics. Path operations are checked **first** (so `/api/*` is untouched); the frontend fallback applies only to `GET`/`HEAD` requests that accept HTML; `fallback="auto"` (default) serves `404.html` with status 404 when present, else `index.html` for missing paths. `check_dir="auto"` raises at app-creation if the directory is missing (unless `FASTAPI_ENV=development`).
**When to use:** Always in Phase 4. Use `check_dir=False` so backend-only contexts (pytest, `uv run uvicorn` without a frontend build) still import `app.main` — the default `check_dir="auto"` would crash every backend test in a checkout without `frontend/out/`.

```python
# backend/app/main.py — appended after include_router(...) block (skeleton; see Code Examples)
app.frontend("/", directory="static", check_dir=False)
```

### Pattern 2: uv two-phase sync + venv-only runtime copy

**What:** Backend-deps stage copies only `pyproject.toml` + `uv.lock`, runs `uv sync --locked --no-install-project` (deps layer, cacheable), then copies the backend source and runs `uv sync --locked --no-editable`; the runtime stage copies **only** `/app/.venv` and the static export — no source duplication, no uv binary needed at runtime, `CMD ["/app/.venv/bin/uvicorn", ...]`.
**When to use:** Always — this is uv's documented Docker pattern [CITED: docs.astral.sh/uv/guides/integration/docker — "Non-editable installs"].

### Pattern 3: idempotent start/stop with fixed container name + health poll

**What:** `start`: `docker rm -f finally 2>/dev/null || true` → `docker run -d --name finally -v finally-data:/app/db -p 8000:8000 $( [ -f .env ] && echo --env-file .env ) finally:latest` → poll `GET /api/health` until `{"status":"healthy"}` (timeout ~60s) → print `http://localhost:8000`. `stop`: `docker rm -f finally 2>/dev/null || true` — the volume is never removed, data persists. Both are idempotent because `rm -f` on a missing container is suppressed.
**When to use:** DEPLOY-04. `--rm` is NOT used (needs `-d` + named container for the stop script model). Windows PowerShell mirrors with `docker rm -f finally 2>$null`.

### Pattern 4: E2E with a disposable test volume

**What:** The test compose mounts `finally-test-data:/app/db` (a *different* volume from the production `finally-data`), and `run-e2e` executes `docker compose -f test/docker-compose.test.yml down -v` **before** `up` — wiping the test DB so every suite starts from the seeded $10k profile (the "fresh start" scenario is deterministic). `LLM_MOCK=true` on the app service makes chat deterministic; the simulator keeps prices streaming for SSE assertions.
**When to use:** Always for TEST-01/02. Never run E2E against the production volume.

### Pattern 5: SSE-reconnection assertion

**What:** The frontend maps `EventSource` `onopen` → `connected` (green, `bg-emerald-500`), `onerror` → `reconnecting` (yellow, `bg-yellow-500`), and **never calls `es.close()` on error** — the browser auto-reconnects honoring the backend's `retry: 1000` directive [VERIFIED: frontend/hooks/usePriceStream.ts:16-26, backend stream.py:65]. Test: wait for `aria-label="connection: connected"` → `context.setOffline(true)` → expect `reconnecting` → `setOffline(false)` → expect `connected` again and a price cell value change. `context.setOffline` is a documented Playwright API [CITED: playwright.dev/docs/api/class-browsercontext]; whether it tears down an *established* SSE socket in Chromium is the one [ASSUMED] link (fallback: CDP `Network.emulateNetworkConditions` via `context.newCDPSession` [CITED: class-browsercontext], or `route.abort()` for blocking *reconnect* attempts [CITED: class-route]).

### Anti-Patterns to Avoid

- **`uvicorn --workers 4` in the container** — each worker gets its own `PriceCache`, simulator, and snapshot loop, but shares the SQLite file → duplicate 30s snapshots and divergent prices. FastAPI's own guidance: one process per container; replication at the cluster level. [CITED: fastapi.tiangolo.com/deployment/docker]
- **Serving `out/` with `StaticFiles` + a hand-rolled catch-all** — re-implements SPA fallback and risks shadowing `/api/*`; use `app.frontend()` after the 1-line pin bump.
- **Copying `frontend/.env.local` into the build context** — it contains `NEXT_PUBLIC_API_BASE=http://localhost:8000` [VERIFIED: frontend/.env.local:1]; Next.js inlines it at build time, so the production export would call the absolute URL instead of relative `/api/*` — breaking the locked same-origin/no-CORS design and any non-default port mapping. **`.dockerignore` must exclude `frontend/.env.local`** (and `**/.env*`).
- **`USER root` without thinking** — the container holds no secrets (keys come via `--env-file` at runtime), but non-root is the standard hardening: create the user, `mkdir -p /app/db && chown` so the named-volume init copy inherits ownership. Decide explicitly (see A5).
- **Playwright version drift** — image tag `v1.62.0-jammy` + `@playwright/test@1.62.0`. A mismatched patch (e.g. npm 1.62.1 with image 1.62.0) yields "browser executable not found". [CITED: playwright.dev/docs/docker]
- **Reusing the stale cached images** — `finally:latest` (WORKDIR `/app/backend`, inert `FINALLY_DB_PATH`) and `mcr.microsoft.com/playwright:v1.48.0-jammy` are from an abandoned attempt; rebuild/re-pull at the correct versions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SPA fallback / static serving | Catch-all `@app.get("/{path}")` serving index.html | `app.frontend("/", directory=..., fallback="auto")` | Official feature since 0.138.0: GET/HEAD-only fallback, `404.html` vs `index.html` auto-selection, API priority, dependency/middleware support |
| Python env in container | pip install -r from scratch | `uv sync --locked` (two-phase) | Reproducible from committed `uv.lock`; cached deps layer; venv-only final stage |
| Browser binaries for E2E | Host install / playwright install in CI | `mcr.microsoft.com/playwright:v1.62.0-jammy` | Browsers + system deps preinstalled; version-pinned; `ipc: host` fix baked into compose |
| Multi-container orchestration for production | docker-compose.yml for prod | Single container + scripts | PROJECT.md locked "no compose for production"; compose is test-only |
| E2E state reset | API reset endpoint / test order gymnastics | `down -v` on a dedicated test volume | Deterministic seeded $10k fresh start every run; zero backend changes |
| Idempotency logic | Scripts that error on second run | `docker rm -f` + suppressed errors + health poll | `rm -f` on missing container is a no-op; volume survives |

**Key insight:** every genuinely hard problem in this phase (SPA serving, reproducible Python envs, browser automation, deterministic test state) is solved by the current official tooling — the phase is *wiring verified pieces*, not inventing. The only new backend code is two small lines (`app.frontend()` + env-aware `DB_PATH`).

## Common Pitfalls

### Pitfall 1: `check_dir="auto"` crashes backend-only contexts
**What goes wrong:** `app.frontend()` with the default `check_dir="auto"` **raises at app creation** when the static directory is missing; `frontend/out/` is gitignored (`frontend/.gitignore:18`), so a fresh checkout running backend pytest or `uv run uvicorn` explodes at import.
**Why it happens:** The check exists to catch deploy-without-frontend misconfigurations; it is unconditional outside `FASTAPI_ENV=development`.
**How to avoid:** `check_dir=False` — the directory exists in the container (baked by the Dockerfile); requests to `/` without the build error naturally, which never happens in the shipped image.
**Warning signs:** `RuntimeError: Directory 'static' does not exist` on import.

### Pitfall 2: The DB lands outside the volume (old image's bug)
**What goes wrong:** With WORKDIR `/app/backend` (the stale image's layout), `db/finally.db` resolves to `/app/backend/db/finally.db` — the `finally-data:/app/db` volume stays empty and **restarts lose positions/watchlist/cash**.
**Why it happens:** `DB_PATH` is cwd-relative and unconfigurable [VERIFIED: main.py:33]; the old Dockerfile set `ENV FINALLY_DB_PATH` the app never read.
**How to avoid:** WORKDIR `/app` (so relative `db/finally.db` → `/app/db/finally.db`) **and** add the `FINALLY_DB_PATH` env read; E2E asserts persistence by trading, restarting the container, and re-checking.
**Warning signs:** `docker exec finally ls /app/db` empty while `/app/backend/db/finally.db` grows.

### Pitfall 3: `NEXT_PUBLIC_API_BASE` leaks from `.env.local` into the production export
**What goes wrong:** The built `index.html`/JS bundle contains `http://localhost:8000` absolute API URLs; any port remap (`-p 8080:8000`) or non-localhost host breaks all calls.
**Why it happens:** Next.js auto-loads `.env.local` at build time; Docker copies the whole build context unless `.dockerignore` intervenes.
**How to avoid:** `.dockerignore` → `frontend/.env.local` (or `**/.env*`). The Docker build then inlines `''` → relative `/api/*` — same-origin, CORS never exercised (matches the locked constraint and the A1 dev-CORS decision).
**Warning signs:** E2E passes at `:8000` but the same image fails when mapped to another port.

### Pitfall 4: E2E "fresh start" fails on the second run
**What goes wrong:** The buy/sell/chat tests mutate cash and positions; re-running the suite against a persistent test volume asserts `$10,000.00` and fails.
**Why it happens:** The seeded profile is written once; `init_db` only seeds when the `users_profile` row is absent [VERIFIED: database.py:84-87].
**How to avoid:** `run-e2e` starts with `docker compose -f test/docker-compose.test.yml down -v` (removes the test volume). Never share the production volume.
**Warning signs:** Second run of the suite fails at the very first assertion.

### Pitfall 5: SSE disconnect not actually exercised
**What goes wrong:** `route.abort()` only intercepts *new* requests — an already-open EventSource stream is not killed by registering a route, so the "reconnecting" state never appears and the test false-passes or times out.
**Why it happens:** Routing sits in front of the network stack; established sockets are unaffected.
**How to avoid:** Use `context.setOffline(true/false)` (browser-level network loss) as the primary trigger — it makes in-flight connections fail and EventSource retry on the backend's `retry: 1000`; assert the dot's `aria-label` transitions `connected → reconnecting → connected` and a price cell changes after recovery. CDP `Network.emulateNetworkConditions({offline:true})` is the deterministic fallback. The `setOffline`-tears-down-SSE link is tagged [ASSUMED] — verify in the first test run.
**Warning signs:** Test asserts `reconnecting` but the dot stays green.

### Pitfall 6: Health poll races the backend boot
**What goes wrong:** `docker run -d` returns immediately; the start script prints "running" while uvicorn is still importing litellm (several seconds) — browsers hit a closed port.
**Why it happens:** No health gate in the naive script.
**How to avoid:** Poll `GET /api/health` (returns `{"status":"healthy"}` [VERIFIED: main.py:91-94]) in a retry loop (e.g. 30 × 2s); the test compose uses `depends_on: condition: service_healthy` with a python urllib healthcheck (slim images ship no curl).

## Code Examples

### Dockerfile skeleton (3 stages — primary recommendation)
```dockerfile
# Source: uv Docker guide [CITED] + FastAPI container guide [CITED]; layout adapted to this repo
# Stage 1 — frontend build (node:22 LTS; REQUIREMENTS says Node 20 → assumption A1)
FROM node:22-slim AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci                                  # deps layer cached; npm 10 (node:22) runs scripts normally
COPY frontend/ .                            # .env.local excluded via .dockerignore
RUN npm run build                           # output: 'export' → out/ (index.html + _next/ + 404.html)

# Stage 2 — backend deps (uv + python 3.12, two-phase sync)
FROM ghcr.io/astral-sh/uv:python3.12-slim-trixie AS backend-deps
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-install-project --no-editable
COPY backend/ .
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-editable

# Stage 3 — runtime: venv + static export only; no uv, no source, no node
FROM ghcr.io/astral-sh/uv:python3.12-slim-trixie
WORKDIR /app
COPY --from=backend-deps /app/.venv /app/.venv
COPY --from=frontend-build /build/out /app/static
ENV PATH="/app/.venv/bin:$PATH"
# non-root (A5): RUN useradd --create-home --uid 1000 app && mkdir -p /app/db && chown -R app:app /app/db
# USER app
EXPOSE 8000
CMD ["/app/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```
Notes: `WORKDIR /app` makes the relative default `db/finally.db` → `/app/db/finally.db`, exactly the DEPLOY-03 volume target. `uv run` is not used in CMD (no project file in runtime → use the venv binary directly). `--no-editable` bakes `app` into site-packages so the source need not be copied (uv docs "Non-editable installs").

### main.py changes (the only two backend code edits)
```python
# backend/app/main.py — replace line 33 (verbatim today):
#   DB_PATH: str = "db/finally.db"
# with:
DB_PATH: str = os.environ.get("FINALLY_DB_PATH", "db/finally.db")

# after the app.include_router(...) block (line 79) — static frontend serving:
app.frontend("/", directory="static", check_dir=False)
```
Both additions keep existing tests green: tests override the module attribute (`monkeypatch.setattr("app.main.DB_PATH", ...)` — 10+ call sites in `backend/tests/`), which still works; `check_dir=False` keeps `app.main` importable without a frontend build.

### docker-compose.test.yml skeleton (TEST-01)
```yaml
# Source: Playwright Docker docs [CITED: playwright.dev/docs/docker] — ipc: host for Chromium;
# REQUIREMENTS TEST-01: docker-compose.test.yml + Playwright container, LLM_MOCK=true
services:
  app:
    build: ..
    environment:
      - LLM_MOCK=true
    volumes:
      - finally-test-data:/app/db
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"]
      interval: 2s
      timeout: 3s
      retries: 30
  playwright:
    build:
      context: .
      dockerfile: playwright.Dockerfile   # FROM mcr.microsoft.com/playwright:v1.62.0-jammy; npm ci; COPY .
    ipc: host                              # recommended for Chromium (Playwright docs)
    depends_on:
      app:
        condition: service_healthy
    environment:
      - PLAYWRIGHT_BASE_URL=http://app:8000
    volumes:
      - ./tests:/test/tests
    working_dir: /test
    command: npx playwright test
volumes:
  finally-test-data:
```

### E2E reconnection test (TEST-02 SSE)
```typescript
// Source: patterns from playwright.dev/docs/api/class-browsercontext (setOffline) + class-route;
// assertions on selectors verified in frontend this session (Header.tsx:12-38, usePriceStream.ts:16-26)
test('SSE reconnects after network loss', async ({ page, context }) => {
  await page.goto('/');
  const dot = page.getByTestId('connection-dot');
  await expect(dot).toHaveAttribute('aria-label', 'connection: connected');
  const price = await page.locator('span').filter({ hasText: /^\$?[0-9]+\./ }).first().textContent();
  await context.setOffline(true);                                  // kill the stream
  await expect(dot).toHaveAttribute('aria-label', /reconnecting|closed/, { timeout: 10_000 });
  await context.setOffline(false);                                 // back online → EventSource retries
  await expect(dot).toHaveAttribute('aria-label', 'connection: connected', { timeout: 15_000 });
  await expect(page.locator('span').filter({ hasText: /^\$?[0-9]+\./ }).first())
    .not.toHaveText(price ?? '');
});
```

### Idempotent start/stop skeleton (DEPLOY-04)
```bash
# scripts/start_mac.sh
set -e
docker rm -f finally 2>/dev/null || true                       # idempotent: no-op if absent
[ -f .env ] && ENV_ARGS="--env-file .env" || ENV_ARGS=""
docker run -d --name finally -v finally-data:/app/db -p 8000:8000 $ENV_ARGS finally:latest
for i in $(seq 1 30); do
  curl -sf http://localhost:8000/api/health >/dev/null 2>&1 && break
  sleep 2
done
curl -sf http://localhost:8000/api/health >/dev/null && echo "FinAlly running at http://localhost:8000"
# scripts/stop_mac.sh
docker rm -f finally 2>/dev/null || true                       # volume finally-data is NOT removed
```
`start_windows.ps1` / `stop_windows.ps1` mirror with `2>$null` and `Invoke-WebRequest -UseBasicParsing`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Nginx/Caddy sidecar serving `out/` | FastAPI `app.frontend()` in the same container | FastAPI 0.138.0 (2026-07) | One container, one port, zero proxy config — the locked single-container architecture becomes the *idiomatic* FastAPI pattern |
| `pip install -r requirements.txt` in Docker | `uv sync --locked` from `uv.lock` | uv 0.4+ / now standard | Reproducible, fast (cache mounts), venv-only runtime images |
| `tiangolo/uvicorn-gunicorn-fastapi` base image | Build from `python`/uv base + `CMD ["uvicorn", ...]` | Deprecated (FastAPI docs) | No gunicorn needed; uvicorn handles single-process; --workers for the rest |
| Host-installed Playwright browsers | Official MCR image `mcr.microsoft.com/playwright:v1.62.0-jammy` | Continuous | Deterministic browser + OS deps; version must match `@playwright/test` |
| Node 20 LTS base | Node 22 LTS | Node 20 EOL 2026-04 | Security-maintained base for the frontend build stage (deviation A1) |

**Deprecated/outdated:**
- **`tiangolo/uvicorn-gunicorn-fastapi`** — FastAPI docs explicitly say do not use it; build from the official Python image instead [CITED: fastapi.tiangolo.com/deployment/docker].
- **`next export` CLI / `next start` for static export** — `output: 'export'` only (Phase 3 verified); Phase 4 serves `out/` via FastAPI.
- **Stale cached images on this machine** — `finally:latest` (2026-08-26, `/app/backend` layout, inert `FINALLY_DB_PATH`) and `mcr.microsoft.com/playwright:v1.48.0-jammy`: rebuild/re-pull at the researched versions.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Use `node:22-slim` for the frontend build stage instead of REQUIREMENTS' "Node 20" (Node 20 EOL Apr 2026; Next 16 needs >=20.9). | Standard Stack / Dockerfile | If the user insists on Node 20, pin `node:20-slim` (still builds Next 16.3.3) — only the base-image security posture changes. Needs user confirmation (requirement text says Node 20). |
| A2 | `app.frontend()` semantics (path-op priority, GET/HEAD-only fallback, `fallback="auto"` 404.html selection, `check_dir` behavior) as documented for 0.141.x are correct and stable across the 0.138→0.141.1 range. | Patterns / Pitfall 1 | The docs page is current (0.141.x); behavior changes between 0.138.0 and 0.141.1 were additive (deps, doted paths, check_dir). Low risk; executor's unit test on `app.frontend` import + a GET `/` smoke check verifies. |
| A3 | `context.setOffline(true)` tears down an *established* SSE connection in Chromium (Playwright docs confirm the API, not the socket-teardown behavior). | Pattern 5 / Pitfall 5 | If it doesn't, the reconnect test must use CDP `Network.emulateNetworkConditions` or `route.abort` + server restart; the assertion target (dot aria-label transitions) is unchanged. |
| A4 | Adding the `FINALLY_DB_PATH` env read to `main.py` (default `db/finally.db`) is acceptable and the volume should be mounted at `/app/db` with WORKDIR `/app`. | Patterns / Pitfall 2 | Alternative without the env read also works (WORKDIR /app only). The env read makes E2E DB isolation explicit and matches the previous attempt's intent. |
| A5 | Container runs non-root (`useradd` + chown `/app/db`) as the default hardening; if volume-permission friction appears on Docker Desktop, fall back to root for the local capstone. | Dockerfile / Security | Non-root + named-volume ownership is the standard pattern (volume init copies image ownership); a chown line in the Dockerfile covers it. |
| A6 | `@playwright/test@1.62.0` pinned to match `mcr.microsoft.com/playwright:v1.62.0-jammy`; the MCR `-jammy` (Ubuntu 22.04) tag exists for 1.62.0. | Standard Stack | The 1.62.0-jammy tag is confirmed by the Playwright docs image-tag list; if the pull 404s, use `:v1.62.0` (same Ubuntu 24.04 default) and keep npm at 1.62.0. |
| A7 | E2E runs serial (`workers: 1`, `fullyParallel: false`) against one mutable DB; "fresh start" is guaranteed by `down -v` in the orchestration script, not by test isolation. | Patterns | If parallelism is later wanted, each test would need its own DB path via `FINALLY_DB_PATH` — out of scope. |
| A8 | `frontend/out/` rebuilds in the Dockerfile from source (never copied from the host) — `out/` is gitignored and must not leak into the image via the context. | Dockerfile / .dockerignore | `.dockerignore` must exclude `frontend/out` and `frontend/.next`; forgetting only wastes build time (source copy wins), it does not corrupt the build. |

## Open Questions (RESOLVED)

1. **Node 20 vs Node 22 base (A1 — needs confirmation)**
   - What we know: DEPLOY-02 says "Node 20 build"; Node 20 reached EOL 2026-04 (security unsupported); Next 16.3.3 requires Node >=20.9; host runs Node 24.19.0.
   - What's unclear: whether the user prefers literal compliance (node:20-slim, EOL base) or the maintained alternative (node:22-slim).
   - Recommendation: `node:22-slim`; note the deviation in the plan and gate behind `checkpoint:human-verify` if the user wants strict compliance.
   - **RESOLVED (2026-08-27):** User confirmed **node:22-slim** (recommended) over the EOL Node 20. Locked decision A1; carried into 04-01 Task 2 Dockerfile.
2. **`FINALLY_DB_PATH` env support in main.py (A4)**
   - What we know: `DB_PATH` is hardcoded [VERIFIED: main.py:33]; the old abandoned image set an inert `FINALLY_DB_PATH`.
   - What's unclear: none technically — the change is 1 line, tests unaffected.
   - Recommendation: adopt it; it converts "volume works by WORKDIR coincidence" into an explicit, testable contract.
   - **RESOLVED (2026-08-27):** Adopted in 04-01 Task 1 — `DB_PATH = os.environ.get("FINALLY_DB_PATH", "db/finally.db")` + the PATTERNS `import os` gotcha + a new env-read unit test.
3. **E2E `setOffline` socket-teardown behavior (A3)**
   - What we know: `context.setOffline` is documented; the frontend reconnect path is verified (`onerror` → `reconnecting`, never `close()`).
   - What's unclear: whether offline mode closes an already-open SSE socket in the pinned Chromium.
   - Recommendation: build the test with `setOffline` first; if the dot never leaves `connected`, switch to CDP `Network.emulateNetworkConditions` (documented fallback in the plan).
   - **RESOLVED (2026-08-27):** Decision procedure locked in 04-04 Task 2 — setOffline primary, CDP fallback; the working trigger is recorded in the 04-04 SUMMARY after the first E2E run.

## Environment Availability

> Step 2.6: RUN. Docker Desktop was **not running** at research start (`failed to connect to the docker API at npipe://...dockerDesktopLinuxEngine`); it was started this session and the daemon came up (server 29.6.2). The executor should check `docker info` first and start Docker Desktop if needed (installed at `C:\Program Files\Docker\Docker\Docker Desktop.exe`; WSL2 default distro Ubuntu).

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker CLI + daemon | All DEPLOY/TEST work | ✓ (daemon started this session) | 29.6.2 | Start Docker Desktop; WSL2 Ubuntu present |
| Docker Compose v2 (`docker compose`) | `test/docker-compose.test.yml` | ✓ | v5.3.1 | — |
| Node.js / npm | Frontend build stage + authoring E2E tests | ✓ | 24.19.0 / 11.17.0 | — |
| uv | Backend `uv sync --locked` (host + image) | ✓ | 0.12.6 | — |
| Python | Backend tests/verification | ✓ | 3.12.12 | — |
| Cached `finally:latest` image | (stale — do not reuse) | ✓ but stale | 2026-08-26 | Rebuilt this phase |
| Cached `mcr.microsoft.com/playwright:v1.48.0-jammy` | (stale — do not reuse) | ✓ but stale | v1.48.0 | Pull `v1.62.0-jammy` |
| `OPENROUTER_API_KEY` | Live chat in the container | ✗ (no root `.env`; only `.env.example`) | — | `LLM_MOCK=true` (E2E) / user creates `.env` for live chat; scripts pass `--env-file .env` only when present |
| `test/` dir, `Dockerfile`, `scripts/`, `db/`, `.dockerignore` | Everything | ✗ (greenfield) | — | Created this phase |

**Missing dependencies with no fallback:** none — the phase is fully executable: Docker Desktop present, all toolchains installed, keys optional (mock mode).
**Missing dependencies with fallback:** `OPENROUTER_API_KEY` → `LLM_MOCK=true`; stale cached images → rebuild/re-pull; Docker daemon down → start Docker Desktop (documented).

## Validation Architecture

> `workflow.nyquist_validation: true` (config.json) — included. Phase 4's testable outputs are E2E (TEST-01/02); backend/frontend unit suites must stay green as regression gates.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Playwright Test 1.62.0 (in `test/`, run inside the `mcr.microsoft.com/playwright:v1.62.0-jammy` container via `test/docker-compose.test.yml`) |
| Config file | `test/playwright.config.ts` — `baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8000'`, project chromium, `headless: true`, `fullyParallel: false`, `workers: 1`, `retries: 0` |
| Quick run command | `docker compose -f test/docker-compose.test.yml up playwright` (targeted: `npx playwright test tests/watchlist.spec.ts` inside the container) |
| Full suite command | `test/run-e2e.sh` (down -v → up --build -d → npx playwright test → down -v) |
| Phase gate | Full E2E suite green + `down -v`; backend `uv run --extra dev pytest` green; frontend `npx vitest run` + `npm run build` green; `docker run --rm -v finally-data:/app/db ...` restart-persistence check |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEPLOY-01 | Container serves `index.html` + `_next/*` + `/api/health` on 8000 | e2e/smoke | fresh-start.spec.ts (page loads, dot connected) + start-script health poll | ❌ Wave 0 |
| DEPLOY-02 | Multi-stage image builds; runtime has no node/uv source | build | `docker build -t finally:latest .` + `docker history` sanity | ❌ Wave 0 |
| DEPLOY-03 | SQLite persists across restart | e2e + manual | trading.spec.ts → `docker restart finally` → assert position/cash survive (E2E asserts via API re-fetch) | ❌ Wave 0 |
| DEPLOY-04 | start/stop idempotent (run twice, no error; volume survives) | manual/script | `bash scripts/start_mac.sh && bash scripts/start_mac.sh` returns 0; `stop` then `start` preserves data | ❌ Wave 0 |
| TEST-01 | compose test stack boots app+playwright with LLM_MOCK | infra | `test/run-e2e.sh` | ❌ Wave 0 |
| TEST-02 | six scenarios pass | e2e | `npx playwright test` in the playwright container | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** targeted backend/frontend unit tests (fast) — full E2E cycle (~1–3 min) only when the task touches Docker/scripts/E2E.
- **Per wave merge:** full E2E suite via `test/run-e2e.sh` + backend pytest + frontend vitest/build (all three).
- **Phase gate:** E2E green + restart-persistence check + all unit suites green before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `backend/app/main.py` — `FINALLY_DB_PATH` env read + `app.frontend("/", directory="static", check_dir=False)`
- [ ] `backend/uv.lock` — fastapi bumped to 0.141.1 (`uv add fastapi@0.141.1`); verify backend pytest still green (regression)
- [ ] `Dockerfile` (3-stage skeleton above), `.dockerignore` (must exclude `frontend/.env.local`, `frontend/out`, `frontend/.next`, `**/node_modules`, `backend/.venv`, `.git`, `.env`)
- [ ] `scripts/start_mac.sh`, `scripts/stop_mac.sh`, `scripts/start_windows.ps1`, `scripts/stop_windows.ps1`
- [ ] `db/.gitkeep` + root `.gitignore` entry for `db/finally.db` (today only `db.sqlite3` is ignored — a runtime `db/finally.db` would be tracked!)
- [ ] `test/package.json` + `package-lock.json` (`@playwright/test@1.62.0`), `test/playwright.config.ts`, `test/playwright.Dockerfile`, `test/docker-compose.test.yml`, `test/run-e2e.sh`/`.ps1`
- [ ] `test/tests/*.spec.ts` — the six scenarios (fresh-start, watchlist, trading, visualizations, chat, sse-reconnect)
- [ ] Backend unit test for the env read: `tests/test_app.py` — `monkeypatch.setenv("FINALLY_DB_PATH", str(tmp_path / "x.db"))` + import/reload `app.main` asserts `DB_PATH` honors it

## Security Domain

> `workflow.security_enforcement: true`, `security_asvs_level: 1` (config.json) — included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user `"default"` model by design (REQUIREMENTS.md Out of Scope) |
| V3 Session Management | no | Stateless API; no sessions |
| V4 Access Control | no | Single user, no roles |
| V5 Input Validation | **yes (unchanged)** | Backend Pydantic stays authoritative (422/400/404/409 — Phase 1/2 verified); the container adds no new input surface. E2E never weakens validation. |
| V6 Cryptography | no | No TLS in-container (proxy/domain concern, out of scope); no new secrets handling |
| V8 Data Protection / secrets | **yes** | `OPENROUTER_API_KEY`/`MASSIVE_API_KEY` arrive via `--env-file .env` at runtime — never `ENV` in the Dockerfile, never baked into image layers; `.env` excluded via `.dockerignore` and already gitignored (`.gitignore:138`) |
| V9 Communication | no | Single localhost port 8000; no external listeners |
| V14 Configuration | **yes** | `uv sync --locked` + `npm ci` from committed lockfiles; pinned base image tags; non-root runtime user (A5); `--no-editable` bakes code into the image (no live source edits) |

### Known Threat Patterns for the Deployment Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key leakage into image layers | Information Disclosure | Keys only via `--env-file`/`-e` at `docker run`; `.dockerignore` excludes `.env`; never `ENV OPENROUTER_API_KEY=...` in the Dockerfile |
| Root process in container (if compromised) | Elevation of Privilege | Non-root `USER app` + chowned `/app/db` (A5); container is ephemeral and holds no keys at rest |
| Stale/unpinned base images | Tampering | Pin base image tags (`python3.12-slim-trixie`, `node:22-slim`, `playwright:v1.62.0-jammy`) and package versions via lockfiles (`uv.lock`, `package-lock.json`) |
| Malicious npm postinstall during build | Tampering | `npm ci` from committed `package-lock.json`; phase packages have `postinstall: null` (audit table); `allowScripts: {next: true}` already scoped in `frontend/package.json` |
| Supply-chain drift in FastAPI bump | Tampering | `uv lock` regeneration pinned to 0.141.1 (2026-07-29 stable); litellm declares no fastapi constraint (verified) |
| E2E container touching production data | Tampering | Dedicated `finally-test-data` volume; `down -v` wipes only test data; production volume never mounted in the test compose |

## Sources

### Primary (HIGH confidence)
- [fastapi.tiangolo.com/tutorial/frontend/](https://fastapi.tiangolo.com/tutorial/frontend/) (current) — `app.frontend()` API: path-op priority, `fallback="auto"`/`"index.html"`/`"404.html"`/`None`, GET/HEAD-only, `check_dir` semantics, APIRouter usage
- [github.com/fastapi/fastapi releases](https://api.github.com/repos/fastapi/fastapi/releases) — fetched this session: **0.138.0 introduced `app.frontend()`** (PR #15800), 0.138.2 (non-GET/HEAD 404), 0.139.0 (deps support), 0.139.1 (doted paths), 0.141.0 (`check_dir="auto"`), 0.141.1 (background tasks/headers fix); 0.141.1 published 2026-07-29
- [docs.astral.sh/uv/guides/integration/docker/](https://docs.astral.sh/uv/guides/integration/docker/) — official images (`ghcr.io/astral-sh/uv:python3.12-slim-trixie`, `:0.12.6`), `COPY --from=... /uv /uvx /bin/`, `uv sync --locked`, `.venv` dockerignore, cache mounts, intermediate `--no-install-project` layer, non-editable venv-only runtime, `CMD ["/app/.venv/bin/hello"]`
- [playwright.dev/docs/docker](https://playwright.dev/docs/docker) — MCR image tags (`v1.62.0-jammy`), browsers-not-package, version-match rule, `--ipc=host`, `--init`, root-for-trusted-E2E, Alpine unsupported
- [playwright.dev/docs/api/class-browsercontext](https://playwright.dev/docs/api/class-browsercontext) — `setOffline`, `newCDPSession`, `route`/`unroute` verified
- [playwright.dev/docs/api/class-route](https://playwright.dev/docs/api/class-route) — `abort(errorCode)` incl. `connectionreset`/`internetdisconnected`
- [fastapi.tiangolo.com/deployment/docker/](https://fastapi.tiangolo.com/deployment/docker/) — exec-form CMD for lifespan, deps-first cache ordering, one-process-per-container, deprecated `tiangolo/uvicorn-gunicorn-fastapi`
- In-repo (read this session, line-cited in text): `backend/app/main.py:33,91-94`, `backend/app/db/database.py:70-89,108-116`, `backend/app/chat/service.py:46,55-59,223-228`, `backend/app/market/factory.py:24`, `backend/app/market/simulator.py:151-152`, `backend/uv.lock:450-453,910-937`, `frontend/out/index.html` (absolute `/_next` paths), `frontend/components/header/Header.tsx:12-38`, `frontend/hooks/usePriceStream.ts:16-26`, `frontend/.env.local:1`, `frontend/.gitignore:18`, `.gitignore:138`, `.env.example`, `frontend/package.json`, `backend/pyproject.toml`

### Secondary (MEDIUM confidence)
- npm registry (`npm view` this session): `@playwright/test` 1.62.1/1.62.0 (2026-07-30), `playwright` 1.62.1 — versions/publish dates/dist-tags
- Phase 3 artifacts: `03-RESEARCH.md` (A2 frontend() gap, SSE `retry:1000`, contract types), `03-07-SUMMARY.md` (out/ guarantee, dev-CORS decision), `STATE.md` (npm-11 allowScripts decision, Phase 1/2 precedent)
- Playwright `setOffline` tearing down an established SSE socket — API documented, socket behavior [ASSUMED] (A3)

### Tertiary (LOW confidence)
- CDP `Network.emulateNetworkConditions` as the deterministic reconnect trigger — CDPSession API documented; the CDP method signature is training knowledge, tagged [ASSUMED] (fallback path only)
- Node 20 EOL timing and LTS recommendation — standard lifecycle knowledge, not re-verified this session (A1)

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — fastapi/uv/playwright versions pinned from official docs + registries this session; version-introduced facts from the release notes API; image tags from Playwright docs; in-repo pins read from `uv.lock`/`package.json`
- Architecture: **HIGH** — every in-repo fact (DB_PATH, health endpoint, mock chat, simulator add_ticker, selectors, connection states, .env.local) verified by reading the files this session with line citations; FastAPI serving decision grounded in the official tutorial + release history
- Pitfalls: **MEDIUM** — the `setOffline`-vs-SSE socket behavior (A3) and non-root volume ownership on Docker Desktop (A5) are not live-tested this session; the E2E first run will confirm them

**Research date:** 2026-08-27
**Valid until:** 2026-09-26 (30 days) — fastapi/playwright/uv move monthly; re-check the fastapi pin and the MCR image tag on `docker pull` (A6).
