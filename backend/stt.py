"""faster-whisper STT engine (CPU, int8)."""

import os
import threading

import numpy as np
from faster_whisper import WhisperModel

WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
SAMPLE_RATE = 16000

_lock = threading.Lock()
_model: WhisperModel | None = None


def load() -> None:
    global _model
    with _lock:
        if _model is None:
            _model = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")


def unload() -> None:
    global _model
    with _lock:
        _model = None


def is_ready() -> bool:
    return _model is not None


def to_mono_16k(audio: np.ndarray, sr: int) -> np.ndarray:
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    audio = audio.astype(np.float32)
    if sr != SAMPLE_RATE:
        n = int(len(audio) * SAMPLE_RATE / sr)
        audio = np.interp(
            np.linspace(0, len(audio) - 1, n), np.arange(len(audio)), audio
        ).astype(np.float32)
    return audio


def transcribe(audio: np.ndarray, sr: int = SAMPLE_RATE,
               language: str | None = None) -> dict:
    """audio: float32 waveform at sr (mono or stereo, resampled to 16k)."""
    audio = to_mono_16k(audio, sr)
    if len(audio) < SAMPLE_RATE // 4:
        return {"text": "", "language": language or "", "confidence": 0.0,
                "duration": round(len(audio) / SAMPLE_RATE, 2)}

    with _lock:
        segments, info = _model.transcribe(
            audio,
            language=language,
            condition_on_previous_text=False,
            vad_filter=True,
            beam_size=5,
        )
        parts = [seg.text.strip() for seg in segments if seg.text.strip()]

    return {
        "text": " ".join(parts),
        "language": info.language,
        "confidence": round(info.language_probability, 3),
        "duration": round(len(audio) / SAMPLE_RATE, 2),
    }
