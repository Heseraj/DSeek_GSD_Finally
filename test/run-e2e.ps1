# run-e2e.ps1: deterministic E2E orchestration (04-PATTERNS.md:354)
# Sequence: down -v --remove-orphans -> up --build -d app -> run --rm playwright -> down -v (unconditional)
$ErrorActionPreference = 'Stop'

# Leading down -v wipes finally-test-data -> deterministic seeded $10k fresh start
docker compose -f test/docker-compose.test.yml down -v --remove-orphans

# SERVICE-SCOPED up: playwright is behind profiles: [e2e], so a bare `up` would
# skip it; scoping to `app` keeps the intent explicit and safe.
docker compose -f test/docker-compose.test.yml up --build -d app

docker compose -f test/docker-compose.test.yml run --rm playwright npx playwright test
$status = $LASTEXITCODE

# Trailing down -v ALWAYS runs, even on test failure
docker compose -f test/docker-compose.test.yml down -v --remove-orphans
exit $status
