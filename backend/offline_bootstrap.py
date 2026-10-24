"""Force local HuggingFace cache before any model library imports.

faster-whisper (via huggingface_hub) otherwise hits the network on first
load even when weights already sit in the portable `.hf-cache` folder.
Setting this here — before `import stt` / `import llm` — keeps the whole
app offline-capable after the one-time model download.
"""

from __future__ import annotations

import os
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
_PORTABLE_CACHE = _ROOT / ".hf-cache"
_BACKEND_CACHE = Path(__file__).resolve().parent / ".hf-cache"
_HUB_DIR = _PORTABLE_CACHE / "hub"
_WHISPER_SNAP = (
    _HUB_DIR
    / "models--Systran--faster-whisper-small"
    / "snapshots"
)

# Prefer the portable SD-card / project cache over the user home cache.
if _PORTABLE_CACHE.is_dir():
    os.environ.setdefault("HF_HOME", str(_PORTABLE_CACHE))
elif _BACKEND_CACHE.is_dir():
    os.environ.setdefault("HF_HOME", str(_BACKEND_CACHE))

# If whisper weights are already on disk, never wait on the network.
def _whisper_cached() -> bool:
    if not _WHISPER_SNAP.is_dir():
        return False
    for snap in _WHISPER_SNAP.iterdir():
        if (snap / "model.bin").is_file() and (snap / "config.json").is_file():
            return True
    return False


if _whisper_cached():
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
