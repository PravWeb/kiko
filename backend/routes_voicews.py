"""Live voice WebSocket — streaming conversation channel (/ws/voice).

Crazy-pipeline v1: server-side VAD turn-taking + sentence-streamed TTS.

Client -> server:
  text JSON : {"type": "config", "voice": "af_heart", "lang": "en",
               "speed": 1.0, "effect": "none", "tools": true,
               "history": [{"who": "user|kiko", "text": "..." }]}
              {"type": "interrupt"}
  binary    : PCM16 mono frames at 16 kHz (~100 ms each)

Server -> client:
  text JSON : {"type": "state", "state": "listening" | "thinking" | "talking"}
              {"type": "stt", "text": "..."}
              {"type": "sentence", "i": 0, "text": "...", "emotion": "happy"}
              {"type": "done", "elapsed_s": 2.3, "tool_calls": [...]}
              {"type": "cleared"}
              {"type": "error", "detail": "..."}
  binary    : one WAV per sentence (sent right before/after its sentence event)
"""

import asyncio
import json
import logging
import re
import time

import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

import agent
import fx
import stt
import tts
from modelmgr import manager

log = logging.getLogger("routes_voicews")
router = APIRouter()

SR = stt.SAMPLE_RATE  # 16000
MAX_TURN_S = 14.0
END_SILENCE_S = 0.65
MIN_SPEECH_S = 0.35

_SENT_SPLIT = re.compile(r"(?<=[.!?।;])\s+")
_FALLBACK_SPLIT = re.compile(r"(?<=[,،])\s+")
_SPEECH_MARKDOWN = re.compile(r"```[\s\S]*?(?:```|$)|`([^`]+)`|\[([^\]]+)\]\([^)]+\)|\[emotion:?[^\]]*\]", re.I)


def _spoken_text(text: str) -> str:
    """Remove formatting that sounds awkward in speech, keeping its words."""
    text = _SPEECH_MARKDOWN.sub(lambda m: m.group(1) or m.group(2) or " ", text)
    text = re.sub(r"^\s{0,3}#{1,6}\s*|^\s*[-*+]\s+", "", text, flags=re.M)
    return re.sub(r"[*_~]+", "", text).strip()


def _display_text(text: str) -> str:
    """Keep streamed chat bubbles free of internal emotion/presenter tags."""
    text = re.sub(r"\s*\[emotion:?\s*[a-z]*\]?\s*", " ", text, flags=re.I)
    return re.sub(r"^(?:Kiko|किको)\s*:\s*", "", text.strip(), flags=re.I)


def _take_ready_sentence(buffer: str, max_len: int = 200) -> tuple[str, str] | None:
    """Return one complete speakable segment while generation is still running."""
    match = re.search(r"(?<=[.!?।;])(?:[\"'’”)]*)\s+", buffer)
    if match:
        return buffer[:match.end()].strip(), buffer[match.end():]
    if len(buffer) > max_len:
        boundary = max(buffer.rfind(",", 0, max_len), buffer.rfind(" ", 0, max_len))
        if boundary > max_len // 2:
            return buffer[:boundary + 1].strip(), buffer[boundary + 1:]
    return None


def split_sentences(text: str, max_len: int = 200) -> list[str]:
    """Split a reply into speakable sentences (English + Devanagari marks)."""
    text = (text or "").strip()
    if not text:
        return []
    parts = _SENT_SPLIT.split(text)
    out: list[str] = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if len(p) > max_len:
            out.extend(q.strip() for q in _FALLBACK_SPLIT.split(p) if q.strip())
        else:
            out.append(p)
    # merge tiny fragments upward
    merged: list[str] = []
    for s in out:
        if merged and len(s) < 6:
            merged[-1] += " " + s
        else:
            merged.append(s)
    return merged or [text]


class _Vad:
    """Adaptive-energy VAD with hysteresis + hangover."""

    def __init__(self) -> None:
        self.floor = 0.006
        self.speaking = False
        self.hangover = 0.0
        self.hit = 0
        self.speech_dur = 0.0

    def enter_th(self) -> float:
        return max(self.floor * 2.4 + 0.004, 0.008)

    def exit_th(self) -> float:
        return max(self.floor * 1.7 + 0.002, 0.005)

    def feed(self, rms: float, dt: float) -> str:
        """Returns 'none' | 'start' | 'end' | 'timeout'."""
        ev = "none"
        if not self.speaking:
            if rms < self.enter_th():
                self.floor = 0.9 * self.floor + 0.1 * rms
            if rms > self.enter_th():
                self.hit += 1
                if self.hit >= 2:
                    self.speaking = True
                    self.speech_dur = 0.0
                    self.hangover = 0.0
                    self.hit = 0
                    ev = "start"
            else:
                self.hit = 0
        else:
            self.speech_dur += dt
            if rms > self.exit_th():
                self.hangover = 0.0
            else:
                self.hangover += dt
                if self.speech_dur >= MAX_TURN_S:
                    self.speaking = False
                    ev = "timeout"
                elif self.hangover >= END_SILENCE_S and \
                        self.speech_dur >= MIN_SPEECH_S:
                    self.speaking = False
                    ev = "end"
                elif self.hangover >= END_SILENCE_S:
                    self.speaking = False
                    self.speech_dur = 0.0
                    ev = "none"  # too short — discard
        return ev


def _synth(text: str, cfg: dict) -> bytes:
    voice, suffix = (cfg.get("voice", "af_heart").split("@", 1) + [""])[:2]
    vfx = {"warm": "pitch_down", "bright": "pitch_up"}.get(suffix, "none")
    effect = cfg.get("effect") if cfg.get("effect") not in (None, "none") else vfx
    with manager.protect("tts"):
        wav, _ = tts.generate(text, voice=voice, speed=float(cfg.get("speed", 1.0)), fmt="wav")
    if effect and effect != "none" and effect in fx.EFFECTS:
        wav = fx.apply_effect(wav, effect, fmt="wav")
    return wav


@router.websocket("/ws/voice")
async def voice_ws(ws: WebSocket):
    await ws.accept()
    cfg: dict = {"voice": "af_heart", "lang": "en", "speed": 1.0,
                 "effect": "none", "tools": True, "history": []}
    vad = _Vad()
    buf: list[np.ndarray] = []
    lead: list[np.ndarray] = []  # ~0.6s pre-speech lead-in kept warm
    busy = False
    interrupted = asyncio.Event()
    send_lock = asyncio.Lock()

    async def send(obj: dict) -> None:
        async with send_lock:
            await ws.send_json(obj)

    async def send_bytes(data: bytes) -> None:
        async with send_lock:
            await ws.send_bytes(data)

    async def run_turn_for_text(text: str) -> None:
        nonlocal busy
        busy = True
        interrupted.clear()
        try:
            await send({"type": "state", "state": "thinking"})
            await send({"type": "stt", "text": text})
            voice_brain = str(cfg.get("brain", "fast"))
            await send({
                "type": "turn_start",
                "emotion": "neutral",
                "tool_calls": [],
            })
            # Pull model events from a worker thread while this coroutine starts
            # Kokoro as soon as a sentence boundary arrives. Both inference and
            # synthesis remain off the websocket event loop.
            loop = asyncio.get_running_loop()
            events: asyncio.Queue = asyncio.Queue()

            def publish(ev: dict) -> None:
                loop.call_soon_threadsafe(events.put_nowait, ev)

            def generate() -> None:
                try:
                    for ev in agent.chat_stream(
                        text, cfg.get("history", []),
                        bool(cfg.get("tools", True)),
                        str(cfg.get("lang", "en")), voice_brain,
                        voice_mode=True,
                    ):
                        publish(ev)
                except Exception as exc:
                    log.exception("voice model stream failed")
                    publish({"type": "error", "message": str(exc)})
                finally:
                    publish({"type": "_stream_end"})

            worker = asyncio.create_task(asyncio.to_thread(generate))
            t0 = time.time()
            pending = ""
            streamed_reply: list[str] = []
            final: dict = {}
            tool_calls: list[dict] = []
            sentence_i = 0
            first_audio_ms: float | None = None
            ended = False
            while not ended:
                ev = await events.get()
                kind = ev.get("type")
                if kind == "_stream_end":
                    ended = True
                elif kind == "delta":
                    delta = str(ev.get("t", ""))
                    streamed_reply.append(delta)
                    pending += delta
                elif kind == "tools":
                    tool_calls = list(ev.get("tool_calls") or [])
                elif kind == "final":
                    final = ev
                    tool_calls = list(ev.get("tool_calls") or tool_calls)
                    emotion = str(ev.get("emotion", "neutral"))
                    await send({"type": "turn_meta", "emotion": emotion,
                                "tool_calls": tool_calls})
                elif kind == "error":
                    await send({"type": "error", "detail": str(ev.get("message", "voice model error"))})

                while pending and not interrupted.is_set():
                    # Hindi replies have a final script-correction fallback in
                    # agent._finish. Hold speech until Devanagari is present so
                    # a corrected final answer is never spoken after English.
                    if cfg.get("lang") == "hi" and not re.search(
                            r"[\u0900-\u097F]", "".join(streamed_reply)):
                        break
                    ready = _take_ready_sentence(pending)
                    if ready is None:
                        break
                    part, pending = ready
                    speak = _spoken_text(part)
                    if not speak:
                        continue
                    wav = await asyncio.to_thread(_synth, speak, cfg)
                    if interrupted.is_set():
                        break
                    if sentence_i == 0:
                        await send({"type": "state", "state": "talking"})
                    await send({"type": "sentence", "i": sentence_i, "text": _display_text(part),
                                "emotion": final.get("emotion", "neutral")})
                    await send_bytes(wav)
                    if first_audio_ms is None:
                        first_audio_ms = round((time.time() - t0) * 1000, 1)
                    sentence_i += 1

            await worker
            reply = str(final.get("reply", "")) or "".join(streamed_reply).strip()
            if cfg.get("lang") == "hi":
                streamed_clean = _display_text("".join(streamed_reply)).strip()
                if reply and reply != streamed_clean:
                    pending = reply
            if pending and not interrupted.is_set():
                for s in split_sentences(pending):
                    speak = _spoken_text(s)
                    if not speak:
                        continue
                    wav = await asyncio.to_thread(_synth, speak, cfg)
                    if interrupted.is_set():
                        break
                    if sentence_i == 0:
                        await send({"type": "state", "state": "talking"})
                    await send({"type": "sentence", "i": sentence_i, "text": _display_text(s),
                                "emotion": final.get("emotion", "neutral")})
                    await send_bytes(wav)
                    if first_audio_ms is None:
                        first_audio_ms = round((time.time() - t0) * 1000, 1)
                    sentence_i += 1
            if interrupted.is_set():
                await send({"type": "cleared"})
            else:
                await send({"type": "done",
                            "reply": reply,
                            "emotion": final.get("emotion", "neutral"),
                            "elapsed_s": final.get("elapsed_s", 0),
                            "tool_calls": tool_calls,
                            "first_audio_ms": first_audio_ms,
                            "synth_s": round(time.time() - t0, 2)})
        except Exception as e:  # keep the socket alive on turn errors
            log.exception("voice turn failed")
            await send({"type": "error", "detail": str(e)})
        finally:
            await send({"type": "state", "state": "listening"})
            busy = False
            buf.clear()
            lead.clear()

    async def run_audio_turn() -> None:
        nonlocal busy
        busy = True
        interrupted.clear()
        try:
            audio = np.concatenate(lead + buf).astype(np.float32)
            await send({"type": "state", "state": "thinking"})
            lang = "hi" if cfg.get("lang") == "hi" else None
            res = await asyncio.to_thread(
                stt.transcribe, audio, SR, lang)
            text = (res.get("text") or "").strip()
            if not text:
                await send({"type": "cleared"})
                busy = False
                buf.clear()
                lead.clear()
                await send({"type": "state", "state": "listening"})
                return
            await run_turn_for_text(text)
        except Exception as e:
            log.exception("audio turn failed")
            await send({"type": "error", "detail": str(e)})
            busy = False
            buf.clear()
            lead.clear()
            await send({"type": "state", "state": "listening"})

    turn_task: asyncio.Task | None = None

    async def finalize(ev: str) -> None:
        nonlocal turn_task, buf, lead
        if turn_task and not turn_task.done():
            return  # already processing a turn
        if ev in ("end", "timeout") and buf:
            t = asyncio.create_task(run_audio_turn())
            turn_task = t

    try:
        await send({"type": "state", "state": "listening"})
        while True:
            message = await ws.receive()
            if message["type"] == "websocket.disconnect":
                break
            if "text" in message and message["text"] is not None:
                try:
                    data = json.loads(message["text"])
                except Exception:
                    continue
                mtype = data.get("type")
                if mtype == "config":
                    for k in ("voice", "lang", "speed", "effect"):
                        if k in data:
                            cfg[k] = data[k]
                    cfg["tools"] = bool(data.get("tools", True))
                    cfg["history"] = list(data.get("history") or [])
                elif mtype == "text":
                    u_text = str(data.get("text", "")).strip()
                    if u_text and not busy:
                        turn_task = asyncio.create_task(run_turn_for_text(u_text))
                elif mtype == "interrupt":
                    interrupted.set()
                    if turn_task and not turn_task.done():
                        # let the task observe the flag at the next sentence
                        pass
                    await send({"type": "cleared"})
            elif message.get("bytes"):
                if busy:
                    continue  # don't let our own agent speech re-trigger VAD
                raw = np.frombuffer(message["bytes"], dtype=np.int16)
                f = raw.astype(np.float32) / 32768.0
                if f.size == 0:
                    continue
                rms = float(np.sqrt(np.mean(f ** 2)))
                dt = f.size / SR
                ev = vad.feed(rms, dt)
                if vad.speaking:
                    buf.append(f)
                elif not vad.speaking and ev == "none":
                    lead.append(f)
                    if sum(len(x) for x in lead) > SR // 2 + 2400:
                        lead.pop(0)
                if ev in ("end", "timeout"):
                    await finalize(ev)
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("voice ws closed unexpectedly")
    finally:
        if turn_task:
            interrupted.set()
            try:
                await asyncio.wait_for(asyncio.shield(turn_task), timeout=2.0)
            except Exception:
                turn_task.cancel()
        try:
            await ws.close()
        except Exception:
            pass
