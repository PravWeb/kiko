"""FastAPI server — Kiko, the offline AI voice companion (TTS + STT + agent)."""

import logging
import os
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import llm
import stt
import tts
from modelmgr import Engine, manager
from routes_agent import router as agent_router
from routes_docs import router as docs_router
from routes_tasks import router as tasks_router
from routes_voice import router as voice_router
from routes_voicews import router as voicews_router

log = logging.getLogger("kiko")
APP_NAME = "Kiko"


def _register_engines() -> None:
    manager.register(Engine(
        name="tts",
        loader=lambda: (tts.load() or True),
        unloader=lambda _h: tts.unload(),
        resident=True,
        model_info="Kokoro-82M fp16 (ONNX) · 54 voices",
    ))
    manager.register(Engine(
        name="stt",
        loader=lambda: (stt.load() or True),
        unloader=lambda _h: stt.unload(),
        resident=True,
        model_info=f"faster-whisper {stt.WHISPER_MODEL} (int8, CPU)",
    ))


@asynccontextmanager
async def lifespan(_: FastAPI):
    _register_engines()
    manager.start_sweeper()
    yield
    manager.stop()


app = FastAPI(title=APP_NAME, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(voicews_router)
app.include_router(docs_router)
app.include_router(voice_router)
app.include_router(agent_router)
app.include_router(tasks_router)

static_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "out")
if os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
