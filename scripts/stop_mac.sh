#!/usr/bin/env bash
# scripts/stop_mac.sh — idempotent stop for the FinAlly container (DEPLOY-04)
# The finally-data volume is deliberately NOT removed — data survives (DEPLOY-03).
docker rm -f finally 2>/dev/null || true
