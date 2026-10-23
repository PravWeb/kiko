"""Agent routes: chat, timers."""

import json
import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import agent
import tools
from modelmgr import manager

log = logging.getLogger("routes_agent")
router = APIRouter()


class ChatTurn(BaseModel):
    who: str = "user"
    text: str = ""


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatTurn] = Field(default_factory=list)
    tools_enabled: bool = True
    lang: Literal["en", "hi"] = "en"


@router.post("/api/chat")
def chat(req: ChatRequest):
    if not __import__("llm").is_available():
        raise HTTPException(503, "LLM weights missing (Qwen3-1.7B/0.6B GGUF)")
    history = [{"who": h.who, "text": h.text} for h in req.history]
    try:
        result = agent.chat(req.message, history, allow_tools=req.tools_enabled,
                            lang=req.lang)
    except Exception as e:
        log.exception("chat failed")
        raise HTTPException(500, f"LLM error: {e}")
    if not result["reply"]:
        raise HTTPException(502, "empty LLM reply")
    return result


@router.post("/api/chat/stream")
def chat_stream(req: ChatRequest):
    """Token-streamed text chat (SSE)."""

    def sse():
        try:
            for ev in agent.chat_stream(req.message,
                                        [{"who": h.who, "text": h.text}
                                         for h in req.history],
                                        allow_tools=req.tools_enabled,
                                        lang=req.lang):
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        except Exception as e:
            log.exception("chat stream failed")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(sse(), media_type="text/event-stream")


@router.get("/api/timers")
def timers():
    return {"timers": tools.list_timers(), "memory": tools.memory_dump()}
