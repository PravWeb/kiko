"""Pronunciation tutor — word-level scoring of spoken vs target text."""

from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher


def _norm(word: str) -> str:
    w = unicodedata.normalize("NFC", word).strip().lower()
    w = re.sub(r"[^\w\u0900-\u097f]", "", w)
    return w


def score(target: str, said: str) -> dict:
    """Return overall 0-100 score + per-word verdicts for karaoke display."""
    tw = [w for w in re.split(r"\s+", target.strip()) if w]
    sw = [_norm(w) for w in re.split(r"\s+", said.strip()) if w]
    sw = [w for w in sw if w]

    if not tw:
        return {"score": 0, "words": [], "said": said}

    t_norm = [_norm(w) for w in tw]

    matcher = SequenceMatcher(None, t_norm, sw, autojunk=False)
    verdict: list[bool | None] = [None] * len(tw)

    for op, a1, a2, b1, b2 in matcher.get_opcodes():
        if op == "equal":
            for i in range(a1, a2):
                verdict[i] = True
        elif op in ("replace", "delete"):
            span_n = max(1, a2 - a1)
            span_s = max(1, b2 - b1)
            # pair up words greedily, compare each pair loosely
            for k, i in enumerate(range(a1, a2)):
                j = b1 + int(k * span_s / span_n)
                if b1 <= j < b2 and sw:
                    ratio = SequenceMatcher(
                        None, t_norm[i], sw[j], autojunk=False
                    ).ratio()
                    verdict[i] = ratio >= 0.62
                else:
                    verdict[i] = False
        # "insert" (extra spoken words) → ignore

    got = sum(1 for v in verdict if v)
    score_val = round(100 * got / len(tw))
    words = [
        {"word": tw[i], "ok": bool(verdict[i])} for i in range(len(tw))
    ]
    return {"score": score_val, "words": words, "said": said}


def encouragement(score_val: int) -> str:
    if score_val >= 90:
        return "Perfect! Your pronunciation is spot on."
    if score_val >= 70:
        return "Nice try! Almost there — try it once more."
    return "Keep practicing! Slow down and hit each word."
