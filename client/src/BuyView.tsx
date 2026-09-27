import { useEffect, useState } from 'react';
import { addDays, api, kg, stored, type Listing, type ListingFields, type ManageView, type Meta, type Understood } from './api';
import { SayIt } from './SayIt';

const empty = (meta: Meta) => ({
  businessName: '', businessType: 'reseller', description: '', crop: meta.crops[0]?.id ?? '', pricePerKg: '', quantityKg: '',
  frequency: 'weekly', neededFrom: addDays(0), neededUntil: addDays(30), county: 'Nairobi', town: '', collectsFromFarm: false, contactPhone: '', showContact: false
});

type MyListing = { id: string; token: string; name: string };
const MY_LISTINGS = 'myListings';

export function BuyView({ meta }: { meta: Meta }) {
  const [form, setForm] = useState(() => empty(meta));
  const [mode, setMode] = useState<'describe' | 'check'>('describe');
  const [heard, setHeard] = useState<Understood<ListingFields> | null>(null);
  const [mine, setMine] = useState<MyListing[]>(() => stored.get(MY_LISTINGS, []));
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
      const { listing, manageToken } = await api.postListing({ ...form, pricePerKg: Number(form.pricePerKg), quantityKg: Number(form.quantityKg) });
      setListings([listing, ...listings]);
      const next = [{ id: listing.id, token: manageToken, name: listing.businessName }, ...mine];
      stored.set(MY_LISTINGS, next);
      setMine(next);
      setForm(empty(meta));
      setMode('describe'); setHeard(null);
      setStatus({ kind: 'ok', text: 'Posted. Farmers searching for this crop will now see your demand, and you can answer them below.' });
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Could not post.' });
    } finally {
      setSaving(false);
    }
  };

  const applyUnderstood = (x: ListingFields) => setForm(f => ({
    ...f,
    ...Object.fromEntries(Object.entries({
      businessName: x.businessName, businessType: x.businessType, crop: x.crop, county: x.county, town: x.town, description: x.description,
      pricePerKg: x.pricePerKg === null ? null : String(x.pricePerKg), quantityKg: x.quantityKg === null ? null : String(x.quantityKg),
      frequency: x.frequency, collectsFromFarm: x.collectsFromFarm, neededFrom: x.neededFrom, neededUntil: x.neededUntil
    }).filter(([, v]) => v !== null && v !== undefined))
  }));

  return <>
    {mine.length > 0 && <>
      <h3 className="section">Your posts <span>{mine.length}</span></h3>
      {mine.map(m => <ManageCard key={m.id} mine={m} cropLabel={cropLabel} />)}
    </>}

    {status?.kind === 'ok' && <p className="card success" role="status">{status.text}</p>}
    {mode === 'describe' && <>
      <SayIt
        title="What do you want to buy?"
        subtitle="Say it, or paste the message you'd send to a traders' WhatsApp group. I'll turn it into a post farmers can find."
        voice
        placeholder="Paste your WhatsApp message or describe what you need"
        example="Tunanunua nyanya kg 500 kila wiki, bei 80 kwa kilo. Tuko Kibuye Kisumu, tunakuja shambani. Kibuye Fresh Traders"
        understand={api.understandListing}
        onUnderstood={h => { applyUnderstood(h.fields); setHeard(h); setMode('check'); setStatus(null); }}
        onFailed={() => setMode('check')}
      />
      <button type="button" className="link" onClick={() => { setHeard(null); setMode('check'); setStatus(null); }}>Or fill in the details yourself</button>
    </>}

    {mode === 'check' && <form className="card form confirm" onSubmit={submit}>
      <h2 className="display">{heard ? 'Check your post' : 'Post what you want to buy'}</h2>
      {heard ? <div className="understood">
        {heard.transcript && <p><b>Heard:</b> “{heard.transcript}”</p>}
        {heard.notes.map(n => <p key={n}>✓ {n}</p>)}
        {heard.unclear.map(u => <p key={u} className="warn-text">? {u}</p>)}
        <p className="muted small">Filled by {heard.model}. Fix anything that's wrong, then post.</p>
      </div> : <p className="muted">Resellers, shops, mills and institutions: tell farmers what you need and what you pay.</p>}
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
      <button type="button" className="link" onClick={() => setMode('describe')}>← Back</button>
      {status?.kind === 'error' && <p className="error" role="alert">{status.text}</p>}
    </form>}

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

/** The buyer's own post: how much demand is still open this week, and farmers waiting for an answer. */
function ManageCard({ mine, cropLabel }: { mine: MyListing; cropLabel: (id: string) => string }) {
  const [view, setView] = useState<ManageView | null>(null);
  const [filled, setFilled] = useState('');
  const [error, setError] = useState('');

  const load = () => api.manage(mine.id, mine.token).then(v => { setView(v); setError(''); }).catch(err => setError(err.message));
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [mine.id]);

  const act = (p: Promise<unknown>) => p.then(load).catch(err => setError(err instanceof Error ? err.message : 'Failed.'));
  if (!view) return <article className="card listing"><h4>{mine.name}</h4>{error ? <p className="error">{error}</p> : <p className="muted small">Loading…</p>}</article>;

  const w = view.thisWeek;
  const pending = view.requests.filter(r => r.status === 'pending');
  return <article className="card listing manage">
    <div className="buyer-head"><div><h4>{view.businessName}</h4><p className="muted">{cropLabel(view.crop)} · {view.frequency === 'weekly' ? `week ${w.period.split('-W')[1]}` : 'one-time order'}</p></div>
      <div className="net"><strong>{w.remainingKg.toLocaleString()}</strong><span>kg still open</span></div></div>
    <div className="stack">{w.totalKg > 0 && <>
      <span className="seg s0" style={{ flex: w.filledKg }} /><span className="seg s1" style={{ flex: w.acceptedKg }} /><span className="seg rest" style={{ flex: w.remainingKg }} />
    </>}</div>
    <p className="muted small">Wants {kg(w.totalKg)} · already bought {kg(w.filledKg)} · confirmed from farmers {kg(w.acceptedKg)}{w.pendingKg ? ` · ${kg(w.pendingKg)} waiting for you` : ''}</p>
    <div className="row inline">
      <input type="number" inputMode="numeric" min="0" placeholder="Bought elsewhere (kg)" value={filled} onChange={e => setFilled(e.target.value)} aria-label="Already bought this week in kg" />
      <button type="button" className="secondary" disabled={filled === ''} onClick={() => act(api.setFilled(mine.id, mine.token, Number(filled)).then(() => setFilled('')))}>Update</button>
    </div>
    {pending.map(r => <div className="req pending" key={r.id}>
      <span>Farmer in {r.farmerCounty} · <b>{kg(r.kg)}</b> · ready {r.harvestDate}</span>
      <span className="req-actions">
        <button type="button" className="secondary" onClick={() => act(api.respond(r.id, mine.token, false))}>Decline</button>
        <button type="button" className="primary small-btn" disabled={r.kg > r.remainingInPeriod} onClick={() => act(api.respond(r.id, mine.token, true))}>Accept</button>
      </span>
    </div>)}
    {view.requests.filter(r => r.status !== 'pending').slice(0, 3).map(r => <div className={`req ${r.status}`} key={r.id}><span>{r.farmerCounty} · {kg(r.kg)}</span><b>{r.status === 'accepted' ? '✓ Accepted' : '✗ Declined'}</b></div>)}
    {error && <p className="error">{error}</p>}
  </article>;
}
