"""Kokoro-82M TTS engine (ONNX, CPU)."""

import io
import os
import threading
from pathlib import Path

import numpy as np
import soundfile as sf

TTS_THREADS = int(os.environ.get("TTS_THREADS", "0")) or min(
    8, max(2, (os.cpu_count() or 4) - 1)
)

MODELS_DIR = Path(__file__).parent / "models"
MODEL_PATH = MODELS_DIR / "kokoro-v1.0.fp16.onnx"
VOICES_PATH = MODELS_DIR / "voices-v1.0.bin"

LANGUAGES = {
    "en-us": {"name": "English (US)", "espeak": "en-us", "flag": "🇺🇸"},
    "en-gb": {"name": "English (UK)", "espeak": "en-gb", "flag": "🇬🇧"},
    "hi": {"name": "Hindi", "espeak": "hi", "flag": "🇮🇳"},
    "es": {"name": "Spanish", "espeak": "es", "flag": "🇪🇸"},
    "fr": {"name": "French", "espeak": "fr", "flag": "🇫🇷"},
    "it": {"name": "Italian", "espeak": "it", "flag": "🇮🇹"},
    "ja": {"name": "Japanese", "espeak": "ja", "flag": "🇯🇵"},
    "pt-br": {"name": "Portuguese (BR)", "espeak": "pt-br", "flag": "🇧🇷"},
    "zh": {"name": "Chinese", "espeak": "cmn", "flag": "🇨🇳"},
}

_PREFIX_LANG = {
    "af": "en-us", "am": "en-us",
    "bf": "en-gb", "bm": "en-gb",
    "ef": "es", "em": "es",
    "ff": "fr",
    "hf": "hi", "hm": "hi",
    "if": "it", "im": "it",
    "jf": "ja", "jm": "ja",
    "pf": "pt-br", "pm": "pt-br",
    "zf": "zh", "zm": "zh",
}

MAX_TEXT_LEN = 4000

_lock = threading.Lock()
_kokoro = None


def load() -> None:
    global _kokoro
    with _lock:
        if _kokoro is None:
            from kokoro_onnx import Kokoro
            import onnxruntime as ort

            so = ort.SessionOptions()
            so.intra_op_num_threads = TTS_THREADS
            so.inter_op_num_threads = 1
            so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            sess = ort.InferenceSession(
                str(MODEL_PATH), sess_options=so, providers=["CPUExecutionProvider"]
            )
            _kokoro = Kokoro.from_session(sess, str(VOICES_PATH))


def unload() -> None:
    global _kokoro
    with _lock:
        _kokoro = None


def is_ready() -> bool:
    return _kokoro is not None


def voice_language(voice: str) -> str:
    return _PREFIX_LANG.get(voice.split("_")[0], "en-us")


def list_voices() -> list[dict]:
    names = _kokoro.get_voices()
    voices = []
    for name in names:
        lang = voice_language(name)
        label = name.split("_", 1)[1] if "_" in name else name
        gender = "Female" if name.split("_")[0].endswith("f") else "Male"
        voices.append({
            "id": name,
            "label": label.replace("_", " ").title(),
            "gender": gender,
            "lang": lang,
            "lang_name": LANGUAGES[lang]["name"],
        })
    return voices


def generate(text: str, voice: str = "af_heart", lang: str | None = None,
             speed: float = 1.0, fmt: str = "mp3") -> tuple[bytes, float]:
    """Generate speech, return (audio_bytes, duration_s)."""
    if not text or not text.strip():
        raise ValueError("Text is empty")
    text = text.strip()[:MAX_TEXT_LEN]
    if lang is None:
        lang = voice_language(voice)
    espeak_lang = LANGUAGES.get(lang, LANGUAGES["en-us"])["espeak"]
    speed = min(max(speed, 0.5), 2.0)

    with _lock:
        audio, sr = _kokoro.create(text, voice=voice, speed=speed, lang=espeak_lang)

    duration = round(len(audio) / sr, 2)
    buf = io.BytesIO()
    fmt_upper = fmt.upper()
    if fmt_upper in ("MP3", "MPEG"):
        sf.write(buf, audio, sr, format="MP3")
    else:
        sf.write(buf, audio, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue(), duration


def audio_stats(wav_bytes: bytes) -> dict:
    data, sr = sf.read(io.BytesIO(wav_bytes), dtype="float32")
    if data.ndim > 1:
        data = data.mean(axis=1)
    return {
        "duration": round(len(data) / sr, 2),
        "sample_rate": sr,
        "rms": round(float(np.sqrt(np.mean(data ** 2))), 4),
    }
