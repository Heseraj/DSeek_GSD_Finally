#!/usr/bin/env bash
# run-e2e: deterministic E2E orchestration (RESEARCH.md:130, 239; Pattern 4 / Pitfall 4)
# Sequence: down -v -> up --build -d app -> run --rm playwright -> down -v (unconditional)
set -e

# Leading down -v wipes finally-test-data -> deterministic seeded $10k fresh start
docker compose -f test/docker-compose.test.yml down -v

# SERVICE-SCOPED up: playwright is behind profiles: [e2e], so a bare `up` would
# skip it; scoping to `app` keeps the intent explicit and safe.
docker compose -f test/docker-compose.test.yml up --build -d app

# Capture the exit status so the trailing down -v ALWAYS runs, even on test failure
docker compose -f test/docker-compose.test.yml run --rm playwright npx playwright test
status=$?

docker compose -f test/docker-compose.test.yml down -v
exit $status
