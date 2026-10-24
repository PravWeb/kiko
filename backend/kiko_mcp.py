"""MCP tools for Kiko's local voice, documents, and runtime status."""

from __future__ import annotations

import asyncio
import base64
import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

import docslib
import skills
from mcp.server.mcpserver import MCPServer
from mcp.types import AudioContent, TextContent
from modelmgr import manager
import tts

ROOT = Path(__file__).resolve().parent.parent
DOCS = (ROOT / "README.md", ROOT / "HACKATHON_DEMO.md")
_tts_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="kiko-mcp-tts")
SERVER_TOOL_NAMES = (
    "get_kiko_project_overview",
    "list_kiko_skills",
    "search_kiko_project",
    "list_uploaded_documents",
    "search_uploaded_documents",
    "search_wikipedia",
    "get_wikipedia_article",
    "get_kiko_runtime_status",
    "generate_kiko_speech",
)

mcp = MCPServer(
    "Kiko Local Voice AI",
    version="0.4.0",
    instructions=(
        "Kiko is a local-first voice companion. Tools can generate speech with "
        "Kiko's local Kokoro voice engine, search documents uploaded in the "
        "current Kiko session, look up public Wikipedia articles when internet "
        "is available, and inspect model readiness. Document search only "
        "accesses Kiko's in-memory uploads. Wikipedia results are public "
        "reference material; include their source URL and prefer primary "
        "sources for high-stakes or rapidly changing facts. No tool executes "
        "shell commands or reads arbitrary files."
    ),
)


def _overview() -> str:
    sections = []
    for path in DOCS:
        try:
            sections.append(f"## {path.name}\n{path.read_text(encoding='utf-8')[:9000]}")
        except OSError:
            continue
    return "\n\n".join(sections) or "Kiko project documentation is unavailable."


@mcp.tool()
async def get_kiko_project_overview() -> str:
    """Get Kiko's architecture, local models, features, and demo plan."""
    return _overview()


@mcp.tool()
async def list_kiko_skills() -> list[dict[str, object]]:
    """List installed Kiko skill names and short descriptions."""
    return skills.list_skills()


@mcp.tool()
async def search_kiko_project(query: str) -> list[dict[str, str]]:
    """Search the public project README and demo guide for relevant excerpts."""
    terms = {term.lower() for term in re.findall(r"[\w-]+", query) if len(term) > 1}
    if not terms:
        return []
    hits: list[tuple[int, dict[str, str]]] = []
    for path in DOCS:
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        for index, line in enumerate(lines):
            score = sum(line.lower().count(term) for term in terms)
            if score:
                excerpt = " ".join(lines[max(0, index - 1):min(len(lines), index + 2)])
                hits.append((score, {"file": path.name, "excerpt": excerpt[:500]}))
    hits.sort(key=lambda item: item[0], reverse=True)
    return [hit for _, hit in hits[:6]]


@mcp.tool()
async def list_uploaded_documents() -> list[dict]:
    """List document names and indexing stats uploaded in this Kiko session."""
    return docslib.list_docs()


@mcp.tool()
async def search_uploaded_documents(query: str) -> list[dict[str, str]]:
    """Find relevant text in the user's currently uploaded documents.

    Returns short excerpts with source names; documents remain local and are
    held only in the current Kiko process.
    """
    query = query.strip()[:500]
    if not query:
        return []
    chunks = docslib.retrieve(query, k=4)
    if not chunks:
        chunks = docslib.get_fallback_chunks(k=2)
    doc_names = [item["name"] for item in docslib.list_docs()]
    results = []
    for chunk in chunks[:4]:
        source = doc_names[0] if len(doc_names) == 1 else "uploaded document"
        excerpt = chunk
        match = re.match(r"^\[([^\]]+)\]\s*(.*)$", chunk, flags=re.S)
        if match:
            source, excerpt = match.group(1), match.group(2)
        results.append({"source": source, "excerpt": excerpt[:900]})
    return results


def _wikipedia_json(language: str, path: str, params: dict[str, str] | None = None) -> dict:
    if language not in {"en", "hi"}:
        raise ValueError("Wikipedia lookup supports English (en) and Hindi (hi).")
    query = f"?{urlencode(params)}" if params else ""
    url = f"https://{language}.wikipedia.org{path}{query}"
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "KikoLocalVoiceCompanion/0.4 (https://github.com/PravWeb/kiko; Wikipedia lookup)",
        },
    )
    with urlopen(request, timeout=6) as response:
        payload = response.read(1_000_000)
    data = json.loads(payload.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Wikipedia returned an unexpected response.")
    return data


@mcp.tool()
async def search_wikipedia(query: str, language: str = "en") -> list[dict[str, str]]:
    """Search public English or Hindi Wikipedia articles for factual background.

    Requires internet. Returns up to five article titles, short excerpts, and
    source URLs. Search text is sent to Wikipedia.
    """
    query = query.strip()[:200]
    if not query:
        return []
    try:
        data = await asyncio.to_thread(
            _wikipedia_json, language, "/w/rest.php/v1/search/page",
            {"q": query, "limit": "5"},
        )
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
        return [{"error": f"Wikipedia search unavailable: {str(exc)[:180]}"}]
    pages = data.get("pages", [])
    if not isinstance(pages, list):
        return []
    results: list[dict[str, str]] = []
    for page in pages[:5]:
        if not isinstance(page, dict):
            continue
        title = str(page.get("title", "")).strip()
        key = str(page.get("key", "")).strip()
        if not title or not key:
            continue
        results.append({
            "title": title[:200],
            "description": str(page.get("description", ""))[:300],
            "excerpt": re.sub(r"<[^>]*>", "", str(page.get("excerpt", "")))[:600],
            "url": f"https://{language}.wikipedia.org/wiki/{quote(key, safe='()_')}",
        })
    return results


@mcp.tool()
async def get_wikipedia_article(title: str, language: str = "en") -> dict[str, str]:
    """Fetch a short public Wikipedia article summary with its source URL.

    Use after search_wikipedia when more context is needed. Requires internet;
    the article title and language are sent to Wikipedia.
    """
    title = " ".join(title.strip().split())[:180]
    if not title:
        return {"error": "Provide an article title."}
    try:
        data = await asyncio.to_thread(
            _wikipedia_json, language,
            f"/api/rest_v1/page/summary/{quote(title.replace(' ', '_'), safe='()_')}",
        )
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
        return {"error": f"Wikipedia article unavailable: {str(exc)[:180]}"}
    extract = str(data.get("extract", "")).strip()
    if not extract:
        return {"error": "Wikipedia did not return a summary for that article."}
    urls = data.get("content_urls", {})
    desktop = urls.get("desktop", {}) if isinstance(urls, dict) else {}
    return {
        "title": str(data.get("title", title))[:200],
        "summary": extract[:7000],
        "url": str(desktop.get("page", ""))[:500],
        "source": "Wikipedia",
    }


@mcp.tool()
async def get_kiko_runtime_status() -> dict:
    """Show local model readiness, memory use, and uploaded-document count."""
    status = manager.status()
    return {
        "engines": status["engines"],
        "process_rss_mb": status["rss_mb"],
        "uploaded_documents": len(docslib.list_docs()),
        "voice_output": "local Kokoro TTS",
    }


@mcp.tool()
async def generate_kiko_speech(text: str, voice: str = "af_heart", speed: float = 1.0):
    """Generate short audio with Kiko's local Kokoro voice model.

    Returns WAV audio and duration metadata. Limit text to 700 characters to
    keep MCP responses small. Voice is a Kokoro voice id such as af_heart;
    speed is clamped to 0.5–2.0.
    """
    text = text.strip()
    if not text:
        return [TextContent(type="text", text="Provide some text to speak.")]
    if len(text) > 700:
        return [TextContent(type="text", text="Text is limited to 700 characters per voice request.")]

    def synthesize() -> tuple[bytes, float]:
        manager.get("tts")
        with manager.protect("tts"):
            return tts.generate(text, voice=voice, speed=speed, fmt="wav")

    try:
        loop = asyncio.get_running_loop()
        audio, duration = await loop.run_in_executor(_tts_executor, synthesize)
    except Exception as exc:
        return [TextContent(type="text", text=f"Speech generation failed: {exc}")]
    return [
        TextContent(type="text", text=f"Generated {duration:.2f}s of speech with local voice {voice}."),
        AudioContent(type="audio", data=base64.b64encode(audio).decode("ascii"), mimeType="audio/wav"),
    ]


@mcp.resource("kiko://project/overview", name="Kiko project overview")
async def project_overview() -> str:
    """Read the project overview and judge demo guide."""
    return _overview()
