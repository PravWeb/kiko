"""Local tools the Kiko agent can call (pure stdlib, fully offline).

`describe_for_llm()` returns a one-shot tool list for the prompt.
`execute(name, args)` runs a tool and returns a JSON-safe result dict.
Timers live here; the frontend polls /api/timers and rings on expiry.
"""

from __future__ import annotations

import random
import threading
import time
import uuid
from datetime import datetime

# ------------------------------------------------------------- quick helpers
_UNIT_TABLE: dict[str, tuple[str, float]] = {
    # unit: (canonical unit, factor to canonical)
    "km": ("m", 1000.0), "m": ("m", 1.0), "cm": ("m", 0.01), "mi": ("m", 1609.344),
    "ft": ("m", 0.3048), "kg": ("g", 1000.0), "lb": ("g", 453.59237),
    "g": ("g", 1.0), "c": ("k", 1.0), "f": ("k", 100.0),  # placeholders, handled specially
}

_TEMPS = {"c", "f", "k"}


def unit_convert(args: dict) -> dict:
    try:
        value = float(args.get("value"))
        frm = str(args.get("from_unit", "")).lower().strip()
        to = str(args.get("to_unit", "")).lower().strip()
    except Exception:
        return {"error": "need value, from_unit, to_unit"}
    if frm in _TEMPS and to in _TEMPS:
        c = {"c": lambda v: v, "f": lambda v: (v - 32) * 5 / 9,
             "k": lambda v: v - 273.15}[frm](value)
        out = {"c": lambda v: v, "f": lambda v: v * 9 / 5 + 32,
               "k": lambda v: v + 273.15}[to](c)
        return {"result": round(out, 3), "text": f"{value}°{frm.upper()} = {round(out, 3)}°{to.upper()}"}
    try:
        if frm not in _UNIT_TABLE or to not in _UNIT_TABLE:
            raise ValueError("unknown unit")
        base, f1 = _UNIT_TABLE[frm]
        base2, f2 = _UNIT_TABLE[to]
        if base != base2:
            raise ValueError("units are not compatible")
        out = value * f1 / f2
        out = round(out, 4)
        return {"result": out, "text": f"{value} {frm} = {out} {to}"}
    except Exception as e:
        return {"error": f"could not convert: {e}"}


JOKES = [
    "Why did the laptop go to therapy? It had too many unresolved dependencies!",
    "I told my Wi-Fi we needed space. Now it's offline.",
    "Why do Python programmers wear glasses? Because they can't C sharp.",
    "My code works on my machine. Sincerely, every programmer ever.",
    "Why was the JavaScript developer sad? Because he didn't Node how to Express himself.",
    "I would tell you a UDP joke but you might not get it.",
]

QUOTES = [
    "Every expert was once a beginner. Keep going!",
    "Small steps every day beat one giant leap next month.",
    "You miss 100 percent of the shots you don't take.",
    "Done is better than perfect. Ship it!",
    "Anyone who has never made a mistake has never tried anything new.",
]


def tell_joke(args: dict) -> dict:
    return {"joke": random.choice(JOKES)}


def motivate(args: dict) -> dict:
    return {"quote": random.choice(QUOTES)}


def dice(args: dict) -> dict:
    try:
        sides = max(2, min(120, int(args.get("sides", 6))))
    except Exception:
        sides = 6
    roll = random.randint(1, sides)
    return {"roll": roll, "sides": sides, "text": f"rolled {roll} on a d{sides}"}


def coin_flip(args: dict) -> dict:
    side = random.choice(["heads", "tails"])
    return {"result": side, "text": f"it's {side}!"}


# ------------------------------------------------------------------- timers
_timers: dict[str, dict] = {}
_timers_lock = threading.Lock()


def set_timer(seconds: float, label: str = "timer") -> dict:
    seconds = max(1.0, min(float(seconds), 60 * 60 * 6))
    tid = uuid.uuid4().hex[:6]
    with _timers_lock:
        _timers[tid] = {
            "id": tid,
            "label": str(label)[:60],
            "fires_at": time.time() + seconds,
            "seconds": seconds,
            "fired": False,
        }
    return {"timer_id": tid, "seconds": int(seconds), "label": label}


def list_timers() -> list[dict]:
    now = time.time()
    with _timers_lock:
        # keep unfired timers + recently fired ones (so UI can flash them)
        for t in list(_timers.values()):
            if t["fired"] and now - t["fires_at"] > 30:
                del _timers[t["id"]]
        out = []
        for t in _timers.values():
            out.append({
                **t,
                "remaining_s": max(0.0, round(t["fires_at"] - now, 1)),
                "fired": t["fired"] or now >= t["fires_at"],
            })
    return sorted(out, key=lambda t: t["remaining_s"])


def fire_due_timers() -> list[dict]:
    now = time.time()
    fired = []
    with _timers_lock:
        for t in _timers.values():
            if not t["fired"] and now >= t["fires_at"]:
                t["fired"] = True
                fired.append(t)
    return fired


# ------------------------------------------------------------------- memory
_session_memory: dict[str, str] = {}
_mem_lock = threading.Lock()


def remember(key: str, value: str) -> dict:
    key = str(key).strip().lower()[:40]
    value = str(value)[:200]
    with _mem_lock:
        _session_memory[key] = value
    return {"stored": True, "key": key, "value": value}


def memory_dump() -> dict[str, str]:
    with _mem_lock:
        return dict(_session_memory)


def memory_prompt_block() -> str:
    mem = memory_dump()
    if not mem:
        return ""
    lines = [f"- {k}: {v}" for k, v in mem.items()]
    return "Facts you remembered this session:\n" + "\n".join(lines)


def web_search(args: dict) -> dict:
    """Live web search via DuckDuckGo (no API key). Needs internet;
    returns graceful offline error otherwise."""
    query = str(args.get("query") or args.get("value") or "").strip()
    if not query:
        return {"error": "empty query"}
    try:
        from ddgs import DDGS
        with DDGS() as ddgs:
            rows = list(ddgs.text(query, max_results=5))
        results = [
            {
                "title": r.get("title", ""),
                "url": r.get("href", ""),
                "snippet": (r.get("body") or "")[:300],
            }
            for r in rows
        ]
        return {"query": query, "results": results}
    except Exception as e:
        return {
            "error": f"search failed: {e}",
            "hint": "web_search needs internet; Kiko works fully offline without it",
        }


# ---------------------------------------------------------------- tool defs
TOOLS: list[dict] = [
    {
        "name": "web_search",
        "description": "Search the web with DuckDuckGo when you need current "
                       "or factual info beyond your knowledge. Args: query (text)",
        "example": '{"tool": "web_search", "args": {"query": "who won the 2024 olympics"}}',
    },
    {
        "name": "set_timer",
        "description": "Start a countdown timer. Args: seconds (number), label (short text)",
        "example": '{"tool": "set_timer", "args": {"seconds": 300, "label": "tea"}}',
    },
    {
        "name": "unit_convert",
        "description": "Convert units or temperatures. Args: value (number), from_unit, to_unit"
                       " (km, m, mi, ft, cm; kg, lb, g; c, f, k)",
        "example": '{"tool": "unit_convert", "args": {"value": 5, "from_unit": "km", "to_unit": "mi"}}',
    },
    {
        "name": "tell_joke",
        "description": "Tell a short programming joke. Args: none",
        "example": '{"tool": "tell_joke", "args": {}}',
    },
    {
        "name": "motivate",
        "description": "Give a short motivational quote. Args: none",
        "example": '{"tool": "motivate", "args": {}}',
    },
    {
        "name": "dice",
        "description": "Roll a dice. Args: sides (number, default 6)",
        "example": '{"tool": "dice", "args": {"sides": 6}}',
    },
    {
        "name": "coin_flip",
        "description": "Flip a coin. Args: none",
        "example": '{"tool": "coin_flip", "args": {}}',
    },
    {
        "name": "get_time_date",
        "description": "Get current local time and date. Args: none",
        "example": '{"tool": "get_time_date", "args": {}}',
    },
    {
        "name": "remember",
        "description": "Store a fact about the user for this session. Args: key, value",
        "example": '{"tool": "remember", "args": {"key": "name", "value": "Ravi"}}',
    },
    {
        "name": "recall",
        "description": "Read back everything remembered this session. Args: none",
        "example": '{"tool": "recall", "args": {}}',
    },
    {
        "name": "list_tools",
        "description": "List what Kiko can do (features). Args: none",
        "example": '{"tool": "list_tools", "args": {}}',
    },
]

FEATURE_LIST = (
    "chat with memory, hands-free talk loop, timers, unit conversion, jokes, "
    "motivational quotes, dice and coin flip, translate English<->Hindi, "
    "summarize long text, pronunciation scoring, read-aloud with karaoke subtitles, "
    "English and Hindi voices, voice effects (pitch/robot/echo), session export, "
    "live web search (DuckDuckGo, needs internet)"
)


def describe_for_llm() -> str:
    lines = ["You can call local tools. Reply with ONLY the tool JSON when one helps:"]
    for t in TOOLS:
        lines.append(f"- {t['name']}: {t['description']} e.g. {t['example']}")
    lines.append(
        'If no tool is needed, reply normally (optionally prefixed with '
        '"[emotion:happy]" style tag from: happy, excited, neutral, serious, '
        'surprised, shy, sleepy).'
    )
    return "\n".join(lines)


def execute(name: str, args: dict) -> dict:
    args = args or {}
    if name == "set_timer":
        return set_timer(args.get("seconds", 30), args.get("label", "timer"))
    if name == "unit_convert":
        return unit_convert(args)
    if name == "tell_joke":
        return tell_joke(args)
    if name == "motivate":
        return motivate(args)
    if name == "dice":
        return dice(args)
    if name == "coin_flip":
        return coin_flip(args)
    if name == "get_time_date":
        now = datetime.now()
        return {
            "time": now.strftime("%H:%M"),
            "date": now.strftime("%A, %d %B %Y"),
            "weekday": now.strftime("%A"),
        }
    if name == "remember":
        return remember(str(args.get("key", "")), str(args.get("value", "")))
    if name == "recall":
        return memory_dump() or {"memory": "empty"}
    if name == "list_tools":
        return {"features": FEATURE_LIST}
    if name == "web_search":
        return web_search(args)
    return {"error": f"unknown tool {name!r}"}
