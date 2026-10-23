"""Kiko brain core — Qwen3 (GGUF) via llama.cpp, CPU only.

Dual-brain routing:
  - 'fast' (Qwen3-0.6B): smaller resident model for lower-latency live voice and quick turns.
  - 'smart' (Qwen3-1.7B): larger on-demand model for longer prompts, document RAG, and summarization.

Lazy loading with automatic idle unloading via the model manager.
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path

from modelmgr import Engine, manager

log = logging.getLogger("llm")

MODELS_DIR = Path(__file__).parent / "models"
GGUF_06B = MODELS_DIR / "Qwen3-0.6B-Q8_0.gguf"
GGUF_17B = MODELS_DIR / "Qwen3-1.7B-Q8_0.gguf"

LLM_IDLE_TTL = float(os.environ.get("LLM_IDLE_TTL", "1800"))
LLM_THREADS = int(os.environ.get("LLM_THREADS", "0")) or min(
    8, max(4, (os.cpu_count() or 4) - 2)
)

KIKO_PERSONA = (
    "You are Kiko — a cheerful, helpful AI companion living on the user's laptop. "
    "Core chat runs locally. Be warm, witty, and helpful. "
    "Answer the user's actual question first with specific, useful information. "
    "For clear questions, answer directly instead of asking what they mean. "
    "Avoid generic filler such as 'I'm here to help' unless it answers the user. "
    "For casual conversation, respond naturally and briefly; don't turn every reply into an offer. "
    "Never invent facts. If the user asks for current news or recent developments and web search is available, search before answering. "
    "If that search is unavailable, say so briefly and separate general background from current facts. "
    "Match the user's language: reply in Hindi if they write Hindi, English if English. "
    "Never mention being a language model; you are Kiko."
)

THINK_START_ID = 151667
THINK_END_ID = 151668

_THINK_BLOCK = re.compile(r"<think>.*?</think>", re.S)
_STRAY_TAGS = re.compile(r"</?think>")


def clean(text: str, keep_code: bool = True) -> str:
    """Normalise model output. keep_code=True preserves fences and newlines."""
    if not text:
        return ""
    text = _THINK_BLOCK.sub(" ", text)
    text = _STRAY_TAGS.sub(" ", text)
    if not keep_code:
        text = text.replace("```json", " ").replace("```", " ")
        text = re.sub(r"\s+", " ", text).strip()
        return text
    text = text.replace("```json", "```")
    lines = [ln.rstrip() for ln in text.splitlines()]
    out: list[str] = []
    blanks = 0
    for ln in lines:
        if not ln.strip():
            blanks += 1
            if blanks > 1:
                continue
        else:
            blanks = 0
        out.append(ln)
    return "\n".join(out).strip()


def build_prompt(messages: list[dict]) -> str:
    """Render chat history into the real Qwen3 chat template, no-thinking mode."""
    im_start = "<|im_start|>"
    im_end = "<|im_end|>"
    parts: list[str] = []
    for m in messages:
        role = m.get("role", "user")
        content = str(m.get("content", ""))
        if role == "system" and "/no_think" not in content:
            content = f"{content}\n/no_think"
        parts.append(f"{im_start}{role}\n{content}{im_end}\n")
    parts.append(f"{im_start}assistant\n")
    return "".join(parts)


IM_END = "<|im_end|>"


def _create_llama(model_path: Path, n_ctx: int = 2048):
    from llama_cpp import Llama

    if not model_path.exists():
        raise FileNotFoundError(f"LLM weights missing: {model_path}")
    return Llama(
        model_path=str(model_path),
        n_ctx=n_ctx,
        n_threads=LLM_THREADS,
        n_batch=512,
        verbose=False,
    )


def _unloader(handle) -> None:
    try:
        close = getattr(handle, "close", None)
        if callable(close):
            close()
    except Exception:
        pass
    del handle


# 1. Fast brain: Qwen3-0.6B (or fallback to 1.7B), resident to avoid repeated model-load delay.
_fast_path = GGUF_06B if GGUF_06B.exists() else GGUF_17B
_smart_path = GGUF_17B if GGUF_17B.exists() else GGUF_06B
_shared_brain = _fast_path == _smart_path
manager.register(Engine(
    name="llm_fast",
    loader=lambda: _create_llama(_fast_path, n_ctx=4096 if _shared_brain else 2048),
    unloader=_unloader,
    resident=True,
    idle_ttl=LLM_IDLE_TTL,
    model_info=f"{_fast_path.name} (llama.cpp, {LLM_THREADS} threads, fast voice)",
))

# 2. Smart brain: Qwen3-1.7B (or fallback to 0.6B)
manager.register(Engine(
    name="llm_smart",
    loader=(lambda: manager.get("llm_fast")) if _shared_brain
            else (lambda: _create_llama(_smart_path, n_ctx=4096)),
    unloader=(lambda _handle: None) if _shared_brain else _unloader,
    resident=False,
    idle_ttl=LLM_IDLE_TTL,
    model_info=f"{_smart_path.name} (llama.cpp, {LLM_THREADS} threads, smart RAG)",
))

# Compatibility alias for default engine
GGUF_PATH = _smart_path if GGUF_17B.exists() else _fast_path


def _resolve_engine(brain: str = "auto") -> str:
    """Resolve engine name: 'fast' -> llm_fast, 'smart' -> llm_smart."""
    b = (brain or "auto").lower()
    if b in ("smart", "big", "1.7b", "1.7", "rag"):
        return "llm_smart" if GGUF_17B.exists() else "llm_fast"
    if b in ("fast", "small", "0.6b", "0.6", "voice"):
        return "llm_fast" if GGUF_06B.exists() else "llm_smart"
    # auto: prefer fast for quick interactions if available
    return "llm_fast" if GGUF_06B.exists() else "llm_smart"


def is_available(brain: str = "any") -> bool:
    b = brain.lower()
    if b == "fast":
        return GGUF_06B.exists() or GGUF_17B.exists()
    if b == "smart":
        return GGUF_17B.exists() or GGUF_06B.exists()
    return GGUF_06B.exists() or GGUF_17B.exists()


def complete(messages: list[dict],
             max_tokens: int = 450,
             temperature: float = 0.7,
             repeat_penalty: float = 1.12,
             stop: list[str] | None = None,
             keep_code: bool = True,
             brain: str = "auto") -> str:
    """Chat-completion through the managed engine. Returns cleaned text."""
    eng_name = _resolve_engine(brain)
    llm = manager.get(eng_name)
    with manager.protect(eng_name):
        out = llm.create_completion(
            prompt=build_prompt(messages),
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=0.9,
            repeat_penalty=repeat_penalty,
            stop=stop or [IM_END, "<|im_start|>"],
        )
    raw = out["choices"][0]["text"] or ""
    return clean(raw, keep_code=keep_code)


def stream(messages: list[dict],
           max_tokens: int = 800,
           temperature: float = 0.7,
           repeat_penalty: float = 1.12,
           brain: str = "auto"):
    """Token-by-token completion for SSE chat. Yields raw deltas (uncleaned);
    think blocks are suppressed live, the caller strips emotion tags at the end."""
    eng_name = _resolve_engine(brain)
    llm = manager.get(eng_name)
    with manager.protect(eng_name):
        prompt = build_prompt(messages)
        gen = llm.create_completion(
            prompt=prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=0.9,
            repeat_penalty=repeat_penalty,
            stop=[IM_END, "<|im_start|>"],
            stream=True,
        )
        in_think = False
        for chunk in gen:
            delta = chunk["choices"][0].get("text", "")
            if not delta:
                continue
            if in_think:
                if "</think>" in delta:
                    delta = delta.split("</think>", 1)[1]
                    in_think = False
                else:
                    continue
            if "<think>" in delta:
                _, _, delta = delta.partition("<think>")
                if "</think>" in delta:
                    delta = delta.split("</think>", 1)[1]
                else:
                    in_think = True
                    continue
            if delta:
                yield delta
