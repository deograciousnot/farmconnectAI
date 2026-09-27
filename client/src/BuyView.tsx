import { useEffect, useState } from 'react';
import { addDays, api, kg, stored, whatsappPhone, type Listing, type ListingFields, type ManageView, type Meta, type Understood } from './api';
import { businessTypeLabel, useT } from './i18n';
import { SayIt } from './SayIt';

const empty = (meta: Meta) => ({
  businessName: '', businessType: 'reseller', description: '', crop: meta.crops[0]?.id ?? '', pricePerKg: '', quantityKg: '',
  frequency: 'weekly', neededFrom: addDays(0), neededUntil: addDays(30), county: 'Nairobi', town: '', collectsFromFarm: false, contactPhone: '', showContact: false
});

type MyListing = { id: string; token: string; name: string };
const MY_LISTINGS = 'myListings';

export function BuyView({ meta }: { meta: Meta }) {
  const t = useT();
  const [form, setForm] = useState(() => empty(meta));
  const [mode, setMode] = useState<'describe' | 'check'>('describe');
  const [heard, setHeard] = useState<Understood<ListingFields> | null>(null);
  const [mine, setMine] = useState<MyListing[]>(() => stored.get(MY_LISTINGS, []));
  const [listings, setListings] = useState<Listing[]>([]);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const cropLabel = (id: string) => meta.crops.find(c => c.id === id)?.label ?? id;

  useEffect(() => { api.listings().then(r => setListings(r.listings)).catch(() => setStatus({ kind: 'error', text: t('Could not load buyer posts.', 'Imeshindwa kupakia matangazo ya wanunuzi.') })); }, []);

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
      setStatus({ kind: 'ok', text: t('Posted. Farmers searching for this crop will now see your demand, and you can answer them below.', 'Imetangazwa. Wakulima wanaotafuta zao hili sasa wataona mahitaji yako, na unaweza kuwajibu hapa chini.') });
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : t('Could not post.', 'Imeshindwa kutangaza.') });
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
      <h3 className="section">{t('Your posts', 'Matangazo yako')} <span>{mine.length}</span></h3>
      {mine.map(m => <ManageCard key={m.id} mine={m} cropLabel={cropLabel} />)}
    </>}

    {status?.kind === 'ok' && <p className="card success" role="status">{status.text}</p>}
    {mode === 'describe' && <>
      <SayIt
        title={t('What do you want to buy?', 'Unataka kununua nini?')}
        subtitle={t('Say it, or paste your usual WhatsApp message.', 'Sema, au bandika ujumbe wako wa kawaida wa WhatsApp.')}
        voice
        placeholder={t('Paste your WhatsApp message or describe what you need', 'Bandika ujumbe wako wa WhatsApp au eleza unachohitaji')}
        example="Tunanunua nyanya kg 500 kila wiki, bei 80 kwa kilo. Tuko Kibuye Kisumu, tunakuja shambani. Kibuye Fresh Traders"
        understand={input => api.understandListing({ ...input, uiLang: t.lang })}
        onUnderstood={h => { applyUnderstood(h.fields); setHeard(h); setMode('check'); setStatus(null); }}
        onFailed={() => setMode('check')}
      />
      <button type="button" className="link" onClick={() => { setHeard(null); setMode('check'); setStatus(null); }}>{t('Or fill in the details yourself', 'Au jaza maelezo mwenyewe')}</button>
    </>}

    {mode === 'check' && <form className="card form confirm" onSubmit={submit}>
      <h2 className="display">{heard ? t('Check your post', 'Kagua tangazo lako') : t('Post what you want to buy', 'Tangaza unachotaka kununua')}</h2>
      {heard ? <div className="understood">
        {heard.transcript && <p><b>{t('Heard:', 'Nimesikia:')}</b> “{heard.transcript}”</p>}
        {heard.notes.map(n => <p key={n}>✓ {n}</p>)}
        {heard.unclear.map(u => <p key={u} className="warn-text">? {u}</p>)}
        <p className="muted small">{t(`Filled by ${heard.model}. Fix anything that's wrong, then post.`, `Imejazwa na ${heard.model}. Rekebisha kilichokosewa, kisha tangaza.`)}</p>
      </div> : <p className="muted">{t('Resellers, shops, mills and institutions: tell farmers what you need and what you pay.', 'Wachuuzi, maduka, viwanda na taasisi: waambieni wakulima mnachohitaji na bei mnayolipa.')}</p>}
      <label>{t('Business name', 'Jina la biashara')}<input value={form.businessName} onChange={set('businessName')} placeholder={t('e.g. Mama Njeri Fruits', 'mf. Mama Njeri Fruits')} required /></label>
      <div className="row">
        <label>{t('Type', 'Aina')}<select value={form.businessType} onChange={set('businessType')}>{meta.businessTypes.map(b => <option key={b} value={b}>{businessTypeLabel(b, t.lang)}</option>)}</select></label>
        <label>{t('Crop', 'Zao')}<select value={form.crop} onChange={set('crop')}>{meta.crops.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      </div>
      <div className="row">
        <label>{t('Price (KES/kg)', 'Bei (KES/kg)')}<input type="number" inputMode="decimal" min="1" step="0.5" value={form.pricePerKg} onChange={set('pricePerKg')} required /></label>
        <label>{t('Quantity (kg)', 'Kiasi (kg)')}<input type="number" inputMode="numeric" min="10" value={form.quantityKg} onChange={set('quantityKg')} required /></label>
      </div>
      <div className="row">
        <label>{t('How often', 'Mara ngapi')}<select value={form.frequency} onChange={set('frequency')}><option value="weekly">{t('Every week', 'Kila wiki')}</option><option value="once">{t('One time', 'Mara moja')}</option></select></label>
        <label>{t('County', 'Kaunti')}<select value={form.county} onChange={set('county')}>{meta.counties.map(c => <option key={c}>{c}</option>)}</select></label>
      </div>
      <label>{t('Town / market', 'Mji / soko')}<input value={form.town} onChange={set('town')} placeholder={t('e.g. Kangemi Market', 'mf. Soko la Kangemi')} /></label>
      <div className="row">
        <label>{t('Needed from', 'Inahitajika kuanzia')}<input type="date" value={form.neededFrom} onChange={set('neededFrom')} required /></label>
        <label>{t('Until', 'Hadi')}<input type="date" value={form.neededUntil} onChange={set('neededUntil')} required /></label>
      </div>
      <label>{t('About your business', 'Kuhusu biashara yako')}<textarea rows={3} value={form.description} onChange={set('description')} placeholder={t('What quality do you need? Where do you sell?', 'Unahitaji ubora gani? Unauza wapi?')} /></label>
      <label className="check"><input type="checkbox" checked={form.collectsFromFarm} onChange={set('collectsFromFarm')} /> {t('We can collect from the farm', 'Tunaweza kuchukua shambani')}</label>
      <label>{t('Phone (optional)', 'Simu (si lazima)')}<input type="tel" value={form.contactPhone} onChange={set('contactPhone')} placeholder="+254…" /></label>
      <label className="check"><input type="checkbox" checked={form.showContact} onChange={set('showContact')} /> {t('Show my phone number to farmers', 'Onyesha nambari yangu ya simu kwa wakulima')}</label>
      <button className="primary" disabled={saving}>{saving ? t('Posting…', 'Inatangaza…') : t('Post demand', 'Tangaza mahitaji')}</button>
      <button type="button" className="link" onClick={() => setMode('describe')}>{t('← Back', '← Rudi')}</button>
      {status?.kind === 'error' && <p className="error" role="alert">{status.text}</p>}
    </form>}

    <h3 className="section">{t('Current buyer demand', 'Mahitaji ya wanunuzi sasa')} <span>{listings.length}</span></h3>
    {(showAll ? listings : listings.slice(0, 3)).map(l => <article className="card listing" key={l.id}>
      <div className="buyer-head">
        <div><h4>{l.businessName}</h4><p className="muted">{cropLabel(l.crop)} · {l.town}, {l.county}{l.isDemo && <span className="pill demo">{t('demo', 'mfano')}</span>}</p></div>
        <div className="net"><strong>{l.pricePerKg}</strong><span>KES/kg</span></div>
      </div>
      <p className="muted small">{kg(l.quantityKg)}{l.frequency === 'weekly' ? t(' per week', ' kwa wiki') : t(' one time', ' mara moja')} · {l.neededFrom} {t('to', 'hadi')} {l.neededUntil}{l.collectsFromFarm ? t(' · collects from farm', ' · anachukua shambani') : ''}</p>
      {l.showContact && l.contactPhone && <div className="contact-actions">
        {whatsappPhone(l.contactPhone) && <a className="contact-action whatsapp" href={`https://wa.me/${whatsappPhone(l.contactPhone)}`} target="_blank" rel="noreferrer">{t('WhatsApp', 'WhatsApp')}</a>}
        <a className="contact-action call" href={`tel:${l.contactPhone}`}>{t('Call', 'Piga simu')}</a>
      </div>}
    </article>)}
    {listings.length > 3 && <button type="button" className="link" onClick={() => setShowAll(!showAll)}>
      {showAll ? t('Show fewer', 'Onyesha machache') : t(`Show all ${listings.length}`, `Onyesha yote ${listings.length}`)}
    </button>}
  </>;
}

/** The buyer's own post: how much demand is still open this week, and farmers waiting for an answer. */
function ManageCard({ mine, cropLabel }: { mine: MyListing; cropLabel: (id: string) => string }) {
  const t = useT();
  const [view, setView] = useState<ManageView | null>(null);
  const [filled, setFilled] = useState('');
  const [error, setError] = useState('');

  const load = () => api.manage(mine.id, mine.token).then(v => { setView(v); setError(''); }).catch(err => setError(err.message));
  useEffect(() => { load(); const timer = setInterval(load, 5000); return () => clearInterval(timer); }, [mine.id]);

  const act = (p: Promise<unknown>) => p.then(load).catch(err => setError(err instanceof Error ? err.message : t('Failed.', 'Imeshindwa.')));
  if (!view) return <article className="card listing"><h4>{mine.name}</h4>{error ? <p className="error">{error}</p> : <p className="muted small">{t('Loading…', 'Inapakia…')}</p>}</article>;

  const w = view.thisWeek;
  const pending = view.requests.filter(r => r.status === 'pending');
  return <article className="card listing manage">
    <div className="buyer-head"><div><h4>{view.businessName}</h4><p className="muted">{cropLabel(view.crop)} · {view.frequency === 'weekly' ? `${t('week', 'wiki')} ${w.period.split('-W')[1]}` : t('one-time order', 'oda ya mara moja')}</p></div>
      <div className="net"><strong>{w.remainingKg.toLocaleString()}</strong><span>{t('kg still open', 'kg bado zinahitajika')}</span></div></div>
    <div className="stack">{w.totalKg > 0 && <>
      <span className="seg s0" style={{ flex: w.filledKg }} /><span className="seg s1" style={{ flex: w.acceptedKg }} /><span className="seg rest" style={{ flex: w.remainingKg }} />
    </>}</div>
    <p className="muted small">{t(
      `Wants ${kg(w.totalKg)} · already bought ${kg(w.filledKg)} · confirmed from farmers ${kg(w.acceptedKg)}${w.pendingKg ? ` · ${kg(w.pendingKg)} waiting for you` : ''}`,
      `Unahitaji ${kg(w.totalKg)} · umeshanunua ${kg(w.filledKg)} · umethibitisha kutoka kwa wakulima ${kg(w.acceptedKg)}${w.pendingKg ? ` · ${kg(w.pendingKg)} zinakusubiri` : ''}`)}</p>
    <div className="row inline">
      <input type="number" inputMode="numeric" min="0" placeholder={t('Bought elsewhere (kg)', 'Umenunua kwingine (kg)')} value={filled} onChange={e => setFilled(e.target.value)} aria-label={t('Already bought this week in kg', 'Kiasi ulichonunua wiki hii kwa kilo')} />
      <button type="button" className="secondary" disabled={filled === ''} onClick={() => act(api.setFilled(mine.id, mine.token, Number(filled)).then(() => setFilled('')))}>{t('Update', 'Sasisha')}</button>
    </div>
    {pending.map(r => <div className="req pending" key={r.id}>
      <span>{t('Farmer in', 'Mkulima wa')} {r.farmerCounty} · <b>{kg(r.kg)}</b> · {t('ready', 'tayari')} {r.harvestDate}</span>
      <span className="req-actions">
        <button type="button" className="secondary" onClick={() => act(api.respond(r.id, mine.token, false))}>{t('Decline', 'Kataa')}</button>
        <button type="button" className="primary small-btn" disabled={r.kg > r.remainingInPeriod} onClick={() => act(api.respond(r.id, mine.token, true))}>{t('Accept', 'Kubali')}</button>
      </span>
    </div>)}
    {view.requests.filter(r => r.status !== 'pending').slice(0, 3).map(r => <div className={`req ${r.status}`} key={r.id}><span>{r.farmerCounty} · {kg(r.kg)}</span><b>{r.status === 'accepted' ? t('✓ Accepted', '✓ Umekubali') : t('✗ Declined', '✗ Umekataa')}</b></div>)}
    {error && <p className="error">{error}</p>}
  </article>;
}
