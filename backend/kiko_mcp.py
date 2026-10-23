"""MCP tools for Kiko's local voice, documents, and runtime status."""

from __future__ import annotations

import asyncio
import base64
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

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
    "get_kiko_runtime_status",
    "generate_kiko_speech",
)

mcp = MCPServer(
    "Kiko Local Voice AI",
    version="0.3.0",
    instructions=(
        "Kiko is a local-first voice companion. Tools can generate speech with "
        "Kiko's local Kokoro voice engine, search documents uploaded in the "
        "current Kiko session, and inspect model readiness. Document search only "
        "accesses Kiko's in-memory uploads. No tool executes shell commands or "
        "reads arbitrary files."
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
