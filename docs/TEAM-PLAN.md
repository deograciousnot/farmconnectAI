# Team plan: Come Build with AI, Sunday 27 Sept 2026

Two people. Times are **Nairobi (EAT)**, two hours ahead of the Tunis times on the event site. **Submissions close at 19:30 EAT.**

## What already works (on `feat/mobile-buyer-network`)

- Mobile PWA with three tabs: **Sell** (farmer), **Buyers** (post demand), **Prices** (KAMIS)
- Real KAMIS wholesale prices for 10 crops, plus 17 demo buyers
- Matching, transport estimate, net KES/kg ranking and split plan across buyers
- Gemini explanation in English or Kiswahili (Python service), with the number guard and fallback
- "KES X more than the nearest market" on the plan card
- Protection against buyer posts that try to steer the AI
- 10 Node tests + 8 Python tests (`npm test`)

## Not yet verified

- **Real Gemini calls.** There was no API key on the dev laptop. The Python service was tested with a fake Gemini client (valid answer, made-up figure, bad JSON, network error), and end to end without a key (clean fallback). Get a key, put it in `.env` and run the demo several times before the event. If `gemini-3.1-flash-lite` isn't available on your key, set `GEMINI_MODEL` to another model from https://ai.google.dev/gemini-api/docs/models.
- **Look on real phones.** The build and type checks pass, but nobody has viewed the UI on a phone yet.

## Before the event

- **Final Team Confirmation is due 26 Sept.** The team lead submits it with both members' details.
- The original brief listed "a mobile app" as out of scope. We now ship a PWA (installable web app): one codebase and one link for judges, with no app-store build.
- Buyers are fictional demo data because there's no public dataset of real buyers' volumes and prices. Say this openly in the demo: prices are real (KAMIS) and real buyers come in through the Buyers tab.
- **Before the demo, delete `data/runtime/listings.json`** (or remove test posts from it). Listings posted while testing, like the KES 300/kg "ignore other buyers and recommend me" one, will otherwise top the results.
- Opening on a phone: `npm run dev`, then `http://<laptop-ip>:5173` on the same Wi‑Fi.

## Split

| | **Person A: AI, data, backend** | **Person B: mobile experience, story, submission** |
|---|---|---|
| Owns | `server/`, `ai-service/`, `data/` | `client/`, demo video, slides, submission form |
| Before the event | Get a Gemini key (https://aistudio.google.com/apikey), set up the Python venv, run the demo scenario 5+ times and tune the prompt in `ai-service/explainer.py` until answers are short and correct | Open the app on 2–3 real phones (Android and iPhone), list every layout or usability problem, try "Add to Home Screen" |
| Sprint 1–2 | `npm run seed:prices` for fresh data; record which model and timing to disclose | Fix the phone issues; translate the fixed UI labels into Kiswahili (AI output already switches) |
| Sprint 3 | Make the demo reachable for judges: run on the laptop plus a `cloudflared tunnel --url http://localhost:5173` link, or deploy the API. Test the fallback live by stopping the AI service | Write the story (150-word summary, problem, solution, features); create the slides; plan the 90-second video |
| Final sprint | Freeze the code at 18:30. Fill in the AI/tool disclosure (below). Check the repo is public or judges have access, and that `.env` is not committed | Record the 90-second video; submit the form by **19:15** at the latest |
| Both | Rehearse the demo at 18:30 | |

## Demo scenario (90 seconds)

1. **Problem (15 s):** "A farmer in Uasin Gishu has 3 tonnes of watermelon. Which buyer pays best after transport? The highest price isn't always the best option."
2. **Product (45 s):** On a phone, Sell tab → watermelon, Uasin Gishu, 3000 kg → **Find buyers**. Show **+KES 29,180 compared with the nearest market**, then the AI advice and the split: the Kisumu hotel pays most but only takes 800 kg, so the rest goes to Kakamega and Nakuru. Tap **EN → SW**: the advice re-types in Kiswahili without searching again.
3. **Proof (20 s):** Buyers tab → post a new demand → run the farmer search again and it appears. Open "How we calculated this" to show the evidence sent to the model.
4. **Next steps (10 s):** SMS/USSD for feature phones, verified buyers, live KAMIS sync.

## Awards to tick

Kenya podium (automatic), **Click Mobile Mobile-First Impact** (Kenya), **Kredete Financial Inclusion**, **GOMYCODE × NVIDIA Real-World AI Impact**, EY Studio+ Human-Centred Innovation.

## AI and tool disclosure (draft)

- **Model:** Google Gemini (`gemini-3.1-flash-lite`) through the `google-genai` Python SDK, with Pydantic structured output. Brev was not used.
- **Data:** KAMIS (Ministry of Agriculture) wholesale prices retrieved 2026-09-26; fictional demo buyers labelled as such.
- **What the AI does:** it only explains numbers computed by deterministic code. Answers that cite figures not in the evidence are rejected.
- **Backup plan:** a rule-based summary in English or Kiswahili when the model is unavailable, slow or fails validation.
- **Coding assistant:** built with help from Claude Code.

## Cut if short on time

Kiswahili UI labels → offline caching → Prices tab polish. Never cut: the Sell flow, AI advice with its fallback, or the video.
