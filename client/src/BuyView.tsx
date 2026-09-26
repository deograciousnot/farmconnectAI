import { useEffect, useState } from 'react';
import { addDays, api, kg, type Listing, type Meta } from './api';

const empty = (meta: Meta) => ({
  businessName: '', businessType: 'reseller', description: '', crop: meta.crops[0]?.id ?? '', pricePerKg: '', quantityKg: '',
  frequency: 'weekly', neededFrom: addDays(0), neededUntil: addDays(30), county: 'Nairobi', town: '', collectsFromFarm: false, contactPhone: '', showContact: false
});

export function BuyView({ meta }: { meta: Meta }) {
  const [form, setForm] = useState(() => empty(meta));
  const [listings, setListings] = useState<Listing[]>([]);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const cropLabel = (id: string) => meta.crops.find(c => c.id === id)?.label ?? id;

  useEffect(() => { api.listings().then(r => setListings(r.listings)).catch(() => setStatus({ kind: 'error', text: 'Could not load buyer posts.' })); }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [key]: e.target instanceof HTMLInputElement && e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setStatus(null);
    try {
      const { listing } = await api.postListing({ ...form, pricePerKg: Number(form.pricePerKg), quantityKg: Number(form.quantityKg) });
      setListings([listing, ...listings]);
      setForm(empty(meta));
      setStatus({ kind: 'ok', text: 'Posted. Farmers searching for this crop will now see your demand.' });
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Could not post.' });
    } finally {
      setSaving(false);
    }
  };

  return <>
    <form className="card form" onSubmit={submit}>
      <h2>Post what you want to buy</h2>
      <p className="muted">Resellers, shops, mills and institutions: tell farmers what you need and what you pay.</p>
      <label>Business name<input value={form.businessName} onChange={set('businessName')} placeholder="e.g. Mama Njeri Fruits" required /></label>
      <div className="row">
        <label>Type<select value={form.businessType} onChange={set('businessType')}>{meta.businessTypes.map(t => <option key={t}>{t}</option>)}</select></label>
        <label>Crop<select value={form.crop} onChange={set('crop')}>{meta.crops.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      </div>
      <div className="row">
        <label>Price (KES/kg)<input type="number" inputMode="decimal" min="1" step="0.5" value={form.pricePerKg} onChange={set('pricePerKg')} required /></label>
        <label>Quantity (kg)<input type="number" inputMode="numeric" min="10" value={form.quantityKg} onChange={set('quantityKg')} required /></label>
      </div>
      <div className="row">
        <label>How often<select value={form.frequency} onChange={set('frequency')}><option value="weekly">Every week</option><option value="once">One time</option></select></label>
        <label>County<select value={form.county} onChange={set('county')}>{meta.counties.map(c => <option key={c}>{c}</option>)}</select></label>
      </div>
      <label>Town / market<input value={form.town} onChange={set('town')} placeholder="e.g. Kangemi Market" /></label>
      <div className="row">
        <label>Needed from<input type="date" value={form.neededFrom} onChange={set('neededFrom')} required /></label>
        <label>Until<input type="date" value={form.neededUntil} onChange={set('neededUntil')} required /></label>
      </div>
      <label>About your business<textarea rows={3} value={form.description} onChange={set('description')} placeholder="What quality do you need? Where do you sell?" /></label>
      <label className="check"><input type="checkbox" checked={form.collectsFromFarm} onChange={set('collectsFromFarm')} /> We can collect from the farm</label>
      <label>Phone (optional)<input type="tel" value={form.contactPhone} onChange={set('contactPhone')} placeholder="+254…" /></label>
      <label className="check"><input type="checkbox" checked={form.showContact} onChange={set('showContact')} /> Show my phone number to farmers</label>
      <button className="primary" disabled={saving}>{saving ? 'Posting…' : 'Post demand'}</button>
      {status && <p className={status.kind === 'ok' ? 'success' : 'error'} role="status">{status.text}</p>}
    </form>

    <h3 className="section">Current buyer demand <span>{listings.length}</span></h3>
    {listings.map(l => <article className="card listing" key={l.id}>
      <div className="buyer-head">
        <div><h4>{l.businessName}</h4><p className="muted">{cropLabel(l.crop)} · {l.town}, {l.county}{l.isDemo && <span className="pill demo">demo</span>}</p></div>
        <div className="net"><strong>{l.pricePerKg}</strong><span>KES/kg</span></div>
      </div>
      <p className="muted small">{kg(l.quantityKg)}{l.frequency === 'weekly' ? ' per week' : ' one time'} · {l.neededFrom} to {l.neededUntil}{l.collectsFromFarm ? ' · collects from farm' : ''}</p>
    </article>)}
  </>;
}
