# Phase 4: Deployment & E2E — Pattern Map

**Mapped:** 2026-08-26
**Files analyzed:** 24 (20 create, 4 modify)
**Analogs found:** 12 / 24 (4 exact existing-file edits, 8 role-match; 12 greenfield → RESEARCH.md skeletons)

**Phase nature:** GREENFIELD infra — no `Dockerfile`, `scripts/`, `test/`, `db/`, `.dockerignore`, or Playwright anywhere in the repo (verified: zero `*.sh`, `*.ps1`, `Dockerfile*`, `compose*.yml`, `playwright.config.*`). The pattern sources are (a) RESEARCH.md §Code Examples skeletons (lines 255–366), (b) existing repo conventions in `.gitignore`, `frontend/package.json`, `backend/pyproject.toml`/`uv.lock`, `backend/tests/`, and (c) the frontend components/tests that the E2E specs must assert against.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/app/main.py` (MODIFY) | config (app entrypoint) | request-response | itself + `backend/app/chat/service.py:38-46` env-read | exact (modify) |
| `backend/uv.lock` (MODIFY) | config (lockfile) | batch (build-time) | itself (line 451: fastapi `0.128.7`) | exact (regenerate) |
| `backend/tests/test_app.py` (MODIFY) | test | request-response | itself (`_make_client` lines 17–20) | exact (modify) |
| `.gitignore` (MODIFY) | config | none | itself (line 61 `db.sqlite3` block) | exact (modify) |
| `Dockerfile` (CREATE) | config (build) | batch | none → RESEARCH.md skeleton lines 255–284 | greenfield (skeleton) |
| `.dockerignore` (CREATE) | config | batch | `.gitignore` (root) + `frontend/.gitignore` | role-match |
| `db/.gitkeep` (CREATE) | config (dir placeholder) | none | `frontend/.gitignore` `/.next/` `/out/` conventions | convention |
| `scripts/start_mac.sh` (CREATE) | utility | batch (lifecycle) | none → RESEARCH.md skeleton lines 351–365 | greenfield (skeleton) |
| `scripts/stop_mac.sh` (CREATE) | utility | batch (lifecycle) | none → RESEARCH.md skeleton line 363–365 | greenfield (skeleton) |
| `scripts/start_windows.ps1` (CREATE) | utility | batch (lifecycle) | `start_mac.sh` skeleton (mirror `2>$null`) | greenfield (skeleton) |
| `scripts/stop_windows.ps1` (CREATE) | utility | batch (lifecycle) | `stop_mac.sh` skeleton (mirror) | greenfield (skeleton) |
| `test/package.json` + `package-lock.json` (CREATE) | config | none | `frontend/package.json` | role-match |
| `test/playwright.config.ts` (CREATE) | config (test runner) | batch | `frontend/tests/setup.ts` + RESEARCH Validation Arch (line 439) | partial |
| `test/playwright.Dockerfile` (CREATE) | config (build) | batch | root `Dockerfile` pattern (COPY + npm ci) | greenfield (skeleton) |
| `test/docker-compose.test.yml` (CREATE) | config (orchestration) | batch | none → RESEARCH.md skeleton lines 299–331 | greenfield (skeleton) |
| `test/run-e2e.sh` / `run-e2e.ps1` (CREATE) | utility | batch | `scripts/*` idempotency pattern + RESEARCH Pattern 4 (line 187) | greenfield (skeleton) |
| `test/tests/fresh-start.spec.ts` (CREATE) | test | request-response + streaming | `frontend/tests/TerminalApp.test.tsx` Test 1–2 (lines 140–162) | role-match |
| `test/tests/watchlist.spec.ts` (CREATE) | test | CRUD + streaming | `TerminalApp.test.tsx` Test 6 (lines 246–268) | role-match |
| `test/tests/trading.spec.ts` (CREATE) | test | CRUD | `TerminalApp.test.tsx` Test 5 (lines 220–244) | role-match |
| `test/tests/visualizations.spec.ts` (CREATE) | test | request-response | `TerminalApp.test.tsx` Test 4 (lines 185–218) | role-match |
| `test/tests/chat.spec.ts` (CREATE) | test | request-response | `TerminalApp.test.tsx` + `chat/service.py:55-59` mock shape | role-match |
| `test/tests/sse-reconnect.spec.ts` (CREATE) | test | event-driven (SSE) | `TerminalApp.test.tsx` Test 1 + RESEARCH skeleton lines 333–349 | partial |

---

## Pattern Assignments

### `backend/app/main.py` (MODIFY — config, request-response)

**Analog:** itself + `backend/app/chat/service.py:38-46` (call-time env read convention)

**Edit 1 — env-configurable DB path.** Today's hardcoded line 33:
```python
# backend/app/main.py:31-33 (today)
# Location of the SQLite database file (relative to the working directory).
# Tests override this module attribute before booting the app.
DB_PATH: str = "db/finally.db"
```
Replace with (RESEARCH.md:13, 292):
```python
DB_PATH: str = os.environ.get("FINALLY_DB_PATH", "db/finally.db")
```
**Gotcha the planner MUST include:** `os` is NOT currently imported in `main.py` (imports are only `asyncio`, `contextlib`, `logging`, `dotenv`, `fastapi`, `CORSMiddleware` — lines 5–13). Add `import os` to the import block. RESEARCH counts this as "2 lines" of change but the `import os` is a third required edit.

**Env-read convention source** — `backend/app/chat/service.py:38-46` (`_mock_enabled` reads at call time, truthy-token set; this is the same style the `FINALLY_DB_PATH` read follows):
```python
def _mock_enabled() -> bool:
    return os.environ.get("LLM_MOCK", "").strip().lower() in {"true", "1", "yes"}
```

**Edit 2 — static frontend serving.** Append after the `include_router` block (line 79), before/adjacent to the CORS middleware (line 83) (RESEARCH.md:172, 295):
```python
# backend/app/main.py — after app.include_router(chat_router)
app.frontend("/", directory="static", check_dir=False)
```
`check_dir=False` (not the default `"auto"`) is mandatory: `frontend/out/` is gitignored (`frontend/.gitignore:18`), so backend pytest in a fresh checkout must still import `app.main` (RESEARCH Pitfall 1, lines 218–222).

**Test-compat guarantee:** existing tests override the module attribute (`backend/tests/test_app.py:19` `monkeypatch.setattr("app.main.DB_PATH", ...)`) — the attribute override still wins over the env read, so all 10+ call sites stay green (RESEARCH.md:297).

---

### `backend/uv.lock` (MODIFY — config lockfile)

**Analog:** itself — the fastapi package entry, `backend/uv.lock:449-452`:
```toml
[[package]]
name = "fastapi"
version = "0.128.7"
```
**Pattern:** bump via uv (RESEARCH.md:75–78, 463): `cd backend && uv add fastapi@0.141.1` (regenerates `uv.lock`, no manual edit). `pyproject.toml:8` already allows it (`fastapi>=0.115.0`) — **no pyproject.toml change**. `app.frontend()` requires ≥0.138.0 (RESEARCH.md:49). After bump: `uv sync --extra dev` and run backend pytest as a regression gate. Verify litellm 1.98.0 has no fastapi pin (RESEARCH verified `backend/uv.lock:910-937`).

---

### `backend/tests/test_app.py` (MODIFY — test)

**Analog:** itself — the `_make_client` fixture, `backend/tests/test_app.py:17-20`:
```python
def _make_client(tmp_path, monkeypatch) -> TestClient:
    """Build a TestClient whose lifespan writes the database to a temp file."""
    monkeypatch.setattr("app.main.DB_PATH", str(tmp_path / "finally.db"))
    return TestClient(app)
```
**New test to add (RESEARCH.md:470):** env-read unit test — same file, follow the existing class/docstring style (`class TestAppSmoke`, `test_` methods with docstrings):
```python
def test_db_path_reads_finally_db_path_env(self, tmp_path, monkeypatch):
    """Test that DB_PATH honors the FINALLY_DB_PATH environment variable."""
    monkeypatch.setenv("FINALLY_DB_PATH", str(tmp_path / "env.db"))
    import importlib, app.main as main
    main.DB_PATH = None  # or del attribute — force re-read path
    importlib.reload(main)
    assert main.DB_PATH == str(tmp_path / "env.db")
```
**Conventions to copy:** module docstring (`"""Smoke tests for the FastAPI application entry point."""` line 1), `from __future__ import annotations` (line 3), pytest built-in fixtures only (`tmp_path`, `monkeypatch`), class-based grouping. pyproject.toml pytest config: `testpaths = ["tests"]`, `asyncio_mode = "auto"` (lines 36–42) — no pytest-asyncio markers needed.

---

### `.gitignore` (MODIFY — config)

**Analog:** itself — the SQLite ignore block, `.gitignore:60-62`:
```gitignore
# Django stuff:
*.log
local_settings.py
db.sqlite3
db.sqlite3-journal
```
**Add (RESEARCH.md:467 — today only `db.sqlite3` is ignored, so a runtime `db/finally.db` WOULD be tracked):**
```gitignore
db/finally.db
db/finally.db-journal
```
Placed next to the `db.sqlite3` entries. Also note `.gitignore:138` already ignores `.env` and line 140 `.venv` — the `.dockerignore` will mirror these.

---

### `Dockerfile` (CREATE — 3-stage build)

**Analog:** none in repo (greenfield). Pattern source = RESEARCH.md skeleton lines 255–284 (uv Docker guide + FastAPI container guide). Copy verbatim, adjusting only if A1/A5 are decided differently:

```dockerfile
# RESEARCH.md:259-283 (primary recommendation)
# Stage 1 — frontend build (node:22 LTS; REQUIREMENTS says Node 20 → assumption A1)
FROM node:22-slim AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .                            # .env.local excluded via .dockerignore
RUN npm run build                           # output: 'export' → out/

# Stage 2 — backend deps (uv + python 3.12, two-phase sync)
FROM ghcr.io/astral-sh/uv:python3.12-slim-trixie AS backend-deps
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-install-project --no-editable
COPY backend/ .
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-editable

# Stage 3 — runtime: venv + static export only
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
**Non-negotiables (RESEARCH: Pitfalls 2, 3; A5/A8):**
- `WORKDIR /app` — makes relative `db/finally.db` → `/app/db/finally.db`, the exact DEPLOY-03 volume target.
- `CMD` exec-form, uvicorn binary directly (no `uv run` — no project file in runtime stage).
- `--no-editable` in stage 2 bakes `app` into site-packages (RESEARCH.md:285).
- **Never `--workers > 1`** — PriceCache/simulator/snapshot-loop are process-local state (RESEARCH.md:37, 196).
- `COPY --from=frontend-build /build/out /app/static` — the directory name must match `app.frontend(directory="static")`.

---

### `.dockerignore` (CREATE — build-context filter)

**Analog:** root `.gitignore` (207 lines) + `frontend/.gitignore`. Pattern = mirror the repo's ignore conventions, plus the three phase-specific MUSTs (RESEARCH.md:137-139, Pitfall 3 line 233, A8 line 394):
```
# RESEARCH.md:137-139 (required set)
.git
**/node_modules
frontend/.next
frontend/out
frontend/.env.local
backend/.venv
**/__pycache__
.pytest_cache
.ruff_cache
.planning/
.env
```
- **`frontend/.env.local` is the critical one** — it contains `NEXT_PUBLIC_API_BASE=http://localhost:8000`; if it leaks into the build context, Next.js inlines absolute URLs into the production export, breaking same-origin `/api/*` (RESEARCH Pitfall 3, lines 230–234; verified `frontend/lib/api.ts:3` inlines `NEXT_PUBLIC_API_BASE`).
- `frontend/out` excluded so the host's gitignored build never leaks into the image (A8 — source copy wins; omission only wastes build time, never corrupts).
- `.env` mirrors `.gitignore:138`.

---

### `db/.gitkeep` (CREATE — config placeholder)

**Analog:** none (convention). Empty file so the `db/` directory survives git while `db/finally.db` is ignored (new `.gitignore` entry above). The runtime named volume mounts over `/app/db` in the container, so this is a host-repo-only placeholder (RESEARCH.md:141, 467).

---

### `scripts/start_mac.sh`, `scripts/stop_mac.sh` (CREATE — utility)

**Analog:** none in repo. Pattern source = RESEARCH.md skeleton lines 351–365. Copy verbatim:
```bash
# scripts/start_mac.sh (RESEARCH.md:353-362)
set -e
docker rm -f finally 2>/dev/null || true                       # idempotent: no-op if absent
[ -f .env ] && ENV_ARGS="--env-file .env" || ENV_ARGS=""
docker run -d --name finally -v finally-data:/app/db -p 8000:8000 $ENV_ARGS finally:latest
for i in $(seq 1 30); do
  curl -sf http://localhost:8000/api/health >/dev/null 2>&1 && break
  sleep 2
done
curl -sf http://localhost:8000/api/health >/dev/null && echo "FinAlly running at http://localhost:8000"

# scripts/stop_mac.sh (RESEARCH.md:363-364)
docker rm -f finally 2>/dev/null || true                       # volume finally-data is NOT removed
```
**Patterns:** fixed container name `finally` (no `--rm` — `-d` + named container needed for the stop model); `rm -f` with suppressed error = idempotency; health poll against `/api/health` (returns `{"status": "healthy"}` — `backend/app/main.py:91-94`); volume NEVER removed by stop.

---

### `scripts/start_windows.ps1`, `scripts/stop_windows.ps1` (CREATE — utility)

**Analog:** the sh scripts above (mirror). RESEARCH.md:183, 366 — PowerShell equivalents:
```powershell
# scripts/start_windows.ps1 (RESEARCH.md:366, 183)
$ErrorActionPreference = 'Stop'
docker rm -f finally 2>$null | Out-Null                      # idempotent — 2>$null mirrors 2>/dev/null
$envArgs = @()
if (Test-Path .env) { $envArgs = @('--env-file', '.env') }
docker run -d --name finally -v finally-data:/app/db -p 8000:8000 @envArgs finally:latest
for ($i = 0; $i -lt 30; $i++) {
  try { Invoke-WebRequest -UseBasicParsing http://localhost:8000/api/health | Out-Null; break }
  catch { Start-Sleep -Seconds 2 }
}
Write-Host "FinAlly running at http://localhost:8000"

# scripts/stop_windows.ps1
docker rm -f finally 2>$null | Out-Null                       # volume finally-data is NOT removed
```
`Invoke-WebRequest -UseBasicParsing` replaces `curl` (slim image has no curl, but these scripts run on the host which has PowerShell). Never remove `finally-data`.

---

### `test/package.json` + `test/package-lock.json` (CREATE — config)

**Analog:** `frontend/package.json` (npm conventions in this repo: `"private": true`, devDependencies for test tooling, `allowScripts` where npm 11 blocks lifecycle scripts):
```json
{
  "name": "finally-e2e",
  "version": "0.1.0",
  "private": true,
  "scripts": { "test": "playwright test" },
  "devDependencies": {
    "@playwright/test": "1.62.0"
  }
}
```
**Critical pins (RESEARCH.md:52, 200; A6):** `@playwright/test` **exact-pin `1.62.0`** (no `^`) to match the MCR image tag `v1.62.0-jammy` — version drift = "browser executable not found". Install with `npm init -y && npm i -D @playwright/test@1.62.0` (RESEARCH.md:75). `package-lock.json` is generated — commit it (reproducible `npm ci` in the image). No `allowScripts` needed: `@playwright/test` has `postinstall: null` (RESEARCH.md:84).

---

### `test/playwright.config.ts` (CREATE — test-runner config)

**Analog:** partial — no Playwright in repo; `frontend/tests/setup.ts` shows the vitest conventions, but Playwright's own config shape comes from RESEARCH Validation Architecture (RESEARCH.md:439):
```typescript
// RESEARCH.md:439 (locked properties)
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,               // one mutable SQLite DB — serial only (A7)
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8000',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```
`workers: 1` + `fullyParallel: false` are mandatory (RESEARCH.md:15, A7) — the six specs share one mutable DB; determinism comes from `down -v` in `run-e2e`, not test isolation.

---

### `test/playwright.Dockerfile` (CREATE — E2E browser image)

**Analog:** root `Dockerfile` pattern (COPY manifests → `npm ci` → COPY source); base image is official. RESEARCH.md:152, 318:
```dockerfile
# RESEARCH.md:152 (FROM mcr.microsoft.com/playwright:v1.62.0-jammy; npm ci; COPY tests)
FROM mcr.microsoft.com/playwright:v1.62.0-jammy
WORKDIR /test
COPY package.json package-lock.json ./
RUN npm ci                          # browsers + system deps already in the base image
COPY tests ./tests                  # (or rely on the compose volume ./tests:/test/tests)
```
**Pin rule (RESEARCH.md:200, A6):** image tag `v1.62.0-jammy` must match the npm `@playwright/test` version exactly. The image has browsers preinstalled — `npx playwright install` is NOT run and NOT needed.

---

### `test/docker-compose.test.yml` (CREATE — orchestration)

**Analog:** none in repo (compose is TEST-ONLY per PROJECT.md:56 — no production compose). Pattern source = RESEARCH.md skeleton lines 299–331:
```yaml
# RESEARCH.md:303-331 (skeleton)
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
      dockerfile: playwright.Dockerfile
    ipc: host                              # Chromium requirement (Playwright docs)
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
**Key patterns:** healthcheck uses `python -c urllib` because the slim image ships **no curl** (RESEARCH.md:251); `depends_on: condition: service_healthy` replaces the scripts' poll loop; `finally-test-data` is a **different** volume from production `finally-data` — E2E never touches production data (RESEARCH.md:187, Pattern 4); `ipc: host` only on the playwright service.

---

### `test/run-e2e.sh` / `test/run-e2e.ps1` (CREATE — utility)

**Analog:** `scripts/*` idempotency conventions + RESEARCH Pattern 4 (RESEARCH.md:187) and orchestration sequence (RESEARCH.md:130):
```bash
# test/run-e2e.sh (RESEARCH.md:130, 239)
set -e
docker compose -f test/docker-compose.test.yml down -v      # -v wipes finally-test-data → deterministic $10k seed
docker compose -f test/docker-compose.test.yml up --build -d
# capture exit code so down -v ALWAYS runs even on test failure:
docker compose -f test/docker-compose.test.yml run --rm playwright npx playwright test
status=$?
docker compose -f test/docker-compose.test.yml down -v
exit $status
```
The `.ps1` mirror uses `docker compose -f test/docker-compose.test.yml down -v --remove-orphans` and `$LASTEXITCODE`. **The leading `down -v` is what makes the "fresh start" scenario deterministic** (RESEARCH Pitfall 4, lines 236–240: the seeded profile is written once, so a persistent test volume fails the suite's first `$10,000.00` assertion on re-run).

---

### E2E specs — `test/tests/*.spec.ts` (six files, CREATE — test)

**Analog:** `frontend/tests/TerminalApp.test.tsx` (role-match — asserts the exact same `data-testid`/aria selectors the specs must use) + `frontend/components/header/Header.tsx` + `frontend/hooks/usePriceStream.ts` + `backend/app/chat/service.py` (mock shape).

**Import pattern (Playwright, from RESEARCH.md:337):**
```typescript
import { test, expect } from '@playwright/test';
```

**Selector source of truth — verified in `frontend/components/header/Header.tsx:12-38`:**
```tsx
// Header.tsx:34-37 — the connection-dot the specs assert on
<span
  data-testid="connection-dot"
  aria-label={`connection: ${connection}`}   // connected | reconnecting | closed
  className={`inline-block h-2.5 w-2.5 rounded-full ${DOT_CLASS[connection]}`}
/>
// DOT_CLASS (Header.tsx:12-16): connected='bg-emerald-500', reconnecting='bg-yellow-500', closed='bg-red-500'
```

**Selector conventions already proven in `frontend/tests/TerminalApp.test.tsx` (copy these queries into the specs):**
```typescript
// TerminalApp.test.tsx:146-150 — connection-dot by aria-label (NOT data-testid)
screen.getByLabelText('connection: closed')            // → specs: page.getByLabel('connection: connected')
// :196-198 — watchlist rows by sparkline data-testid
screen.findByTestId('sparkline-AAPL')                  // → specs: page.getByTestId('sparkline-AAPL')
// :206-207 — heatmap cells
screen.findByTestId('heatmap-cell-AAPL')               // → specs: page.getByTestId('heatmap-cell-AAPL')
// :213-217 — trade bar: labels + role buttons
screen.getByLabelText('Ticker'); screen.getByLabelText('Quantity')
screen.getByRole('button', { name: 'Buy' }); screen.getByRole('button', { name: 'Sell' })
// :217 — chat input
screen.getByPlaceholderText('Ask the AI to trade…')
// :199 — remove buttons (role+name convention)
screen.getByRole('button', { name: 'Remove AAPL' })
```

**Spec-to-analog mapping (all six use `page.goto('/')` then the selectors above):**

| Spec | Asserts | Analog excerpt |
|------|---------|----------------|
| `fresh-start.spec.ts` | `/` loads, header cash `$10,000.00`, 10 sparklines, connection dot green | TerminalApp.test.tsx Test 1 (140–154) + Test 2 (156–162) |
| `watchlist.spec.ts` | Add PYPL → row + sparkline appears + streams; remove → gone | TerminalApp.test.tsx Test 6 (246–268) DELETE/204 shape |
| `trading.spec.ts` | Buy 10 AAPL → cash ↓ + position; sell 5 → cash ↑ qty 5 | TerminalApp.test.tsx Test 5 (220–244) trade POST body `{ticker, quantity, side}` |
| `visualizations.spec.ts` | heatmap cells, P&L chart, positions table render | TerminalApp.test.tsx Test 4 (185–218) |
| `chat.spec.ts` | Mock chat → `[mock] Acknowledged:` + AAPL buy confirmation | `chat/service.py:55-59` mock shape: `{"message": "[mock] Acknowledged: ...", "trades": [{"ticker": "AAPL", "side": "buy", "quantity": 1}]}` |
| `sse-reconnect.spec.ts` | connected → setOffline → reconnecting → online → connected | RESEARCH.md skeleton lines 334–349 (below) |

**SSE-reconnect spec — the one test with no in-repo analog; copy RESEARCH.md:337-348 verbatim:**
```typescript
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
Frontend behavior backing this test — `frontend/hooks/usePriceStream.ts:16-17`: `es.onerror` sets `reconnecting` and **never calls `es.close()`** (browser auto-reconnects honoring backend `retry: 1000`). A3 [ASSUMED]: if `setOffline` doesn't tear down an established SSE socket, fall back to CDP `Network.emulateNetworkConditions` via `context.newCDPSession` (RESEARCH.md:192, 245, 409).

---

## Shared Patterns

### 1. Env read at call time (config-seam convention)
**Source:** `backend/app/chat/service.py:38-46` (`_mock_enabled`)
**Apply to:** `backend/app/main.py` (`FINALLY_DB_PATH`), `test/docker-compose.test.yml` (`LLM_MOCK=true`), `test/playwright.config.ts` (`PLAYWRIGHT_BASE_URL`)
```python
return os.environ.get("LLM_MOCK", "").strip().lower() in {"true", "1", "yes"}
```
Pattern: module-level reads of `os.environ.get` with a safe default; truthy-token set `{"true","1","yes"}` (RESEARCH.md:27); tests override via `monkeypatch.setenv`.

### 2. Idempotent Docker lifecycle (fixed name + suppressed errors)
**Source:** RESEARCH.md Pattern 3 (lines 180–183)
**Apply to:** `scripts/start_mac.sh`, `scripts/stop_mac.sh`, `scripts/start_windows.ps1`, `scripts/stop_windows.ps1`
```bash
docker rm -f finally 2>/dev/null || true     # no-op when absent → second run never errors
```
`--rm` is NOT used (`-d` + named container required). The volume `finally-data` is never removed by stop.

### 3. Health-poll gate before "ready"
**Source:** `backend/app/main.py:91-94` (`{"status": "healthy"}`) + RESEARCH Pitfall 6 (lines 248–251)
**Apply to:** start scripts (30×2s loop), `test/docker-compose.test.yml` healthcheck (`python -c urllib` — slim image has no curl)
```python
@app.get("/api/health")
def health() -> dict:
    return {"status": "healthy"}
```

### 4. Version pinning for reproducibility
**Source:** `frontend/package.json` (npm) + `backend/uv.lock` (uv)
**Apply to:** `test/package.json` (`@playwright/test: "1.62.0"` exact), Dockerfile (`uv sync --locked`, `npm ci` from committed lockfiles), base image tags (`node:22-slim`, `ghcr.io/astral-sh/uv:python3.12-slim-trixie`, `mcr.microsoft.com/playwright:v1.62.0-jammy` — all digest-pinned tags, never `latest`). Version drift between npm package and MCR image tag = "browser executable not found" (RESEARCH.md:200).

### 5. Ignore-list conventions (git + docker build context)
**Source:** `.gitignore` (root:138-140 ignores `.env`/`.venv`) + `frontend/.gitignore:17-18` (`/.next/`, `/out/`)
**Apply to:** new `.dockerignore` (mirror set + `frontend/.env.local`), `.gitignore` (`db/finally.db`)

### 6. monkeypatch test isolation
**Source:** `backend/tests/test_app.py:17-20` (`_make_client`)
**Apply to:** new `FINALLY_DB_PATH` env-read test — same `tmp_path` + `monkeypatch` style, class grouping `TestAppSmoke`.

---

## No Analog Found

Greenfield files with no in-repo match — planner should use the RESEARCH.md skeletons cited (they are the authoritative pattern source; all were authored from official uv/FastAPI/Playwright Docker docs this session):

| File | Role | Data Flow | Reason | Pattern Source |
|------|------|-----------|--------|----------------|
| `Dockerfile` | config/build | batch | No containerization anywhere in repo; stale cached `finally:latest` (WORKDIR `/app/backend`, inert `FINALLY_DB_PATH`) is an abandoned attempt — do NOT copy it (RESEARCH.md:9, 381) | RESEARCH.md:255-284 |
| `.dockerignore` | config | batch | No build-context filtering exists | RESEARCH.md:137-139 + Pitfall 3 |
| `scripts/*.sh` / `*.ps1` | utility | batch | No scripts exist; no shell/PowerShell conventions to mirror | RESEARCH.md:351-366 |
| `test/package.json` | config | none | (partial analog: `frontend/package.json`) | RESEARCH.md:75, 148 |
| `test/playwright.config.ts` | config | batch | No Playwright anywhere (no `playwright.config.*`, no playwright packages — RESEARCH.md:9) | RESEARCH.md:439 |
| `test/playwright.Dockerfile` | config/build | batch | No Docker image for tooling | RESEARCH.md:152 |
| `test/docker-compose.test.yml` | config/orchestration | batch | Compose is TEST-ONLY (PROJECT.md:56 locked "no compose for production") | RESEARCH.md:299-331 |
| `test/run-e2e.sh` / `.ps1` | utility | batch | No orchestration scripts | RESEARCH.md:130, 187, 239 |
| `test/tests/sse-reconnect.spec.ts` | test | event-driven | No SSE test exists; frontend vitest uses MockEventSource, not real network loss | RESEARCH.md:333-349 |
| `db/.gitkeep` | config | none | Repo has no empty-dir placeholders today | convention |

---

## Metadata

**Analog search scope:** repo root + `backend/` + `frontend/` (config files, tests, components, hooks, chat service); `.planning/phases/04-deployment-e2e/04-RESEARCH.md` skeletons for greenfield
**Files scanned:** ~15 (`.gitignore`, `frontend/.gitignore`, `backend/pyproject.toml`, `backend/uv.lock`, `frontend/package.json`, `.env.example`, `backend/app/main.py`, `backend/app/db/database.py`, `backend/app/chat/service.py`, `backend/tests/test_app.py`, `backend/tests/conftest.py`, `frontend/tests/TerminalApp.test.tsx`, `frontend/components/header/Header.tsx`, `frontend/hooks/usePriceStream.ts`, `frontend/lib/api.ts`, `frontend/out/` export)
**Pattern extraction date:** 2026-08-26
