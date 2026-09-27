// Pulls recent wholesale prices from KAMIS (Kenya Agricultural Market Information System,
// Ministry of Agriculture) and writes data/market-prices.json.
// Run: npm run seed:prices --workspace server
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Food crops reported by KAMIS. Labels include common Kiswahili names so the AI can map what farmers say.
// grain = dry cereals and pulses, traded in standard 90 kg bags.
type Category = 'grain' | 'produce';
const CROPS: { id: string; label: string; kamisId: number; category: Category }[] = [
  // Cereals
  { id: 'maize', label: 'Dry maize (mahindi)', kamisId: 1, category: 'grain' },
  { id: 'green-maize', label: 'Green maize (mahindi mabichi)', kamisId: 149, category: 'produce' },
  { id: 'sorghum-red', label: 'Red sorghum (mtama)', kamisId: 2, category: 'grain' },
  { id: 'sorghum-white', label: 'White sorghum (mtama)', kamisId: 56, category: 'grain' },
  { id: 'finger-millet', label: 'Finger millet (wimbi)', kamisId: 54, category: 'grain' },
  { id: 'wheat', label: 'Wheat (ngano)', kamisId: 3, category: 'grain' },
  { id: 'rice', label: 'Rice (mchele)', kamisId: 4, category: 'grain' },
  // Pulses and nuts
  { id: 'beans-rosecoco', label: 'Beans, Rosecoco (maharagwe)', kamisId: 64, category: 'grain' },
  { id: 'beans-wairimu', label: 'Beans, red haricot / Wairimu (maharagwe)', kamisId: 29, category: 'grain' },
  { id: 'beans-mwitemania', label: 'Beans, Mwitemania (maharagwe)', kamisId: 65, category: 'grain' },
  { id: 'beans-canadian', label: 'Beans, Canadian wonder (maharagwe)', kamisId: 67, category: 'grain' },
  { id: 'beans-yellow', label: 'Beans, yellow (maharagwe)', kamisId: 269, category: 'grain' },
  { id: 'beans-mixed', label: 'Beans, mixed (maharagwe)', kamisId: 246, category: 'grain' },
  { id: 'green-grams', label: 'Green grams (ndengu / pojo)', kamisId: 10, category: 'grain' },
  { id: 'cowpeas', label: 'Cowpeas (kunde)', kamisId: 189, category: 'grain' },
  { id: 'pigeon-peas', label: 'Pigeon peas (mbaazi)', kamisId: 188, category: 'grain' },
  { id: 'njahi', label: 'Dolichos lablab (njahi)', kamisId: 50, category: 'grain' },
  { id: 'dry-peas', label: 'Dry peas (njegere)', kamisId: 245, category: 'grain' },
  { id: 'groundnuts', label: 'Groundnuts (karanga)', kamisId: 12, category: 'grain' },
  { id: 'sunflower', label: 'Sunflower seeds (alizeti)', kamisId: 239, category: 'grain' },
  // Roots and tubers
  { id: 'irish-potato', label: 'Irish potato, white (viazi)', kamisId: 163, category: 'produce' },
  { id: 'irish-potato-red', label: 'Irish potato, red (viazi)', kamisId: 57, category: 'produce' },
  { id: 'sweet-potato', label: 'Sweet potatoes (viazi vitamu)', kamisId: 59, category: 'produce' },
  { id: 'cassava', label: 'Cassava, fresh (mihogo)', kamisId: 162, category: 'produce' },
  { id: 'arrow-root', label: 'Arrow root (nduma)', kamisId: 143, category: 'produce' },
  { id: 'yam', label: 'Yam (viazi vikuu)', kamisId: 131, category: 'produce' },
  // Vegetables
  { id: 'tomato', label: 'Tomatoes (nyanya)', kamisId: 61, category: 'produce' },
  { id: 'cabbage', label: 'Cabbages (kabichi)', kamisId: 58, category: 'produce' },
  { id: 'kales', label: 'Kales (sukuma wiki)', kamisId: 154, category: 'produce' },
  { id: 'spinach', label: 'Spinach (spinachi)', kamisId: 161, category: 'produce' },
  { id: 'managu', label: 'Black nightshade (managu)', kamisId: 121, category: 'produce' },
  { id: 'amaranth', label: 'Amaranth (terere)', kamisId: 123, category: 'produce' },
  { id: 'cowpea-leaves', label: 'Cowpea leaves (kunde)', kamisId: 230, category: 'produce' },
  { id: 'dry-onion', label: 'Dry onions (vitunguu)', kamisId: 158, category: 'produce' },
  { id: 'spring-onion', label: 'Spring onions (vitunguu majani)', kamisId: 159, category: 'produce' },
  { id: 'carrot', label: 'Carrots (karoti)', kamisId: 60, category: 'produce' },
  { id: 'capsicum', label: 'Capsicum / pilipili hoho', kamisId: 172, category: 'produce' },
  { id: 'chillies', label: 'Chillies (pilipili)', kamisId: 165, category: 'produce' },
  { id: 'french-beans', label: 'French beans', kamisId: 177, category: 'produce' },
  { id: 'fresh-peas', label: 'Fresh peas (njegere)', kamisId: 160, category: 'produce' },
  { id: 'cucumber', label: 'Cucumber (tango)', kamisId: 173, category: 'produce' },
  { id: 'eggplant', label: 'Eggplant / brinjal (biringanya)', kamisId: 174, category: 'produce' },
  { id: 'cauliflower', label: 'Cauliflower', kamisId: 175, category: 'produce' },
  { id: 'broccoli', label: 'Broccoli', kamisId: 258, category: 'produce' },
  { id: 'okra', label: 'Okra (bamia)', kamisId: 272, category: 'produce' },
  { id: 'pumpkin', label: 'Pumpkin (malenge)', kamisId: 170, category: 'produce' },
  { id: 'butternut', label: 'Butternut', kamisId: 171, category: 'produce' },
  { id: 'garlic', label: 'Garlic (kitunguu saumu)', kamisId: 180, category: 'produce' },
  { id: 'ginger', label: 'Ginger (tangawizi)', kamisId: 178, category: 'produce' },
  // Fruit
  { id: 'watermelon', label: 'Watermelon (tikiti maji)', kamisId: 150, category: 'produce' },
  { id: 'avocado', label: 'Avocado (parachichi)', kamisId: 142, category: 'produce' },
  { id: 'banana', label: 'Bananas, ripening (ndizi)', kamisId: 226, category: 'produce' },
  { id: 'banana-cooking', label: 'Bananas, cooking (ndizi)', kamisId: 255, category: 'produce' },
  { id: 'mango', label: 'Mangoes (maembe)', kamisId: 147, category: 'produce' },
  { id: 'pineapple', label: 'Pineapples (nanasi)', kamisId: 151, category: 'produce' },
  { id: 'pawpaw', label: 'Pawpaw (papai)', kamisId: 152, category: 'produce' },
  { id: 'passion-fruit', label: 'Passion fruit', kamisId: 125, category: 'produce' },
  { id: 'orange', label: 'Oranges (machungwa)', kamisId: 127, category: 'produce' },
  { id: 'tangerine', label: 'Tangerines (sandara)', kamisId: 262, category: 'produce' },
  { id: 'lemon', label: 'Lemons (malimau)', kamisId: 145, category: 'produce' },
  { id: 'tree-tomato', label: 'Tree tomato', kamisId: 128, category: 'produce' },
  { id: 'macadamia', label: 'Macadamia nuts', kamisId: 228, category: 'produce' },
  { id: 'cashew', label: 'Cashew nuts (korosho)', kamisId: 229, category: 'produce' }
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
  crops.push({ id: crop.id, label: crop.label, category: crop.category, kamisProductId: crop.kamisId, nationalMedianPerKg, markets });
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
