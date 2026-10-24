"""FastAPI server — Kiko, the offline AI voice companion (TTS + STT + agent)."""

import offline_bootstrap  # noqa: F401  — must run before model imports

import logging
import os
import threading
import time
from contextlib import AsyncExitStack
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
from kiko_mcp import mcp as kiko_mcp

log = logging.getLogger("kiko")
APP_NAME = "Kiko"
# API calls slower than this are logged so latency regressions are easy to spot.
SLOW_REQUEST_MS = float(os.environ.get("SLOW_REQUEST_MS", "3000"))


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
    # Prewarm smart brain in the background so the first chat isn't a cold load.
    if not manager.is_ready("llm_smart"):
        threading.Thread(target=manager._quiet_load, args=("llm_smart",), daemon=True).start()


@asynccontextmanager
async def lifespan(_: FastAPI):
    _register_engines()
    manager.start_sweeper()
    try:
        async with AsyncExitStack() as stack:
            await stack.enter_async_context(kiko_mcp.session_manager.run())
            yield
    finally:
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

# Kiko exposes its local voice, document-search, runtime, and project tools at /mcp.
app.mount(
    "/mcp",
    kiko_mcp.streamable_http_app(
        streamable_http_path="/", json_response=True, stateless_http=True,
        host="127.0.0.1",
    ),
    name="kiko-mcp",
)


@app.middleware("http")
async def normalize_mcp_root(request, call_next):
    # A mounted ASGI app normally sees an empty path for its root when the
    # client omits the trailing slash. Keep the advertised /mcp URL canonical.
    if request.scope.get("path") == "/mcp":
        request.scope["path"] = "/mcp/"
        request.scope["raw_path"] = b"/mcp/"
    started = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - started) * 1000.0
    path = request.scope.get("path", "")
    if path.startswith("/api/"):
        response.headers["X-Response-Time-Ms"] = f"{elapsed_ms:.1f}"
        # Surface slow API calls in the server log for latency triage.
        if elapsed_ms > SLOW_REQUEST_MS and request.method != "GET":
            log.warning("slow request %s %s took %.0fms",
                        request.method, path, elapsed_ms)
        elif elapsed_ms > SLOW_REQUEST_MS:
            log.info("slow request %s %s took %.0fms",
                     request.method, path, elapsed_ms)
    # Ensure browsers don't aggressively cache the static HTML shell during local development
    if path == "/" or path.endswith(".html"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

static_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "out")
if os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
