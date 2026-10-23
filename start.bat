@echo off
setlocal
cd /d "%~dp0"

rem Add common uv locations to PATH
set "PATH=%USERPROFILE%\.local\bin;%USERPROFILE%\.cargo\bin;%LOCALAPPDATA%\uv;%PATH%"

where uv >nul 2>nul
if errorlevel 1 (
  echo [setup] installing uv...
  powershell -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"
  set "PATH=%USERPROFILE%\.local\bin;%USERPROFILE%\.cargo\bin;%LOCALAPPDATA%\uv;%PATH%"
)

if not exist "backend\models\kokoro-v1.0.fp16.onnx" (
  echo [setup] downloading Kokoro voice model ~163MB, one time...
  if not exist "backend\models" mkdir "backend\models"
  curl.exe -L --retry 3 -C - -o "backend\models\kokoro-v1.0.fp16.onnx" "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.fp16.onnx"
)
if not exist "backend\models\voices-v1.0.bin" (
  echo [setup] downloading Kokoro voice bin ~28MB, one time...
  if not exist "backend\models" mkdir "backend\models"
  curl.exe -L --retry 3 -C - -o "backend\models\voices-v1.0.bin" "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin"
)

echo [setup] checking Kiko's brain...
if exist "backend\models\Qwen3-1.7B-Q8_0.gguf" goto :brain_ok
if exist "backend\models\Qwen3-0.6B-Q8_0.gguf" goto :brain_ok

echo Qwen3-1.7B (~1.8GB, recommended) or Qwen3-0.6B (~610MB, lighter) is needed.
choice /c Yn /m "Download the 1.7B brain now"
if errorlevel 2 goto :brain_choice_small
if not exist "backend\models" mkdir "backend\models"
curl.exe -L --retry 3 -C - -o "backend\models\Qwen3-1.7B-Q8_0.gguf" "https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q8_0.gguf"
goto :brain_ok

:brain_choice_small
choice /c Yn /m "Download the smaller 0.6B brain instead"
if errorlevel 2 (
  echo [warn] continuing without the brain - chat will be offline.
  goto :brain_ok
)
if not exist "backend\models" mkdir "backend\models"
curl.exe -L --retry 3 -C - -o "backend\models\Qwen3-0.6B-Q8_0.gguf" "https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf"

:brain_ok

set "NEEDS_BUILD=0"
if not exist "frontend\out\index.html" set "NEEDS_BUILD=1"
if "%NEEDS_BUILD%"=="0" (
  powershell -NoProfile -Command "$out=Get-Item 'frontend/out/index.html'; $latest=Get-ChildItem 'frontend/app','frontend/components','frontend/hooks','frontend/lib','frontend/package.json' -File -Recurse | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1; if ($latest -and $latest.LastWriteTimeUtc -gt $out.LastWriteTimeUtc) { exit 1 }"
  if errorlevel 1 set "NEEDS_BUILD=1"
)
if "%NEEDS_BUILD%"=="1" (
  where npm >nul 2>nul
  if errorlevel 1 (
    echo [error] frontend needs a build and npm was not found
    exit /b 1
  )
  echo [setup] building frontend...
  pushd frontend
  call npm install
  if errorlevel 1 (
    popd
    exit /b 1
  )
  call npm run build
  if errorlevel 1 (
    popd
    exit /b 1
  )
  popd
)

set "HF_HOME=%~dp0.hf-cache"
if not defined KIKO_MCP_URL set "KIKO_MCP_URL=http://127.0.0.1:8000/mcp"
if exist "%HF_HOME%\hub" set "HF_HUB_OFFLINE=1"
set PYTHONUNBUFFERED=1

pushd backend
echo [setup] installing python packages with uv...
call uv sync
if errorlevel 1 (
  popd
  exit /b 1
)

if not exist "%~dp0sample_docs\Artificial_Intelligence_Architecture.pdf" (
  echo [setup] generating sample subject PDFs for RAG demo...
  uv run python scripts\generate_sample_pdfs.py 2>nul
)

if not exist "%HF_HOME%\hub\models--Systran--faster-whisper-small" (
  echo [setup] downloading STT model whisper small ~460MB, one time...
  uv run python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"
  if errorlevel 1 echo [warn] STT model download skipped - it will download on first voice use.
)

echo [app] starting Kiko on http://localhost:8000
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8000'"
call uv run uvicorn main:app --host 127.0.0.1 --port 8000
popd
