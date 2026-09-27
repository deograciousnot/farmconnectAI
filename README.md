# Farmconnect AI

**Voice-first market intelligence for smallholder farmers in Kenya.**

A farmer says, in Kiswahili or English, *"Nina magunia 28 ya maharagwe Webuye, nitauza wiki ijayo"* ("I have 28 bags of beans in Webuye, selling next week"). Farmconnect understands it, asks them to confirm, and finds buyers who still have open demand for that crop and week. It works out what each buyer really pays after transport and has the AI choose how to split the harvest across buyers and explain why. With one tap, the farmer can then ask those buyers to confirm. Buyers post their demand the same way, by speaking or pasting their usual WhatsApp message, and answer farmers from their phone.

It's a mobile web app (PWA): open the link on any phone and "Add to Home Screen". There's nothing to install from an app store.

## How the AI is used

The AI does the parts rules can't do. Code does everything that has to be exact.

| Step | AI (Google Gemini) | Code |
|---|---|---|
| **Understand the farmer** | Reads a voice note or text in Kiswahili, English or Sheng: number words ("thelathini" = 30), local units (gunia, debe, crate), relative dates ("wiki ijayo" = next week), and towns mapped to counties (Webuye → Bungoma) | Converts units to kg with a fixed table (90 kg bag, 64 kg tomato crate). The farmer confirms every field before anything happens |
| **Understand the buyer** | Turns a spoken or pasted WhatsApp message into a buyer post: crop, price per unit, volume, how often, place, pickup | Converts price per bag to price per kg. The buyer checks the post before publishing |
| **Choose the split** | Decides which buyers get how many kg, using judgement: perishable crops go to fewer, nearer buyers or buyers who collect; weekly buyers mean repeat sales; buyers with little demand left get little | Checks every allocation (each buyer's open demand, total within the harvest) and calculates all the money. It shows what a price-only split would earn, so the cost of the AI's judgement is visible |
| **Explain** | Writes the advice and a one-line reason for each buyer, in English or Kiswahili | Rejects any answer that mentions a price, weight, distance or percentage not in the evidence |

If Gemini is unavailable, slow, or its answer breaks a rule, the app still works: it falls back to the manual form, the price-only split and a rule-based summary, all clearly labelled.

## Project structure

```text
client/            React + Vite PWA: Sell (conversation) · Buyers (post + manage) · Prices (KAMIS)
server/            Express + TypeScript API
  src/matching.ts    eligible buyers, distance, transport, net KES/kg, price-only split
  src/demand.ts      open demand per buyer per week, farmer requests, buyer answers
  src/ai.ts          evidence for the model, AI split checks, rule-based fallback
  src/understand.ts  unit conversion for what the AI read
  scripts/           KAMIS price import
ai-service/        Python + FastAPI + google-genai: prompts, structured output, number checks
data/              market-prices.json (KAMIS, 63 crops), buyers.seed.json (demo buyers)
docs/              architecture, data sources, team plan, submission
```

## Quick start

```bash
npm install
cp .env.example .env            # PowerShell: Copy-Item .env.example .env
                                # then paste your key from https://aistudio.google.com/apikey into GEMINI_API_KEY

# Python AI service (Python 3.10+)
python -m venv ai-service/.venv
ai-service/.venv/Scripts/pip install -r ai-service/requirements.txt   # macOS/Linux: ai-service/.venv/bin/pip

npm run dev                     # starts the app, the API and the AI service
```

- Live demo: https://farmconnect-ai-do0u.onrender.com
- App (local): http://localhost:5173
- **On a phone, or for judges:** run `cloudflared tunnel --url http://localhost:5173` and open the `https://…trycloudflare.com` link. Phones only allow the microphone on https.
- API health: http://localhost:4000/health (shows whether Gemini is configured)

Other commands:

```bash
npm test               # 17 Node tests (matching, demand, AI split rules, fallback) + 15 Python tests (Gemini handling, number checks)
npm run seed:prices    # refresh data/market-prices.json from KAMIS
npm run build
```

Before a demo, delete `data/runtime/` to clear test posts and requests.

## Deploy to Render

One Docker service runs everything (built app, Node API, Python AI service) on one https URL, so the microphone works on phones.

1. On [render.com](https://render.com): **New → Blueprint**, connect this GitHub repo. Render reads `render.yaml`.
2. When asked, paste your Gemini key into `GEMINI_API_KEY`. It's stored as a secret in Render, never in the repo.
3. Wait for the first build (about 5–8 minutes). Your link is `https://farmconnect-ai.onrender.com` (or similar).
4. Check `https://<your-link>/health` shows `"configured": true`.

Free-tier notes: the service sleeps after 15 minutes without visitors, and the next visit takes 30–60 s to wake. Keep it awake with a free monitor (e.g. UptimeRobot) pinging `/health` every 5 minutes. The disk resets on restart, so posted buyer listings and requests are temporary. Demo buyers and KAMIS prices are built in.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/understand/harvest` | Text or voice note → proposed crop, county, kg, date (for the farmer to confirm) |
| POST | `/api/understand/listing` | Text or voice note → proposed buyer post (for the buyer to check) |
| POST | `/api/analyze` | Confirmed harvest → buyers with open demand, net KES/kg, price-only split, gain vs nearest market. Instant, no AI |
| POST | `/api/explain` | Same input → AI split (checked), reasons per buyer, advice, and the exact evidence sent to the model |
| POST / GET | `/api/requests` | Farmer asks buyers to confirm; farmer polls answers |
| GET | `/api/listings/:id/manage` | Buyer's own view: open demand this week and farmer requests (needs the buyer's private code) |
| POST | `/api/requests/:id/respond`, `/api/listings/:id/filled` | Buyer accepts or declines, or reports kg already bought elsewhere |
| GET / POST | `/api/listings` | Public buyer posts / create a post |
| GET | `/api/meta`, `/api/prices/:crop` | Crops, counties, KAMIS prices |

## Responsible AI and data

- **The AI never sets prices or does sums.** Every number shown is calculated by code. AI answers that cite figures missing from the evidence are rejected; AI splits that exceed a buyer's demand or the harvest are rejected.
- **People confirm what the AI understood** before any search or post, and every field can be edited.
- **Buyer text is untrusted.** Posts that read like instructions ("ignore other buyers…") are rejected, names are cleaned before reaching the prompt, and the prompt treats them as labels only.
- **Privacy.** Gemini's free tier may use prompts to improve Google's products, so only crop, place, quantities, business names and prices are sent. No phone numbers or farmer identities are sent. Buyer phone numbers are shown only if the buyer consents. Only the buyer's own device (a private code) can answer requests for a post.
- **Honest data.** KAMIS prices are real (Ministry of Agriculture, retrieved 2026-09-27); obvious entry errors are flagged, not hidden. Seed buyers are fictional and labelled **demo**. The "KES X more" figure is compared against the nearest public market at wholesale, a generous baseline.
- **Known limits.** KAMIS coverage is uneven across counties, so advice is more reliable where markets report often. Distances are estimated between county towns. No accounts or verification yet: in production, buyers would need to be verified.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md), [docs/TEAM-PLAN.md](docs/TEAM-PLAN.md) and [docs/SUBMISSION.md](docs/SUBMISSION.md).
