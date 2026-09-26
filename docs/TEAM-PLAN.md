# Team plan: Come Build with AI, Sunday 27 Sept 2026

Two people. Times are **Nairobi (EAT)**, two hours ahead of the Tunis times on the event site. **Submissions close at 19:30 EAT.**

## What already works (on `feat/mobile-buyer-network`)

- Mobile PWA with three tabs: **Sell** (farmer), **Buyers** (post demand), **Prices** (KAMIS)
- Real KAMIS wholesale prices for 10 crops, plus 17 demo buyers
- Matching, transport estimate, net KES/kg ranking and split plan across buyers
- Ollama explanation in English or Kiswahili, with the number guard and fallback
- 8 server tests (`npm test`)

## Not yet verified

- **Real Ollama model.** Ollama wasn't installed on the dev laptop. The AI step was tested against a fake Ollama server with the same response format: valid answers were shown, and one with a made-up KES 250,000 was rejected and replaced by the fallback. Install it and run the demo several times before the event.
- **Look on real phones.** The build and type checks pass, but nobody has viewed the UI on a phone yet.

## Before the event

- **Final Team Confirmation is due 26 Sept.** The team lead submits it with both members' details.
- The original brief listed "a mobile app" as out of scope. We now ship a PWA (installable web app): one codebase and one link for judges, with no app-store build.
- Buyers are fictional demo data because there's no public dataset of real buyers' volumes and prices. Say this openly in the demo: prices are real (KAMIS) and real buyers come in through the Buyers tab.
- Opening on a phone: `npm run dev`, then `http://<laptop-ip>:5173` on the same Wi‑Fi.

## Split

| | **Person A: AI, data, backend** | **Person B: mobile experience, story, submission** |
|---|---|---|
| Owns | `server/`, `data/`, Ollama | `client/`, demo video, slides, submission form |
| Before the event | Install Ollama, `ollama pull llama3.2:3b`, run the demo scenario 5+ times and tune the prompt in `server/src/ai.ts` until answers are short and correct | Open the app on 2–3 real phones (Android and iPhone), list every layout or usability problem, try "Add to Home Screen" |
| Sprint 1–2 | `npm run seed:prices` for fresh data; record which model and timing to disclose | Fix the phone issues; translate the fixed UI labels into Kiswahili (AI output already switches) |
| Sprint 3 | Make the demo reachable for judges: run on the laptop plus a `cloudflared tunnel --url http://localhost:5173` link, or deploy the API. Test the fallback live by stopping Ollama | Write the story (150-word summary, problem, solution, features); create the slides; plan the 90-second video |
| Final sprint | Freeze the code at 18:30. Fill in the AI/tool disclosure (below). Check the repo is public or judges have access, and that `.env` is not committed | Record the 90-second video; submit the form by **19:15** at the latest |
| Both | Rehearse the demo at 18:30 | |

## Demo scenario (90 seconds)

1. **Problem (15 s):** "A farmer in Uasin Gishu has 3 tonnes of watermelon. Which buyer pays best after transport? The highest price isn't always the best option."
2. **Product (45 s):** On a phone, Sell tab → watermelon, Uasin Gishu, 3000 kg → **Find buyers**. Show the AI advice, then the split: the Kisumu hotel pays most but only takes 800 kg, so the rest goes to Kakamega and Nakuru. Tap **EN → SW** and **Find buyers** again to get the advice in Kiswahili.
3. **Proof (20 s):** Buyers tab → post a new demand → run the farmer search again and it appears. Open "How we calculated this" to show the evidence sent to the model.
4. **Next steps (10 s):** SMS/USSD for feature phones, verified buyers, live KAMIS sync.

## Awards to tick

Kenya podium (automatic), **Click Mobile Mobile-First Impact** (Kenya), **Kredete Financial Inclusion**, **GOMYCODE × NVIDIA Real-World AI Impact**, EY Studio+ Human-Centred Innovation.

## AI and tool disclosure (draft)

- **Model:** Llama 3.2 3B through Ollama, running locally, with JSON-schema structured output. Brev was not used.
- **Data:** KAMIS (Ministry of Agriculture) wholesale prices retrieved 2026-09-26; fictional demo buyers labelled as such.
- **What the AI does:** it only explains numbers computed by deterministic code. Answers that cite figures not in the evidence are rejected.
- **Backup plan:** a rule-based summary in English or Kiswahili when the model is unavailable, slow or fails validation.
- **Coding assistant:** built with help from Claude Code.

## Cut if short on time

Kiswahili UI labels → offline caching → Prices tab polish. Never cut: the Sell flow, AI advice with its fallback, or the video.
