---
status: testing
phase: 04-deployment-e2e
source: [04-VERIFICATION.md]
started: 2026-08-27T06:47:13.622Z
updated: 2026-08-27T06:47:13.622Z
---

## Current Test

number: 1
name: macOS/Linux shell scripts live execution (DEPLOY-04)
expected: |
  On a real macOS or Linux host, run scripts/start_mac.sh twice consecutively, then scripts/stop_mac.sh, then scripts/start_mac.sh again; make a trade (e.g. buy 3 AAPL via the API or UI) before the stop and confirm it survives the stop → start cycle.
awaiting: user response

## Tests

### 1. macOS/Linux shell scripts live execution
expected: Both start invocations exit 0 (second start replaces the running container without error); stop leaves 0 containers while the `finally-data` volume is retained; the pre-stop trade is visible after the final start (cash_balance < 10000).
result: [pending]

### 2. Repeated interactive start/stop UX
expected: No errors on any invocation; "FinAlly running at http://localhost:8000" is printed only after `/api/health` responds; the pre-stop trade survives through `finally-data`.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps

- Test 1 requires a real macOS/Linux host (this verification host is Windows-only).
- Test 2 is the interactive shell-script UX feel (automated runs cover exit codes only).
