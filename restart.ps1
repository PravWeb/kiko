$ErrorActionPreference = "SilentlyContinue"
$root = $PSScriptRoot
$port = 8000

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "         Restarting Kiko & Neural Engines           " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. Stop any running server on port 8000
Write-Host "[1/3] stopping any server on port $port..." -ForegroundColor Yellow
Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 800

# 2. Build frontend if needed
$frontendDir = Join-Path $root "frontend"
Write-Host "[2/3] compiling latest UI static export..." -ForegroundColor Cyan
$cmdObj = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
if ($cmdObj) { $npmCmd = $cmdObj.Source } else { $npmCmd = "npm" }
& $npmCmd --prefix $frontendDir run build

# 3. Verify Python and Backend
$python = Join-Path $root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
  Write-Host "[error] backend\.venv not found - run start.bat once to set it up." -ForegroundColor Red
  Read-Host "Press Enter to close"
  exit 1
}
if (-not (Test-Path (Join-Path $root "backend\main.py"))) {
  Write-Host "[error] backend\main.py not found - keep restart.ps1 next to the backend folder." -ForegroundColor Red
  Read-Host "Press Enter to close"
  exit 1
}

$env:HF_HOME = Join-Path $root ".hf-cache"
if (Test-Path (Join-Path $env:HF_HOME "hub")) { $env:HF_HUB_OFFLINE = "1" }
$env:PYTHONUNBUFFERED = "1"
$env:KIKO_MCP_URL = "http://127.0.0.1:$port/mcp"

# 4. Open browser in background
Start-Process powershell -ArgumentList "-NoProfile -WindowStyle Hidden -Command ""Start-Sleep -Seconds 3; Start-Process 'http://localhost:$port'"""

# 5. Start uvicorn in foreground
Write-Host "[3/3] starting Kiko on http://localhost:$port..." -ForegroundColor Green
Write-Host "Keep this window open while using Kiko." -ForegroundColor Cyan
Set-Location (Join-Path $root "backend")
& $python -m uvicorn main:app --host 127.0.0.1 --port $port
