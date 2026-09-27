import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { cropFits, findListing, saveListings, type Listing } from './data.js';
import { findCounty } from './geo.js';

// Buyer demand changes: a buyer wanting 300 kg a week may already have 200 kg lined up. This module keeps
// track of what is still open, from farmers' requests the buyer accepted and what the buyer reports.
// It's plain bookkeeping, so it's done by code; the AI only reasons with the result.

const RUNTIME_DIR = fileURLToPath(new URL('../../data/runtime/', import.meta.url));
const REQUESTS_FILE = `${RUNTIME_DIR}requests.json`;

export type MatchRequest = {
  id: string; listingId: string; crop: string; kg: number; harvestDate: string; farmerCounty: string;
  status: 'pending' | 'accepted' | 'declined'; createdAt: string; respondedAt?: string;
};

const requests: MatchRequest[] = !process.env.NODE_TEST_CONTEXT && existsSync(REQUESTS_FILE) ? JSON.parse(readFileSync(REQUESTS_FILE, 'utf8')) : [];
const saveRequests = () => {
  if (process.env.NODE_TEST_CONTEXT) return;
  mkdirSync(RUNTIME_DIR, { recursive: true });
  writeFileSync(REQUESTS_FILE, JSON.stringify(requests, null, 1));
};

/** Weekly demand is tracked per ISO week of the delivery date; one-off demand has a single period. */
export function periodKey(listing: Pick<Listing, 'frequency'>, date: string) {
  if (listing.frequency === 'once') return 'once';
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // move to Thursday, which decides the ISO year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export type DemandStatus = { period: string; totalKg: number; filledKg: number; acceptedKg: number; pendingKg: number; remainingKg: number };

export function demandFor(listing: Listing, date: string): DemandStatus {
  const period = periodKey(listing, date);
  const inPeriod = requests.filter(r => r.listingId === listing.id && periodKey(listing, r.harvestDate) === period);
  const sum = (status: MatchRequest['status']) => inPeriod.filter(r => r.status === status).reduce((s, r) => s + r.kg, 0);
  // '*' applies to every period (used by demo buyers to show partly filled demand).
  const filledKg = listing.filled?.[period] ?? listing.filled?.['*'] ?? 0;
  const acceptedKg = sum('accepted');
  return { period, totalKg: listing.quantityKg, filledKg, acceptedKg, pendingKg: sum('pending'), remainingKg: Math.max(0, listing.quantityKg - filledKg - acceptedKg) };
}

const today = () => new Date().toISOString().slice(0, 10);

const tokenMatches = (listing: Listing | undefined, token: unknown): listing is Listing => {
  if (!listing?.manageToken || typeof token !== 'string') return false;
  const a = Buffer.from(listing.manageToken), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** A farmer asks a buyer to confirm they still want this quantity. */
export function createRequest(body: Record<string, unknown>): { request: MatchRequest } | { error: string } {
  const listing = findListing(String(body.listingId ?? ''));
  const kg = Math.round(Number(body.kg));
  const harvestDate = String(body.harvestDate ?? '');
  const county = findCounty(String(body.county ?? ''));
  if (!listing) return { error: 'That buyer no longer exists.' };
  if (typeof body.crop === 'string' && !cropFits(listing.crop, body.crop)) return { error: `${listing.businessName} isn't buying that crop.` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(harvestDate)) return { error: 'Provide a valid harvest date.' };
  if (!county) return { error: 'Choose your county.' };
  const open = demandFor(listing, harvestDate).remainingKg;
  if (!(kg >= 10 && kg <= open)) return { error: open < 10 ? `${listing.businessName} has no demand left for that week.` : `${listing.businessName} can take at most ${open} kg for that week.` };
  const request: MatchRequest = { id: randomUUID(), listingId: listing.id, crop: typeof body.crop === 'string' ? body.crop : listing.crop, kg, harvestDate, farmerCounty: county.name, status: 'pending', createdAt: new Date().toISOString() };
  requests.push(request);
  saveRequests();
  return { request };
}

/** Farmers poll the status of their requests by id. Only non-sensitive fields are returned. */
export function requestStatuses(ids: string[]) {
  return requests.filter(r => ids.includes(r.id)).map(r => {
    const listing = findListing(r.listingId);
    return { id: r.id, listingId: r.listingId, businessName: listing?.businessName ?? 'Buyer', kg: r.kg, status: r.status, canReply: !!listing?.manageToken, respondedAt: r.respondedAt };
  });
}

/** The buyer's view of their own listing: demand this week, and requests waiting for an answer. */
export function manageView(listingId: string, token: unknown) {
  const listing = findListing(listingId);
  if (!tokenMatches(listing, token)) return null;
  return {
    listingId: listing.id, businessName: listing.businessName, crop: listing.crop, frequency: listing.frequency,
    thisWeek: demandFor(listing, today()),
    requests: requests.filter(r => r.listingId === listing.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20)
      .map(r => ({ ...r, period: periodKey(listing, r.harvestDate), remainingInPeriod: demandFor(listing, r.harvestDate).remainingKg }))
  };
}

export function respond(requestId: string, token: unknown, accept: boolean): { ok: true } | { error: string } {
  const request = requests.find(r => r.id === requestId);
  const listing = request && findListing(request.listingId);
  if (!request || !tokenMatches(listing, token)) return { error: 'Not allowed.' };
  if (request.status !== 'pending') return { error: 'Already answered.' };
  if (accept && request.kg > demandFor(listing, request.harvestDate).remainingKg) return { error: 'Accepting this would go over your demand for that week. Update what you still need first.' };
  request.status = accept ? 'accepted' : 'declined';
  request.respondedAt = new Date().toISOString();
  saveRequests();
  return { ok: true };
}

/** The buyer reports how much they already have this week from elsewhere (e.g. "we got 200 kg already"). */
export function setFilled(listingId: string, token: unknown, kg: unknown): { ok: true } | { error: string } {
  const listing = findListing(listingId);
  if (!tokenMatches(listing, token)) return { error: 'Not allowed.' };
  const value = Math.round(Number(kg));
  if (!(value >= 0 && value <= listing.quantityKg)) return { error: `Enter between 0 and ${listing.quantityKg} kg.` };
  listing.filled = { ...listing.filled, [periodKey(listing, today())]: value };
  saveListings();
  return { ok: true };
}

