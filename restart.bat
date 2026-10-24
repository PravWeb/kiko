@echo off
setlocal
title Kiko - Restarting Server
cd /d "%~dp0"

echo ====================================================================
echo              KIKO - Restarting Server & Neural Engines
echo ====================================================================
echo.

rem 1. Kill any existing process on port 8000
echo [1/3] Stopping any running server on port 8000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
  taskkill /f /pid %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

rem 2. Check if frontend source has changed and build
echo [2/3] Building latest UI static export...
if exist "frontend\package.json" (
  call npm.cmd --prefix frontend run build
)

rem 3. Start Kiko server and open browser
echo [3/3] Starting Kiko server on http://localhost:8000...
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://localhost:8000'"

cd /d "%~dp0backend"
set "HF_HOME=%~dp0.hf-cache"
if exist "%HF_HOME%\hub" set "HF_HUB_OFFLINE=1"
set PYTHONUNBUFFERED=1
set "KIKO_MCP_URL=http://127.0.0.1:8000/mcp"

echo.
echo ====================================================================
echo  Kiko is running! Keep this window open.
echo ====================================================================
echo.

.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
pause
