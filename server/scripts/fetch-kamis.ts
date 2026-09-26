// Pulls recent wholesale prices from KAMIS (Kenya Agricultural Market Information System,
// Ministry of Agriculture) and writes data/market-prices.json.
// Run: npm run seed:prices --workspace server
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const CROPS = [
  { id: 'watermelon', label: 'Watermelon', kamisId: 150 },
  { id: 'maize', label: 'Dry maize', kamisId: 1 },
  { id: 'irish-potato', label: 'Irish potato (white)', kamisId: 163 },
  { id: 'tomato', label: 'Tomatoes', kamisId: 61 },
  { id: 'cabbage', label: 'Cabbages', kamisId: 58 },
  { id: 'beans-rosecoco', label: 'Beans (Rosecoco)', kamisId: 64 },
  { id: 'dry-onion', label: 'Dry onions', kamisId: 158 },
  { id: 'avocado', label: 'Avocado', kamisId: 142 },
  { id: 'kales', label: 'Kales (sukuma wiki)', kamisId: 154 },
  { id: 'banana', label: 'Bananas (ripening)', kamisId: 226 }
];
const WINDOW_DAYS = 30;
const OUTLIER_FACTOR = 2;
const OUT = fileURLToPath(new URL('../../data/market-prices.json', import.meta.url));

const text = (cell: string) => cell.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
const perKg = (value: string) => { const m = value.match(/^([\d.]+)\/Kg$/i); return m ? Number(m[1]) : null; };
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const mid = Math.floor(s.length / 2); return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2; };

async function fetchRows(kamisId: number) {
  const url = `https://kamis.kilimo.go.ke/site/market?product=${kamisId}&per_page=1500`;
  const html = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 farmconnect-ai-hackathon' }, signal: AbortSignal.timeout(90_000) })).text();
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map(row => [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => text(c[1])))
    .filter(cells => cells.length === 10)
    .map(([, , , , market, wholesale, , supply, county, date]) => ({ market, county, wholesale: perKg(wholesale), supplyKg: Number(supply) || null, date }));
}

const cutoff = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
const crops = [];
for (const crop of CROPS) {
  const rows = (await fetchRows(crop.kamisId)).filter(r => r.wholesale !== null && r.date >= cutoff);
  const byMarket = new Map<string, typeof rows>();
  for (const r of rows) byMarket.set(`${r.market}|${r.county}`, [...(byMarket.get(`${r.market}|${r.county}`) ?? []), r]);
  const markets = [...byMarket.values()].map(obs => ({
    market: obs[0].market,
    county: obs[0].county,
    wholesalePerKg: Math.round(median(obs.map(o => o.wholesale!)) * 100) / 100,
    observations: obs.length,
    latestDate: obs.map(o => o.date).sort().at(-1)
  })).sort((a, b) => b.wholesalePerKg - a.wholesalePerKg);
  const nationalMedianPerKg = rows.length ? Math.round(median(rows.map(r => r.wholesale!)) * 100) / 100 : null;
  // KAMIS has occasional unit/entry errors (e.g. KES 1/kg maize, or per-piece prices entered as per-kg). Flag rather than drop, so the data stays inspectable.
  for (const m of markets) Object.assign(m, { outlier: nationalMedianPerKg !== null && (m.wholesalePerKg < nationalMedianPerKg / OUTLIER_FACTOR || m.wholesalePerKg > nationalMedianPerKg * OUTLIER_FACTOR) });
  crops.push({ id: crop.id, label: crop.label, kamisProductId: crop.kamisId, nationalMedianPerKg, markets });
  console.log(`${crop.label}: ${rows.length} observations across ${markets.length} markets`);
}

await writeFile(OUT, JSON.stringify({
  source: 'KAMIS - Kenya Agricultural Market Information System (Ministry of Agriculture)',
  sourceUrl: 'https://kamis.kilimo.go.ke/site/market',
  retrievedAt: new Date().toISOString().slice(0, 10),
  method: `Median wholesale KES/kg per market over the ${WINDOW_DAYS} days before retrieval. Rows without a wholesale price are dropped. Markets more than ${OUTLIER_FACTOR}x above or below the national median are flagged as outliers.`,
  crops
}, null, 1) + '\n');
console.log(`Wrote ${OUT}`);
