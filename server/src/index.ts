import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { aiStatus, buildEvidence, explain } from './ai.js';
import { BUSINESS_TYPES, addListing, cropPrices, crops, listListings, prices, publicListing } from './data.js';
import { COUNTIES } from './geo.js';
import { ASSUMPTIONS, analyze, validateInput } from './matching.js';

const ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json({ limit: '20kb' }));

app.get('/health', async (_req, res) => res.json({ ok: true, service: 'farmconnect-ai-api', ai: await aiStatus() }));

app.get('/api/meta', (_req, res) => res.json({
  crops,
  counties: Object.values(COUNTIES).map(c => c.name).sort(),
  businessTypes: BUSINESS_TYPES,
  assumptions: ASSUMPTIONS,
  priceSource: { name: prices.source, url: prices.sourceUrl, retrievedAt: prices.retrievedAt, method: prices.method }
}));

app.get('/api/prices/:crop', (req, res) => {
  const data = cropPrices(req.params.crop);
  if (!data) return res.status(404).json({ error: 'Unknown crop.' });
  return res.json({ ...data, source: prices.source, sourceUrl: prices.sourceUrl, retrievedAt: prices.retrievedAt });
});

app.get('/api/listings', (req, res) => res.json({ listings: listListings(typeof req.query.crop === 'string' ? req.query.crop : undefined).map(publicListing) }));

app.post('/api/listings', (req, res) => {
  const result = addListing(req.body ?? {});
  if ('errors' in result) return res.status(400).json({ error: result.errors.join(' '), errors: result.errors });
  return res.status(201).json({ listing: publicListing(result.listing) });
});

// Deterministic results return immediately; the client then asks /api/explain for the AI advice,
// so farmers see buyers and the split without waiting for the model.
app.post('/api/analyze', (req, res) => {
  const validated = validateInput(req.body ?? {});
  if ('error' in validated) return res.status(400).json({ error: validated.error });
  return res.json({ ...analyze(validated.input), priceSource: { name: prices.source, url: prices.sourceUrl, retrievedAt: prices.retrievedAt } });
});

// Recomputes the analysis from the same input rather than trusting evidence sent by the client.
app.post('/api/explain', async (req, res) => {
  const validated = validateInput(req.body ?? {});
  if ('error' in validated) return res.status(400).json({ error: validated.error });
  const analysis = analyze(validated.input);
  return res.json({ ...(await explain(analysis)), evidenceSent: buildEvidence(analysis) });
});

app.listen(port, () => console.log(`Farmconnect API listening on http://localhost:${port}`));
