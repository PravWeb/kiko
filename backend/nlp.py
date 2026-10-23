"""NLP tasks — translate / summarize / rewrite via the offline LLM."""

from __future__ import annotations

from llm import complete


_PAIRS = [
    ("Good morning judges, nice to meet you all.",
     "जजों को सुप्रभात, आप सबसे मिलकर अच्छा लगा।"),
    ("My name is Kiko and I live inside your laptop.",
     "मेरा नाम किको है और मैं आपके लैपटॉप के अंदर रहती हूँ।"),
    ("Today is a great day to learn something new.",
     "आज कुछ नया सीखने के लिए बहुत अच्छा दिन है।"),
]


def _fewshot(direction: str) -> str:
    a, b = ("English", "Hindi") if direction == "en-hi" else ("Hindi", "English")
    src_dst = _PAIRS if direction == "en-hi" else [(hi, en) for en, hi in _PAIRS]
    return "".join(f"{a}: {s}\n{b}: {t}\n" for s, t in src_dst)


def translate(text: str, direction: str) -> dict:
    if direction == "en-hi":
        src, dst = "English", "Hindi"
    else:
        src, dst = "Hindi", "English"
    messages = [
        {"role": "system", "content":
         f"You are a precise {src}-to-{dst} translator. Given one "
         f"{src} line, respond with exactly its {dst} translation "
         "and nothing else."},
        {"role": "user", "content": _fewshot(direction) + f"{src}: {text[:400]}\n{dst}:"},
    ]
    out = complete(messages, max_tokens=160, temperature=0.1,
                   repeat_penalty=1.05, stop=["\nEnglish:", "\nHindi:", "\n\n"])
    clean = out.strip()
    # drop model echoes like  leading  "Hindi:" /  ' 英語'  prefixes
    clean = clean.splitlines()[0] if clean else ""
    clean = clean.strip().strip('"').strip("'")
    for pre in (f"{dst}:", f"{src}:", "Translation:", "अनुवाद:"):
        if clean.startswith(pre):
            clean = clean[len(pre):].strip()
    return {"text": clean or text}


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
