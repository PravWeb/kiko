"""Local tools the Kiko agent can call (pure stdlib, fully offline).

`describe_for_llm()` returns a one-shot tool list for the prompt.
`execute(name, args)` runs a tool and returns a JSON-safe result dict.
Timers live here; the frontend polls /api/timers and rings on expiry.
"""

from __future__ import annotations

import random
import os
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
import json

# ------------------------------------------------------------- quick helpers
_UNIT_TABLE: dict[str, tuple[str, float]] = {
    # unit: (dimension, factor to canonical unit)
    "km": ("length", 1000.0), "m": ("length", 1.0),
    "cm": ("length", 0.01), "mm": ("length", 0.001),
    "mi": ("length", 1609.344), "yd": ("length", 0.9144),
    "ft": ("length", 0.3048), "in": ("length", 0.0254),
    "kg": ("mass", 1000.0), "g": ("mass", 1.0),
    "mg": ("mass", 0.001), "lb": ("mass", 453.59237),
    "oz": ("mass", 28.349523125),
    "l": ("volume", 1.0), "ml": ("volume", 0.001),
    "gal": ("volume", 3.785411784), "cup": ("volume", 0.2365882365),
}

_UNIT_ALIASES = {
    "kilometer": "km", "kilometers": "km", "kilometre": "km", "kilometres": "km",
    "meter": "m", "meters": "m", "metre": "m", "metres": "m",
    "centimeter": "cm", "centimeters": "cm", "centimetre": "cm", "centimetres": "cm",
    "millimeter": "mm", "millimeters": "mm", "millimetre": "mm", "millimetres": "mm",
    "mile": "mi", "miles": "mi", "yard": "yd", "yards": "yd",
    "foot": "ft", "feet": "ft", "inch": "in", "inches": "in",
    "kilo": "kg", "kilos": "kg", "kilogram": "kg", "kilograms": "kg", "kgs": "kg",
    "gram": "g", "grams": "g",
    "milligram": "mg", "milligrams": "mg", "pound": "lb", "pounds": "lb", "lbs": "lb",
    "ounce": "oz", "ounces": "oz", "liter": "l", "liters": "l",
    "litre": "l", "litres": "l", "milliliter": "ml", "milliliters": "ml",
    "millilitre": "ml", "millilitres": "ml", "gallon": "gal", "gallons": "gal",
    "cups": "cup", "celsius": "c", "fahrenheit": "f", "kelvin": "k",
}

_TEMPS = {"c", "f", "k"}


def unit_convert(args: dict) -> dict:
    try:
        value = float(args.get("value"))
        frm = str(args.get("from_unit", "")).lower().strip().replace("°", "")
        to = str(args.get("to_unit", "")).lower().strip().replace("°", "")
        frm = _UNIT_ALIASES.get(frm, frm)
        to = _UNIT_ALIASES.get(to, to)
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


# ------------------------------------------------------------------- persistent memory
if os.name == "nt":
    _DATA_ROOT = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
else:
    _DATA_ROOT = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
_DATA_DIR = _DATA_ROOT / "Kiko"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_MEMORY_FILE = _DATA_DIR / "memory.json"
_LEGACY_MEMORY_FILE = Path(__file__).parent / "data" / "memory.json"

_session_memory: dict[str, str] = {}
_mem_lock = threading.Lock()


def _load_memory() -> None:
    global _session_memory
    source = _MEMORY_FILE if _MEMORY_FILE.exists() else _LEGACY_MEMORY_FILE
    if source.exists():
        try:
            with open(source, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    _session_memory = {str(k).strip().lower(): str(v) for k, v in data.items()}
                    if source == _LEGACY_MEMORY_FILE:
                        _save_memory()
        except Exception:
            _session_memory = {}


def _save_memory() -> None:
    try:
        tmp = _MEMORY_FILE.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(_session_memory, f, ensure_ascii=False, indent=2)
        tmp.replace(_MEMORY_FILE)
    except Exception:
        pass


_load_memory()


def remember(key: str, value: str) -> dict:
    key = str(key).strip().lower()[:40]
    value = str(value).strip()[:300]
    if not key or not value:
        return {"error": "need both key and value"}
    with _mem_lock:
        if key not in _session_memory and len(_session_memory) >= 100:
            _session_memory.pop(next(iter(_session_memory)))
        _session_memory[key] = value
        _save_memory()
    return {"stored": True, "key": key, "value": value}


def forget(key: str) -> dict:
    key = str(key).strip().lower()[:40]
    with _mem_lock:
        existed = _session_memory.pop(key, None) is not None
        if existed:
            _save_memory()
    return {"removed": existed, "key": key}


def clear_memory() -> dict:
    with _mem_lock:
        _session_memory.clear()
        _save_memory()
    return {"cleared": True}


def memory_dump() -> dict[str, str]:
    with _mem_lock:
        return dict(_session_memory)


def memory_prompt_block() -> str:
    mem = memory_dump()
    if not mem:
        return ""
    lines = [f"- {k}: {v}" for k, v in list(mem.items())[-24:]]
    return "\nLong-Term Facts you know about this user:\n" + "\n".join(lines) + "\n"


_SEARCH_CACHE: dict[str, tuple[float, list[dict]]] = {}
_SEARCH_CACHE_TTL = 600.0  # 10 minutes


def web_search(args: dict) -> dict:
    """Live web search via DuckDuckGo (no API key). Needs internet;
    returns graceful offline error otherwise."""
    query = str(args.get("query") or args.get("value") or "").strip()
    if not query:
        return {"error": "empty query"}

    # Cache check
    now = time.time()
    q_key = query.lower()
    if q_key in _SEARCH_CACHE:
        cached_time, cached_results = _SEARCH_CACHE[q_key]
        if now - cached_time < _SEARCH_CACHE_TTL:
            return {"query": query, "results": cached_results, "cached": True}

    results: list[dict] = []
    # Primary: ddgs package
    try:
        from ddgs import DDGS
        with DDGS() as ddgs:
            rows = list(ddgs.text(query, max_results=5))
        for r in rows:
            t = (r.get("title") or "").strip()
            u = (r.get("href") or "").strip()
            s = (r.get("body") or "").strip()
            if t and (s or u):
                results.append({
                    "title": t,
                    "url": u,
                    "snippet": s[:350],
                })
    except Exception as e:
        log.warning("ddgs search failed: %s, attempting direct request fallback", e)

    # Fallback: duckduckgo html endpoint via urllib if ddgs produced no results
    if not results:
        try:
            import urllib.parse
            import urllib.request
            import re
            url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                html = resp.read().decode("utf-8", errors="replace")
            # Parse links and snippets
            links = re.findall(r'<a class="result__url"[^>]*href="([^"]+)"', html)
            snippets = re.findall(r'<a class="result__snippet[^>]*>(.*?)</a>', html)
            titles = re.findall(r'<a class="result__a[^>]*>(.*?)</a>', html)
            for i in range(min(4, len(titles))):
                title = re.sub(r"<[^>]+>", "", titles[i]).strip()
                snip = re.sub(r"<[^>]+>", "", snippets[i]).strip() if i < len(snippets) else ""
                href = links[i] if i < len(links) else ""
                if title:
                    results.append({"title": title, "url": href, "snippet": snip[:350]})
        except Exception as e:
            log.warning("direct search fallback also failed: %s", e)

    if results:
        _SEARCH_CACHE[q_key] = (now, results)
        return {"query": query, "results": results}

    return {
        "error": "No web results found or offline",
        "hint": "web_search needs internet; Kiko works fully offline without it",
        "results": [],
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
                       " (length: km, m, cm, mm, mi, yd, ft, in; mass: kg, g, mg, lb, oz; volume: l, ml, gal, cup; temperature: c, f, k; common singular/plural names accepted)",
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
        "name": "forget",
        "description": "Delete a remembered fact about the user. Args: key",
        "example": '{"tool": "forget", "args": {"key": "name"}}',
    },
]

FEATURE_LIST = (
    "chat with memory, hands-free talk loop, timers, unit conversion, jokes, "
    "motivational quotes, dice and coin flip, "
    "summarize long text, read-aloud with karaoke subtitles, "
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
    if name == "forget":
        return forget(str(args.get("key", args.get("value", ""))))
    if name == "list_tools":
        return {"features": FEATURE_LIST}
    if name == "web_search":
        return web_search(args)
    return {"error": f"unknown tool {name!r}"}
