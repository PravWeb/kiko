"""Task routes: summarize / rewrite / tutor score."""

import logging

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

import docslib
import nlp
import tutor
from modelmgr import manager

log = logging.getLogger("routes_tasks")
router = APIRouter()


@router.post("/api/parse-file")
async def parse_uploaded_file(file: UploadFile = File(...)):
    """Parse text from .txt, .md, .pdf, .docx files for Read Aloud or Voice Studio."""
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(413, "file too large (20MB max)")
    try:
        _, text = docslib.parse_text(file.filename or "file.txt", data)
        text = text.strip()
        words = len(text.split())
        return {"name": file.filename or "file.txt", "text": text, "words": words}
    except Exception as e:
        raise HTTPException(422, f"Failed to parse file: {e}")


class SummarizeRequest(BaseModel):
    text: str = Field(min_length=10, max_length=12000)


class RewriteRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    style: str = Field(default="friendly", max_length=40)


class TutorRequest(BaseModel):
    target: str = Field(min_length=1, max_length=600)
    said: str = Field(default="", max_length=1500)


@router.post("/api/summarize")
def summarize(req: SummarizeRequest):
    if not __import__("llm").is_available():
        raise HTTPException(503, "LLM weights missing")
    try:
        return nlp.summarize(req.text)
    except Exception as e:
        log.exception("summarize failed")
        raise HTTPException(500, f"LLM error: {e}")


@router.post("/api/rewrite")
def rewrite(req: RewriteRequest):
    if not __import__("llm").is_available():
        raise HTTPException(503, "LLM weights missing")
    try:
        return nlp.rewrite(req.text, req.style)
    except Exception as e:
        raise HTTPException(500, f"LLM error: {e}")


@router.post("/api/tutor/score")
def tutor_score(req: TutorRequest):
    result = tutor.score(req.target, req.said)
    result["message"] = tutor.encouragement(result["score"])
    return result
