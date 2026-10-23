"""Task routes: translate / summarize / rewrite / tutor score."""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import nlp
import tutor
from modelmgr import manager

log = logging.getLogger("routes_tasks")
router = APIRouter()


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1500)
    direction: str = "en-hi"


class SummarizeRequest(BaseModel):
    text: str = Field(min_length=10, max_length=12000)


class RewriteRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    style: str = Field(default="friendly", max_length=40)


class TutorRequest(BaseModel):
    target: str = Field(min_length=1, max_length=600)
    said: str = Field(default="", max_length=1500)


@router.post("/api/translate")
def translate(req: TranslateRequest):
    if req.direction not in ("en-hi", "hi-en"):
        raise HTTPException(422, "direction must be en-hi or hi-en")
    if not __import__("llm").is_available():
        raise HTTPException(503, "LLM weights missing")
    try:
        return nlp.translate(req.text, req.direction)
    except Exception as e:
        log.exception("translate failed")
        raise HTTPException(500, f"LLM error: {e}")


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
