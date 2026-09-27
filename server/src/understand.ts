import { BUSINESS_TYPES, cleanText, cropPrices, crops } from './data.js';
import { COUNTIES, findCounty } from './geo.js';

// The AI reads what people say or paste; this module turns its reading into form values.
// Units are converted here with a fixed table, never by the model. Values are approximate and
// shown to the person with the conversion so they can correct them.
type Unit = 'kg' | 'bag' | 'tonne' | 'debe' | 'crate' | 'piece' | 'other';
// Only sizes we're confident about. Dry grains and pulses trade in 90 kg bags; potatoes in 50 kg bags;
// tomatoes in 64 kg crates. Anything else (a "bag" of cabbages, a "piece" of watermelon) is left for the person.
const UNIT_KG: Record<string, Partial<Record<Unit, number>>> = {
  default: { kg: 1, tonne: 1000 },
  grain: { bag: 90, debe: 18 },
  'irish-potato': { bag: 50 },
  'irish-potato-red': { bag: 50 },
  tomato: { crate: 64 }
};
const unitKg = (unit: Unit, crop: string | null) =>
  UNIT_KG.default[unit] ?? (crop ? UNIT_KG[crop]?.[unit] ?? UNIT_KG[cropPrices(crop)?.category ?? '']?.[unit] : undefined);
// Notes shown to the person follow the app's language (EN/SW switch).
export type UiLang = 'en' | 'sw';
const UNIT_LABEL: Record<UiLang, Record<Unit, [string, string]>> = {
  en: { kg: ['kg', 'kg'], bag: ['bag', 'bags'], tonne: ['tonne', 'tonnes'], debe: ['debe', 'debes'], crate: ['crate', 'crates'], piece: ['piece', 'pieces'], other: ['unit', 'units'] },
  sw: { kg: ['kg', 'kg'], bag: ['gunia', 'magunia'], tonne: ['tani', 'tani'], debe: ['debe', 'madebe'], crate: ['kreti', 'kreti'], piece: ['kipande', 'vipande'], other: ['kipimo', 'vipimo'] }
};
const uiLang = (v: unknown): UiLang => (v === 'sw' ? 'sw' : 'en');
const spoken = (v: unknown) => (v === 'en' || v === 'sw' || v === 'mixed' ? v : null);
const countyNote = (place: string, county: string, ui: UiLang) => (ui === 'sw' ? `${place} → kaunti ya ${county}` : `${place} → ${county} county`);

const AI_SERVICE_URL = () => (process.env.AI_SERVICE_URL || 'http://localhost:8000').replace(/\/$/, '');

type Quantity = { amount: number | null; unit: Unit | null } | null;

/** Converts an amount to kg for a crop. Returns null (with a reason) when the unit size is unknown. */
export function toKg(q: Quantity, crop: string | null, ui: UiLang = 'en'): { kg: number; note: string } | { kg: null; note: string } | null {
  if (!q?.amount || q.amount <= 0) return null;
  const unit = q.unit ?? 'kg';
  const perUnit = unitKg(unit, crop);
  const label = UNIT_LABEL[ui][unit][q.amount === 1 ? 0 : 1];
  const amount = ui === 'sw' ? `${label} ${q.amount}` : `${q.amount} ${label}`;
  if (!perUnit) return { kg: null, note: ui === 'sw' ? `${amount}: hatujui ni kilo ngapi. Tafadhali weka kilo.` : `${amount}: we don't know how many kg that is${crop ? ' for this crop' : ''}. Please enter kg.` };
  const kg = Math.round(q.amount * perUnit);
  const total = kg.toLocaleString('en-US');
  if (unit === 'kg') return { kg, note: ui === 'sw' ? `kg ${total}` : `${total} kg` };
  return { kg, note: ui === 'sw' ? `${amount} × kg ${perUnit} ≈ kg ${total}` : `${amount} × ${perUnit} kg ≈ ${total} kg` };
}

/** Price per kg from a price per unit, using the same table. */
export function pricePerKg(p: { amount: number | null; per: Unit | null } | null, crop: string | null, ui: UiLang = 'en') {
  if (!p?.amount || p.amount <= 0) return null;
  const unit = p.per ?? 'kg';
  const perUnit = unitKg(unit, crop);
  const per = ui === 'sw' ? `kwa ${UNIT_LABEL.sw[unit][0]}` : `per ${UNIT_LABEL.en[unit][0]}`;
  if (!perUnit) return { value: null, note: ui === 'sw' ? `KES ${p.amount} ${per}: kipimo hakijulikani, tafadhali weka bei kwa kilo.` : `KES ${p.amount} ${per}: unknown size, please enter price per kg.` };
  const value = Math.round((p.amount / perUnit) * 100) / 100;
  if (unit === 'kg') return { value, note: `KES ${value}/kg` };
  return { value, note: `KES ${p.amount} ${per} ÷ ${perUnit} kg ≈ KES ${value}/kg` };
}

const knownCrop = (id: string | null) => (id && cropPrices(id) ? id : null);
const knownCounty = (name: string | null) => (name ? findCounty(name)?.name ?? null : null);

async function callAi(path: string, body: object) {
  const response = await fetch(`${AI_SERVICE_URL()}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(Number(process.env.AI_SERVICE_TIMEOUT_MS || 25_000)),
    body: JSON.stringify({ ...body, options: { crops: crops.map(c => c.id), cropLabels: Object.fromEntries(crops.map(c => [c.id, c.label])), counties: Object.values(COUNTIES).map(c => c.name), businessTypes: BUSINESS_TYPES } })
  }).catch(err => { throw new Error(err instanceof Error && err.name === 'TimeoutError' ? 'The AI took too long. Please fill in the form.' : 'The AI service is not reachable. Please fill in the form.'); });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ? `Couldn't understand that (${data.error}). Please fill in the form.` : 'Couldn\'t understand that. Please fill in the form.');
  return data as { extraction: Record<string, any>; model: string; latencyMs: number };
}

type HarvestExtraction = { language?: string | null; transcript: string | null; crop: string | null; cropMentioned?: string | null; place: string | null; county: string | null; quantity: Quantity; harvestDate: string | null; unclear: string[] };

export function mapHarvest(x: HarvestExtraction, ui: UiLang = 'en') {
  const crop = knownCrop(x.crop);
  const county = knownCounty(x.county);
  const quantity = toKg(x.quantity, crop, ui);
  const notes = [
    ...(crop ? [`${x.cropMentioned && !cropPrices(crop)!.label.toLowerCase().includes(x.cropMentioned.toLowerCase()) ? `${x.cropMentioned} → ` : ''}${cropPrices(crop)!.label}`] : []),
    ...(x.place && county && x.place.toLowerCase() !== county.toLowerCase() ? [countyNote(x.place, county, ui)] : []),
    ...(quantity ? [quantity.note] : [])
  ];
  return {
    fields: { crop, county, harvestKg: quantity?.kg ?? null, harvestDate: x.harvestDate },
    /** The language the person spoke or typed in; the AI's advice replies in it. */
    language: spoken(x.language),
    transcript: x.transcript ? cleanText(x.transcript, 500) : null,
    notes,
    unclear: [...unsupported(crop, x.cropMentioned, ui), ...(x.unclear ?? []).map(u => cleanText(u, 160))].slice(0, 4)
  };
}

/** Tells the person when they named a crop we don't cover, instead of silently leaving it blank. */
const unsupported = (crop: string | null, mentioned: string | null | undefined, ui: UiLang) => {
  if (crop || !mentioned) return [];
  const name = cleanText(mentioned, 40);
  return [ui === 'sw' ? `“${name}” bado haipo kwenye orodha yetu ya mazao. Chagua zao lililo karibu zaidi.` : `“${name}” isn't in our crop list yet. Choose the closest crop or contact us to add it.`];
};

export async function understandHarvest(body: { text?: unknown; audioBase64?: unknown; mimeType?: unknown; uiLang?: unknown }) {
  const text = typeof body.text === 'string' ? cleanText(body.text, 1500) : undefined;
  const audioBase64 = typeof body.audioBase64 === 'string' ? body.audioBase64 : undefined;
  if (!text && !audioBase64) throw new Error('Say or type something first.');
  const ai = await callAi('/extract/harvest', { text, audioBase64, mimeType: typeof body.mimeType === 'string' ? body.mimeType : 'audio/webm' });
  return { ...mapHarvest(ai.extraction as HarvestExtraction, uiLang(body.uiLang)), model: ai.model, latencyMs: ai.latencyMs };
}

type ListingExtraction = {
  language?: string | null;
  businessName: string | null; businessType: string | null; crop: string | null; cropMentioned?: string | null; price: { amount: number | null; per: Unit | null } | null; quantity: Quantity;
  frequency: 'weekly' | 'once' | null; place: string | null; county: string | null; collectsFromFarm: boolean | null;
  neededFrom: string | null; neededUntil: string | null; description: string | null; unclear: string[];
};

export function mapListing(x: ListingExtraction, ui: UiLang = 'en') {
  const crop = knownCrop(x.crop);
  const county = knownCounty(x.county);
  const quantity = toKg(x.quantity, crop, ui);
  const price = pricePerKg(x.price, crop, ui);
  return {
    fields: {
      businessName: x.businessName ? cleanText(x.businessName, 80) : null,
      businessType: x.businessType && (BUSINESS_TYPES as readonly string[]).includes(x.businessType) ? x.businessType : null,
      crop, county, town: x.place ? cleanText(x.place, 60) : null,
      pricePerKg: price?.value ?? null, quantityKg: quantity?.kg ?? null, frequency: x.frequency,
      collectsFromFarm: x.collectsFromFarm, neededFrom: x.neededFrom, neededUntil: x.neededUntil,
      description: x.description ? cleanText(x.description, 400) : null
    },
    language: spoken(x.language),
    notes: [...(price ? [price.note] : []), ...(quantity ? [quantity.note] : []), ...(x.place && county && x.place.toLowerCase() !== county.toLowerCase() ? [countyNote(x.place, county, ui)] : [])],
    unclear: [...unsupported(crop, x.cropMentioned, ui), ...(x.unclear ?? []).map(u => cleanText(u, 160))].slice(0, 4)
  };
}

export async function understandListing(body: { text?: unknown; audioBase64?: unknown; mimeType?: unknown; uiLang?: unknown }) {
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1500) : undefined;
  const audioBase64 = typeof body.audioBase64 === 'string' ? body.audioBase64 : undefined;
  if (!text && !audioBase64) throw new Error('Say or paste a message first.');
  const ai = await callAi('/extract/listing', { text, audioBase64, mimeType: typeof body.mimeType === 'string' ? body.mimeType : 'audio/webm' });
  const extraction = ai.extraction as ListingExtraction & { transcript?: string | null };
  return { ...mapListing(extraction, uiLang(body.uiLang)), transcript: extraction.transcript ? cleanText(extraction.transcript, 500) : null, model: ai.model, latencyMs: ai.latencyMs };
}
