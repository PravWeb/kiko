"""Voice effects — pure-numpy DSP on WAV bytes (no scipy, no ffmpeg)."""

from __future__ import annotations

import io

import numpy as np
import soundfile as sf

EFFECTS = ("none", "pitch_up", "pitch_down", "robot", "echo", "chipmunk", "deep")


def _read(wav: bytes) -> tuple[np.ndarray, int]:
    data, sr = sf.read(io.BytesIO(wav), dtype="float32")
    if data.ndim > 1:
        data = data.mean(axis=1)
    return data, sr


def _write(data: np.ndarray, sr: int) -> bytes:
    data = np.clip(data, -1.0, 1.0)
    buf = io.BytesIO()
    sf.write(buf, data.astype(np.float32), sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def _resample(data: np.ndarray, factor: float) -> np.ndarray:
    n = max(1, int(len(data) / factor))
    x_new = np.linspace(0, len(data) - 1, n)
    return np.interp(x_new, np.arange(len(data)), data).astype(np.float32)


def _pitch(data: np.ndarray, factor: float) -> np.ndarray:
    """Pitch-shift without changing duration (two-step resample)."""
    stretched = _resample(data, 1.0 / factor)   # length changes
    return _resample(stretched, factor)         # restore length → pitch stays


def _robot(data: np.ndarray, sr: int) -> np.ndarray:
    t = np.arange(len(data)) / sr
    carrier = np.sign(np.sin(2 * np.pi * 90 * t))          # square 90Hz ring-mod
    out = data * (0.55 + 0.45 * carrier)
    # light bit-crush (sample-rate reduction)
    step = max(1, sr // 6000)
    held = np.repeat(out[::step], step)[:len(data)]
    if len(held) < len(data):
        held = np.pad(held, (0, len(data) - len(held)), mode="edge")
    levels = 12
    return np.round(held * levels) / levels


def _echo(data: np.ndarray, sr: int) -> np.ndarray:
    out = data.copy()
    for delay_s, gain in ((0.23, 0.45), (0.41, 0.25)):
        d = int(delay_s * sr)
        if d < len(out):
            out[d:] += data[:-d] * gain
    return out


def apply_effect(wav: bytes, effect: str) -> bytes:
    effect = (effect or "none").lower()
    if effect in ("none", ""):
        return wav
    data, sr = _read(wav)
    if effect == "pitch_up":
        data = _pitch(data, 1.25)
    elif effect == "pitch_down":
        data = _pitch(data, 0.8)
    elif effect == "chipmunk":
        data = _pitch(data, 1.5)
        sr = int(sr * 1.0)
    elif effect == "deep":
        data = _pitch(data, 0.65)
    elif effect == "robot":
        data = _robot(data, sr)
    elif effect == "echo":
        data = _echo(data, sr)
    else:
        return wav
    return _write(data, sr)
