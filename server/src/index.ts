import cors from 'cors';
import express from 'express';
import markets from '../../data/markets.json' with { type: 'json' };

type Market = (typeof markets)[number];
type AnalysisRequest = { crop: string; farmLocation: string; harvestKg: number; harvestDate: string };

const app = express();
const port = Number(process.env.PORT ?? 4000);
const transportRatePerKm = 0.12;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true, service: 'farmconnect-ai-api' }));
app.get('/api/markets', (_req, res) => res.json({ markets }));

app.post('/api/analyze', (req, res) => {
  const input = req.body as Partial<AnalysisRequest>;
  if (!input.crop || !input.farmLocation || !input.harvestDate || !Number.isFinite(input.harvestKg) || Number(input.harvestKg) <= 0) {
    return res.status(400).json({ error: 'Please provide crop, location, harvest quantity, and harvest date.' });
  }

  const harvestKg = Number(input.harvestKg);
  const recommendations = markets.map((market: Market) => {
    const transportCost = market.distanceKm * harvestKg * transportRatePerKm;
    const grossRevenue = market.pricePerKg * harvestKg;
    const estimatedNet = grossRevenue - transportCost;
    return { ...market, transportCost, grossRevenue, estimatedNet };
  }).sort((a, b) => b.estimatedNet - a.estimatedNet);

  const best = recommendations[0];
  return res.json({
    input: { ...input, harvestKg },
    assumptions: { transportRatePerKm, currency: 'KES', unit: 'kg' },
    recommendations,
    explanation: `${best.name} currently has the strongest estimated net return for ${input.crop}. Its higher price offsets the longer journey, but confirm transport availability and the market price before committing. These are prototype estimates, not guaranteed returns.`
  });
});

app.listen(port, () => console.log(`Farmconnect API listening on http://localhost:${port}`));
