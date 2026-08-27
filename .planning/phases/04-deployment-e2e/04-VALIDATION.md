---
phase: 4
slug: deployment-e2e
status: validated
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-27
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright Test 1.62.0 (in `test/`, run inside the `mcr.microsoft.com/playwright:v1.62.0-jammy` container via `test/docker-compose.test.yml`) |
| **Config file** | `test/playwright.config.ts` — `baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:8000'`, project chromium, `headless: true`, `fullyParallel: false`, `workers: 1`, `retries: 0` |
| **Quick run command** | `docker compose -f test/docker-compose.test.yml up playwright` (targeted: `npx playwright test tests/watchlist.spec.ts` inside the container) |
| **Full suite command** | `test/run-e2e.sh` (down -v → up --build -d → npx playwright test → down -v) |
| **Estimated runtime** | ~3 minutes (full E2E cycle) |

---

## Sampling Rate

- **Per task commit:** targeted backend/frontend unit tests (fast) — full E2E cycle (~1–3 min) only when the task touches Docker/scripts/E2E.
- **Per wave merge:** full E2E suite via `test/run-e2e.sh` + backend pytest + frontend vitest/build (all three).
- **Phase gate:** E2E green + restart-persistence check + all unit suites green before `/gsd-verify-work`.
- **Max feedback latency:** 180 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | 01 | 1 | DEPLOY-01, DEPLOY-02, DEPLOY-03 | T-04-04 | Multi-stage image; no node/uv source in runtime; non-root USER; keys never ENV-baked | build + smoke | `docker build -t finally:latest . && docker history finally:latest` | ❌ W0 | ⬜ pending |
| TBD | 02 | 1 | DEPLOY-03, DEPLOY-04 | T-04-05 | FINALLY_DB_PATH env read; volume-mounted db persists across restart | unit + e2e | `pytest tests/test_app.py` + restart-persistence check | ❌ W0 | ⬜ pending |
| TBD | 03 | 2 | DEPLOY-04 | — | start/stop scripts idempotent (run twice, volume survives) | manual/script | `bash scripts/start_mac.sh && bash scripts/start_mac.sh` exit 0 | ❌ W0 | ⬜ pending |
| TBD | 04 | 3 | TEST-01, TEST-02 | — | compose test stack boots app + playwright with LLM_MOCK=true | infra | `test/run-e2e.sh` | ❌ W0 | ⬜ pending |
| TBD | 05 | 3 | TEST-02 | T-04-06 | Six E2E scenarios pass; test data isolated on finally-test-data volume | e2e | `npx playwright test` in the playwright container | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/app/main.py` — `FINALLY_DB_PATH` env read + `app.frontend("/", directory="static", check_dir=False)`
- [ ] `backend/uv.lock` — fastapi bumped to 0.141.1 (`uv add fastapi@0.141.1`); verify backend pytest still green
- [ ] `Dockerfile` (3-stage), `.dockerignore` (exclude `frontend/.env.local`, `frontend/out`, `frontend/.next`, `**/node_modules`, `backend/.venv`, `.git`, `.env`)
- [ ] `scripts/start_mac.sh`, `scripts/stop_mac.sh`, `scripts/start_windows.ps1`, `scripts/stop_windows.ps1`
- [ ] `db/.gitkeep` + root `.gitignore` entry for `db/finally.db`
- [ ] `test/package.json` + lock (`@playwright/test@1.62.0`), `test/playwright.config.ts`, `test/playwright.Dockerfile`, `test/docker-compose.test.yml`, `test/run-e2e.sh`/`.ps1`
- [ ] `test/tests/*.spec.ts` — the six scenarios (fresh-start, watchlist, trading, visualizations, chat, sse-reconnect)
- [ ] Backend unit test for the env read: `tests/test_app.py` — `monkeypatch.setenv("FINALLY_DB_PATH", str(tmp_path / "x.db"))` + reload `app.main` asserts `DB_PATH` honors it

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Start/stop idempotency + data survival | DEPLOY-04 | Shell-script UX + Docker Desktop behaviors; automated runs cover exit codes but not repeated-interactive semantics | Run `scripts/start_mac.sh` twice, then `stop_mac.sh`, then `start_mac.sh` again; confirm no errors and a trade made before the stop survives |
| `docker run` restart-persistence | DEPLOY-03 | Container lifecycle outside Playwright's reach | `docker run -d --rm -p 8000:8000 -v finally-data:/app/db --env-file .env finally:latest`, make a trade, `docker restart <id>`, confirm cash/positions survive via API |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (plan-phase will finalize task IDs)
