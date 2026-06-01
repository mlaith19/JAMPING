# =============================================================
#  JAMPING — Start all services
#  Opens server and client in separate terminal windows.
# =============================================================

$Root = Split-Path $PSScriptRoot -Parent

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  JAMPING — Starting..." -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── Start database ────────────────────────────────────────────
Write-Host "Starting database..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot"
docker-compose up -d | Out-Null
Write-Host "Database ready on port 5440." -ForegroundColor Green

# ── Start server ──────────────────────────────────────────────
Write-Host "Starting server (port 4000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$Root\server'; Write-Host 'JAMPING Server' -ForegroundColor Cyan; npm run dev"
) -WindowStyle Normal

Start-Sleep -Seconds 2

# ── Start client ──────────────────────────────────────────────
Write-Host "Starting client (port 5173)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$Root\client'; Write-Host 'JAMPING Client' -ForegroundColor Cyan; npm run dev"
) -WindowStyle Normal

Start-Sleep -Seconds 3

# ── Open browser ──────────────────────────────────────────────
Write-Host "Opening browser..." -ForegroundColor Yellow
Start-Process "http://localhost:5173"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  JAMPING is running!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Client:  http://localhost:5173" -ForegroundColor Cyan
Write-Host "  Server:  http://localhost:4000" -ForegroundColor Cyan
Write-Host "  DB:      localhost:5440" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Close the server/client windows to stop." -ForegroundColor Gray
Write-Host ""
