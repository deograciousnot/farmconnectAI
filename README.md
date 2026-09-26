# Farmconnect AI

AI-powered market intelligence for smallholder farmers in Kenya.

A farmer enters crop, county, harvest size and date. Farmconnect matches them against buyers (resellers, shops, mills, institutions) who have posted what they want and what they pay, estimates transport, ranks buyers by **net KES per kg**, suggests how to split the harvest when no single buyer takes it all, and uses Google Gemini (through a small Python service) to explain the trade-offs in English or Kiswahili. Public wholesale prices from **KAMIS** (Ministry of Agriculture) are shown as a reference.

It is a mobile-first web app (PWA): open it in a phone browser and "Add to Home Screen". Nothing needs installing from an app store.

## Project structure

```text
client/          React + Vite PWA (Sell · Buyers · Prices tabs)
server/          Express + TypeScript API
  src/matching.ts  buyer matching, logistics, split plan (deterministic)
  src/ai.ts        calls the AI service; rule-based fallback
  scripts/         KAMIS price import
ai-service/      Python + FastAPI: Gemini prompt, structured output, number guard
data/            market-prices.json (KAMIS), buyers.seed.json (demo buyers)
docs/            architecture, data sources, team plan
```

## Quick start

```bash
npm install
cp .env.example .env            # PowerShell: Copy-Item .env.example .env
                                # then paste your key from https://aistudio.google.com/apikey into GEMINI_API_KEY

# Python AI service (Python 3.10+)
python -m venv ai-service/.venv
ai-service/.venv/Scripts/pip install -r ai-service/requirements.txt   # macOS/Linux: ai-service/.venv/bin/pip

npm run dev                     # starts client, API and AI service
```

Without a key, or if the AI service is down, the app still works and shows a labelled rule-based summary.

- App: http://localhost:5173 (on a phone on the same Wi‑Fi: `http://<your-laptop-ip>:5173`)
- API: http://localhost:4000 (`/health` shows whether the AI service is reachable and has a key)
- AI service: http://localhost:8000 (`POST /explain`, docs at `/docs`)

Other commands:

```bash
npm test                          # Node tests (matching, validation, fallback) + Python tests (Gemini handling, number guard)
npm run seed:prices               # refresh data/market-prices.json from KAMIS
npm run typecheck && npm run build
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Service and AI status |
| GET | `/api/meta` | Crops, counties, business types, assumptions, price source |
| GET | `/api/prices/:crop` | KAMIS wholesale prices per market |
| GET / POST | `/api/listings` | Buyer demand posts |
| POST | `/api/analyze` | `{ crop, county, harvestKg, harvestDate, language: 'en' \| 'sw' }` → matches, split plan, gain vs nearest market, market references. Instant, no AI. |
| POST | `/api/explain` | Same body → AI advice (or labelled fallback) and the exact evidence sent to the model. The app calls this right after `/api/analyze`. |

## Responsible AI and data

- The model never calculates or invents prices. It receives computed evidence, and its answer is **rejected** if it mentions any price, weight, distance, percentage or large number that isn't in that evidence (see `find_invented_numbers` in `ai-service/explainer.py`).
- Buyer text comes from an open form, so it's treated as untrusted: posts that read like instructions ("ignore other buyers…") are rejected, text is cleaned before it reaches the prompt, and the prompt tells the model to treat names as labels only.
- The "KES X more" figure compares the split against selling everything at the nearest KAMIS market at wholesale price. That's a generous baseline, since farm-gate prices are usually lower.
- Only the computed evidence is sent to Gemini. No farmer details or buyer phone numbers are sent, because Gemini's free tier may use prompts to improve Google's products.
- If Gemini or the AI service is down, slow or returns malformed output, the app shows a clearly labelled rule-based summary of the same numbers.
- Seed buyers are fictional and marked **demo**. KAMIS prices are real but noisy; outliers are flagged, not hidden.
- Buyer phone numbers are only shown if the buyer ticks consent.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) and [docs/TEAM-PLAN.md](docs/TEAM-PLAN.md).
