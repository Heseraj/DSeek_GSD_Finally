# scripts/stop_windows.ps1 - idempotent stop for the FinAlly container (DEPLOY-04)
# The finally-data volume is deliberately NOT removed - data survives (DEPLOY-03).
docker rm -f finally 2>$null | Out-Null
