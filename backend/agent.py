"""Kiko agent — chat turn orchestration with tool-calling loop.

Uses llm.complete() (no thinking prefill) and tools.execute().  Emotion tags
are parsed from the reply; tool calls surface as structured metadata for the UI.
"""

from __future__ import annotations

import json
import logging
import re
import time

import tools
from llm import KIKO_PERSONA, complete, stream as llm_stream

log = logging.getLogger("agent")

TOOL_HINT = tools.describe_for_llm()
SYSTEM = (
    f"{KIKO_PERSONA}\n\n{TOOL_HINT}\n\n"
    "When a tool helps, reply with ONLY a JSON object like "
    '{"tool": "set_timer", "args": {"seconds": 30, "label": "tea"}}.\n'
    "After you receive the tool result, answer the user in one short spoken "
    "line. Otherwise reply normally. You may prefix a reply with one emotion "
    "tag from: [emotion:happy] [emotion:excited] [emotion:neutral] "
    "[emotion:serious] [emotion:surprised] [emotion:shy] [emotion:sleepy] "
    "[emotion:thinking].\n{memory}"
)

VALID_EMOTIONS = {
    "happy", "excited", "neutral", "serious", "surprised", "shy", "sleepy",
    "thinking",
}

def _finish(messages: list[dict], raw: str, tool_calls: list[dict],
            started: float, lang: str) -> dict:
    reply, emotion = _strip_emotion(raw)
    reply = reply.strip().strip('"').strip()
    # last-resort: if reply is still JSON, replace
    if reply.strip().startswith(("{", "[")):
        reply = "हो गया जी!" if lang == "hi" else "Done!"
    # Hindi mode: one retry when the model slipped into pure English
    if lang == "hi" and reply and not _HAS_DEVA.search(reply):
        nudge = messages + [{
            "role": "user",
            "content": " जवाब हिंदी में दो (देवनागरी में लिखो). एक छोटी लाइन.",
        }]
        raw2 = complete(nudge, max_tokens=140, temperature=0.6,
                        repeat_penalty=1.15)
        r2, e2 = _strip_emotion(raw2)
        r2 = r2.strip().strip('"').strip()
        if r2 and not r2.startswith(("{", "[")) and _HAS_DEVA.search(r2):
            reply, emotion = r2, e2
    for label in ("किको:", "किको :", "उपयोगकर्ता:", "Kiko:"):
        if reply.startswith(label):
            reply = reply[len(label):].lstrip()
    return {
        "reply": reply.strip() or "...",
        "emotion": emotion,
        "tool_calls": tool_calls,
        "elapsed_s": round(time.time() - started, 2),
    }
_emotion_re = re.compile(r"\s*\[emotion:\s*([a-z]+)\]\s*", re.I)
_json_re = re.compile(r"\{.*?\}", re.S)

_TOOL_KEYS = ("tool", "tool_used", "name", "function")
_ARG_KEYS = ("args", "arguments", "parameters", "params")


def _memory_block() -> str:
    block = tools.memory_prompt_block()
    return block if block else ""


def _strip_emotion(text: str, default: str = "neutral") -> tuple[str, str]:
    m = _emotion_re.search(text)
    if m:
        emo = m.group(1).lower()
        text = _emotion_re.sub(" ", text).strip()
        return text, (emo if emo in VALID_EMOTIONS else default)
    low = text.lower()
    if any(w in low for w in ("wow", "amazing", "haha", "awesome")):
        return text, "excited"
    if text.strip().endswith("!"):
        return text, "happy"
    if "?" in text:
        return text, "thinking"
    return text, default


def _tool_from_obj(obj: dict) -> tuple[str, dict] | None:
    name = None
    for k in _TOOL_KEYS:
        if k in obj and obj[k]:
            name = str(obj[k])
            break
    if not name:
        return None
    args = {}
    for k in _ARG_KEYS:
        if k in obj and isinstance(obj[k], dict):
            args = obj[k]
            break
    if not args:
        for k in _ARG_KEYS:
            if k in obj and obj[k] is not None:
                args = obj[k] if isinstance(obj[k], dict) else {"value": obj[k]}
                break
    return name, args or {}


def _loads_norm(candidate: str) -> dict | None:
    for attempt in (candidate, candidate.replace("`", "")):
        if attempt.startswith("[") and attempt.endswith("]"):
            attempt = "{" + attempt[1:-1] + "}"
        try:
            obj = json.loads(attempt)
            return obj if isinstance(obj, dict) else None
        except Exception:
            continue
    return None


def _extract_tool(text: str) -> tuple[str, dict] | None:
    cleaned = text.replace("```json", " ").replace("```", " ").strip()
    # fast path: whole reply is (close to) a single JSON object
    obj = _loads_norm(cleaned)
    if obj:
        tool = _tool_from_obj(obj)
        if tool:
            return tool
    start = cleaned.find("{")
    while start != -1:
        depth = 0
        for i in range(start, len(cleaned)):
            ch = cleaned[i]
            if ch in "{[":
                depth += 1
            elif ch in "}]":
                depth -= 1
                if depth == 0:
                    candidate = cleaned[start:i + 1]
                    obj = _loads_norm(candidate)
                    if obj:
                        tool = _tool_from_obj(obj)
                        if tool:
                            return tool
                        # inner object without a tool key — keep scanning
                    break
        start = cleaned.find("{", start + 1)
    return None

def _lang_rule(lang: str) -> str:
    if lang == "hi":
        return (
            " CRITICAL: Write your ENTIRE reply ONLY in Hindi, Devanagari "
            "script, never English sentences. Tool names may stay English."
            "Examples:"
            "उपयोगकर्ता: नमस्ते, आप कैसी हैं? → किको: नमस्ते जी! मैं बढ़िया हूँ, आपको सुनकर अच्छा लगा।"
            "उपयोगकर्ता: मुझे पाँच मिनट का टाइमर सेट करो → किको: पाँच मिनट का टाइमर सेट हो गया जी!"
            "उपयोगकर्ता: आज मौसम कैसा है? → किको: मैं ऑफ़लाइन हूँ, मगर बाहर देखकर बता जी!"
        )
    return ""


_HAS_DEVA = re.compile(r"[\u0900-\u097F]")


def _context_block(chunks: list[str]) -> str:
    return (
        "\n\nFILE CONTENT below. Answer using ONLY it; if the answer is not "
        "in it, say you don't have that detail. One or two lines — spoken aloud."
        "\n\nFILE CONTENT:\n" + "\n\n".join(chunks)
    )


def chat_with_context(question: str, chunks: list[str]) -> dict:
    """Grounded answer: no tools, file content in system, one short reply."""
    started = time.time()
    sys_prompt = (
        "You are Kiko — a cheerful offline assistant. Answer ONLY from the "
        "given FILE CONTENT. If it is missing there, say so. Reply in one or "
        "two short spoken lines. /no_think"
    )
    messages = [
        {"role": "system", "content": sys_prompt + _context_block(chunks)},
        {"role": "user", "content": question[:1500]},
    ]
    raw = complete(messages, max_tokens=200, temperature=0.6,
                   repeat_penalty=1.12)
    reply, emotion = _strip_emotion(raw)
    reply = reply.strip().strip('"').strip()
    for label in ("किको:", "Kiko:"):
        if reply.startswith(label):
            reply = reply[len(label):].lstrip()
    return {
        "reply": reply or "…",
        "emotion": emotion,
        "tool_calls": [],
        "elapsed_s": round(time.time() - started, 2),
    }


def chat_with_context_stream(question: str, chunks: list[str]):
    """Streaming variant of chat_with_context — yields SSE events:
    {"type":"delta","t":…} then {"type":"final", reply, emotion, elapsed_s}."""
    started = time.time()
    sys_prompt = (
        "You are Kiko — a cheerful offline assistant. Answer ONLY from the "
        "given FILE CONTENT. If it is missing there, say so. Reply in one or "
        "two short spoken lines. /no_think"
    )
    messages = [
        {"role": "system", "content": sys_prompt + _context_block(chunks)},
        {"role": "user", "content": question[:1500]},
    ]

    def gen():
        raw_parts: list[str] = []
        try:
            for delta in llm_stream(messages, max_tokens=320,
                                    temperature=0.6, repeat_penalty=1.12):
                if delta:
                    raw_parts.append(delta)
                    yield {"type": "delta", "t": delta}
        except Exception as e:
            log.exception("ctx stream failed")
            yield {"type": "error", "message": str(e)}
            return
        raw = "".join(raw_parts)
        reply, emotion = _strip_emotion(raw)
        reply = reply.strip().strip('"').strip()
        for label in ("किको:", "Kiko:"):
            if reply.startswith(label):
                reply = reply[len(label):].lstrip()
        yield {
            "type": "final",
            "reply": reply or "…",
            "emotion": emotion,
            "tool_calls": [],
            "elapsed_s": round(time.time() - started, 2),
        }

    return gen()


def chat(message: str, history: list[dict],
         allow_tools: bool = True, lang: str = "en") -> dict:
    """One agent turn: optional tool call + final spoken reply."""
    sys_prompt = SYSTEM.replace("{memory}", _memory_block()) + _lang_rule(lang)
    messages = [{"role": "system", "content": sys_prompt}]
    for h in history[-8:]:
        role = "assistant" if h.get("who") == "kiko" else "user"
        content = str(h.get("text", ""))[:500]
        if content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": message[:1500]})

    tool_calls: list[dict] = []
    started = time.time()
    raw = ""

    for round_i in range(2):
        raw = complete(messages, max_tokens=260, temperature=0.7,
                       repeat_penalty=1.15)
        tool = _extract_tool(raw) if (allow_tools and round_i == 0) else None
        if tool is None:
            # model sometimes re-emits a tool call in round 1 — re-prompt once
            if round_i == 1 and _extract_tool(raw) is not None:
                messages.append({"role": "assistant", "content": raw.strip()})
                messages.append({
                    "role": "user",
                    "content": "You already have the tool result above. "
                               "Reply to the user in ONE short spoken line. "
                               "Do NOT output JSON.",
                })
                raw = complete(messages, max_tokens=160, temperature=0.6,
                               repeat_penalty=1.15)
                if _extract_tool(raw) is not None:
                    raw = "Done!"
            return _finish(messages, raw, tool_calls, started, lang)
        name, args = tool
        result = tools.execute(name, args)
        tool_calls.append({"tool": name, "args": args, "result": result})
        messages.append({"role": "assistant", "content": raw.strip()})
        messages.append({
            "role": "user",
            "content": f"tool result: {json.dumps(result, ensure_ascii=False)}\n"
                       "Now reply to the user in one short spoken line. "
                       "Do NOT output JSON.",
        })

    return _finish(messages, raw, tool_calls, started, lang)


_CHAT_TEXT_STYLE = (
    " STYLE for this text channel: keep casual replies short (under 60 "
    "words), but if the user asks for code, an example, or a deep "
    "explanation, give a proper answer: short paragraphs and ALL code inside "
    "``` fenced blocks with a language tag (like ```python). Only invent "
    "APIs you are sure exist; prefer classic well-known libraries."
)


def chat_stream(message: str, history: list[dict],
                allow_tools: bool = True, lang: str = "en"):
    """Streaming variant for the text-chat UI.

    Returns a generator of events:
      {"type": "delta", "t": "..."}     — incremental answer text
      {"type": "tools", "tool_calls": …} — a tool round is executing
      {"type": "final", reply, emotion, tool_calls, elapsed_s}
      {"type": "error", "message": …}
    """
    sys_prompt = (SYSTEM.replace("{memory}", _memory_block())
                  + _lang_rule(lang) + _CHAT_TEXT_STYLE)
    messages = [{"role": "system", "content": sys_prompt}]
    for h in history[-8:]:
        role = "assistant" if h.get("who") == "kiko" else "user"
        content = str(h.get("text", ""))[:500]
        if content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": message[:1500]})

    started = time.time()
    tool_calls: list[dict] = []

    def gen():
        raw_parts: list[str] = []
        try:
            for delta in llm_stream(messages, max_tokens=512,
                                    temperature=0.7, repeat_penalty=1.12):
                if delta:
                    raw_parts.append(delta)
                    yield {"type": "delta", "t": delta}
        except Exception as e:  # engine hiccup mid-stream
            log.exception("chat_stream failed")
            yield {"type": "error", "message": str(e)}
            return
        raw = "".join(raw_parts)
        tool = _extract_tool(raw) if allow_tools else None
        if tool is not None:
            name, args = tool
            result = tools.execute(name, args)
            tool_calls.append({"tool": name, "args": args, "result": result})
            yield {"type": "tools", "tool_calls": tool_calls}
            messages.append({"role": "assistant", "content": raw.strip()})
            messages.append({
                "role": "user",
                "content": f"tool result: {json.dumps(result, ensure_ascii=False)}\n"
                           "Now reply to the user in one short spoken line. "
                           "Do NOT output JSON.",
            })
            raw = complete(messages, max_tokens=200, temperature=0.6,
                           repeat_penalty=1.15)
            if _extract_tool(raw) is not None:
                raw = "हो गया जी!" if lang == "hi" else "Done!"
            yield {"type": "final", **_finish(messages, raw, tool_calls,
                                              started, lang)}
            return
        yield {"type": "final", **_finish(messages, raw, tool_calls,
                                          started, lang)}

    return gen()
