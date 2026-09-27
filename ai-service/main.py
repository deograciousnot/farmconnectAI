"""Farmconnect AI explanation service (Gemini). Called by the Node API at POST /explain.

Run: python -m uvicorn main:app --port 8000 --reload   (from this folder, with the venv active)
"""

import base64
import os
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from explainer import ExplainError, explain, model_name  # noqa: E402  (needs env loaded first)
from extractor import extract_harvest, extract_listing  # noqa: E402

app = FastAPI(title="Farmconnect AI explanation service")


class ExplainRequest(BaseModel):
    evidence: dict
    language: Literal["en", "sw"] = "en"


@app.get("/health")
def health():
    return {"ok": True, "provider": "gemini", "model": model_name(), "configured": bool(os.getenv("GEMINI_API_KEY"))}


class Options(BaseModel):
    crops: list[str]
    cropLabels: dict[str, str] = {}
    counties: list[str]
    businessTypes: list[str] = []


class HarvestRequest(BaseModel):
    options: Options
    text: str | None = Field(default=None, max_length=1500)
    audioBase64: str | None = Field(default=None, max_length=4_000_000)  # about 3 MB of audio, far more than 30 s
    mimeType: str = "audio/webm"


class ListingRequest(BaseModel):
    options: Options
    text: str | None = Field(default=None, max_length=1500)
    audioBase64: str | None = Field(default=None, max_length=4_000_000)
    mimeType: str = "audio/webm"


def _unavailable(err: ExplainError):
    return JSONResponse(status_code=503, content={"error": str(err)})


@app.post("/extract/harvest")
async def extract_harvest_route(body: HarvestRequest):
    try:
        audio = base64.b64decode(body.audioBase64) if body.audioBase64 else None
        return await extract_harvest(body.options.model_dump(), text=body.text, audio=audio, mime_type=body.mimeType)
    except ExplainError as err:
        return _unavailable(err)


@app.post("/extract/listing")
async def extract_listing_route(body: ListingRequest):
    try:
        audio = base64.b64decode(body.audioBase64) if body.audioBase64 else None
        return await extract_listing(body.options.model_dump(), text=body.text, audio=audio, mime_type=body.mimeType)
    except ExplainError as err:
        return _unavailable(err)


@app.post("/explain")
async def explain_route(body: ExplainRequest):
    try:
        return await explain(body.evidence, body.language)
    except ExplainError as err:
        # 503 tells the Node API to use its rule-based fallback; the reason is shown to the farmer.
        return JSONResponse(status_code=503, content={"error": str(err)})
