# scripts/start_windows.ps1 - idempotent start for the FinAlly container (DEPLOY-04)
$ErrorActionPreference = 'Stop'

# Build the image only when missing - a second run skips the build (idempotent).
docker image inspect finally:latest *> $null
if ($LASTEXITCODE -ne 0) {
    docker build -t finally:latest .
    if ($LASTEXITCODE -ne 0) { Write-Host 'docker build failed'; exit 1 }
}

# Idempotency linchpin: 2>$null mirrors 2>/dev/null - a no-op when the container is absent,
# and cleanly replaces a live container (e.g. from an earlier start).
docker rm -f finally 2>$null | Out-Null

# Keys are passed at runtime only, never baked (T-04-01): --env-file only when .env exists.
$envArgs = @()
if (Test-Path .env) { $envArgs = @('--env-file', '.env') }

# No --rm: the named container is the stop model; finally-data volume persists (DEPLOY-03).
docker run -d --name finally -v finally-data:/app/db -p 8000:8000 @envArgs finally:latest
if ($LASTEXITCODE -ne 0) { Write-Host 'docker run failed'; exit 1 }

# Health-poll gate (Pitfall 6): wait up to 30x2s for /api/health before declaring ready.
$healthy = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        Invoke-WebRequest -UseBasicParsing http://localhost:8000/api/health -TimeoutSec 3 | Out-Null
        $healthy = $true
        break
    } catch {
        Start-Sleep -Seconds 2
    }
}
if (-not $healthy) { Write-Host 'FinAlly failed to become healthy within 60s'; exit 1 }
Write-Host 'FinAlly running at http://localhost:8000'
