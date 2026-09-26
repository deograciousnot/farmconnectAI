import { cropPrices, listListings, type Listing } from './data.js';
import { findCounty, roadKm } from './geo.js';

// Documented, deliberately simple logistics assumptions. Shown to the farmer with every result.
export const ASSUMPTIONS = {
  transportKesPerKgKm: 0.03, // hired lorry, shared across a load of a few tonnes
  handlingKesPerKg: 1, // loading, bags, market fees
  minDistanceKm: 10, // farm to town within the same county
  dateToleranceDays: 3, // a buyer window that starts a few days after harvest still counts
  currency: 'KES',
  unit: 'kg'
};

export type AnalysisInput = { crop: string; county: string; harvestKg: number; harvestDate: string; language: 'en' | 'sw' };

export type BuyerMatch = {
  listingId: string; businessName: string; businessType: Listing['businessType']; description: string; town: string; county: string;
  pricePerKg: number; distanceKm: number; transportPerKg: number; netPerKg: number;
  demandKg: number; frequency: Listing['frequency']; sellableKg: number; coveragePct: number; estimatedNet: number;
  collectsFromFarm: boolean; priceVsWholesalePct: number | null; wholesaleReference: string | null; isDemo: boolean; contactPhone?: string;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const addDays = (date: string, days: number) => new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);

export function validateInput(body: Record<string, unknown>): { input: AnalysisInput } | { error: string } {
  const crop = String(body.crop ?? '');
  const county = String(body.county ?? '');
  const harvestKg = Number(body.harvestKg);
  const harvestDate = String(body.harvestDate ?? '');
  if (!cropPrices(crop)) return { error: 'Choose a supported crop.' };
  if (!findCounty(county)) return { error: 'Choose the county where your farm is.' };
  if (!(harvestKg >= 10 && harvestKg <= 1_000_000)) return { error: 'Harvest must be between 10 and 1,000,000 kg.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(harvestDate) || Number.isNaN(Date.parse(harvestDate))) return { error: 'Provide a valid harvest date.' };
  return { input: { crop, county: findCounty(county)!.name, harvestKg, harvestDate, language: body.language === 'sw' ? 'sw' : 'en' } };
}

/** KAMIS median wholesale price in the buyer's county (ignoring flagged outliers), else the national median. */
function wholesaleFor(crop: string, county: string) {
  const data = cropPrices(crop);
  if (!data) return null;
  const local = data.markets.filter(m => !m.outlier && findCounty(m.county)?.name === county).map(m => m.wholesalePerKg).sort((a, b) => a - b);
  if (local.length) return { perKg: local[Math.floor(local.length / 2)], label: `KAMIS wholesale, ${county}` };
  return data.nationalMedianPerKg ? { perKg: data.nationalMedianPerKg, label: 'KAMIS national median wholesale' } : null;
}

function logistics(from: { lat: number; lng: number }, to: { lat: number; lng: number }, collects: boolean) {
  const distanceKm = Math.max(ASSUMPTIONS.minDistanceKm, roadKm(from, to));
  const transportPerKg = collects ? 0 : round1(distanceKm * ASSUMPTIONS.transportKesPerKgKm);
  return { distanceKm, transportPerKg };
}

export function analyze(input: AnalysisInput) {
  const farm = findCounty(input.county)!;
  const latestStart = addDays(input.harvestDate, ASSUMPTIONS.dateToleranceDays);

  const matches: BuyerMatch[] = listListings(input.crop)
    .filter(l => l.neededFrom <= latestStart && l.neededUntil >= input.harvestDate)
    .flatMap(l => {
      const location = findCounty(l.county);
      if (!location) return [];
      const { distanceKm, transportPerKg } = logistics(farm, location, l.collectsFromFarm);
      const netPerKg = round1(l.pricePerKg - transportPerKg - ASSUMPTIONS.handlingKesPerKg);
      const sellableKg = Math.min(input.harvestKg, l.quantityKg);
      const wholesale = wholesaleFor(l.crop, l.county);
      return [{
        listingId: l.id, businessName: l.businessName, businessType: l.businessType, description: l.description, town: l.town, county: l.county,
        pricePerKg: l.pricePerKg, distanceKm, transportPerKg, netPerKg,
        demandKg: l.quantityKg, frequency: l.frequency, sellableKg, coveragePct: Math.round((sellableKg / input.harvestKg) * 100),
        estimatedNet: Math.round(sellableKg * netPerKg), collectsFromFarm: l.collectsFromFarm,
        priceVsWholesalePct: wholesale ? Math.round(((l.pricePerKg - wholesale.perKg) / wholesale.perKg) * 100) : null,
        wholesaleReference: wholesale?.label ?? null, isDemo: l.isDemo, ...(l.showContact && l.contactPhone ? { contactPhone: l.contactPhone } : {})
      }];
    })
    .filter(m => m.netPerKg > 0)
    .sort((a, b) => b.netPerKg - a.netPerKg || a.distanceKm - b.distanceKm);

  // Greedy split: fill the best net-per-kg buyers first until the harvest is allocated.
  let remaining = input.harvestKg;
  const plan = [];
  for (const m of matches) {
    if (remaining <= 0) break;
    const kg = Math.min(remaining, m.demandKg);
    plan.push({ listingId: m.listingId, businessName: m.businessName, town: m.town, kg, netPerKg: m.netPerKg, estimatedNet: Math.round(kg * m.netPerKg) });
    remaining -= kg;
  }

  const priceData = cropPrices(input.crop)!;
  const marketReferences = priceData.markets
    .filter(m => !m.outlier && m.observations >= 2 && findCounty(m.county))
    .map(m => {
      const { distanceKm, transportPerKg } = logistics(farm, findCounty(m.county)!, false);
      return { market: m.market, county: findCounty(m.county)!.name, wholesalePerKg: m.wholesalePerKg, distanceKm, transportPerKg, netPerKg: round1(m.wholesalePerKg - transportPerKg - ASSUMPTIONS.handlingKesPerKg), latestDate: m.latestDate };
    })
    .sort((a, b) => b.netPerKg - a.netPerKg)
    .slice(0, 5);

  return {
    input,
    cropLabel: priceData.label,
    assumptions: ASSUMPTIONS,
    matches,
    plan: { allocations: plan, allocatedKg: input.harvestKg - remaining, unallocatedKg: remaining, estimatedNet: plan.reduce((s, p) => s + p.estimatedNet, 0) },
    marketReferences,
    nationalMedianPerKg: priceData.nationalMedianPerKg
  };
}

export type Analysis = ReturnType<typeof analyze>;
