#!/usr/bin/env bash
# scripts/start_mac.sh — idempotent start for the FinAlly container (DEPLOY-04)
set -e

# Build the image only when missing — a second run skips the build (idempotent).
docker image inspect finally:latest >/dev/null 2>&1 || docker build -t finally:latest .

# Idempotency linchpin: suppressed-error rm is a no-op when the container is absent,
# and cleanly replaces a live container (e.g. from an earlier start).
docker rm -f finally 2>/dev/null || true

# Keys are passed at runtime only, never baked (T-04-01): --env-file only when .env exists.
[ -f .env ] && ENV_ARGS="--env-file .env" || ENV_ARGS=""

# No --rm: the named container is the stop model; finally-data volume persists (DEPLOY-03).
docker run -d --name finally -v finally-data:/app/db -p 8000:8000 $ENV_ARGS finally:latest

# Health-poll gate (Pitfall 6): wait up to 30x2s for /api/health before declaring ready.
for i in $(seq 1 30); do
  curl -sf http://localhost:8000/api/health >/dev/null 2>&1 && break
  sleep 2
done
curl -sf http://localhost:8000/api/health >/dev/null && echo "FinAlly running at http://localhost:8000"
