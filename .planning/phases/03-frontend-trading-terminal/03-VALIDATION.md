---
phase: 3
slug: frontend-trading-terminal
status: validated
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-26
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 + @testing-library/react 16.3.2 + @testing-library/jest-dom 7.0.1 + jsdom 30.0.1 |
| **Config file** | `frontend/vitest.config.ts` (`environment: 'jsdom'`, `setupFiles: ['./tests/setup.ts']`) |
| **Quick run command** | `npx vitest run tests/<file> -q` (per task/commit) |
| **Full suite command** | `npx vitest run` + `npm run build` (phase gate: both green + `npx tsc --noEmit`) |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **Per task commit:** `npx vitest run tests/<changed> -q` (targeted)
- **Per wave merge:** `npx vitest run` (full frontend suite) + `npm run build` (static export still compiles)
- **Phase gate:** Full suite green + build succeeds + `npx tsc --noEmit` clean before `/gsd-verify-work`
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | 01 | 1 | UI-01 | T-03-04 | Terminal shell renders panels; text never via dangerouslySetInnerHTML | component | `npx vitest run tests/TerminalApp.test.tsx -q` | ❌ W0 | ⬜ pending |
| TBD | 02 | 1 | UI-02, UI-07 | T-03-02 | SSE frames parsed defensively; flash class + sparklines; readyState → indicator | unit + component | `npx vitest run tests/usePriceStream.test.ts tests/TickerRow.test.tsx -q` | ❌ W0 | ⬜ pending |
| TBD | 03 | 2 | UI-03 | — | Heatmap treemap + P&L chart + positions table from mocked data | component | `npx vitest run tests/Heatmap.test.tsx tests/PnlChart.test.tsx tests/PositionsTable.test.tsx -q` | ❌ W0 | ⬜ pending |
| TBD | 04 | 2 | UI-04 | — | TradeBar posts `{ticker, quantity, side}`; reflects returned portfolio | component (fetch mock) | `npx vitest run tests/TradeBar.test.tsx -q` | ❌ W0 | ⬜ pending |
| TBD | 05 | 3 | UI-05 | T-03-01 | ChatPanel loading → message + confirmations inline; 503-with-ChatResponse contract | component (fetch mock) | `npx vitest run tests/ChatPanel.test.tsx -q` | ❌ W0 | ⬜ pending |
| TBD | 06 | 3 | UI-06 | — | Watchlist add (409 handled) + remove (204/404 handled) | component (fetch mock) | `npx vitest run tests/WatchlistPanel.test.tsx -q` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/` scaffold via `create-next-app` (Next 16.3.3, TS, App Router, Tailwind 4) + `output:'export'` in `next.config.ts`
- [ ] `frontend/vitest.config.ts` + `tests/setup.ts` — jsdom env, jest-dom matchers, `EventSource` class mock, global `fetch` mock via `vi.stubGlobal`
- [ ] `frontend/lib/types.ts` — backend contract types
- [ ] `frontend/tests/` — the seven test files mapped above
- [ ] Framework install: `npm install -D vitest@4.1.11 @testing-library/react@16.3.2 @testing-library/jest-dom@7.0.1 jsdom@30.0.1`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live SSE streaming + chart interaction in a real browser (prices flash, sparklines fill, ticker chart renders) | UI-02, UI-03 | jsdom has no real canvas/EventSource timing; component tests cover logic, not pixels | `cd frontend && npm run dev`, open http://localhost:3000, observe live prices flashing + sparklines filling |
| Full-page visual (dark terminal, density, layout balance) | UI-01 | Automated tests assert presence, not aesthetics | Visually inspect the running app |
| Chat with real LLM (if OPENROUTER_API_KEY provided) | UI-05 | Requires API key; mock mode covers the contract in tests | Set LLM_MOCK=false + key, send a chat message |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (plan-phase will finalize task IDs)
