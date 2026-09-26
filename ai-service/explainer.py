"""Turns matching evidence computed by the Node API into a short, farmer-friendly explanation using Gemini.

The model only explains numbers it is given. It never calculates or invents prices, buyers or totals,
and any answer that mentions a figure missing from the evidence is rejected.
"""

import json
import os
import re
import time
from typing import Literal

from google import genai
from google.genai import errors, types
from pydantic import BaseModel, ValidationError

Language = Literal["en", "sw"]


class Explanation(BaseModel):
    headline: str
    points: list[str]
    nextSteps: list[str]


class ExplainError(Exception):
    """Raised when Gemini cannot produce a usable explanation. The Node API then uses its rule-based fallback."""


def model_name() -> str:
    return os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")


def system_prompt(language: Language) -> str:
    return f"""You advise smallholder farmers in Kenya on where to sell a harvest.
You receive EVIDENCE as JSON computed by our system. Rules:
- Use only buyers, markets and numbers that appear in EVIDENCE. Never invent or recalculate prices, distances or totals.
- Compare options by net KES per kg (price minus transport and handling), how much each buyer can take, and distance.
- If one buyer cannot take the whole harvest, explain the suggested split.
- Point out trade-offs, e.g. a higher price far away versus a nearby buyer or one that collects from the farm.
- Be honest about uncertainty: prices are estimates and buyers must be confirmed.
- Never tell the farmer what they must do; offer options.
- Write simply for a farmer with basic literacy. Short sentences.
- Write in {"Kiswahili" if language == "sw" else "English"}.
Respond as JSON: "headline" is one sentence, "points" has 2-4 short sentences, "nextSteps" has 2-3 short actions."""


_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")


def find_invented_numbers(text: str, evidence: object) -> list[float]:
    """Numbers above 31 (days and small counts are allowed) must be within 2% of a number in the evidence."""
    allowed = [abs(float(n)) for n in re.findall(r"-?\d+(?:\.\d+)?", json.dumps(evidence))]
    found = [float(m.replace(",", "")) for m in _NUMBER.findall(text)]
    return [n for n in found if n > 31 and not any(abs(a - n) <= max(1, a * 0.02) for a in allowed)]


_client: genai.Client | None = None


def get_client() -> genai.Client:
    global _client
    if _client is None:
        if not os.getenv("GEMINI_API_KEY"):
            raise ExplainError("GEMINI_API_KEY is not set")
        timeout_ms = int(os.getenv("GEMINI_TIMEOUT_MS", "20000"))
        _client = genai.Client(
            api_key=os.environ["GEMINI_API_KEY"],
            http_options=types.HttpOptions(timeout=timeout_ms, retry_options=types.HttpRetryOptions(attempts=2)),
        )
    return _client


async def explain(evidence: dict, language: Language, client: genai.Client | None = None) -> dict:
    started = time.perf_counter()
    client = client or get_client()
    try:
        response = await client.aio.models.generate_content(
            model=model_name(),
            contents=f"EVIDENCE:\n{json.dumps(evidence)}",
            config=types.GenerateContentConfig(
                system_instruction=system_prompt(language),
                response_mime_type="application/json",
                response_schema=Explanation,
                temperature=0.2,
            ),
        )
    except errors.APIError as err:
        raise ExplainError(f"Gemini returned an error ({err.code})") from err
    except Exception as err:  # network failures and timeouts
        raise ExplainError(f"Gemini is not reachable ({type(err).__name__})") from err

    try:
        explanation = Explanation.model_validate_json(response.text or "")
    except ValidationError as err:
        raise ExplainError("Model response did not match the expected format") from err

    explanation = Explanation(headline=explanation.headline, points=explanation.points[:4], nextSteps=explanation.nextSteps[:3])
    invented = find_invented_numbers(" ".join([explanation.headline, *explanation.points, *explanation.nextSteps]), evidence)
    if invented:
        raise ExplainError(f"Model mentioned figures not in the evidence ({', '.join(f'{n:g}' for n in invented[:3])})")

    return {
        "explanation": explanation.model_dump(),
        "provider": "gemini",
        "model": model_name(),
        "latencyMs": round((time.perf_counter() - started) * 1000),
    }
