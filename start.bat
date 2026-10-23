@echo off
setlocal
title Kiko - Offline AI Voice Companion
cd /d "%~dp0"

echo ====================================================================
echo             KIKO - 100%% Local Offline AI Voice Companion
echo ====================================================================
echo.

set "ROOT=%~dp0"
set "TOOLS_DIR=%ROOT%tools"
set "WHEELS_DIR=%ROOT%wheels"
set "PORTABLE_PY=%TOOLS_DIR%\python\python.exe"
set "PORTABLE_UV=%TOOLS_DIR%\uv.exe"
set "HF_HOME=%ROOT%.hf-cache"
set "HF_HUB_OFFLINE=1"
set "KIKO_MCP_URL=http://127.0.0.1:8000/mcp"
set PYTHONUNBUFFERED=1

rem 1. Set PATH to include portable tools
set "PATH=%TOOLS_DIR%;%TOOLS_DIR%\python;%TOOLS_DIR%\python\Scripts;%PATH%"

rem 2. Ensure MSVC C++ Runtime is installed if needed
if not exist "C:\Windows\System32\msvcp140.dll" (
  if exist "%TOOLS_DIR%\VC_redist.x64.exe" (
    echo [setup] installing required Visual C++ runtime (one time)...
    "%TOOLS_DIR%\VC_redist.x64.exe" /passive /norestart
  )
)

rem 3. Detect Python interpreter
set "PY_CMD="
if exist "%PORTABLE_PY%" (
  set "PY_CMD=%PORTABLE_PY%"
) else (
  where python >nul 2>nul
  if not errorlevel 1 set "PY_CMD=python"
)

rem 4. Detect uv
set "UV_CMD="
if exist "%PORTABLE_UV%" (
  set "UV_CMD=%PORTABLE_UV%"
) else (
  where uv >nul 2>nul
  if not errorlevel 1 set "UV_CMD=uv"
)

rem 5. Setup Python Virtual Environment in backend
pushd backend
if not exist ".venv\Scripts\python.exe" (
  echo [setup] configuring local Python virtual environment...
  if defined UV_CMD (
    if defined PY_CMD (
      "%UV_CMD%" venv --python "%PY_CMD%" .venv
    ) else (
      "%UV_CMD%" venv .venv
    )
  ) else (
    if defined PY_CMD (
      "%PY_CMD%" -m venv .venv
    ) else (
      echo [error] Python was not found on this system!
      pause
      popd
      exit /b 1
    )
  )
)

rem 6. Fast offline package installation from SD card wheels
if not exist ".venv\Lib\site-packages\fastapi" (
  echo [setup] installing dependencies offline from SD card (one time, ~3s)...
  if defined UV_CMD (
    "%UV_CMD%" pip install --python .venv --no-index --find-links "%WHEELS_DIR%" -r "%ROOT%win_requirements.txt"
  ) else (
    call .venv\Scripts\activate.bat
    python -m pip install --no-index --find-links "%WHEELS_DIR%" -r "%ROOT%win_requirements.txt"
    call deactivate
  )
)

rem 7. Verify pre-loaded offline AI models
echo [check] verifying local models...
if not exist "models\kokoro-v1.0.fp16.onnx" (
  echo [warn] Kokoro TTS model missing from backend\models\
)
if not exist "models\Qwen3-1.7B-Q8_0.gguf" (
  if not exist "models\Qwen3-0.6B-Q8_0.gguf" (
    echo [warn] Qwen LLM brain model missing from backend\models\
  )
)

rem 8. Auto-open browser & start server
echo.
echo ====================================================================
echo  Starting Kiko on http://localhost:8000
echo  Web browser opening in 3 seconds...
echo ====================================================================
echo.
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 3; Start-Process 'http://localhost:8000'"

.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
popd
pause
