# Team plan: final hours, Sunday 27 Sept 2026

Times are **Nairobi (EAT)**, two hours ahead of the Tunis times on the event site.
**Submit by 19:15 EAT** (the form closes at 19:30). Judging runs 19:45–21:15 EAT: keep the demo link up until then.

## What's built

- Voice-first PWA: **Sell** (describe → confirm → buyers, AI split and advice → ask buyers to confirm), **Buyers** (speak or paste a WhatsApp message → check → post; manage demand and answer farmers), **Prices** (KAMIS, 63 crops)
- Gemini understands Kiswahili/English/Sheng speech and text, chooses the split with reasons, and explains in English or Kiswahili
- Every number calculated by code; AI answers and splits checked against rules; labelled fallback when Gemini is unavailable
- Live buyer demand: open kg per week, requests and accept/decline between two phones
- 17 Node + 15 Python tests (`npm test`)

## Checklist

**Person A (laptop, backend):**
- [ ] `git pull` on `main`, `npm install`, Python venv set up, Gemini key in `.env`
- [ ] Local only: delete `data/runtime/` (test posts, including the "ignore other buyers" listing). Render starts clean.
- [ ] **Deploy to Render** (README → "Deploy to Render"): New → Blueprint → this repo → paste the Gemini key. Check `https://<link>/health` shows `"configured": true`.
- [ ] Add a free UptimeRobot monitor on `https://<link>/health` every 5 minutes, so it doesn't sleep during judging (19:45–21:15 EAT).
- [ ] Backup link if Render has problems: `npm run dev` and `cloudflared tunnel --url http://localhost:5173` on the laptop.
- [ ] Rehearse the fallback once: stop the AI service, find buyers, check that "offline summary" and "Price-only split" show, then start it again
- [ ] Paste the link, repo URL and disclosure into the form ([SUBMISSION.md](SUBMISSION.md))

**Person B (phones, story):**
- [ ] Open the https link on two phones. Test the mic (allow microphone access), the Kiswahili screens (SW switch) and "Add to Home Screen"
- [ ] Build the slides from [SUBMISSION.md](SUBMISSION.md)
- [ ] Record the 90-second video (script in SUBMISSION.md), screen-recording both phones

**Both:** rehearse the video script once before recording. Don't hammer Gemini right before judging; the free tier has rate limits.

## Two-phone demo

1. **Buyer phone** (Buyers tab): speak or paste *"Webuye Cereals: tunanunua maharagwe kg 600 kila wiki, bei 140 kwa kilo. Tuko Webuye, Bungoma."* ("We buy 600 kg of beans every week at 140 a kilo. We're in Webuye, Bungoma.") → Check your post → Post demand.
2. **Farmer phone** (Sell tab): tap the mic and say *"Nina magunia 28 ya maharagwe Webuye, nitauza wiki ijayo"* → "Here's what I understood" → **Yes, find buyers**.
3. Show the AI split (school supplier 2,000 kg + Webuye Cereals 520 kg), the reason on each buyer, and "+KES … more than the nearest market". Tap **SW** to show the advice in Kiswahili.
4. **Yes, ask them** → buyer phone shows the request → **Accept** → farmer phone shows **✓ Confirmed**, and Webuye Cereals' open demand drops.

Backup scenario (single phone): watermelon, Uasin Gishu, 3,000 kg. The AI trades a little money for a nearer or collecting buyer because watermelon is perishable, and the card shows what a price-only split would have earned.

## If something breaks

- **Gemini down or slow:** the app still works (manual form, price-only split, rule-based advice). Say so. That's the reliability story.
- **Mic blocked:** you're on http. Use the https tunnel link, or type.
- **Render slow on first open:** it was asleep; wait up to a minute. The UptimeRobot ping prevents this.
- **Tunnel link changed (backup only):** a free trycloudflare link changes on restart. Update it in the submission if you had to restart.
