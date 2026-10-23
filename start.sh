#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Ensure common uv install directories are on PATH
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

if ! command -v uv >/dev/null 2>&1; then
  echo "[setup] installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
fi

# Ensure Kokoro TTS models exist
mkdir -p backend/models
if [ ! -f backend/models/kokoro-v1.0.fp16.onnx ]; then
  echo "[setup] downloading Kokoro voice model (~163MB, one time)..."
  curl -L --retry 3 -C - -o backend/models/kokoro-v1.0.fp16.onnx \
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.fp16.onnx"
fi
if [ ! -f backend/models/voices-v1.0.bin ]; then
  echo "[setup] downloading Kokoro voice bin (~28MB, one time)..."
  curl -L --retry 3 -C - -o backend/models/voices-v1.0.bin \
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin"
fi

# Check brain LLM models
GGUF_BIG="backend/models/Qwen3-1.7B-Q8_0.gguf"
GGUF_SMALL="backend/models/Qwen3-0.6B-Q8_0.gguf"
if [ ! -f "$GGUF_BIG" ] && [ ! -f "$GGUF_SMALL" ]; then
  echo "[setup] Kiko's brain is missing Qwen3-1.7B (~1.8GB, recommended) or Qwen3-0.6B (~610MB, lighter)."
  if [ -t 0 ]; then
    read -r -p "Download the 1.7B brain now? [Y/n] " ans
    case "$ans" in
      [nN]*)
        read -r -p "Download the smaller 0.6B brain instead? [y/N] " ans2
        case "$ans2" in
          [yY]*)
            curl -L --retry 3 -C - -o "$GGUF_SMALL" \
              "https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf"
            ;;
          *) echo "[warn] continuing without the brain — chat will be offline." ;;
        esac
        ;;
      *)
        curl -L --retry 3 -C - -o "$GGUF_BIG" \
          "https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q8_0.gguf"
        ;;
    esac
  else
    # Non-interactive fallback
    curl -L --retry 3 -C - -o "$GGUF_BIG" \
      "https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q8_0.gguf"
  fi
fi

# Check frontend build
NEEDS_BUILD=0
if [ ! -d frontend/out ] || [ ! -f frontend/out/index.html ]; then
  NEEDS_BUILD=1
elif [ -n "$(find frontend/app frontend/components frontend/hooks frontend/lib frontend/package.json -type f -newer frontend/out/index.html 2>/dev/null)" ]; then
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
export KIKO_MCP_URL="${KIKO_MCP_URL:-http://127.0.0.1:8000/mcp}"
if [ -d "$HF_HOME/hub" ]; then
  export HF_HUB_OFFLINE=1
fi
export PYTHONUNBUFFERED=1

echo "[setup] installing python packages with uv..."
uv sync

# Ensure sample subject PDFs exist for RAG and Read Aloud demo
if [ ! -f "$ROOT/sample_docs/Artificial_Intelligence_Architecture.pdf" ]; then
  echo "[setup] generating sample subject PDFs for RAG demo..."
  uv run python scripts/generate_sample_pdfs.py 2>/dev/null || true
fi

# Pre-cache STT model if not present
if [ ! -d "$HF_HOME/hub/models--Systran--faster-whisper-small" ]; then
  echo "[setup] downloading STT model (whisper small ~460MB, one time)..."
  uv run python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')" || \
    echo "[warn] STT model download skipped (no network?) — it will download on first voice use."
fi

echo "[app] starting Kiko on http://localhost:8000"
(sleep 2; xdg-open http://localhost:8000 2>/dev/null || open http://localhost:8000 2>/dev/null || true) &
exec uv run uvicorn main:app --host 127.0.0.1 --port 8000
