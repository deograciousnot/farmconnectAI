"""Farmconnect AI explanation service (Gemini). Called by the Node API at POST /explain.

Run: python -m uvicorn main:app --port 8000 --reload   (from this folder, with the venv active)
"""

import os
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from explainer import ExplainError, explain, model_name  # noqa: E402  (needs env loaded first)

app = FastAPI(title="Farmconnect AI explanation service")


class ExplainRequest(BaseModel):
    evidence: dict
    language: Literal["en", "sw"] = "en"


@app.get("/health")
def health():
    return {"ok": True, "provider": "gemini", "model": model_name(), "configured": bool(os.getenv("GEMINI_API_KEY"))}


@app.post("/explain")
async def explain_route(body: ExplainRequest):
    try:
        return await explain(body.evidence, body.language)
    except ExplainError as err:
        # 503 tells the Node API to use its rule-based fallback; the reason is shown to the farmer.
        return JSONResponse(status_code=503, content={"error": str(err)})
