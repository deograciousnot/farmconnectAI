# Architecture

```text
Phone browser (PWA)
   │  /api (same origin, Vite proxy in dev)
   ▼
Express API ──► data.ts      KAMIS prices + buyer listings (seed JSON + posted listings in data/runtime/)
            ├─► matching.ts  eligibility, distance, transport, net KES/kg, greedy split plan
            └─► ai.ts        evidence ──HTTP──► Python AI service (ai-service/, FastAPI)
                   ▲                                   └─► Gemini (structured JSON output)
                   │                                   └─► number guard
                   └──── fail / timeout / 503 ──► rule-based fallback (English or Kiswahili)
```

## Matching (deterministic)

1. **Eligible buyers:** same crop, and the buyer's date window covers the harvest date (starting up to 3 days after it still counts).
2. **Distance:** straight line between county towns × 1.3 road factor, at least 10 km.
3. **Net KES/kg** = buyer price − transport (0.03 KES per kg per km, or 0 if the buyer collects) − handling (1 KES/kg).
4. **Ranking:** net KES/kg, highest first. Ties go to the nearer buyer.
5. **Split plan:** fill the best buyers first, up to each buyer's quantity, until the harvest is allocated.
6. **Price context:** each offer is compared to the KAMIS median wholesale price in the buyer's county, or the national median if that county has no data.

All assumptions are returned by the API and shown in the app under "How we calculated this".

## AI layer (Python + Gemini)

- **Service:** `ai-service/` (FastAPI). `POST /explain` takes `{ evidence, language }` and returns `{ explanation, provider, model, latencyMs }`, or HTTP 503 `{ error }`.
- **Model:** Google Gemini through the `google-genai` SDK, default `gemini-3.1-flash-lite` (fast and cheap). Configure with `GEMINI_API_KEY`, `GEMINI_MODEL` and `GEMINI_TIMEOUT_MS`.
- **Input:** a compact, rounded evidence JSON built by `buildEvidence` in `server/src/ai.ts`. It's returned to the client as `ai.evidenceSent` so judges can see exactly what the model saw. It contains no personal data.
- **Output:** Gemini structured output with a Pydantic schema `{ headline, points[], nextSteps[] }`, validated again after the response.
- **Guardrails:** the system prompt forbids inventing buyers or numbers and forbids telling the farmer what they must do. After generation, every number above 31 must match the evidence within 2%, or the response is rejected.
- **Fallback:** the Node API uses a template summary in English or Kiswahili when the AI service is unreachable, times out or returns 503 (no key, Gemini error, bad format, failed number check). The UI labels it "offline summary" and shows the reason.

## Why a PWA, not a native app

It works on any Android or iPhone browser, can be added to the home screen, has one codebase and one link for judges, and needs no app-store build. The client is about 51 KB gzipped. SMS/USSD would be the next step for feature phones.
