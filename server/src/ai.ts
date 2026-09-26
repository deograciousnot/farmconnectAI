import type { Analysis } from './matching.js';

// The model only explains evidence the backend already computed. It never produces prices, buyers or arithmetic.
export type Explanation = { headline: string; points: string[]; nextSteps: string[] };
export type AiResult = { explanation: Explanation; provider: 'ollama' | 'fallback'; model: string | null; latencyMs: number; fallbackReason?: string };

const OLLAMA_URL = () => (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL = () => process.env.OLLAMA_MODEL || 'llama3.2:3b';
const TIMEOUT_MS = () => Number(process.env.OLLAMA_TIMEOUT_MS || 30_000);

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** The exact, rounded evidence the model sees. Also logged in the response so judges can inspect it. */
export function buildEvidence(a: Analysis) {
  return {
    farmer: { crop: a.cropLabel, county: a.input.county, harvestKg: a.input.harvestKg, harvestDate: a.input.harvestDate },
    buyers: a.matches.slice(0, 5).map(m => ({
      name: m.businessName, town: m.town, type: m.businessType, pricePerKg: m.pricePerKg, distanceKm: m.distanceKm,
      transportPerKg: m.transportPerKg, netPerKg: m.netPerKg, buysUpToKg: m.demandKg, frequency: m.frequency,
      collectsFromFarm: m.collectsFromFarm, priceVsLocalWholesalePct: m.priceVsWholesalePct
    })),
    suggestedSplit: a.plan.allocations.map(p => ({ name: p.businessName, kg: p.kg, estimatedNet: p.estimatedNet })),
    unallocatedKg: a.plan.unallocatedKg,
    totalEstimatedNet: a.plan.estimatedNet,
    publicMarketReference: a.marketReferences.slice(0, 3).map(m => ({ market: m.market, county: m.county, wholesalePerKg: m.wholesalePerKg, distanceKm: m.distanceKm, netPerKg: m.netPerKg })),
    assumptions: { transportKesPerKgKm: a.assumptions.transportKesPerKgKm, handlingKesPerKg: a.assumptions.handlingKesPerKg }
  };
}

const SYSTEM_PROMPT = (language: 'en' | 'sw') => `You advise smallholder farmers in Kenya on where to sell a harvest.
You receive EVIDENCE as JSON computed by our system. Rules:
- Use only buyers, markets and numbers that appear in EVIDENCE. Never invent or recalculate prices, distances or totals.
- Compare options by net KES per kg (price minus transport and handling), how much each buyer can take, and distance.
- If one buyer cannot take the whole harvest, explain the suggested split.
- Point out trade-offs, e.g. a higher price far away versus a nearby buyer or one that collects from the farm.
- Be honest about uncertainty: prices are estimates and buyers must be confirmed.
- Never tell the farmer what they must do; offer options.
- Write simply for a farmer with basic literacy. Short sentences.
- Write in ${language === 'sw' ? 'Kiswahili' : 'English'}.
Respond as JSON: {"headline": one sentence, "points": 2-4 short sentences, "nextSteps": 2-3 short actions}.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: { headline: { type: 'string' }, points: { type: 'array', items: { type: 'string' } }, nextSteps: { type: 'array', items: { type: 'string' } } },
  required: ['headline', 'points', 'nextSteps']
};

/**
 * Guard against hallucinated figures: every number above 31 (days/percent-ish small numbers are allowed)
 * must be within 2% of a number in the evidence.
 */
export function findInventedNumbers(text: string, evidence: unknown) {
  const allowed = [...JSON.stringify(evidence).matchAll(/-?\d+(?:\.\d+)?/g)].map(m => Math.abs(Number(m[0])));
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)]
    .map(m => Number(m[0].replace(/,/g, '')))
    .filter(n => n > 31 && !allowed.some(a => Math.abs(a - n) <= Math.max(1, a * 0.02)));
}

export function fallbackExplanation(a: Analysis, language: 'en' | 'sw'): Explanation {
  const sw = language === 'sw';
  const [best, second] = a.matches;
  const ref = a.marketReferences[0];
  if (!best) {
    return sw
      ? { headline: `Hakuna mnunuzi aliyesajiliwa anayetafuta ${a.cropLabel} kwa tarehe hiyo.`, points: ref ? [`Soko la ${ref.market} (${ref.county}) lina bei ya jumla ya takriban KES ${ref.wholesalePerKg}/kg kulingana na KAMIS.`] : [], nextSteps: ['Angalia tena baadaye wanunuzi wapya wakijisajili.', 'Uliza bei katika soko lililo karibu nawe.'] }
      : { headline: `No registered buyer is looking for ${a.cropLabel} around that date yet.`, points: ref ? [`${ref.market} (${ref.county}) shows a KAMIS wholesale price of about KES ${ref.wholesalePerKg}/kg, about KES ${ref.netPerKg}/kg after transport.`] : [], nextSteps: ['Check again later as new buyers post demand.', 'Ask for prices at your nearest market before harvest.'] };
  }
  const points = sw
    ? [
        `${best.businessName} (${best.town}) inatoa KES ${best.pricePerKg}/kg, takriban KES ${best.netPerKg}/kg baada ya usafiri wa km ${best.distanceKm}.`,
        ...(best.demandKg < a.input.harvestKg ? [`Wanaweza kuchukua kg ${fmt(best.demandKg)} tu, kwa hivyo mgawanyo unaopendekezwa unahusisha wanunuzi ${a.plan.allocations.length}.`] : []),
        ...(second ? [`Chaguo la pili ni ${second.businessName} (${second.town}) kwa takriban KES ${second.netPerKg}/kg.`] : [])
      ]
    : [
        `${best.businessName} in ${best.town} offers KES ${best.pricePerKg}/kg, about KES ${best.netPerKg}/kg after ${best.distanceKm} km of transport.`,
        ...(best.demandKg < a.input.harvestKg ? [`They only need ${fmt(best.demandKg)} kg, so the suggested split uses ${a.plan.allocations.length} buyers for an estimated KES ${fmt(a.plan.estimatedNet)} in total.`] : []),
        ...(second ? [`The next option is ${second.businessName} in ${second.town} at about KES ${second.netPerKg}/kg${second.collectsFromFarm ? ', and they collect from the farm' : ''}.`] : [])
      ];
  return sw
    ? { headline: `${best.businessName} inaonekana kuwa chaguo bora kwa sasa.`, points, nextSteps: ['Piga simu kuthibitisha bei na kiasi kabla ya kuvuna.', 'Thibitisha gharama ya usafiri na jinsi utakavyolipwa.'] }
    : { headline: `${best.businessName} looks like the strongest option right now.`, points, nextSteps: ['Call to confirm price and quantity before harvest.', 'Confirm transport cost and payment terms before loading.'] };
}

export async function explain(a: Analysis): Promise<AiResult> {
  const started = Date.now();
  const evidence = buildEvidence(a);
  const fallback = (reason: string): AiResult => ({ explanation: fallbackExplanation(a, a.input.language), provider: 'fallback', model: null, latencyMs: Date.now() - started, fallbackReason: reason });
  if (process.env.AI_PROVIDER === 'none') return fallback('AI disabled by configuration');

  try {
    const response = await fetch(`${OLLAMA_URL()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS()),
      body: JSON.stringify({
        model: OLLAMA_MODEL(),
        stream: false,
        format: RESPONSE_SCHEMA,
        options: { temperature: 0.2 },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT(a.input.language) },
          { role: 'user', content: `EVIDENCE:\n${JSON.stringify(evidence)}` }
        ]
      })
    });
    if (!response.ok) return fallback(`Ollama returned HTTP ${response.status}`);
    const data = (await response.json()) as { message?: { content?: string } };
    const parsed = JSON.parse(data.message?.content ?? '') as Partial<Explanation>;
    if (typeof parsed.headline !== 'string' || !Array.isArray(parsed.points) || !Array.isArray(parsed.nextSteps)) return fallback('Model response did not match the expected format');

    const explanation = { headline: parsed.headline, points: parsed.points.map(String).slice(0, 4), nextSteps: parsed.nextSteps.map(String).slice(0, 3) };
    const invented = findInventedNumbers([explanation.headline, ...explanation.points, ...explanation.nextSteps].join(' '), evidence);
    if (invented.length) return fallback(`Model mentioned figures not in the evidence (${invented.slice(0, 3).join(', ')})`);
    return { explanation, provider: 'ollama', model: OLLAMA_MODEL(), latencyMs: Date.now() - started };
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? `Ollama timed out after ${TIMEOUT_MS()} ms` : 'Ollama is not reachable';
    return fallback(reason);
  }
}

export async function aiStatus() {
  try {
    const res = await fetch(`${OLLAMA_URL()}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const { models = [] } = (await res.json()) as { models?: { name: string }[] };
    return { provider: 'ollama', model: OLLAMA_MODEL(), reachable: true, modelInstalled: models.some(m => m.name === OLLAMA_MODEL()) };
  } catch {
    return { provider: 'ollama', model: OLLAMA_MODEL(), reachable: false, modelInstalled: false };
  }
}

/** Loads the model into memory at startup so the first farmer request isn't slowed by a cold start. */
export function warmUp() {
  if (process.env.AI_PROVIDER === 'none') return;
  fetch(`${OLLAMA_URL()}/api/generate`, { method: 'POST', body: JSON.stringify({ model: OLLAMA_MODEL(), prompt: '', keep_alive: '30m' }), signal: AbortSignal.timeout(120_000) })
    .then(r => console.log(r.ok ? `Ollama model ${OLLAMA_MODEL()} loaded` : `Ollama warm-up failed: HTTP ${r.status}`))
    .catch(() => console.log(`Ollama not reachable at ${OLLAMA_URL()}; using rule-based explanations until it is.`));
}
