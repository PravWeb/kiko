"""Voice routes: status, health, voices, TTS, STT."""

import io
import logging
import time

import soundfile as sf
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

import fx
import stt
import tools
import tts
from modelmgr import manager

log = logging.getLogger("routes_voice")
router = APIRouter()

_START_TIME = time.time()


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    voice: str = "af_heart"
    lang: str | None = None
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    effect: str = "none"
    format: str = "mp3"


@router.get("/api/health")
def health():
    """Cheap liveness probe — never touches model handles."""
    tts_ready = manager.is_ready("tts")
    stt_ready = manager.is_ready("stt")
    ready = tts_ready and stt_ready
    return JSONResponse(
        {
            "ok": True,
            "ready": ready,
            "uptime_s": round(time.time() - _START_TIME, 1),
            "engines": {
                "tts": "ready" if tts_ready else "loading",
                "stt": "ready" if stt_ready else "loading",
            },
        },
        status_code=200 if ready else 202,
    )


@router.get("/api/status")
def status():
    mem = manager.status()
    import llm as _llm
    fast_ready = manager.is_ready("llm_fast")
    smart_ready = manager.is_ready("llm_smart")
    tts_ready = manager.is_ready("tts")
    stt_ready = manager.is_ready("stt")
    engines = mem.get("engines", {})
    still_loading = [
        name for name, eng in engines.items()
        if eng.get("loading") or not eng.get("loaded")
    ]
    return {
        "app": "Kiko",
        "tts": {"ready": tts_ready,
                "loading": bool(engines.get("tts", {}).get("loading")),
                "model": "Kokoro-82M fp16 (ONNX)"},
        "stt": {"ready": stt_ready,
                "loading": bool(engines.get("stt", {}).get("loading")),
                "model": f"faster-whisper {stt.WHISPER_MODEL} (int8, CPU)"},
        "llm": {"ready": fast_ready or smart_ready,
                "available": _llm.is_available(),
                "fast_ready": fast_ready,
                "smart_ready": smart_ready,
                "model": "Dual-Brain: 0.6B Fast (Voice) + 1.7B Smart (Docs)"},
        "ready": tts_ready and stt_ready,
        "loading_engines": still_loading,
        "memory": mem,
        "timers": tools.list_timers(),
    }


@router.get("/api/voices")
def voices():
    if not manager.is_ready("tts"):
        raise HTTPException(503, "TTS model still loading")
    base = tts.list_voices()
    # Hindi tone variants (built from the same voices with pitch effects)
    variants = []
    for v in base:
        if not v["lang"].startswith("hi"):
            continue
        for tag, effect, label, desc in (
            ("@warm", "pitch_down", f"{v['label']} warm", "round, lower tone"),
            ("@bright", "pitch_up", f"{v['label']} bright", "crisp, higher tone"),
        ):
            variants.append({**v, "id": v["id"] + tag, "label": label,
                             "variant": desc})
    return {"languages": tts.LANGUAGES, "voices": base + variants}


@router.post("/api/tts")
def synthesize(req: TTSRequest):
    if not manager.is_ready("tts"):
        raise HTTPException(503, "TTS model still loading, retry in a moment")
    t0 = time.perf_counter()
    try:
        voice, vfx = (req.voice.split("@", 1) + [""])[:2]
        vfx = {"warm": "pitch_down", "bright": "pitch_up"}.get(vfx, "none")
        effect = req.effect if req.effect and req.effect != "none" else vfx
        fmt = (req.format or "mp3").lower()
        with manager.protect("tts"):
            audio_bytes, duration = tts.generate(
                req.text, voice=voice, lang=req.lang, speed=req.speed, fmt=fmt
            )
        if effect and effect != "none":
            if effect not in fx.EFFECTS:
                raise HTTPException(422, f"unknown effect {effect!r}")
            audio_bytes = fx.apply_effect(audio_bytes, effect, fmt=fmt)
    except ValueError as e:
        raise HTTPException(422, str(e))
    synth_ms = (time.perf_counter() - t0) * 1000.0
    media_type = "audio/mpeg" if fmt in ("mp3", "mpeg") else "audio/wav"
    return Response(
        audio_bytes,
        media_type=media_type,
        headers={
            "X-Audio-Duration": str(duration),
            "X-Synthesis-Ms": f"{synth_ms:.1f}",
        },
    )


@router.post("/api/stt")
async def recognize(audio: UploadFile = File(...),
                    language: str | None = None):
    if not manager.is_ready("stt"):
        raise HTTPException(503, "STT model still loading, retry in a moment")
    raw = await audio.read()
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(413, "Audio too large (max 20MB)")
    try:
        data, sr = sf.read(io.BytesIO(raw), dtype="float32")
    except Exception:
        raise HTTPException(422, "Could not decode audio (send WAV/OGG/MP3)")
    t0 = time.perf_counter()
    with manager.protect("stt"):
        result = stt.transcribe(data, sr, language)
    result["transcribe_ms"] = round((time.perf_counter() - t0) * 1000.0, 1)
    return result
