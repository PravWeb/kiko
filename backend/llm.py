"""Kiko brain core — Qwen3 (GGUF) via llama.cpp, CPU only.

Uses Qwen3-1.7B-Q8 when present (falls back to 0.6B).  Loads through the
model manager (lazy + idle-unload).  create_completion with a hand-built
Qwen3 prompt; /no_think keeps hybrid reasoning off.
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path

from modelmgr import Engine, manager

log = logging.getLogger("llm")

MODELS_DIR = Path(__file__).parent / "models"
GGUF_17B = MODELS_DIR / "Qwen3-1.7B-Q8_0.gguf"
GGUF_PATH = MODELS_DIR / os.environ.get(
    "LLM_GGUF",
    GGUF_17B.name if GGUF_17B.exists() else "Qwen3-0.6B-Q8_0.gguf",
)
LLM_IDLE_TTL = float(os.environ.get("LLM_IDLE_TTL", "420"))
LLM_THREADS = int(os.environ.get("LLM_THREADS", "0")) or max(
    2, min(6, (os.cpu_count() or 4) // 2)
)

KIKO_PERSONA = (
    "You are Kiko — a cheerful, slightly chaotic anime-style voice companion "
    "living on the user's laptop. You are fully offline and proud of it. "
    "Keep replies SHORT (under 45 words) because they are spoken aloud. "
    "Match the user's language: reply in Hindi if they write Hindi, English "
    "if English. Be warm, witty and useful. Never mention being a language "
    "model; you are Kiko, the character on screen."
)

# Qwen3 think markers — NOT blocked: a logit bias on them forces the model
# to "think" in freeform text. clean() strips real think blocks instead.
THINK_START_ID = 151667
THINK_END_ID = 151668

_THINK_BLOCK = re.compile(r"<think>.*?</think>", re.S)
_STRAY_TAGS = re.compile(r"</?think>")


def clean(text: str, keep_code: bool = False) -> str:
    """Normalise model output.  keep_code=True (text-chat mode) preserves
    ``` fences and newlines so code survives; default mode flattens the text
    so it reads nicely when spoken."""
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
    """Render chat history into the real Qwen3 chat template, no-thinking mode.

    - `/no_think` soft switch (documented Qwen3 behaviour) in the system turn
    - think-marker tokens blocked via logit_bias as belt-and-suspenders
    """
    im_start = "<|im_start|>"
    im_end = "<|im_end|>"
    parts: list[str] = []
    for m in messages:
        role = m.get("role", "user")
        content = str(m.get("content", ""))
        if role == "system" and "/no_think" not in content:
            content = f"{content}\n/no_think"
        parts.append(f"{im_start}{role}\n{content}{im_end}\n")
    # assistant prefill: straight to the final answer
    parts.append(f"{im_start}assistant\n")
    return "".join(parts)


IM_END = "<|im_end|>"


def _loader():
    from llama_cpp import Llama  # deferred heavy import

    if not GGUF_PATH.exists():
        raise FileNotFoundError(f"LLM weights missing: {GGUF_PATH}")
    return Llama(
        model_path=str(GGUF_PATH),
        n_ctx=4096,
        n_threads=LLM_THREADS,
        n_batch=256,
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


manager.register(Engine(
    name="llm",
    loader=_loader,
    unloader=_unloader,
    idle_ttl=LLM_IDLE_TTL,
    model_info=f"{GGUF_PATH.name} (llama.cpp, {LLM_THREADS} threads)",
))


def is_available() -> bool:
    return GGUF_PATH.exists()


def complete(messages: list[dict],
             max_tokens: int = 240,
             temperature: float = 0.7,
             repeat_penalty: float = 1.12,
             stop: list[str] | None = None,
             keep_code: bool = False) -> str:
    """Chat-completion through the managed engine. Returns cleaned text."""
    llm = manager.get("llm")
    with manager.protect("llm"):
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
           max_tokens: int = 512,
           temperature: float = 0.7,
           repeat_penalty: float = 1.12):
    """Token-by-token completion for SSE chat. Yields raw deltas (uncleaned);
    think blocks are suppressed live, the caller strips emotion tags at the end."""
    llm = manager.get("llm")
    with manager.protect("llm"):
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
