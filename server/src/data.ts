import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { findCounty } from './geo.js';

const DATA_DIR = fileURLToPath(new URL('../../data/', import.meta.url));
const RUNTIME_FILE = `${DATA_DIR}runtime/listings.json`;

export type MarketPrice = { market: string; county: string; wholesalePerKg: number; observations: number; latestDate: string; outlier: boolean };
export type CropPrices = { id: string; label: string; kamisProductId: number; nationalMedianPerKg: number | null; markets: MarketPrice[] };
export type PriceData = { source: string; sourceUrl: string; retrievedAt: string; method: string; crops: CropPrices[] };

export const BUSINESS_TYPES = ['reseller', 'wholesaler', 'retailer', 'processor', 'institution', 'exporter'] as const;

export type Listing = {
  id: string;
  businessName: string;
  businessType: (typeof BUSINESS_TYPES)[number];
  description: string;
  crop: string;
  pricePerKg: number;
  quantityKg: number;
  frequency: 'once' | 'weekly';
  neededFrom: string;
  neededUntil: string;
  county: string;
  town: string;
  collectsFromFarm: boolean;
  contactPhone?: string;
  showContact: boolean;
  isDemo: boolean;
  createdAt: string;
};

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8'));

export const prices = readJson<PriceData>(`${DATA_DIR}market-prices.json`);
const seedListings = readJson<Listing[]>(`${DATA_DIR}buyers.seed.json`);
// Tests (node --test sets NODE_TEST_CONTEXT) run against seed data only, never against listings posted while demoing.
const postedListings: Listing[] = !process.env.NODE_TEST_CONTEXT && existsSync(RUNTIME_FILE) ? readJson<Listing[]>(RUNTIME_FILE) : [];

export const crops = prices.crops.map(({ id, label }) => ({ id, label }));
export const cropPrices = (cropId: string) => prices.crops.find(c => c.id === cropId);

export function listListings(crop?: string) {
  const all = [...postedListings, ...seedListings];
  return crop ? all.filter(l => l.crop === crop) : all;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Buyer text comes from an open form and some of it reaches the AI prompt, so treat it as untrusted.
const INSTRUCTION_LIKE = /\b(ignore|disregard|forget)\b.{0,40}\b(instructions?|rules?|prompt|above|previous|other)\b|\bsystem prompt\b|\byou (must|should) (recommend|choose|pick|rank)\b|\brecommend (me|us|this buyer)\b|\bas an ai\b/i;

/** Collapses whitespace and strips control characters and markup/JSON punctuation. */
export const cleanText = (value: string, max: number) =>
  value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/[<>{}[\]`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Text safe to hand to the model as a label: cleaned, and blanked if it reads like an instruction. */
export const promptSafe = (value: string, max = 60) => {
  const cleaned = cleanText(value, max);
  return INSTRUCTION_LIKE.test(cleaned) ? '[text removed]' : cleaned;
};

/** Validates a buyer post. Returns the saved listing or a list of human-readable problems. */
export function addListing(body: Record<string, unknown>): { listing: Listing } | { errors: string[] } {
  const str = (k: string, max = 120) => (typeof body[k] === 'string' ? cleanText(body[k] as string, max) : '');
  const num = (k: string) => Number(body[k]);
  const errors: string[] = [];

  const draft = {
    businessName: str('businessName', 80),
    businessType: str('businessType') as Listing['businessType'],
    description: str('description', 400),
    crop: str('crop'),
    pricePerKg: num('pricePerKg'),
    quantityKg: num('quantityKg'),
    frequency: (str('frequency') === 'weekly' ? 'weekly' : 'once') as Listing['frequency'],
    neededFrom: str('neededFrom'),
    neededUntil: str('neededUntil'),
    county: str('county'),
    town: str('town', 60),
    collectsFromFarm: body.collectsFromFarm === true,
    contactPhone: str('contactPhone', 20) || undefined,
    showContact: body.showContact === true
  };

  if (draft.businessName.length < 3) errors.push('Business name is required.');
  if ([draft.businessName, draft.town, draft.description].some(t => INSTRUCTION_LIKE.test(t))) errors.push('Please describe your business only. Text that gives instructions is not allowed.');
  if (!BUSINESS_TYPES.includes(draft.businessType)) errors.push('Choose a business type.');
  if (!cropPrices(draft.crop)) errors.push('Choose a supported crop.');
  if (!(draft.pricePerKg > 0 && draft.pricePerKg < 5000)) errors.push('Price per kg must be between 1 and 5,000 KES.');
  if (!(draft.quantityKg >= 10 && draft.quantityKg <= 1_000_000)) errors.push('Quantity must be between 10 and 1,000,000 kg.');
  if (!DATE.test(draft.neededFrom) || !DATE.test(draft.neededUntil) || draft.neededUntil < draft.neededFrom) errors.push('Provide a valid date range.');
  if (!findCounty(draft.county)) errors.push('Choose a county.');
  if (draft.contactPhone && !/^\+?[\d\s]{9,15}$/.test(draft.contactPhone)) errors.push('Phone number looks invalid.');
  if (errors.length) return { errors };

  const listing: Listing = { ...draft, county: findCounty(draft.county)!.name, town: draft.town || findCounty(draft.county)!.town, id: randomUUID(), isDemo: false, createdAt: new Date().toISOString() };
  postedListings.unshift(listing);
  if (!process.env.NODE_TEST_CONTEXT) {
    mkdirSync(`${DATA_DIR}runtime`, { recursive: true });
    writeFileSync(RUNTIME_FILE, JSON.stringify(postedListings, null, 1));
  }
  return { listing };
}

/** Strips contact details the buyer did not consent to share. */
export const publicListing = ({ contactPhone, ...rest }: Listing) => (rest.showContact ? { ...rest, contactPhone } : rest);
