"""Local doc-RAG — parse .md/.txt/.pdf/.docx, chunk, BM25 retrieve.

Everything in-process: a compiled scanner-free TF-IDF/BM25 index per doc.
No embeddings needed; short docs + 0.6~2B models retrieve fine on keywords.
"""

from __future__ import annotations

import io
import logging
import math
import re
import threading
import time
import unicodedata
from collections import Counter

log = logging.getLogger("docslib")

CHUNK_MAX = 620
CHUNK_OVERLAP_WORDS = 40

_docs_lock = threading.Lock()
_DOCS: dict[str, dict] = {}   # id -> {"name", "text", "chunks", "added", "id"}


# ---------------------------------------------------------------- parsing

def parse_text(name: str, data: bytes) -> tuple[str, str]:
    """Extract plain text from a file; returns (kind, text)."""
    low = name.lower()
    if low.endswith((".md", ".markdown", ".rst", ".txt", ".log", ".csv", ".json")):
        text = data.decode("utf-8", errors="replace")
        if low.endswith((".md", ".markdown")):
            text = _strip_markdown(text)
        return "text", text
    if low.endswith(".pdf"):
        try:
            from pypdf import PdfReader

            reader = PdfReader(io.BytesIO(data))
            pages = []
            for page in reader.pages:
                try:
                    pages.append(page.extract_text() or "")
                except Exception:
                    pages.append("")
            return "pdf", "\n".join(pages)
        except Exception as e:
            raise ValueError(f"PDF parse failed: {e}") from e
    if low.endswith(".docx"):
        return "docx", _parse_docx(data)
    # try utf-8 anyway
    return "text", data.decode("utf-8", errors="replace")


def _strip_markdown(md: str) -> str:
    md = re.sub(r"```[a-zA-Z0-9_+-]*\n(.*?)```", r"\1", md, flags=re.S)
    md = re.sub(r"`([^`]*)`", r"\1", md)
    md = re.sub(r"^#{1,6}\s+", "", md, flags=re.M)
    md = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", md)
    md = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", md)
    md = re.sub(r"^\s*[-*+]\s+", "- ", md, flags=re.M)
    md = re.sub(r"[*_~]{1,3}", "", md)
    return md


def _parse_docx(data: bytes) -> str:
    """DOCX = zip of XML; pull <w:t> runs without extra deps."""
    import zipfile

    with zipfile.ZipFile(io.BytesIO(data)) as z:
        with z.open("word/document.xml") as f:
            xml = f.read().decode("utf-8", errors="replace")
    paras = re.split(r"</w:p>", xml)
    out = []
    for p in paras:
        runs = re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p)
        if runs:
            out.append("".join(runs))
    return "\n".join(out)


# ---------------------------------------------------------------- chunking

def _chunk(text: str) -> list[str]:
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    for p in paras:
        words = p.split()
        while words:
            take = min(len(words), 160)
            chunks.append(" ".join(words[:take]))
            if len(words) <= take:
                break
            words = words[take - CHUNK_OVERLAP_WORDS:]
    # drop tiny chunks
    return [c for c in chunks if len(c) > 40] or ([text[:600]] if text else [])


# ---------------------------------------------------------------- BM25

_TOKEN_RE = re.compile(r"[\w\u0900-\u097F]+", re.UNICODE)


def _tokens(s: str) -> list[str]:
    out = []
    for t in _TOKEN_RE.findall(unicodedata.normalize("NFKC", s.lower())):
        if len(t) > 3 and t.endswith("es"):
            t = t[:-2]
        elif len(t) > 3 and t.endswith("s") and not t.endswith("ss"):
            t = t[:-1]
        out.append(t)
    return out


class _BM25:
    def __init__(self, chunks: list[str]) -> None:
        self.docs = [ _tokens(c) for c in chunks ]
        self.n = len(chunks)
        self.avgdl = (sum(len(d) for d in self.docs) / max(1, self.n)) or 1.0
        self.tf = [Counter(d) for d in self.docs]
        df = Counter()
        for d in self.tf:
            df.update(d.keys())
        self.df = df

    def search(self, q: str, k: int = 4) -> list[tuple[int, float]]:
        qt = _tokens(q)
        k1, b = 1.5, 0.75
        out = []
        for i, tf in enumerate(self.tf):
            dl = len(self.docs[i]) or 1
            score = 0.0
            for t in set(qt):
                f = tf.get(t)
                if not f:
                    continue
                idf = math.log(1 + (self.n - self.df[t] + 0.5) /
                               (self.df[t] + 0.5))
                score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * dl / self.avgdl))
            if score > 0:
                out.append((i, score))
        out.sort(key=lambda x: -x[1])
        return out[:k]


# ---------------------------------------------------------------- api

def add_doc(name: str, data: bytes) -> dict:
    """Parse + index a document; returns its meta entry."""
    kind, text = parse_text(name, data)
    text = text.strip()
    if not text:
        raise ValueError("document contains no readable text")
    chunks = _chunk(text)
    doc_id = f"d{int(time.time() * 1000) % 10**9}"
    with _docs_lock:
        _DOCS[doc_id] = {
            "id": doc_id,
            "name": name,
            "kind": kind,
            "text": text,
            "chunks": chunks,
            "index": _BM25(chunks),
            "added": time.strftime("%Y-%m-%d %H:%M"),
        }
    return doc_meta(_load(doc_id))


def _load(doc_id: str) -> dict:
    with _docs_lock:
        return _DOCS[doc_id]


def doc_meta(d: dict) -> dict:
    return {
        "id": d["id"], "name": d["name"], "kind": d["kind"],
        "words": len(d["text"].split()), "chunks": len(d["chunks"]),
        "added": d["added"],
    }


def list_docs() -> list[dict]:
    with _docs_lock:
        return [doc_meta(d) for d in _DOCS.values()]


def remove(doc_id: str) -> bool:
    with _docs_lock:
        return _DOCS.pop(doc_id, None) is not None


def clear() -> None:
    with _docs_lock:
        _DOCS.clear()


def get_fallback_chunks(doc_id: str | None = None, k: int = 4) -> list[str]:
    """Return initial document chunks when keyword matching yields zero hits."""
    with _docs_lock:
        pool = {i: d for i, d in _DOCS.items() if doc_id is None or i == doc_id}
    if not pool:
        return []
    out = []
    for d in pool.values():
        for c in d["chunks"][:k]:
            out.append(f"[{d['name']}] {c}" if len(pool) > 1 else c)
            if len(out) >= k:
                return out
    return out


def retrieve(question: str, k: int = 4, doc_id: str | None = None,
             history: list[dict] | None = None) -> list[str]:
    """Top-k chunks across all docs (or one), for LLM grounding.
    Enriches query with recent conversational context if available."""
    with _docs_lock:
        pool = {i: d for i, d in _DOCS.items() if doc_id is None or i == doc_id}
    if not pool:
        return []

    search_query = question
    if history:
        recent_text = " ".join(
            str(h.get("text", "")).strip() for h in history[-2:]
        )
        if recent_text:
            search_query = f"{question} {recent_text[:250]}"

    if doc_id is not None:
        d = pool[doc_id]
        hits = d["index"].search(search_query, k)
        if hits:
            return [d["chunks"][i] for i, _s in hits][:k]
        # weak/zero scores: front-load the doc head so the LLM still has context
        return d["chunks"][:k]
    per = max(1, k // max(1, len(pool)))
    out: list[str] = []
    for d in pool.values():
        for i, _s in d["index"].search(search_query, per):
            out.append(f"[{d['name']}] {d['chunks'][i]}")
    return out[:k]


def summarize_source(doc_id: str) -> str:
    """Condensed text for an LLM summary of one doc (head of the doc)."""
    with _docs_lock:
        d = _DOCS.get(doc_id)
    if not d:
        raise ValueError("no such document")
    text = d["text"]
    cut = text[:3500]
    if len(text) > 3500:
        # middle sampling: head, a middle slice, tail
        mid = len(text) // 2
        cut = cut + "\n…\n" + text[mid:mid + 1200] + "\n…\n" + text[-1000:]
    return cut


def has_docs() -> bool:
    with _docs_lock:
        return bool(_DOCS)


def stats() -> dict:
    with _docs_lock:
        return {"docs": len(_DOCS),
                "words": sum(len(d["text"].split()) for d in _DOCS.values())}
