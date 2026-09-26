import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explain, fallbackExplanation } from './ai.js';
import { addListing } from './data.js';
import { analyze, validateInput, type AnalysisInput } from './matching.js';

const demo: AnalysisInput = { crop: 'watermelon', county: 'Uasin Gishu', harvestKg: 3000, harvestDate: '2026-10-11', language: 'en' };

test('demo scenario ranks buyers by net KES/kg and splits the harvest', () => {
  const a = analyze(demo);
  assert.ok(a.matches.length >= 3);
  assert.ok(a.matches.every(m => m.netPerKg > 0));
  for (let i = 1; i < a.matches.length; i++) assert.ok(a.matches[i - 1].netPerKg >= a.matches[i].netPerKg);
  assert.equal(a.plan.allocatedKg + a.plan.unallocatedKg, 3000);
  assert.equal(a.plan.unallocatedKg, 0);
  assert.ok(a.plan.allocations.length > 1, 'no single demo buyer takes 3,000 kg at the best price');
});

test('buyers who collect from the farm carry no transport cost', () => {
  const collector = analyze(demo).matches.find(m => m.collectsFromFarm);
  assert.ok(collector);
  assert.equal(collector.transportPerKg, 0);
});

test('farther buyers carry higher transport cost', () => {
  const byName = Object.fromEntries(analyze(demo).matches.map(m => [m.businessName, m]));
  assert.ok(byName['Kangemi Fruit Wholesalers'].transportPerKg > byName['Kakamega Town Fruit Wholesalers'].transportPerKg);
});

test('buyers outside the harvest date window are excluded, market references remain', () => {
  const a = analyze({ ...demo, harvestDate: '2027-06-01' });
  assert.equal(a.matches.length, 0);
  assert.equal(a.plan.allocations.length, 0);
  assert.ok(a.marketReferences.length > 0);
  assert.match(fallbackExplanation(a, 'en').headline, /No registered buyer/);
});

test('input validation rejects bad requests', () => {
  assert.ok('error' in validateInput({ crop: 'gold', county: 'Nakuru', harvestKg: 100, harvestDate: '2026-10-01' }));
  assert.ok('error' in validateInput({ crop: 'maize', county: 'Atlantis', harvestKg: 100, harvestDate: '2026-10-01' }));
  assert.ok('error' in validateInput({ crop: 'maize', county: 'Nakuru', harvestKg: -5, harvestDate: '2026-10-01' }));
  assert.ok('input' in validateInput({ crop: 'maize', county: 'uasin-gishu', harvestKg: 100, harvestDate: '2026-10-01' }));
});

test('buyer listings are validated', () => {
  const result = addListing({ businessName: 'X', crop: 'maize', pricePerKg: 0 });
  assert.ok('errors' in result && result.errors.length >= 3);
});

test('explanation falls back when the AI service is unreachable', async () => {
  process.env.AI_SERVICE_URL = 'http://127.0.0.1:9';
  const result = await explain(analyze(demo));
  assert.equal(result.provider, 'fallback');
  assert.ok(result.fallbackReason);
  assert.match(result.explanation.headline, /Lakeside Hotels Procurement/);
});
