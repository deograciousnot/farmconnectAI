import { cropPrices, promptSafe } from './data.js';
import type { Analysis } from './matching.js';

// The AI step lives in the Python service (ai-service/, Gemini). This module builds the evidence it receives,
// checks the split the model proposes against hard rules, calculates the money for it, and falls back to the
// rule-based split and summary whenever the service is unavailable, slow or its answer breaks a rule.
export type Explanation = { headline: string; points: string[]; nextSteps: string[] };
export type Plan = Analysis['plan'] & { source: 'ai' | 'rules' };
export type BuyerNote = { listingId: string; why: string };
export type AiResult = {
  explanation: Explanation; plan: Plan; comparison: Analysis['comparison']; buyerNotes: BuyerNote[];
  /** Net of the price-only split, so the app can show what the AI's judgement costs or gains. */
  rulesPlanNet: number;
  provider: 'gemini' | 'fallback'; model: string | null; latencyMs: number; fallbackReason?: string;
};
type ModelAnswer = Explanation & { split?: { ref: string; kg: number }[]; buyerNotes?: { ref: string; why: string }[] };

const AI_SERVICE_URL = () => (process.env.AI_SERVICE_URL || 'http://localhost:8000').replace(/\/$/, '');
const TIMEOUT_MS = () => Number(process.env.AI_SERVICE_TIMEOUT_MS || 25_000);
const MAX_BUYERS = 6;

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const ref = (i: number) => `B${i + 1}`;
const byRef = (buyers: Analysis['matches'], r: string) => buyers[Number(/^B(\d+)$/.exec(r)?.[1]) - 1];

/** The exact, rounded evidence the model sees. Also returned to the app so judges can inspect it. */
export function buildEvidence(a: Analysis) {
  const buyers = a.matches.slice(0, MAX_BUYERS);
  return {
    farmer: { crop: a.cropLabel, perishable: cropPrices(a.input.crop)?.category !== 'grain', county: a.input.county, harvestKg: a.input.harvestKg, harvestDate: a.input.harvestDate },
    buyers: buyers.map((m, i) => ({
      ref: ref(i), name: promptSafe(m.businessName), town: promptSafe(m.town, 40), type: m.businessType, about: promptSafe(m.description, 140),
      pricePerKg: m.pricePerKg, distanceKm: m.distanceKm, transportPerKg: m.transportPerKg, netPerKg: m.netPerKg,
      canTakeKg: m.demandKg, weeklyDemandKg: m.frequency === 'weekly' ? m.totalDemandKg : undefined, alreadyCoveredKg: m.alreadyCoveredKg,
      frequency: m.frequency, collectsFromFarm: m.collectsFromFarm, priceVsLocalWholesalePct: m.priceVsWholesalePct
    })),
    rulesSplit: a.plan.allocations.map(p => ({ ref: ref(buyers.findIndex(m => m.listingId === p.listingId)), kg: p.kg })),
    rulesSplitUnallocatedKg: a.plan.unallocatedKg,
    comparedWithNearestMarket: a.comparison && { market: promptSafe(a.comparison.market), distanceKm: a.comparison.distanceKm, netPerKg: a.comparison.netPerKg, sellEverythingThereNet: a.comparison.baselineNet },
    publicMarketReference: a.marketReferences.slice(0, 3).map(m => ({ market: m.market, county: m.county, wholesalePerKg: m.wholesalePerKg, distanceKm: m.distanceKm, netPerKg: m.netPerKg })),
    assumptions: { transportKesPerKgKm: a.assumptions.transportKesPerKgKm, handlingKesPerKg: a.assumptions.handlingKesPerKg }
  };
}

/** Gain over the nearest public market for any plan; unplaced kg are assumed to go to that market. */
export function compareFor(a: Analysis, plan: Analysis['plan']): Analysis['comparison'] {
  const c = a.comparison;
  if (!c) return null;
  const planNet = plan.estimatedNet + Math.round(plan.unallocatedKg * c.netPerKg);
  return { ...c, planNet, differenceKes: planNet - c.baselineNet, differencePct: c.baselineNet > 0 ? Math.round(((planNet - c.baselineNet) / c.baselineNet) * 100) : null };
}

/**
 * Turns the model's proposed split into a plan, or says why it can't be used. The model picks buyers and kg;
 * code enforces the limits and does all the money arithmetic.
 */
export function planFromSplit(a: Analysis, split: { ref: string; kg: number }[]): { plan: Plan } | { error: string } {
  const buyers = a.matches.slice(0, MAX_BUYERS);
  const seen = new Set<string>();
  const allocations = [];
  for (const { ref: r, kg } of split) {
    const m = byRef(buyers, r);
    if (!m) return { error: `unknown buyer ${r}` };
    if (seen.has(r)) return { error: `buyer ${r} listed twice` };
    if (!Number.isInteger(kg) || kg < 10) return { error: `invalid kg for ${r}` };
    if (kg > m.demandKg) return { error: `${r} can only take ${m.demandKg} kg` };
    seen.add(r);
    allocations.push({ listingId: m.listingId, businessName: m.businessName, town: m.town, kg, netPerKg: m.netPerKg, estimatedNet: Math.round(kg * m.netPerKg) });
  }
  const allocatedKg = allocations.reduce((s, x) => s + x.kg, 0);
  if (allocatedKg > a.input.harvestKg) return { error: 'split is larger than the harvest' };
  if (!allocations.length && a.matches.length) return { error: 'empty split' };
  return { plan: { allocations, allocatedKg, unallocatedKg: a.input.harvestKg - allocatedKg, estimatedNet: allocations.reduce((s, x) => s + x.estimatedNet, 0), source: 'ai' } };
}

/** Rule-based reasons shown when the model is unavailable. */
function fallbackNotes(a: Analysis, language: 'en' | 'sw'): BuyerNote[] {
  const sw = language === 'sw';
  return a.plan.allocations.map((p, i) => {
    const m = a.matches.find(x => x.listingId === p.listingId)!;
    const parts = [
      i === 0 ? (sw ? 'Bei bora zaidi baada ya usafiri' : 'Best price after transport') : (sw ? 'Bei nzuri inayofuata' : 'Next best price after transport'),
      ...(m.collectsFromFarm ? [sw ? 'wanakuja shambani' : 'they collect from your farm'] : []),
      ...(m.frequency === 'weekly' ? [sw ? 'wananunua kila wiki' : 'they buy every week'] : [])
    ];
    return { listingId: p.listingId, why: parts.join(', ') + '.' };
  });
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
        ...(second ? [`Chaguo la pili ni ${second.businessName} (${second.town}) kwa takriban KES ${second.netPerKg}/kg.`] : []),
        ...(a.comparison && a.comparison.differenceKes > 0 ? [`Hii ni takriban KES ${fmt(a.comparison.differenceKes)} zaidi ya kuuza yote katika soko la ${a.comparison.market}, soko la umma lililo karibu.`] : [])
      ]
    : [
        `${best.businessName} in ${best.town} offers KES ${best.pricePerKg}/kg, about KES ${best.netPerKg}/kg after ${best.distanceKm} km of transport.`,
        ...(best.demandKg < a.input.harvestKg ? [`They only need ${fmt(best.demandKg)} kg, so the suggested split uses ${a.plan.allocations.length} buyers for an estimated KES ${fmt(a.plan.estimatedNet)} in total.`] : []),
        ...(second ? [`The next option is ${second.businessName} in ${second.town} at about KES ${second.netPerKg}/kg${second.collectsFromFarm ? ', and they collect from the farm' : ''}.`] : []),
        ...(a.comparison && a.comparison.differenceKes > 0 ? [`That is about KES ${fmt(a.comparison.differenceKes)} more than selling everything at ${a.comparison.market}, the nearest public market.`] : [])
      ];
  return sw
    ? { headline: `${best.businessName} inaonekana kuwa chaguo bora kwa sasa.`, points, nextSteps: ['Piga simu kuthibitisha bei na kiasi kabla ya kuvuna.', 'Thibitisha gharama ya usafiri na jinsi utakavyolipwa.'] }
    : { headline: `${best.businessName} looks like the strongest option right now.`, points, nextSteps: ['Call to confirm price and quantity before harvest.', 'Confirm transport cost and payment terms before loading.'] };
}

export async function explain(a: Analysis): Promise<AiResult> {
  const started = Date.now();
  const rulesPlan: Plan = { ...a.plan, source: 'rules' };
  const fallback = (reason: string): AiResult => ({
    explanation: fallbackExplanation(a, a.input.language), plan: rulesPlan, comparison: a.comparison, buyerNotes: fallbackNotes(a, a.input.language), rulesPlanNet: a.plan.estimatedNet,
    provider: 'fallback', model: null, latencyMs: Date.now() - started, fallbackReason: reason
  });
  if (process.env.AI_PROVIDER === 'none') return fallback('AI disabled by configuration');

  try {
    const response = await fetch(`${AI_SERVICE_URL()}/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS()),
      body: JSON.stringify({ evidence: buildEvidence(a), language: a.input.language })
    });
    const data = (await response.json().catch(() => ({}))) as { explanation?: ModelAnswer; model?: string; latencyMs?: number; error?: string };
    if (!response.ok || !data.explanation) return fallback(data.error ?? `AI service returned HTTP ${response.status}`);

    const { split = [], buyerNotes = [], ...raw } = data.explanation;
    const buyers = a.matches.slice(0, MAX_BUYERS);
    const named = (text: string) => text.replace(/\bB(\d+)\b/g, (r, n) => buyers[Number(n) - 1]?.businessName ?? r);
    const explanation = { headline: named(raw.headline), points: raw.points.map(named), nextSteps: raw.nextSteps.map(named) };
    const checked = a.matches.length ? planFromSplit(a, split) : { plan: rulesPlan };
    if ('error' in checked) return fallback(`AI split broke a rule (${checked.error})`);
    return {
      explanation, plan: checked.plan, comparison: compareFor(a, checked.plan), rulesPlanNet: a.plan.estimatedNet,
      buyerNotes: buyerNotes.flatMap(n => { const m = byRef(buyers, n.ref); return m ? [{ listingId: m.listingId, why: named(n.why) }] : []; }),
      provider: 'gemini', model: data.model ?? null, latencyMs: data.latencyMs ?? Date.now() - started
    };
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
