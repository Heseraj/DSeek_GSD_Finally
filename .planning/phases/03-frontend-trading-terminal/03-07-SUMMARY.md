---
phase: 03-frontend-trading-terminal
plan: 07
subsystem: ui
tags: [cors, fastapi, nextjs, dev-tooling, browser-verification, manual-verify]

# Dependency graph
requires:
  - phase: 03-frontend-trading-terminal
    provides: 03-06 composed terminal grid (all eight components, TickerRow remove wiring), the full automated battery (58 vitest tests, build, tsc, lint)
provides:
  - Dev-only CORSMiddleware in backend/app/main.py (allow_origins=['http://localhost:3000'], no credentials, DEV-ONLY comment) — unlocks next dev :3000 -> FastAPI :8000 (assumption A1, user-confirmed deviation from the locked no-CORS constraint)
  - Human-signed browser verification of the running terminal: all 8 manual checks passed at http://localhost:3000
  - Verified dev loop: uvicorn :8000 + next dev :3000, OPTIONS preflight carries access-control-allow-origin, GET /api/health healthy
affects: [phase-04-docker, gsd-verify-work]

# Actuals (#2632) — chars/4 over the realized diff (1 modified file, small middleware addition).
actuals:
  tokens: 1200
  tasks: 2
  commits: 1

# Tech tracking
tech-stack:
  added: [] # no new deps — FastAPI's built-in CORSMiddleware
  patterns: [dev-only middleware gated by human approval, single-origin CORS (localhost:3000 only, no credentials, no wildcard), production stays same-origin]

key-files:
  created: []
  modified: [backend/app/main.py]

key-decisions:
  - "Dev-only CORSMiddleware (allow_origins=['http://localhost:3000'], no credentials=True, no wildcard) added to backend/app/main.py — user-confirmed A1 deviation; production static-export builds keep relative /api and never exercise CORS (threat T-03-03 mitigated)"

patterns-established:
  - "Dev-only capability gating: a human-verify checkpoint (gate=blocking-human) authorizes dev-environment deviations from locked production constraints; the middleware carries an explicit DEV-ONLY comment and stays inert in production"

requirements-completed: [UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "Dev-only CORSMiddleware in backend/app/main.py (allow_origins exactly ['http://localhost:3000'], no credentials, DEV-ONLY comment) so next dev on :3000 can reach FastAPI on :8000; production static-export builds stay same-origin"
    requirement: UI-01
    verification:
      - kind: integration
        ref: "OPTIONS preflight from Origin http://localhost:3000 -> access-control-allow-origin: http://localhost:3000"
        status: pass
    human_judgment: false
  - id: D2
    description: "Human-signed browser verification of the complete trading terminal at http://localhost:3000: all 8 manual checks passed (layout, SSE price flashes + sparklines, connection dot states, ticker chart, instant trading, portfolio visuals, chat with confirmations, watchlist add/remove)"
    requirement: UI-02
    verification:
      - kind: manual_procedural
        ref: "03-VALIDATION.md:62-69 manual checks — user approved (all 8 passed)"
        status: pass
    human_judgment: true

# Metrics
duration: 15min
completed: 2026-08-27
status: complete
---

# Phase 3 Plan 7: Dev-CORS + Manual Verification Summary

**The dev loop opened and the complete terminal signed off in a browser — dev-only CORSMiddleware (user-approved A1 deviation, single dev origin, inert in production) added to the backend, then all eight manual browser checks passed on the running app**

## Performance

- **Duration:** ~15 min (2 executor sessions + 1 human sign-off)
- **Completed:** 2026-08-27
- **Tasks:** 2
- **Files modified:** 1 (backend/app/main.py)

## Accomplishments

- **Task 1 — Dev-only CORS middleware (committed `f4b745e`):** `from fastapi.middleware.cors import CORSMiddleware` + `app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], allow_methods=["*"], allow_headers=["*"])` added to `backend/app/main.py` after the router includes, with an explicit `DEV ONLY` comment marking assumption A1 (user-confirmed deviation from PROJECT.md's locked no-CORS constraint). No `credentials=True`, no wildcard origin. Production static-export builds keep relative `/api` and are same-origin — CORS is never exercised there (threat T-03-03: single dev origin, no wildcard, no credentials).
- **Verified:** `uv run --extra dev ruff check app/main.py` clean; GET /api/health → `{"status":"healthy"}` on :8000; OPTIONS preflight from Origin `http://localhost:3000` carries `access-control-allow-origin: http://localhost:3000`.
- **Task 2 — Human browser verification (approved):** the running terminal at http://localhost:3000 was verified by the user against the 8 manual checks (03-07-PLAN.md:97-105 / 03-VALIDATION.md:62-69): dark Bloomberg-style layout (header live total + connection dot + $10,000.00 cash, ten watchlist tickers, main chart, portfolio, trade bar, chat panel); prices flash green/red + sparklines fill from SSE; connection dot green (and reconnect behavior); ticker click → larger live Area chart; buy/sell updates cash/positions/header instantly; heatmap + P&L chart + positions table render live; chat send → loading → confirmations inline (LLM_MOCK); watchlist add + remove with sparkline disappearance. **All 8 passed.**
- The automated battery remains green: 58 vitest tests, `npm run build` (out/index.html), `npx tsc --noEmit`, `npm run lint`.

## Task Commits

1. **Task 1: Add dev-only CORSMiddleware** - `f4b745e` (feat)
2. **Task 2: Human gate — browser verification** - user-approved; no code change

**Plan metadata:** committed with the phase completion docs.

## Files Created/Modified

- `backend/app/main.py` - added `CORSMiddleware` import + `app.add_middleware(...)` with `allow_origins=["http://localhost:3000"]` (DEV-ONLY, no credentials, no wildcard) (modified)

## Decisions Made

- **Dev-only CORS accepted (A1)** — the user approved the middleware deviation after reviewing the diff: single origin `http://localhost:3000`, no credentials, DEV-ONLY comment, production unaffected. This is the documented cost of `output:'export'` forbidding `rewrites`/`proxy` (03-RESEARCH.md:269-271); the alternative (serve `out/` from FastAPI) was declined for its slower dev loop.
- **Human gate completed inline** — the browser checks were presented directly to the user (not re-dispatched to a subagent, which had stalled twice at this gate); the user ran them on the live app and approved.

## Deviations from Plan

None. The plan's two tasks were completed as specified; the only process note is that the executor subagent twice halted at the Task 2 human gate (expected — it is `gate="blocking-human"`), and the gate was completed by presenting it to the user directly.

## Issues Encountered

- Two executor interruptions at the Task 2 human gate (the subagent correctly refuses to auto-pass a blocking-human gate). Resolved by presenting the checks to the user inline and collecting the verdict in the orchestrator — no code impact.

## User Setup Required

- None for Phase 3 sign-off. Live chat still requires `OPENROUTER_API_KEY` + `LLM_MOCK` unset (02-USER-SETUP.md); the panel is verified against the mock path.

## Next Phase Readiness

- **Phase 4 (Deployment & E2E):** the static export lands in `frontend/out/` and the backend serves it. RESEARCH flags a gap: the installed FastAPI is 0.128.7, which lacks `app.frontend()` (added later; docs show 0.141.1 has it) — Phase 4 must either bump FastAPI or use `StaticFiles` + a catch-all fallback (03-RESEARCH.md:451-454, RESEARCH A2). DEPLOY-01..04 + TEST-01..02: single Docker container on port 8000, persistent SQLite (volume), Playwright E2E (fresh start, watchlist add/remove, buy/sell, visualizations, mocked AI chat, SSE reconnection).
- `/gsd-verify-work 3` optional: every UI-XX requirement now has an automated test path plus the human browser sign-off.

---
*Phase: 03-frontend-trading-terminal*
*Completed: 2026-08-27*

## Self-Check: PASSED

- `backend/app/main.py` on disk with the CORSMiddleware addition; commit `f4b745e` present
- User approved all 8 manual browser checks (recorded in the orchestrator verdict)
- Automated gates green on the committed state (58 vitest tests, build, tsc, lint)
