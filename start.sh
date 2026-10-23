#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! command -v uv >/dev/null 2>&1; then
  echo "[setup] installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

if [ ! -f backend/models/kokoro-v1.0.fp16.onnx ] || [ ! -f backend/models/voices-v1.0.bin ]; then
  echo "[setup] downloading Kokoro voice model (~192MB, one time)..."
  mkdir -p backend/models
  curl -L --retry 3 -o backend/models/kokoro-v1.0.fp16.onnx \
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.fp16.onnx"
  curl -L --retry 3 -o backend/models/voices-v1.0.bin \
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin"
fi

GGUF_BIG="backend/models/Qwen3-1.7B-Q8_0.gguf"
GGUF_SMALL="backend/models/Qwen3-0.6B-Q8_0.gguf"
if [ ! -f "$GGUF_BIG" ] && [ ! -f "$GGUF_SMALL" ]; then
  echo "[setup] Kiko's brain is missing Qwen3-1.7B (~1.8GB, recommended) or Qwen3-0.6B (~610MB, lighter)."
  read -r -p "Download the 1.7B brain now? [Y/n] " ans
  case "$ans" in
    [nN]*)
      read -r -p "Download the smaller 0.6B brain instead? [y/N] " ans2
      case "$ans2" in
        [yY]*)
          mkdir -p backend/models
          curl -L --retry 3 -C - -o "$GGUF_SMALL" \
            "https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf"
          ;;
        *) echo "[warn] continuing without the brain — chat will be offline." ;;
      esac
      ;;
    *)
      mkdir -p backend/models
      curl -L --retry 3 -C - -o "$GGUF_BIG" \
        "https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q8_0.gguf"
      ;;
  esac
fi

NEEDS_BUILD=0
if [ ! -d frontend/out ] || [ ! -f frontend/out/index.html ]; then
  NEEDS_BUILD=1
elif [ -n "$(find frontend/app frontend/components frontend/hooks frontend/lib -type f -newer frontend/out/index.html 2>/dev/null)" ]; then
  NEEDS_BUILD=1
fi

if [ "$NEEDS_BUILD" -eq 1 ]; then
  if command -v npm >/dev/null 2>&1; then
    echo "[setup] building frontend..."
    (cd frontend && npm install && npm run build)
  else
    echo "[error] frontend needs build and npm not found" >&2
    exit 1
  fi
fi

cd backend
export HF_HOME="$ROOT/.hf-cache"
if [ -d "$HF_HOME/hub" ]; then
  export HF_HUB_OFFLINE=1
fi
export PYTHONUNBUFFERED=1

echo "[setup] installing python packages..."
uv sync

if [ ! -d "$HF_HOME/hub/models--Systran--faster-whisper-small" ]; then
  echo "[setup] downloading STT model (whisper small ~460MB, one time)..."
  uv run python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')" || \
    echo "[warn] STT model download skipped (no network?) — it will download on first voice use."
fi

echo "[app] starting http://localhost:8000"
(sleep 4; xdg-open http://localhost:8000 2>/dev/null || open http://localhost:8000 2>/dev/null || true) &
exec uv run uvicorn main:app --host 127.0.0.1 --port 8000
