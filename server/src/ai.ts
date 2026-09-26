import type { Analysis } from './matching.js';

// The AI step lives in the Python service (ai-service/, Gemini). This module builds the evidence it receives
// and falls back to a rule-based summary whenever that service is unavailable, slow or rejects the model output.
export type Explanation = { headline: string; points: string[]; nextSteps: string[] };
export type AiResult = { explanation: Explanation; provider: 'gemini' | 'fallback'; model: string | null; latencyMs: number; fallbackReason?: string };

const AI_SERVICE_URL = () => (process.env.AI_SERVICE_URL || 'http://localhost:8000').replace(/\/$/, '');
const TIMEOUT_MS = () => Number(process.env.AI_SERVICE_TIMEOUT_MS || 25_000);

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
  const fallback = (reason: string): AiResult => ({ explanation: fallbackExplanation(a, a.input.language), provider: 'fallback', model: null, latencyMs: Date.now() - started, fallbackReason: reason });
  if (process.env.AI_PROVIDER === 'none') return fallback('AI disabled by configuration');

  try {
    const response = await fetch(`${AI_SERVICE_URL()}/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS()),
      body: JSON.stringify({ evidence: buildEvidence(a), language: a.input.language })
    });
    const data = (await response.json().catch(() => ({}))) as Partial<AiResult> & { error?: string };
    if (!response.ok || !data.explanation) return fallback(data.error ?? `AI service returned HTTP ${response.status}`);
    return data as AiResult;
  } catch (err) {
    return fallback(err instanceof Error && err.name === 'TimeoutError' ? `AI service timed out after ${TIMEOUT_MS()} ms` : 'AI service is not reachable');
  }
}

export async function aiStatus() {
  try {
    const res = await fetch(`${AI_SERVICE_URL()}/health`, { signal: AbortSignal.timeout(3000) });
    return { ...(await res.json()), reachable: true };
  } catch {
    return { provider: 'gemini', reachable: false, configured: false };
  }
}
