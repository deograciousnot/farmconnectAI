# Farmconnect AI

AI-powered market intelligence for smallholder farmers in Kenya.

A farmer enters crop, county, harvest size and date. Farmconnect matches them against buyers (resellers, shops, mills, institutions) who have posted what they want and what they pay, estimates transport, ranks buyers by **net KES per kg**, suggests how to split the harvest when no single buyer takes it all, and uses a local LLM (Ollama) to explain the trade-offs in English or Kiswahili. Public wholesale prices from **KAMIS** (Ministry of Agriculture) are shown as a reference.

It is a mobile-first web app (PWA): open it in a phone browser and "Add to Home Screen". Nothing needs installing from an app store.

## Project structure

```text
client/          React + Vite PWA (Sell · Buyers · Prices tabs)
server/          Express + TypeScript API
  src/matching.ts  buyer matching, logistics, split plan (deterministic)
  src/ai.ts        Ollama explanation + number guard + rule-based fallback
  scripts/         KAMIS price import
data/            market-prices.json (KAMIS), buyers.seed.json (demo buyers)
docs/            architecture, data sources, team plan
```

## Quick start

```bash
npm install
cp .env.example .env            # PowerShell: Copy-Item .env.example .env
ollama pull llama3.2:3b         # optional: without Ollama the app uses the rule-based summary
npm run dev
```

- App: http://localhost:5173 (on a phone on the same Wi‑Fi: `http://<your-laptop-ip>:5173`)
- API: http://localhost:4000 (`/health` shows whether Ollama is reachable)

Other commands:

```bash
npm test                          # server tests (matching, validation, AI fallback, number guard)
npm run seed:prices               # refresh data/market-prices.json from KAMIS
npm run typecheck && npm run build
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Service and Ollama status |
| GET | `/api/meta` | Crops, counties, business types, assumptions, price source |
| GET | `/api/prices/:crop` | KAMIS wholesale prices per market |
| GET / POST | `/api/listings` | Buyer demand posts |
| POST | `/api/analyze` | `{ crop, county, harvestKg, harvestDate, language: 'en' \| 'sw' }` → matches, split plan, market references, AI explanation and the exact evidence sent to the model |

## Responsible AI and data

- The model never calculates or invents prices. It receives computed evidence, and its answer is **rejected** if it mentions figures that are not in that evidence (see `findInventedNumbers` in `server/src/ai.ts`).
- If Ollama is down, slow or returns malformed output, the app shows a clearly labelled rule-based summary of the same numbers.
- Seed buyers are fictional and marked **demo**. KAMIS prices are real but noisy; outliers are flagged, not hidden.
- Buyer phone numbers are only shown if the buyer ticks consent.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) and [docs/TEAM-PLAN.md](docs/TEAM-PLAN.md).
