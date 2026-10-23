"""Voice routes: status, voices, TTS, STT."""

import io
import logging

import soundfile as sf
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

import fx
import stt
import tools
import tts
from modelmgr import manager

log = logging.getLogger("routes_voice")
router = APIRouter()


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    voice: str = "af_heart"
    lang: str | None = None
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    effect: str = "none"


@router.get("/api/status")
def status():
    mem = manager.status()
    import llm as _llm
    return {
        "app": "Kiko",
        "tts": {"ready": manager.is_ready("tts"),
                "model": "Kokoro-82M fp16 (ONNX)"},
        "stt": {"ready": manager.is_ready("stt"),
                "model": f"faster-whisper {stt.WHISPER_MODEL} (int8, CPU)"},
        "llm": {"ready": manager.is_ready("llm"),
                "available": _llm.is_available(),
                "model": f"{_llm.GGUF_PATH.name} (llama.cpp)"},
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
    try:
        voice, vfx = (req.voice.split("@", 1) + [""])[:2]
        vfx = {"warm": "pitch_down", "bright": "pitch_up"}.get(vfx, "none")
        effect = req.effect if req.effect and req.effect != "none" else vfx
        with manager.protect("tts"):
            wav = tts.generate(req.text, voice=voice, lang=req.lang,
                               speed=req.speed)
        if effect and effect != "none":
            if effect not in fx.EFFECTS:
                raise HTTPException(422, f"unknown effect {effect!r}")
            wav = fx.apply_effect(wav, effect)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return Response(
        wav,
        media_type="audio/wav",
        headers={"X-Audio-Duration": str(tts.audio_stats(wav)["duration"])},
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
    with manager.protect("stt"):
        return stt.transcribe(data, sr, language)
