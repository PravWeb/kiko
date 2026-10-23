"""Docs routes — offline document RAG (upload, list, ask, summarize)."""

import json
import logging

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import agent
import docslib

log = logging.getLogger("routes_docs")
router = APIRouter()

MAX_BYTES = 20 * 1024 * 1024


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    doc_id: str | None = None
    history: list[dict] = Field(default_factory=list)
    brain: str = "smart"
    websearch_enabled: bool = False


class SummarizeRequest(BaseModel):
    doc_id: str
    brain: str = "smart"


@router.post("/api/docs/upload")
async def upload(file: UploadFile = File(...)):
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "file too large (20MB max)")
    try:
        meta = docslib.add_doc(file.filename or "untitled", data)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return meta


@router.get("/api/docs")
def docs_list():
    return {"docs": docslib.list_docs(), "stats": docslib.stats()}


@router.delete("/api/docs/{doc_id}")
def docs_delete(doc_id: str):
    if not docslib.remove(doc_id):
        raise HTTPException(404, "no such doc")
    return {"ok": True}


def _context_block(chunks: list[str]) -> str:
    joined = "\n\n".join(chunks)
    return (
        "\n\nYou have FILE CONTENT below. Answer using ONLY it; if the answer "
        "is not in it, say you don't have that detail. Quote short bits. One "
        "or two lines — this will be spoken aloud.\n\nFILE CONTENT:\n" + joined
    )


@router.post("/api/docs/ask")
def ask(req: AskRequest):
    if not docslib.has_docs():
        raise HTTPException(409, "no documents uploaded yet")
    chunks = docslib.retrieve(req.question, k=4, doc_id=req.doc_id, history=req.history)
    if not chunks:
        chunks = docslib.get_fallback_chunks(req.doc_id, k=4)
    out = agent.chat_with_context(req.question, chunks, history=req.history,
                                 brain=req.brain, websearch_enabled=req.websearch_enabled)
    return {**out, "sources": len(chunks)}


@router.post("/api/docs/ask/stream")
def ask_stream(req: AskRequest):
    """Token-streamed grounded answer (SSE)."""
    if not docslib.has_docs():
        raise HTTPException(409, "no documents uploaded yet")
    chunks = docslib.retrieve(req.question, k=4, doc_id=req.doc_id, history=req.history)
    if not chunks:
        chunks = docslib.get_fallback_chunks(req.doc_id, k=4)

    def sse():
        try:
            for ev in agent.chat_with_context_stream(
                req.question, chunks, history=req.history,
                brain=req.brain, websearch_enabled=req.websearch_enabled
            ):
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        except Exception as e:
            log.exception("docs stream failed")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(sse(), media_type="text/event-stream")


@router.post("/api/docs/summarize")
def summarize(req: SummarizeRequest):
    if not docslib.has_docs():
        raise HTTPException(409, "no documents uploaded yet")
    text = docslib.summarize_source(req.doc_id)
    out = agent.chat_with_context(
        "Summarize this document clearly: main takeaways, purpose, and key points.",
        [text], history=[], brain=req.brain)
    return {**out, "sources": 1}


@router.post("/api/docs/summarize/stream")
def summarize_stream(req: SummarizeRequest):
    """Token-streamed document summary (SSE)."""
    if not docslib.has_docs():
        raise HTTPException(409, "no documents uploaded yet")
    text = docslib.summarize_source(req.doc_id)

    def sse():
        try:
            prompt = "Summarize this document thoroughly with clear bullet points, purpose, and key takeaways."
            for ev in agent.chat_with_context_stream(
                prompt, [text], history=[], brain=req.brain
            ):
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        except Exception as e:
            log.exception("docs summarize stream failed")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(sse(), media_type="text/event-stream")
