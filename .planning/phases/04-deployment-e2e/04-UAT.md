---
status: complete
phase: 04-deployment-e2e
source: [04-VERIFICATION.md]
started: 2026-08-27T06:47:13.622Z
updated: 2026-08-27T07:00:00.000Z
---

## Current Test

number: 2
name: Repeated interactive start/stop UX (DEPLOY-04)
expected: |
  Run start_windows.ps1 → make a trade → stop_windows.ps1 → start_windows.ps1; no errors; URL prints after /api/health; trade survives through finally-data.
awaiting: user response — COMPLETE (passed)

## Tests

### 1. macOS/Linux shell scripts live execution
expected: Both start invocations exit 0 (second start replaces the running container without error); stop leaves 0 containers while the `finally-data` volume is retained; the pre-stop trade is visible after the final start (cash_balance < 10000).
result: skipped
reason: No macOS/Linux host available (Windows-only verification machine). Scripts were WSL bash -n syntax-validated (exit 0) and logic-mirrored against the functionally-proven start_windows.ps1/stop_windows.ps1 pair. User confirmed skip.

### 2. Repeated interactive start/stop UX
expected: No errors on any invocation; "FinAlly running at http://localhost:8000" is printed only after `/api/health` responds; the pre-stop trade survives through `finally-data`.
result: pass
reported: "Ran live: start (exit 0, URL after health), buy 3 AAPL (cash 7910.26 → 7340.17), stop (exit 0, 0 containers, volume retained), start again (exit 0, cash 7340.17 — trade survived)."

## Summary

total: 2
passed: 1
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

- Test 1 skipped: no macOS/Linux host available (Windows-only verification machine). WSL syntax-validated + logic-mirrored against the proven ps1 pair; can be run on a mac/Linux host later if one becomes available.
- Test 2 passed: repeated interactive start/stop UX proven live (trade survived stop→start through finally-data).
