import { useEffect, useRef, useState } from 'react';
import { addDays, api, kes, kg, type AiAdvice, type Analysis, type Lang, type Meta } from './api';
import { AiCard } from './AiCard';

export type AdviceState = { status: 'loading' } | { status: 'done'; advice: AiAdvice } | { status: 'error'; message: string };

export function SellView({ meta, lang }: { meta: Meta; lang: Lang }) {
  const [form, setForm] = useState({ crop: 'watermelon', county: 'Uasin Gishu', harvestKg: '3000', harvestDate: addDays(14) });
  const [result, setResult] = useState<Analysis | null>(null);
  const [advice, setAdvice] = useState<AdviceState>({ status: 'loading' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lastRequest = useRef<object | null>(null);
  const adviceRequestId = useRef(0);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value });

  // AI advice loads separately so buyers and the split show immediately. Stale answers (from an earlier
  // search or language) are ignored.
  const loadAdvice = (body: object) => {
    const id = ++adviceRequestId.current;
    setAdvice({ status: 'loading' });
    api.explain(body)
      .then(a => id === adviceRequestId.current && setAdvice({ status: 'done', advice: a }))
      .catch(err => id === adviceRequestId.current && setAdvice({ status: 'error', message: err instanceof Error ? err.message : 'AI advice failed.' }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true); setError('');
    const body = { ...form, harvestKg: Number(form.harvestKg), language: lang };
    try {
      setResult(await api.analyze(body));
      lastRequest.current = body;
      loadAdvice(body);
      setTimeout(() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  // Switching EN/SW re-asks the AI for the current results; no need to search again.
  useEffect(() => {
    if (lastRequest.current) loadAdvice({ ...lastRequest.current, language: lang });
  }, [lang]);

  return <>
    <form className="card form" onSubmit={submit}>
      <h2>Where should I sell?</h2>
      <p className="muted">Tell us about your harvest. We compare buyers after transport costs.</p>
      <label>Crop<select value={form.crop} onChange={set('crop')}>{meta.crops.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      <label>Farm county<select value={form.county} onChange={set('county')}>{meta.counties.map(c => <option key={c}>{c}</option>)}</select></label>
      <div className="row">
        <label>Harvest (kg)<input type="number" inputMode="numeric" min="10" value={form.harvestKg} onChange={set('harvestKg')} required /></label>
        <label>Ready on<input type="date" value={form.harvestDate} onChange={set('harvestDate')} required /></label>
      </div>
      <button className="primary" disabled={loading}>{loading ? 'Finding buyers…' : 'Find buyers'}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>

    {result && <div id="results">
      <AiCard state={advice} />
      <PlanCard result={result} />

      <h3 className="section">Buyers for your {result.cropLabel.toLowerCase()} <span>{result.matches.length}</span></h3>
      {result.matches.length === 0 && <p className="card muted">No buyer has posted demand for this crop around your harvest date. See public market prices below.</p>}
      {result.matches.map((m, i) => <article className={`card buyer${i === 0 ? ' top' : ''}`} key={m.listingId}>
        <div className="buyer-head">
          <div><h4>{m.businessName}</h4><p className="muted">{m.town} · {m.distanceKm} km · {m.businessType}{m.isDemo && <span className="pill demo">demo buyer</span>}</p></div>
          <div className="net"><strong>{m.netPerKg}</strong><span>KES/kg net</span></div>
        </div>
        <p className="desc">{m.description}</p>
        <dl className="facts">
          <div><dt>Offer</dt><dd>KES {m.pricePerKg}/kg</dd></div>
          <div><dt>Transport</dt><dd>{m.collectsFromFarm ? 'Buyer collects' : `−${m.transportPerKg}/kg`}</dd></div>
          <div><dt>Wants</dt><dd>{kg(m.demandKg)}{m.frequency === 'weekly' ? '/wk' : ''}</dd></div>
          <div><dt>vs market</dt><dd className={m.priceVsWholesalePct !== null && m.priceVsWholesalePct >= 0 ? 'good' : ''}>{m.priceVsWholesalePct === null ? '—' : `${m.priceVsWholesalePct > 0 ? '+' : ''}${m.priceVsWholesalePct}%`}</dd></div>
        </dl>
        {m.contactPhone && <a className="call" href={`tel:${m.contactPhone}`}>Call {m.contactPhone}</a>}
      </article>)}

      <h3 className="section">Public wholesale markets <span>KAMIS</span></h3>
      <div className="card">
        <p className="muted small">Reference prices, not buyer offers. Median wholesale over the last 30 days, minus estimated transport.</p>
        {result.marketReferences.map(r => <div className="ref" key={r.market + r.county}><div><b>{r.market}</b><span className="muted"> · {r.county} · {r.distanceKm} km</span></div><div className="mono">{r.wholesalePerKg} → <b>{r.netPerKg}</b></div></div>)}
        <p className="muted small">Source: <a href={result.priceSource.url} target="_blank" rel="noreferrer">{result.priceSource.name}</a>, retrieved {result.priceSource.retrievedAt}.</p>
      </div>

      <details className="card how">
        <summary>How we calculated this</summary>
        <p>Net KES/kg = buyer price − transport − handling. Transport ≈ KES {result.assumptions.transportKesPerKgKm} per kg per km of estimated road distance (zero if the buyer collects). Handling ≈ KES {result.assumptions.handlingKesPerKg}/kg. Distances are estimated between county towns.</p>
        <p>The AI only explains these numbers. It receives the evidence below and its answer is rejected if it mentions figures that are not in it.</p>
        {advice.status === 'done' ? <pre>{JSON.stringify(advice.advice.evidenceSent, null, 1)}</pre> : <p className="muted small">Waiting for the AI step…</p>}
      </details>
    </div>}
  </>;
}

function PlanCard({ result }: { result: Analysis }) {
  const { plan, input, comparison } = result;
  if (!plan.allocations.length) return null;
  return <section className="card plan">
    {comparison && <div className={`gain${comparison.differenceKes > 0 ? '' : ' flat'}`}>
      {comparison.differenceKes > 0
        ? <><strong>+{kes(comparison.differenceKes)}</strong><span>{comparison.differencePct !== null && `(+${comparison.differencePct}%) `}more than selling everything at {comparison.market}, the nearest public market ({comparison.distanceKm} km)</span></>
        : <><strong>No gain</strong><span>Selling everything at {comparison.market} ({comparison.distanceKm} km) earns about the same or more: {kes(comparison.baselineNet)}</span></>}
    </div>}
    <div className="plan-head"><span className="muted">Suggested split for {kg(input.harvestKg)}</span><strong>{kes(plan.estimatedNet)}</strong></div>
    <div className="stack">{plan.allocations.map((a, i) => <span key={a.listingId} className={`seg s${i % 4}`} style={{ flex: a.kg }} />)}{plan.unallocatedKg > 0 && <span className="seg rest" style={{ flex: plan.unallocatedKg }} />}</div>
    {plan.allocations.map((a, i) => <div className="alloc" key={a.listingId}><span className={`dot s${i % 4}`} />{a.businessName}<span className="muted"> · {kg(a.kg)}</span><b>{kes(a.estimatedNet)}</b></div>)}
    {plan.unallocatedKg > 0 && <div className="alloc"><span className="dot rest" />No buyer yet<span className="muted"> · {kg(plan.unallocatedKg)}</span><b>—</b></div>}
    <p className="muted small">Estimated income after transport, if every buyer confirms.{comparison && ` Comparison uses the KAMIS wholesale price at ${comparison.market} (KES ${comparison.wholesalePerKg}/kg) minus transport. Farm-gate prices are usually lower, so the real gain may be bigger.`}</p>
  </section>;
}
