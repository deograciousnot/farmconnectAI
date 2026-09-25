import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Recommendation = { name: string; county: string; pricePerKg: number; distanceKm: number; demand: string; estimatedNet: number; transportCost: number; source: string; updatedAt: string };
type Result = { recommendations: Recommendation[]; explanation: string };

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

function App() {
  const [form, setForm] = useState({ crop: 'Maize', farmLocation: 'Uasin Gishu', harvestKg: '1000', harvestDate: '2026-10-15' });
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const analyze = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const response = await fetch(`${API}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, harvestKg: Number(form.harvestKg) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Analysis failed');
      setResult(data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not reach the API.'); }
    finally { setLoading(false); }
  };

  return <main>
    <header className="topbar"><div className="brand"><span className="brand-mark">FC</span><span>Farmconnect <b>AI</b></span></div><span className="status"><i /> Prototype data</span></header>
    <section className="intro"><p className="eyebrow">MARKET INTELLIGENCE FOR FARMERS</p><h1>Find the market that makes sense for your harvest.</h1><p className="lede">Compare potential selling points with transport costs included, then get a clear explanation of the trade-offs.</p></section>
    <section className="workspace">
      <form className="panel form-panel" onSubmit={analyze}><div className="panel-heading"><span className="step">01</span><div><h2>Tell us about your harvest</h2><p>Use your best current estimate.</p></div></div>
        <label>What are you growing?<input value={form.crop} onChange={e => setForm({ ...form, crop: e.target.value })} placeholder="e.g. Maize" /></label>
        <label>Where is your farm?<input value={form.farmLocation} onChange={e => setForm({ ...form, farmLocation: e.target.value })} placeholder="County or nearest town" /></label>
        <div className="two-col"><label>Expected harvest (kg)<input type="number" min="1" value={form.harvestKg} onChange={e => setForm({ ...form, harvestKg: e.target.value })} /></label><label>Expected harvest date<input type="date" value={form.harvestDate} onChange={e => setForm({ ...form, harvestDate: e.target.value })} /></label></div>
        <button disabled={loading}>{loading ? 'Analyzing...' : 'Analyze my options'} <span>→</span></button>{error && <p className="error">{error}</p>}
      </form>
      <section className="panel results-panel"><div className="panel-heading"><span className="step">02</span><div><h2>Potential markets</h2><p>Estimated net return after transport.</p></div></div>{result ? <><div className="recommendations">{result.recommendations.map((market, index) => <article className={index === 0 ? 'market featured' : 'market'} key={market.name}><div className="rank">{String(index + 1).padStart(2, '0')}</div><div className="market-main"><div className="market-title"><h3>{market.name}</h3>{index === 0 && <span className="tag">Best estimate</span>}</div><p>{market.county} · {market.distanceKm} km · {market.demand} demand</p><div className="bar"><span style={{ width: `${Math.max(12, Math.min(100, market.estimatedNet / result.recommendations[0].estimatedNet * 100))}%` }} /></div></div><div className="return"><strong>KES {Math.round(market.estimatedNet).toLocaleString()}</strong><span>net estimate</span></div></article>)}</div><div className="explanation"><span className="spark">✦</span><div><h3>What the numbers suggest</h3><p>{result.explanation}</p></div></div></> : <div className="empty"><div className="empty-icon">↗</div><h3>Your comparison will appear here</h3><p>Enter your harvest details to see estimated returns across nearby markets.</p></div>}</section>
    </section><footer><span>Farmconnect AI · COME BUILD WITH AI 2026</span><span>Estimates are for decision support, not guaranteed prices.</span></footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
