# run-e2e.ps1: deterministic E2E orchestration (04-PATTERNS.md:354)
# Sequence: down -v --remove-orphans -> up --build -d app -> run --rm playwright -> down -v (unconditional)
# WR-04 fix: try/finally guarantees the trailing down -v runs even if a native
# command (or $PSNativeCommandUseErrorActionPreference interplay) throws.

$ErrorActionPreference = 'Stop'

$testStatus = 1
try {
  # Leading down -v wipes finally-test-data -> deterministic seeded $10k fresh start
  docker compose -f test/docker-compose.test.yml down -v --remove-orphans
  if ($LASTEXITCODE -ne 0) { throw "down -v failed (exit $LASTEXITCODE)" }

  # SERVICE-SCOPED up: playwright is behind profiles: [e2e], so a bare `up` would
  # skip it; scoping to `app` keeps the intent explicit and safe.
  docker compose -f test/docker-compose.test.yml up --build -d app
  if ($LASTEXITCODE -ne 0) { throw "up failed (exit $LASTEXITCODE)" }

  docker compose -f test/docker-compose.test.yml run --rm playwright npx playwright test
  $testStatus = $LASTEXITCODE
}
finally {
  # Trailing down -v ALWAYS runs, even on test failure or a thrown error
  docker compose -f test/docker-compose.test.yml down -v --remove-orphans | Out-Null
}

exit $testStatus
