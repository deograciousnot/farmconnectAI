// Same-origin by default: the Vite dev server proxies /api to the Express server, so the app
// works when opened from a phone on the same Wi-Fi. Set VITE_API_URL to point at a hosted API.
const API = import.meta.env.VITE_API_URL ?? '';

export type Lang = 'en' | 'sw';
export type Meta = {
  crops: { id: string; label: string }[];
  counties: string[];
  businessTypes: string[];
  assumptions: { transportKesPerKgKm: number; handlingKesPerKg: number };
  priceSource: { name: string; url: string; retrievedAt: string; method: string };
};

export type BuyerMatch = {
  totalDemandKg: number; alreadyCoveredKg: number;
  listingId: string; businessName: string; businessType: string; description: string; town: string; county: string;
  pricePerKg: number; distanceKm: number; transportPerKg: number; netPerKg: number; demandKg: number; frequency: 'once' | 'weekly';
  sellableKg: number; coveragePct: number; estimatedNet: number; collectsFromFarm: boolean;
  priceVsWholesalePct: number | null; wholesaleReference: string | null; isDemo: boolean; contactPhone?: string;
};

export type Analysis = {
  cropLabel: string;
  input: { crop: string; county: string; harvestKg: number; harvestDate: string };
  matches: BuyerMatch[];
  plan: { allocations: { listingId: string; businessName: string; town: string; kg: number; netPerKg: number; estimatedNet: number }[]; allocatedKg: number; unallocatedKg: number; estimatedNet: number };
  marketReferences: { market: string; county: string; wholesalePerKg: number; distanceKm: number; transportPerKg: number; netPerKg: number; latestDate: string }[];
  comparison: { market: string; county: string; distanceKm: number; wholesalePerKg: number; netPerKg: number; baselineNet: number; planNet: number; differenceKes: number; differencePct: number | null } | null;
  assumptions: { transportKesPerKgKm: number; handlingKesPerKg: number };
  priceSource: { name: string; url: string; retrievedAt: string };
};

export type Plan = Analysis['plan'] & { source?: 'ai' | 'rules' };

export type AiAdvice = {
  explanation: { headline: string; points: string[]; nextSteps: string[] };
  plan: Plan & { source: 'ai' | 'rules' };
  comparison: Analysis['comparison'];
  buyerNotes: { listingId: string; why: string }[];
  rulesPlanNet: number;
  provider: 'gemini' | 'fallback'; model: string | null; latencyMs: number; fallbackReason?: string; evidenceSent: unknown;
};

export type NegotiationTurn = { role: 'user' | 'assistant'; content: string };

export type RequestStatus = { id: string; listingId: string; businessName: string; kg: number; status: 'pending' | 'accepted' | 'declined'; canReply: boolean };
export type Demand = { period: string; totalKg: number; filledKg: number; acceptedKg: number; pendingKg: number; remainingKg: number };
export type ManageView = {
  listingId: string; businessName: string; crop: string; frequency: 'once' | 'weekly'; thisWeek: Demand;
  requests: { id: string; kg: number; harvestDate: string; farmerCounty: string; status: RequestStatus['status']; period: string; remainingInPeriod: number }[];
};

export type Understood<F> = { fields: F; language?: 'en' | 'sw' | 'mixed' | null; transcript?: string | null; notes: string[]; unclear: string[]; model: string; latencyMs: number };
export type HarvestFields = { crop: string | null; county: string | null; harvestKg: number | null; harvestDate: string | null };
export type ListingFields = {
  businessName: string | null; businessType: string | null; crop: string | null; county: string | null; town: string | null;
  pricePerKg: number | null; quantityKg: number | null; frequency: 'weekly' | 'once' | null; collectsFromFarm: boolean | null;
  neededFrom: string | null; neededUntil: string | null; description: string | null;
};

export type Listing = {
  id: string; businessName: string; businessType: string; description: string; crop: string; pricePerKg: number; quantityKg: number;
  frequency: 'once' | 'weekly'; neededFrom: string; neededUntil: string; county: string; town: string; collectsFromFarm: boolean;
  contactPhone?: string; showContact?: boolean; isDemo: boolean; createdAt: string;
};

/** Convert the project's Kenyan local phone format to digits suitable for a wa.me URL. */
export function whatsappPhone(phone: string): string | null {
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('00')) digits = digits.slice(2);
  else if (trimmed.startsWith('+')) { /* Keep the explicit international country code. */ }
  else if (digits.startsWith('0')) digits = `254${digits.slice(1)}`;
  else if (digits.length === 9) digits = `254${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export type CropPrices = { label: string; nationalMedianPerKg: number | null; retrievedAt: string; source: string; sourceUrl: string; markets: { market: string; county: string; wholesalePerKg: number; observations: number; latestDate: string; outlier: boolean }[] };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.');
  return data as T;
}

export const api = {
  meta: () => request<Meta>('/api/meta'),
  analyze: (body: object) => request<Analysis>('/api/analyze', { method: 'POST', body: JSON.stringify(body) }),
  explain: (body: object) => request<AiAdvice>('/api/explain', { method: 'POST', body: JSON.stringify(body) }),
  negotiate: (body: { listingId: string; crop: string; county: string; harvestKg: number; harvestDate: string; language: string; messages: NegotiationTurn[] }) =>
    request<{ reply: string; model: string | null; latencyMs: number }>('/api/negotiate', { method: 'POST', body: JSON.stringify(body) }),
  understandHarvest: (body: { text?: string; audioBase64?: string; mimeType?: string; uiLang?: string }) => request<Understood<HarvestFields>>('/api/understand/harvest', { method: 'POST', body: JSON.stringify(body) }),
  understandListing: (body: { text?: string; audioBase64?: string; mimeType?: string; uiLang?: string }) => request<Understood<ListingFields>>('/api/understand/listing', { method: 'POST', body: JSON.stringify(body) }),
  listings: () => request<{ listings: Listing[] }>('/api/listings'),
  postListing: (body: object) => request<{ listing: Listing; manageToken: string }>('/api/listings', { method: 'POST', body: JSON.stringify(body) }),
  sendRequest: (body: { listingId: string; crop: string; kg: number; harvestDate: string; county: string }) => request<{ request: { id: string } }>('/api/requests', { method: 'POST', body: JSON.stringify(body) }),
  requestStatuses: (ids: string[]) => request<{ requests: RequestStatus[] }>(`/api/requests?ids=${ids.map(encodeURIComponent).join(',')}`),
  manage: (id: string, token: string) => request<ManageView>(`/api/listings/${id}/manage`, { headers: { 'X-Manage-Token': token } }),
  setFilled: (id: string, token: string, kg: number) => request<{ ok: true }>(`/api/listings/${id}/filled`, { method: 'POST', headers: { 'X-Manage-Token': token }, body: JSON.stringify({ kg }) }),
  respond: (requestId: string, token: string, accept: boolean) => request<{ ok: true }>(`/api/requests/${requestId}/respond`, { method: 'POST', headers: { 'X-Manage-Token': token }, body: JSON.stringify({ accept }) }),
  prices: (crop: string) => request<CropPrices>(`/api/prices/${crop}`)
};

export const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;
export const kg = (n: number) => `${Math.round(n).toLocaleString('en-KE')} kg`;
export const addDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** Small localStorage helpers; the app works without storage, it just forgets between visits. */
export const stored = {
  get<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) ?? '') as T; } catch { return fallback; } },
  set(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } }
};
