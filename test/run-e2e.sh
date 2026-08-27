#!/usr/bin/env bash
# run-e2e: deterministic E2E orchestration (RESEARCH.md:130, 239; Pattern 4 / Pitfall 4)
# Sequence: down -v -> up --build -d app -> run --rm playwright -> down -v (unconditional)
# CR-01 fix: the run status is captured WITHOUT `set -e` aborting the script, so the
# trailing `down -v` ALWAYS executes even when the test suite fails.

set -e

cleanup() {
  status=$?
  docker compose -f test/docker-compose.test.yml down -v >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

# Leading down -v wipes finally-test-data -> deterministic seeded $10k fresh start
docker compose -f test/docker-compose.test.yml down -v

# SERVICE-SCOPED up: playwright is behind profiles: [e2e], so a bare `up` would
# skip it; scoping to `app` keeps the intent explicit and safe.
docker compose -f test/docker-compose.test.yml up --build -d app

# Run the suite; do not let a non-zero exit trip `set -e` before cleanup.
set +e
docker compose -f test/docker-compose.test.yml run --rm playwright npx playwright test
status=$?
set -e

# Trap fires here -> down -v + exit $status
exit $status
