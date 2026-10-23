"""NLP tasks — summarize / rewrite via the offline LLM."""

from __future__ import annotations

from llm import complete


def summarize(text: str) -> dict:
    messages = [
        {"role": "system", "content":
         "You summarize text. Reply with ONLY the summary, 2-3 short sentences."},
        {"role": "user", "content": "Summarize:\n\n" + text[:6000]},
    ]
    out = complete(messages, max_tokens=220, temperature=0.4,
                   repeat_penalty=1.08)
    return {"text": out.strip()}


def rewrite(text: str, style: str) -> dict:
    messages = [
        {"role": "system", "content":
         "You rewrite text. Reply with ONLY the rewrite, same language."},
        {"role": "user", "content":
         f"Rewrite in a '{style}' style:\n\n{text[:2000]}"},
    ]
    out = complete(messages, max_tokens=360, temperature=0.7,
                   repeat_penalty=1.08)
    return {"text": out.strip()}
