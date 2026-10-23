"""Agent routes: chat, timers."""

import json
import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import agent
import skills
import tools
import mcp_client
from kiko_mcp import SERVER_TOOL_NAMES
from modelmgr import manager

log = logging.getLogger("routes_agent")
router = APIRouter()


def _mcp_command(message: str) -> dict | None:
    """Give `/mcp` a useful deterministic response instead of asking the LLM."""
    command = " ".join(message.strip().lower().split())
    if command not in {"/mcp", "/mcp status"}:
        return None
    endpoint = "http://127.0.0.1:8000/mcp"
    configured = mcp_client.configured_url()
    connection = (
        "Kiko chat is connected to this local MCP server by default."
        if configured.rstrip("/") == endpoint
        else "Kiko chat is configured to use a custom MCP server."
    )
    reply = (
        f"Kiko's MCP server is available at {endpoint}. It provides local speech generation, "
        "search over documents uploaded in this running session, model status, skills, and project info. "
        f"{connection} Connect an external MCP client to the endpoint, or ask me normally to "
        "search an uploaded document or check model status."
    )
    return {
        "reply": reply,
        "emotion": "thinking",
        "tool_calls": [{"tool": "mcp_status", "args": {}, "result": {"endpoint": endpoint}}],
        "active_skills": [],
        "elapsed_s": 0.0,
    }


class ChatTurn(BaseModel):
    who: str = "user"
    text: str = ""


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatTurn] = Field(default_factory=list)
    tools_enabled: bool = True
    websearch_enabled: bool = False
    lang: Literal["en", "hi"] = "en"
    brain: str = "smart"


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)


@router.post("/api/search")
def search_web_api(req: SearchRequest):
    """Direct live web search endpoint."""
    return tools.web_search({"query": req.query})


@router.get("/api/skills")
def list_local_skills():
    """List installed, local SKILL.md workflows without exposing their prompt text."""
    return {"skills": skills.list_skills()}


@router.get("/api/mcp")
def mcp_status():
    """Discover Kiko's MCP endpoint and optional configured remote tools."""
    remote = mcp_client.available_tools()
    return {
        "server": {
            "enabled": True,
            "endpoint": "/mcp",
            "tools": list(SERVER_TOOL_NAMES),
        },
        "client": {
            "configured": bool(mcp_client.configured_url()),
            "connected": bool(remote),
            "tools": [{"name": t["name"], "description": t["description"]} for t in remote],
        },
    }


@router.post("/api/chat")
def chat(req: ChatRequest):
    command = _mcp_command(req.message)
    if command:
        return command
    if not __import__("llm").is_available():
        raise HTTPException(503, "LLM weights missing (Qwen3-1.7B/0.6B GGUF)")
    history = [{"who": h.who, "text": h.text} for h in req.history]
    try:
        result = agent.chat(req.message, history, allow_tools=req.tools_enabled,
                            lang=req.lang, brain=req.brain,
                            websearch_enabled=req.websearch_enabled)
    except Exception as e:
        log.exception("chat failed")
        raise HTTPException(500, f"LLM error: {e}")
    if not result["reply"]:
        raise HTTPException(502, "empty LLM reply")
    return result


@router.post("/api/chat/stream")
def chat_stream(req: ChatRequest):
    """Token-streamed text chat (SSE)."""
    command = _mcp_command(req.message)

    def sse():
        try:
            if command:
                yield f"data: {json.dumps({'type': 'delta', 't': command['reply']}, ensure_ascii=False)}\n\n"
                yield f"data: {json.dumps({'type': 'final', **command}, ensure_ascii=False)}\n\n"
                return
            for ev in agent.chat_stream(req.message,
                                        [{"who": h.who, "text": h.text}
                                         for h in req.history],
                                        allow_tools=req.tools_enabled,
                                        lang=req.lang,
                                        brain=req.brain,
                                        websearch_enabled=req.websearch_enabled):
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        except Exception as e:
            log.exception("chat stream failed")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(sse(), media_type="text/event-stream")


@router.get("/api/timers")
def timers():
    return {"timers": tools.list_timers(), "memory": tools.memory_dump()}


class MemoryItem(BaseModel):
    key: str = Field(min_length=1, max_length=50)
    value: str = Field(min_length=1, max_length=400)


@router.get("/api/memory")
def get_memory():
    return {"memory": tools.memory_dump()}


@router.post("/api/memory")
def set_memory(item: MemoryItem):
    res = tools.remember(item.key, item.value)
    return {"ok": True, **res, "memory": tools.memory_dump()}


@router.delete("/api/memory/{key}")
def delete_memory_key(key: str):
    res = tools.forget(key)
    return {"ok": True, **res, "memory": tools.memory_dump()}


@router.delete("/api/memory")
def clear_all_memory():
    tools.clear_memory()
    return {"ok": True, "memory": {}}
