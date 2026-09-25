# Farmconnect AI

AI-powered market intelligence for smallholder farmers.

Farmconnect AI helps farmers compare potential markets by combining curated market data, logistics estimates, deterministic economic calculations, and an AI-generated explanation. It is a decision-support prototype, not a source of guaranteed live prices.

## Project structure

```text
client/       React + Vite frontend
server/       Express + TypeScript API
data/         Curated prototype datasets
docs/         Architecture and data notes
```

## Quick start

```bash
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`. The API runs at `http://localhost:4000`.

## Git workflow

```bash
git init
git add .
git commit -m "chore: scaffold Farmconnect AI prototype"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/farmconnect-ai.git
git push -u origin main
```

For shared work, create a branch for each feature, push it, and open a pull request:

```bash
git checkout -b feat/market-recommendations
git add .
git commit -m "feat: add market recommendation flow"
git push -u origin feat/market-recommendations
```

## Responsibility and data notes

Prototype values are estimates and may not reflect live prices. The API keeps calculations separate from the AI explanation layer so assumptions can be inspected and replaced later. See `docs/DATA-SOURCES.md` and `docs/ARCHITECTURE.md`.
