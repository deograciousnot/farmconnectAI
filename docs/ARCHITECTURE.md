# Architecture

```text
Phone browser (PWA, voice-first)
   │  /api (same origin; Vite proxy in dev, https tunnel for phones and judges)
   ▼
Express API (Node/TypeScript)
   ├─ understand.ts ──► AI service /extract/*  ──► Gemini (audio or text in, structured JSON out)
   │                     unit conversion to kg by a fixed table; person confirms
   ├─ matching.ts       eligible buyers (crop, date, open demand), distance, transport, net KES/kg, price-only split
   ├─ demand.ts         open demand per buyer per ISO week = demand − bought elsewhere − accepted requests
   └─ ai.ts ─────────► AI service /explain ──► Gemini (split + reasons + advice as structured JSON)
                         number check (Python) → split rule check + money calculation (Node)
                         any failure → price-only split + rule-based summary (English or Kiswahili)
```

## The farmer's flow

1. **Describe:** voice note or text. `POST /api/understand/harvest` → Gemini returns crop, place, county, quantity with its unit, date, and anything unclear. Node converts units (90 kg bags for grains and pulses, 50 kg for potatoes, 64 kg tomato crates; unknown sizes are left for the farmer). If the farmer typed digits, the AI's quantity must be one of them.
2. **Confirm:** "Here's what I understood". The farmer edits anything, and missing fields are highlighted. If the AI is unavailable, the same form is filled in by hand.
3. **Results, instantly:** `POST /api/analyze` returns buyers and the price-only split without calling the model.
4. **AI split and advice:** `POST /api/explain` recomputes the analysis on the server (it never trusts evidence from the client) and asks Gemini. The advice types out word by word after it has been checked. We don't stream raw tokens, because the number check needs the whole answer.
5. **Confirm with buyers:** `POST /api/requests` for each buyer in the split. The farmer's screen polls for answers every 5 seconds.

## Languages

- **App language:** the EN/SW switch translates every screen (`client/src/i18n.tsx`; each string is written in both languages side by side). It's remembered on the phone.
- **Reply language:** when Gemini reads what the person said, it also reports the language used: `en`, `sw` or `mixed`. The advice and buyer reasons are written in that language; for `mixed` the model is told to code-switch the way Kenyans do. If the farmer used the manual form, the app language is used. The rule-based fallback uses Kiswahili for mixed speakers, since templates can't mix naturally.
- **Understanding notes** ("28 bags × 90 kg") follow the app language.

## Matching (deterministic)

1. **Eligible buyers:** crop fits (a mixed-beans buyer takes any bean variety), the buyer's date window covers the harvest date (starting up to 3 days after still counts), and at least 10 kg of demand is still open that week.
2. **Distance:** straight line between county towns × 1.3 road factor, at least 10 km.
3. **Net KES/kg** = buyer price − transport (0.03 KES per kg per km, or 0 if the buyer collects) − handling (1 KES/kg).
4. **Price-only split:** fill the highest net KES/kg buyers first. This is shown as the baseline for the AI's split.
5. **Price context:** each offer is compared with the KAMIS median wholesale price in the buyer's county, or the national median.
6. **Gain shown to the farmer:** the chosen split compared with selling everything at the nearest KAMIS market (typical price among the nearest markets, minus transport). Unplaced kg are counted at that market on both sides.

## Live demand

Buyer demand changes. `demand.ts` tracks, per listing and ISO week (or once for one-off orders):
`open = demand − kg the buyer reports buying elsewhere − kg from farmer requests the buyer accepted`.
Pending requests don't reduce demand until accepted. Farmers can't request more than is open. Only the device that created a post holds its private manage code (never sent to other users), and only that code can accept, decline or update demand.

## AI layer (Python + Gemini)

- **Service:** `ai-service/` (FastAPI, `google-genai`). Endpoints `/extract/harvest`, `/extract/listing`, `/explain`. On any problem it returns HTTP 503 with a reason, and Node falls back.
- **Model:** `gemini-3.1-flash-lite` by default (fast, cheap, accepts audio). Configure with `GEMINI_MODEL`.
- **Structured output:** Pydantic schemas for every call, validated again after the response.
- **Evidence:** built by `buildEvidence` in `server/src/ai.ts`. Buyers are referred to as B1…B6 with price, distance, transport, net KES/kg, `canTakeKg`, `alreadyCoveredKg`, frequency, pickup and a short description. It includes the price-only split as a baseline, and whether the crop is perishable. The evidence is shown in the app under "How we calculated this".
- **Checks:**
  - *Numbers:* every figure the model writes (KES, kg, km, %, decimals, anything above 31) must match the evidence or the model's own split within 2%. Bare counts and days up to 31 are exempt.
  - *Split:* known buyer refs only, no duplicates, whole kg ≥ 10, each within the buyer's open demand, total within the harvest. Money is calculated by code.
  - *Refs:* B1-style refs in the text are replaced with buyer names.
  - *Untrusted text:* buyer names, towns and descriptions are cleaned (`promptSafe`) and instruction-like posts are rejected at creation.
- **Fallback:** manual form for understanding; price-only split plus rule-based summary and reasons for advice. The UI labels the source ("✦ AI-suggested split" vs "Price-only split", "offline summary").

## Why a PWA

It works on any Android or iPhone browser, can be added to the home screen, is one codebase with one link for judges, and needs no app-store build (about 57 KB gzipped). SMS/USSD would be the next step for feature phones.
