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
  assumptions: { transportKesPerKgKm: number; handlingKesPerKg: number };
  ai: { explanation: { headline: string; points: string[]; nextSteps: string[] }; provider: 'ollama' | 'fallback'; model: string | null; latencyMs: number; fallbackReason?: string; evidenceSent: unknown };
  priceSource: { name: string; url: string; retrievedAt: string };
};

export type Listing = {
  id: string; businessName: string; businessType: string; description: string; crop: string; pricePerKg: number; quantityKg: number;
  frequency: 'once' | 'weekly'; neededFrom: string; neededUntil: string; county: string; town: string; collectsFromFarm: boolean;
  contactPhone?: string; isDemo: boolean; createdAt: string;
};

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
  listings: () => request<{ listings: Listing[] }>('/api/listings'),
  postListing: (body: object) => request<{ listing: Listing }>('/api/listings', { method: 'POST', body: JSON.stringify(body) }),
  prices: (crop: string) => request<CropPrices>(`/api/prices/${crop}`)
};

export const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;
export const kg = (n: number) => `${Math.round(n).toLocaleString('en-KE')} kg`;
export const addDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
