# =============================================================
#  JAMPING — Stop database
#  (Close the server/client windows manually first)
# =============================================================

$PSScriptRoot_local = $PSScriptRoot

Write-Host "Stopping JAMPING database..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot_local"
docker-compose down
Write-Host "Database stopped." -ForegroundColor Green
