import { useEffect, useRef, useState } from 'react';
import { addDays, api, kes, kg, stored, type AiAdvice, type Analysis, type HarvestFields, type Lang, type Meta, type Plan, type RequestStatus, type Understood } from './api';
import { AiCard } from './AiCard';
import { FieldArt, SparkIcon } from './icons';
import { SayIt } from './SayIt';

export type AdviceState = { status: 'loading' } | { status: 'done'; advice: AiAdvice } | { status: 'error'; message: string };
type Details = { crop: string; county: string; harvestKg: string; harvestDate: string };
type Step = { name: 'describe' } | { name: 'confirm'; heard?: Understood<HarvestFields>; said?: string | null } | { name: 'results' };

const emptyDetails: Details = { crop: '', county: '', harvestKg: '', harvestDate: '' };
const complete = (d: Details) => !!(d.crop && d.county && Number(d.harvestKg) >= 10 && d.harvestDate);

/**
 * One conversation: the farmer describes the harvest in their own words, confirms what the AI understood,
 * then sees buyers, the AI's advice and split, and can ask buyers to confirm. The manual form is the fallback.
 */
export function SellView({ meta, lang }: { meta: Meta; lang: Lang }) {
  const [step, setStep] = useState<Step>({ name: 'describe' });
  const [details, setDetails] = useState<Details>(emptyDetails);
  const [result, setResult] = useState<Analysis | null>(null);
  const [advice, setAdvice] = useState<AdviceState>({ status: 'loading' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lastRequest = useRef<object | null>(null);
  const adviceRequestId = useRef(0);

  const loadAdvice = (body: object) => {
    const id = ++adviceRequestId.current;
    setAdvice({ status: 'loading' });
    api.explain(body)
      .then(a => id === adviceRequestId.current && setAdvice({ status: 'done', advice: a }))
      .catch(err => id === adviceRequestId.current && setAdvice({ status: 'error', message: err instanceof Error ? err.message : 'AI advice failed.' }));
  };

  const findBuyers = async () => {
    setLoading(true); setError('');
    const body = { ...details, harvestKg: Number(details.harvestKg), language: lang };
    try {
      setResult(await api.analyze(body));
      lastRequest.current = body;
      loadAdvice(body);
      setStep({ name: 'results' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (lastRequest.current) loadAdvice({ ...lastRequest.current, language: lang });
  }, [lang]);

  const cropLabel = (id: string) => meta.crops.find(c => c.id === id)?.label ?? id;

  if (step.name === 'describe') {
    return <>
      <section className="hero">
        <FieldArt />
        <p className="hero-kicker">Habari, mkulima</p>
        <p className="hero-line">Find the buyer that pays you most after transport.</p>
      </section>
      <SayIt
        title="Where should I sell my harvest?"
        subtitle="Tell me what you grow, where, how much and when. I'll find buyers and explain your best options."
        voice
        placeholder="e.g. I have 10 bags of beans in Webuye, ready next week"
        example="Nina magunia kumi ya maharagwe Webuye, nitauza wiki ijayo"
        understand={api.understandHarvest}
        onUnderstood={(heard, said) => {
          const f = heard.fields;
          setDetails({ crop: f.crop ?? '', county: f.county ?? '', harvestKg: f.harvestKg ? String(f.harvestKg) : '', harvestDate: f.harvestDate ?? '' });
          setStep({ name: 'confirm', heard, said });
        }}
        onFailed={() => setDetails(d => ({ ...d, harvestDate: d.harvestDate || addDays(14) }))}
      />
      <button type="button" className="link" onClick={() => { setDetails({ ...emptyDetails, harvestDate: addDays(14) }); setStep({ name: 'confirm' }); }}>
        Or fill in the details yourself
      </button>
    </>;
  }

  if (step.name === 'confirm') {
    return <ConfirmCard
      meta={meta} details={details} heard={step.heard} said={step.said} loading={loading} error={error}
      onChange={setDetails} onConfirm={findBuyers} onBack={() => setStep({ name: 'describe' })}
    />;
  }

  // Results. The AI plan replaces the rule-based one when it arrives.
  if (!result) return null;
  const aiDone = advice.status === 'done' ? advice.advice : null;
  const plan: Plan = aiDone?.plan ?? { ...result.plan, source: 'rules' };
  const comparison = aiDone ? aiDone.comparison : result.comparison;
  const notes = new Map((aiDone?.buyerNotes ?? []).map(n => [n.listingId, n.why]));

  return <div id="results">
    <section className="card summary">
      <div><b>{cropLabel(result.input.crop)}</b><span className="muted"> · {result.input.county} · {kg(result.input.harvestKg)} · {result.input.harvestDate}</span></div>
      <button type="button" className="link" onClick={() => setStep({ name: 'confirm' })}>Change</button>
    </section>

    <AiCard state={advice} />
    <PlanCard result={result} plan={plan} comparison={comparison} advice={advice} rulesPlanNet={aiDone?.rulesPlanNet ?? result.plan.estimatedNet} />

    <h3 className="section">Buyers for your crop <span>{result.matches.length}</span></h3>
    {result.matches.length === 0 && <p className="card muted">No buyer has open demand for this crop around your harvest date. See public market prices below.</p>}
    {result.matches.map((m, i) => <article className={`card buyer${i === 0 ? ' best' : ''}`} key={m.listingId}>
      <div className="buyer-head">
        <div><h4>{m.businessName}</h4><p className="muted">{m.town} · {m.distanceKm} km · {m.businessType}{m.isDemo && <span className="pill demo">demo buyer</span>}</p></div>
        <div className="net"><strong>{m.netPerKg}</strong><span>KES/kg net</span></div>
      </div>
      {notes.get(m.listingId) && <p className="ai-note"><span className="spark">✦</span> {notes.get(m.listingId)}</p>}
      <p className="desc">{m.description}</p>
      <dl className="facts">
        <div><dt>Offer</dt><dd>KES {m.pricePerKg}/kg</dd></div>
        <div><dt>Transport</dt><dd>{m.collectsFromFarm ? 'Buyer collects' : `−${m.transportPerKg}/kg`}</dd></div>
        <div><dt>Still needs</dt><dd>{kg(m.demandKg)}{m.frequency === 'weekly' ? '/wk' : ''}</dd></div>
        <div><dt>vs market</dt><dd className={m.priceVsWholesalePct !== null && m.priceVsWholesalePct >= 0 ? 'good' : ''}>{m.priceVsWholesalePct === null ? '—' : `${m.priceVsWholesalePct > 0 ? '+' : ''}${m.priceVsWholesalePct}%`}</dd></div>
      </dl>
      {m.alreadyCoveredKg > 0 && <p className="muted small">Wants {kg(m.totalDemandKg)}{m.frequency === 'weekly' ? ' a week' : ''}, already has {kg(m.alreadyCoveredKg)}.</p>}
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
      <p>Net KES/kg = buyer price − transport − handling. Transport ≈ KES {result.assumptions.transportKesPerKgKm} per kg per km of estimated road distance (zero if the buyer collects). Handling ≈ KES {result.assumptions.handlingKesPerKg}/kg. Distances are estimated between county towns. Buyers only show demand they still have open.</p>
      <p>The AI chooses the split and explains it, using the evidence below. Code checks that every buyer can take what the AI gives them and that the total fits your harvest, then calculates the money. The AI's text is rejected if it mentions figures that aren't in the evidence. If anything fails, you get the price-only split and a rule-based summary.</p>
      {advice.status === 'done' ? <pre>{JSON.stringify(advice.advice.evidenceSent, null, 1)}</pre> : <p className="muted small">Waiting for the AI step…</p>}
    </details>
  </div>;
}

function ConfirmCard({ meta, details, heard, said, loading, error, onChange, onConfirm, onBack }: {
  meta: Meta; details: Details; heard?: Understood<HarvestFields>; said?: string | null; loading: boolean; error: string;
  onChange: (d: Details) => void; onConfirm: () => void; onBack: () => void;
}) {
  const set = (key: keyof Details) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...details, [key]: e.target.value });
  const missing = (key: keyof Details) => (!details[key] ? ' missing' : '');
  const words = said ?? heard?.transcript;
  return <form className="card form confirm" onSubmit={e => { e.preventDefault(); onConfirm(); }}>
    {heard ? <div className="chat">
      {words && <p className="bubble me">{heard.transcript && !said ? '🎤 ' : ''}{words}</p>}
      <div className="bubble ai">
        <p className="bubble-title"><SparkIcon size={13} /> Here's what I understood</p>
        {heard.notes.map(n => <p key={n}>✓ {n}</p>)}
        {heard.unclear.map(u => <p key={u} className="warn-text">? {u}</p>)}
        <p className="muted small">Is this right? Fix anything below.</p>
      </div>
    </div> : <h2 className="display">Your harvest</h2>}
    <label className={missing('crop')}>Crop<select value={details.crop} onChange={set('crop')} required><option value="">Choose…</option>{meta.crops.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
    <label className={missing('county')}>Farm county<select value={details.county} onChange={set('county')} required><option value="">Choose…</option>{meta.counties.map(c => <option key={c}>{c}</option>)}</select></label>
    <div className="row">
      <label className={missing('harvestKg')}>How much (kg)<input type="number" inputMode="numeric" min="10" value={details.harvestKg} onChange={set('harvestKg')} placeholder="kg" required /></label>
      <label className={missing('harvestDate')}>Ready on<input type="date" value={details.harvestDate} onChange={set('harvestDate')} required /></label>
    </div>
    {!complete(details) && <p className="warn-text small">Fill in the highlighted details to continue.</p>}
    <button className="primary" disabled={loading || !complete(details)}>{loading ? 'Finding buyers…' : heard ? 'Yes, find buyers' : 'Find buyers'}</button>
    <button type="button" className="link" onClick={onBack}>← Describe it again</button>
    {error && <p className="error" role="alert">{error}</p>}
  </form>;
}

function PlanCard({ result, plan, comparison, advice, rulesPlanNet }: { result: Analysis; plan: Plan; comparison: Analysis['comparison']; advice: AdviceState; rulesPlanNet: number }) {
  const { input } = result;
  if (!plan.allocations.length) return null;
  const aiPending = advice.status === 'loading';
  const priceOnlyDiff = rulesPlanNet - plan.estimatedNet;
  return <section className="card plan">
    {comparison && <div className={`gain${comparison.differenceKes > 0 ? '' : ' flat'}`}>
      {comparison.differenceKes > 0
        ? <><strong>+{kes(comparison.differenceKes)}</strong><span>{comparison.differencePct !== null && `(+${comparison.differencePct}%) `}more than selling everything at {comparison.market}, the nearest public market ({comparison.distanceKm} km)</span></>
        : <><strong>No gain</strong><span>Selling everything at {comparison.market} ({comparison.distanceKm} km) earns about the same or more: {kes(comparison.baselineNet)}</span></>}
    </div>}
    <div className="plan-head">
      <span className="muted">{plan.source === 'ai' ? '✦ AI-suggested split' : aiPending ? 'Price-only split (AI reviewing…)' : 'Price-only split'} for {kg(input.harvestKg)}</span>
      <strong>{kes(plan.estimatedNet)}</strong>
    </div>
    <div className="stack">{plan.allocations.map((a, i) => <span key={a.listingId} className={`seg s${i % 4}`} style={{ flex: a.kg }} />)}{plan.unallocatedKg > 0 && <span className="seg rest" style={{ flex: plan.unallocatedKg }} />}</div>
    {plan.allocations.map((a, i) => <div className="alloc" key={a.listingId}><span className={`dot s${i % 4}`} />{a.businessName}<b>{kes(a.estimatedNet)}</b><span className="muted">{kg(a.kg)}</span></div>)}
    {plan.unallocatedKg > 0 && <div className="alloc"><span className="dot rest" />No buyer yet<b>—</b><span className="muted">{kg(plan.unallocatedKg)}</span></div>}
    {plan.source === 'ai' && priceOnlyDiff > 0 && <p className="muted small">A price-only split would earn {kes(priceOnlyDiff)} more ({kes(rulesPlanNet)}). The AI traded that for the reasons in its advice.</p>}
    <p className="muted small">Estimated income after transport, if every buyer confirms.{comparison && ` Comparison uses the KAMIS wholesale price at ${comparison.market} (KES ${comparison.wholesalePerKg}/kg) minus transport. Farm-gate prices are usually lower, so the real gain may be bigger.`}</p>
    {!aiPending && <ConfirmWithBuyers plan={plan} input={input} />}
  </section>;
}

/** "Should I ask these buyers to confirm they still need it?" Sends requests and shows their answers live. */
function ConfirmWithBuyers({ plan, input }: { plan: Plan; input: Analysis['input'] }) {
  const key = `requests:${input.crop}:${input.county}:${input.harvestDate}`;
  const [ids, setIds] = useState<string[]>(() => stored.get(key, []));
  const [statuses, setStatuses] = useState<RequestStatus[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ids.length) return;
    const poll = () => api.requestStatuses(ids).then(r => setStatuses(r.requests)).catch(() => undefined);
    poll();
    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, [ids.join(',')]);

  const send = async () => {
    setSending(true); setError('');
    const sent: string[] = [];
    const failed: string[] = [];
    for (const a of plan.allocations) {
      try { sent.push((await api.sendRequest({ listingId: a.listingId, crop: input.crop, kg: a.kg, harvestDate: input.harvestDate, county: input.county })).request.id); }
      catch (err) { failed.push(`${a.businessName}: ${err instanceof Error ? err.message : 'failed'}`); }
    }
    stored.set(key, sent);
    setIds(sent);
    if (failed.length) setError(failed.join(' '));
    setSending(false);
  };

  if (!ids.length) {
    return <div className="ask">
      <p><b>Ask {plan.allocations.length === 1 ? 'this buyer' : 'these buyers'} to confirm they still need it?</b></p>
      <button type="button" className="primary" onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Yes, ask them'}</button>
      {error && <p className="error">{error}</p>}
    </div>;
  }
  const label = (s: RequestStatus) => s.status === 'accepted' ? '✓ Confirmed' : s.status === 'declined' ? '✗ Declined' : s.canReply ? '⏳ Waiting' : 'Demo buyer (can\'t reply)';
  return <div className="ask">
    <p><b>Buyer confirmations</b></p>
    {statuses.map(s => <div className={`req ${s.status}`} key={s.id}><span>{s.businessName} · {kg(s.kg)}</span><b>{label(s)}</b></div>)}
    {error && <p className="error">{error}</p>}
    <p className="muted small">Updates automatically. Declined? Search again: that buyer's demand is updated.</p>
  </div>;
}
