# =============================================================
#  JAMPING — First-time setup
#  Run this ONCE on a new computer, then use start.ps1 daily.
# =============================================================

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  JAMPING Setup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Check Node.js ─────────────────────────────────────────
Write-Host "[1/6] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVer = node --version
    Write-Host "      Node.js $nodeVer found." -ForegroundColor Green
} catch {
    Write-Host "      ERROR: Node.js not found." -ForegroundColor Red
    Write-Host "      Download from: https://nodejs.org (LTS version)" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# ── 2. Check Docker ──────────────────────────────────────────
Write-Host "[2/6] Checking Docker..." -ForegroundColor Yellow
try {
    $dockerVer = docker --version
    Write-Host "      $dockerVer found." -ForegroundColor Green
} catch {
    Write-Host "      ERROR: Docker not found." -ForegroundColor Red
    Write-Host "      Download Docker Desktop from: https://www.docker.com/products/docker-desktop" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# ── 3. Start PostgreSQL via Docker ───────────────────────────
Write-Host "[3/6] Starting PostgreSQL database..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot"
docker-compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "      ERROR: Failed to start database." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "      Database started on port 5440." -ForegroundColor Green
Start-Sleep -Seconds 3

# ── 4. Create .env if missing ────────────────────────────────
Write-Host "[4/6] Setting up server .env..." -ForegroundColor Yellow
$envPath = "$Root\server\.env"
if (-not (Test-Path $envPath)) {
    @"
DATABASE_URL=postgresql://showjump:showjump@localhost:5440/showjump?schema=public
PORT=4000
CLIENT_ORIGIN=http://localhost:5173,http://localhost:5174
"@ | Out-File -FilePath $envPath -Encoding utf8
    Write-Host "      Created server/.env" -ForegroundColor Green
} else {
    Write-Host "      server/.env already exists — skipped." -ForegroundColor Green
}

# ── 5. Install dependencies ──────────────────────────────────
Write-Host "[5/6] Installing dependencies..." -ForegroundColor Yellow

Write-Host "      server/..." -ForegroundColor Gray
Set-Location "$Root\server"
npm install --silent
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR in server npm install" -ForegroundColor Red; exit 1 }

Write-Host "      client/..." -ForegroundColor Gray
Set-Location "$Root\client"
npm install --silent
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR in client npm install" -ForegroundColor Red; exit 1 }

Write-Host "      Done." -ForegroundColor Green

# ── 6. Initialize database schema ───────────────────────────
Write-Host "[6/6] Pushing database schema..." -ForegroundColor Yellow
Set-Location "$Root\server"
npx prisma db push --skip-generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "      ERROR: Prisma db push failed. Is the database running?" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "      Schema applied." -ForegroundColor Green

# ── Done ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Run  .\start.ps1  to launch JAMPING." -ForegroundColor Cyan
Write-Host ""
Read-Host "Press Enter to exit"
