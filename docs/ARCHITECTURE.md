# Architecture

```text
Phone browser (PWA)
   │  /api (same origin, Vite proxy in dev)
   ▼
Express API ──► data.ts      KAMIS prices + buyer listings (seed JSON + posted listings in data/runtime/)
            ├─► matching.ts  eligibility, distance, transport, net KES/kg, greedy split plan
            └─► ai.ts        evidence → Ollama (/api/chat, JSON schema output)
                                 └─► number guard ──fail──► rule-based fallback
```

## Matching (deterministic)

1. **Eligible buyers:** same crop, and the buyer's date window covers the harvest date (starting up to 3 days after it still counts).
2. **Distance:** straight line between county towns × 1.3 road factor, at least 10 km.
3. **Net KES/kg** = buyer price − transport (0.03 KES per kg per km, or 0 if the buyer collects) − handling (1 KES/kg).
4. **Ranking:** net KES/kg, highest first. Ties go to the nearer buyer.
5. **Split plan:** fill the best buyers first, up to each buyer's quantity, until the harvest is allocated.
6. **Price context:** each offer is compared to the KAMIS median wholesale price in the buyer's county, or the national median if that county has no data.

All assumptions are returned by the API and shown in the app under "How we calculated this".

## AI layer

- **Model:** Ollama, default `llama3.2:3b` (small enough for a laptop CPU). Configure with `OLLAMA_URL` and `OLLAMA_MODEL`.
- **Input:** a compact, rounded evidence JSON (`buildEvidence`), returned to the client as `ai.evidenceSent` so judges can see exactly what the model saw.
- **Output:** constrained with Ollama's JSON-schema `format` to `{ headline, points[], nextSteps[] }`.
- **Guardrails:** the system prompt forbids inventing buyers or numbers and forbids telling the farmer what they must do. After generation, every number above 31 must match the evidence within 2%, or the response is discarded.
- **Fallback:** a template summary in English or Kiswahili, used on timeout, connection error, bad format or a failed number check. The UI labels it "offline summary" and shows the reason.

## Why a PWA, not a native app

It works on any Android or iPhone browser, can be added to the home screen, has one codebase and one link for judges, and needs no app-store build. The client is about 51 KB gzipped. SMS/USSD would be the next step for feature phones.
