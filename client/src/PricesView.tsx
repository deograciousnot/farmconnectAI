import { useEffect, useState } from 'react';
import { api, type CropPrices, type Meta } from './api';

export function PricesView({ meta }: { meta: Meta }) {
  const [crop, setCrop] = useState(meta.crops.find(c => c.id === 'maize')?.id ?? meta.crops[0]?.id ?? '');
  const [data, setData] = useState<CropPrices | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null); setError('');
    api.prices(crop).then(setData).catch(err => setError(err.message));
  }, [crop]);

  return <>
    <section className="card form">
      <h2 className="display">Market prices</h2>
      <p className="muted">Wholesale prices reported by county market officers to KAMIS (Ministry of Agriculture).</p>
      <label>Crop<select value={crop} onChange={e => setCrop(e.target.value)}>{meta.crops.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
    </section>
    {error && <p className="error">{error}</p>}
    {data && <section className="card">
      <div className="plan-head"><span className="muted">National median</span><strong>{data.nationalMedianPerKg ?? '—'} KES/kg</strong></div>
      {data.markets.map(m => <div className={`ref${m.outlier ? ' outlier' : ''}`} key={m.market + m.county}>
        <div><b>{m.market}</b><span className="muted"> · {m.county} · {m.latestDate}</span>{m.outlier && <span className="pill warn">check</span>}</div>
        <div className="mono">{m.wholesalePerKg}</div>
      </div>)}
      <p className="muted small">Median of the last 30 days, retrieved {data.retrievedAt}. "check" marks prices far from the national median, which are often data-entry errors. Source: <a href={data.sourceUrl} target="_blank" rel="noreferrer">KAMIS</a>.</p>
    </section>}
  </>;
}
