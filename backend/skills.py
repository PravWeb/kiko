"""Small, local prompt skills. A skill is selected only when its triggers match."""

from __future__ import annotations

import re
from pathlib import Path

SKILLS_DIR = Path(__file__).parent / "skills"
_WORD_RE = re.compile(r"[\w']+", re.UNICODE)
_MAX_SKILLS = 1
_MAX_INSTRUCTIONS = 900


def _read_skill(path: Path) -> dict | None:
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return None
    if not raw.startswith("---\n") or "\n---\n" not in raw[4:]:
        return None
    header, body = raw[4:].split("\n---\n", 1)
    metadata = {}
    for line in header.splitlines():
        key, sep, value = line.partition(":")
        if sep:
            metadata[key.strip().lower()] = value.strip()
    name = metadata.get("name", path.parent.name)
    triggers = [x.strip().lower() for x in metadata.get("triggers", "").split(",") if x.strip()]
    if not triggers:
        return None
    return {
        "name": name,
        "description": metadata.get("description", ""),
        "triggers": triggers,
        "instructions": body.strip()[:_MAX_INSTRUCTIONS],
    }


def _all_skills() -> list[dict]:
    return [skill for path in sorted(SKILLS_DIR.glob("*/SKILL.md"))
            if (skill := _read_skill(path)) is not None]


def list_skills() -> list[dict]:
    """Return safe metadata for the local skill picker/status UI."""
    return [
        {"name": s["name"], "description": s["description"], "triggers": s["triggers"]}
        for s in _all_skills()
    ]


def select(message: str) -> list[dict]:
    """Choose the single strongest matching skill, keeping small-model prompts lean."""
    text = " ".join(_WORD_RE.findall(message.lower()))
    ranked = []
    for skill in _all_skills():
        hits = sum(1 for trigger in skill["triggers"]
                   if re.search(rf"(?<!\w){re.escape(trigger)}(?!\w)", text))
        if hits:
            ranked.append((hits, skill["name"], skill))
    ranked.sort(key=lambda row: (-row[0], row[1]))
    return [row[2] for row in ranked[:_MAX_SKILLS]]


def prompt_block(selected: list[dict]) -> str:
    if not selected:
        return ""
    return "\n\nACTIVE LOCAL SKILL — follow this workflow:\n" + selected[0]["instructions"]

