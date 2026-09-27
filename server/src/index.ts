import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { aiStatus, buildEvidence, explain, negotiate as negotiateWithAi } from './ai.js';
import { BUSINESS_TYPES, addListing, cropPrices, crops, listListings, prices, publicListing } from './data.js';
import { createRequest, manageView, requestStatuses, respond, setFilled } from './demand.js';
import { COUNTIES } from './geo.js';
import { ASSUMPTIONS, analyze, validateInput } from './matching.js';
import { understandHarvest, understandListing } from './understand.js';

const ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
// Voice notes are sent as base64; only that route accepts large bodies.
app.use(['/api/understand/harvest', '/api/understand/listing'], express.json({ limit: '4mb' }));
app.use('/api/negotiate', express.json({ limit: '40kb' }));
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
  // The manage token is returned once, to the buyer's device only.
  return res.status(201).json({ listing: publicListing(result.listing), manageToken: result.listing.manageToken });
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

// Negotiation chat reuses verified match and market data; only short, contact-redacted turns go to Gemini.
app.post('/api/negotiate', async (req, res) => {
  const body = req.body ?? {};
  const validated = validateInput(body);
  if ('error' in validated) return res.status(400).json({ error: validated.error });
  if (typeof body.listingId !== 'string' || !body.listingId || body.listingId.length > 100) {
    return res.status(400).json({ error: 'Choose a buyer to discuss.' });
  }
  const messages = body.messages ?? [];
  if (!Array.isArray(messages) || messages.length > 20) return res.status(400).json({ error: 'This chat is too long. Start a new negotiation chat.' });
  let totalChars = 0;
  const turns: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const message of messages) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || message.content.length > 800) {
      return res.status(400).json({ error: 'A chat message was invalid or too long.' });
    }
    totalChars += message.content.length;
    turns.push({ role: message.role, content: message.content });
  }
  if (totalChars > 8000 || (turns.length > 0 && turns.at(-1)?.role !== 'user')) {
    return res.status(400).json({ error: 'Send a short message from the farmer to continue.' });
  }
  try {
    const analysis = analyze(validated.input);
    const response = await negotiateWithAi(analysis, body.listingId, turns);
    return res.json(response);
  } catch (err) {
    return res.status(503).json({ error: err instanceof Error ? err.message : 'Negotiation AI is unavailable.' });
  }
});

// AI reads free speech or text and proposes form values. The person always confirms before anything happens.
app.post('/api/understand/harvest', async (req, res) => {
  try { return res.json(await understandHarvest(req.body ?? {})); } catch (err) { return res.status(422).json({ error: err instanceof Error ? err.message : 'Could not understand.' }); }
});

app.post('/api/understand/listing', async (req, res) => {
  try { return res.json(await understandListing(req.body ?? {})); } catch (err) { return res.status(422).json({ error: err instanceof Error ? err.message : 'Could not understand.' }); }
});

// Farmers ask buyers to confirm; buyers answer from their own device (manage token).
app.post('/api/requests', (req, res) => {
  const result = createRequest(req.body ?? {});
  return 'error' in result ? res.status(400).json(result) : res.status(201).json(result);
});

app.get('/api/requests', (req, res) => {
  const ids = typeof req.query.ids === 'string' ? req.query.ids.split(',').slice(0, 20) : [];
  return res.json({ requests: requestStatuses(ids) });
});

app.get('/api/listings/:id/manage', (req, res) => {
  const view = manageView(req.params.id, req.get('x-manage-token'));
  return view ? res.json(view) : res.status(403).json({ error: 'Not allowed.' });
});

app.post('/api/listings/:id/filled', (req, res) => {
  const result = setFilled(req.params.id, req.get('x-manage-token'), req.body?.kg);
  return 'error' in result ? res.status(400).json(result) : res.json(result);
});

app.post('/api/requests/:id/respond', (req, res) => {
  const result = respond(req.params.id, req.get('x-manage-token'), req.body?.accept === true);
  return 'error' in result ? res.status(400).json(result) : res.json(result);
});

// In production (e.g. Render) this server also serves the built app, so everything is one https origin.
const CLIENT_DIST = fileURLToPath(new URL('../../client/dist/', import.meta.url));
if (existsSync(`${CLIENT_DIST}index.html`)) {
  app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/|\/health).*/, (_req, res) => res.sendFile(`${CLIENT_DIST}index.html`));
}

app.listen(port, () => console.log(`Farmconnect API listening on http://localhost:${port}`));
