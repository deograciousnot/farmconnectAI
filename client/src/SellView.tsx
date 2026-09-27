import { useEffect, useRef, useState } from 'react';
import { addDays, api, kes, kg, stored, whatsappPhone, type AiAdvice, type Analysis, type HarvestFields, type Meta, type Plan, type RequestStatus, type Understood } from './api';
import { AiCard } from './AiCard';
import { NegotiationChat } from './NegotiationChat';
import { businessTypeLabel, useT, type ReplyLang } from './i18n';
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
 * The AI replies in the language the farmer used (English, Kiswahili or a mix); the manual form uses the app language.
 */
export function SellView({ meta }: { meta: Meta }) {
  const t = useT();
  const [step, setStep] = useState<Step>({ name: 'describe' });
  const [details, setDetails] = useState<Details>(emptyDetails);
  const [replyLang, setReplyLang] = useState<ReplyLang | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);
  const [advice, setAdvice] = useState<AdviceState>({ status: 'loading' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const adviceRequestId = useRef(0);

  const loadAdvice = (body: object) => {
    const id = ++adviceRequestId.current;
    setAdvice({ status: 'loading' });
    api.explain(body)
      .then(a => id === adviceRequestId.current && setAdvice({ status: 'done', advice: a }))
      .catch(err => id === adviceRequestId.current && setAdvice({ status: 'error', message: err instanceof Error ? err.message : t('AI advice failed.', 'Ushauri wa AI umeshindwa.') }));
  };

  const language: ReplyLang = replyLang ?? t.lang;
  const findBuyers = async () => {
    setLoading(true); setError('');
    const body = { ...details, harvestKg: Number(details.harvestKg), language };
    try {
      setResult(await api.analyze(body));
      loadAdvice(body);
      setStep({ name: 'results' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Analysis failed.', 'Uchambuzi umeshindwa.'));
    } finally {
      setLoading(false);
    }
  };

  const cropLabel = (id: string) => meta.crops.find(c => c.id === id)?.label ?? id;

  if (step.name === 'describe') {
    return <>
      <section className="hero">
        <FieldArt />
        <p className="hero-kicker">Habari, mkulima</p>
        <p className="hero-line">{t('Find the buyer that pays you most after transport.', 'Pata mnunuzi anayekulipa zaidi baada ya usafiri.')}</p>
      </section>
      <SayIt
        title={t('Where should I sell my harvest?', 'Niuze mavuno yangu wapi?')}
        subtitle={t('Say what you grow, where, how much and when.', 'Sema unalima nini, wapi, kiasi gani na lini.')}
        voice
        placeholder={t('e.g. I have 10 bags of beans in Webuye, ready next week', 'mf. Nina magunia 10 ya maharagwe Webuye, tayari wiki ijayo')}
        example="Nina magunia kumi ya maharagwe Webuye, nitauza wiki ijayo"
        understand={input => api.understandHarvest({ ...input, uiLang: t.lang })}
        onUnderstood={(heard, said) => {
          const f = heard.fields;
          setDetails({ crop: f.crop ?? '', county: f.county ?? '', harvestKg: f.harvestKg ? String(f.harvestKg) : '', harvestDate: f.harvestDate ?? '' });
          setReplyLang(heard.language ?? null);
          setStep({ name: 'confirm', heard, said });
        }}
        onFailed={() => setDetails(d => ({ ...d, harvestDate: d.harvestDate || addDays(14) }))}
      />
      <button type="button" className="link" onClick={() => { setDetails({ ...emptyDetails, harvestDate: addDays(14) }); setReplyLang(null); setStep({ name: 'confirm' }); }}>
        {t('Or fill in the details yourself', 'Au jaza maelezo mwenyewe')}
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
      <button type="button" className="link" onClick={() => setStep({ name: 'confirm' })}>{t('Change', 'Badilisha')}</button>
    </section>

    <AiCard state={advice} replyLang={language} />
    <PlanCard result={result} plan={plan} comparison={comparison} advice={advice} rulesPlanNet={aiDone?.rulesPlanNet ?? result.plan.estimatedNet} />

    <h3 className="section">{t('Buyers for your crop', 'Wanunuzi wa zao lako')} <span>{result.matches.length}</span></h3>
    {result.matches.length === 0 && <p className="card muted">{t('No buyer has open demand for this crop around your harvest date. See public market prices below.', 'Hakuna mnunuzi anayehitaji zao hili karibu na tarehe yako ya mavuno. Angalia bei za masoko ya umma hapa chini.')}</p>}
    {result.matches.map((m, i) => <article className={`card buyer${i === 0 ? ' best' : ''}`} key={m.listingId}>
      <div className="buyer-head">
        <div><h4>{m.businessName}</h4><p className="muted">{m.town} · {m.distanceKm} km · {businessTypeLabel(m.businessType, t.lang)}{m.isDemo && <span className="pill demo">{t('demo buyer', 'mnunuzi wa mfano')}</span>}</p></div>
        <div className="net"><strong>{m.netPerKg}</strong><span>{t('KES/kg net', 'KES/kg halisi')}</span></div>
      </div>
      {notes.get(m.listingId) && <p className="ai-note"><span className="spark">✦</span> {notes.get(m.listingId)}</p>}
      <p className="buyer-line muted small">KES {m.pricePerKg}/kg · {m.collectsFromFarm ? t('collects from farm', 'anachukua shambani') : t(`transport −${m.transportPerKg}/kg`, `usafiri −${m.transportPerKg}/kg`)} · {t('needs', 'anahitaji')} {kg(m.demandKg)}{m.frequency === 'weekly' ? t('/wk', '/wiki') : ''}</p>
      {m.contactPhone && <div className="contact-actions">
        {whatsappPhone(m.contactPhone) && <a className="contact-action whatsapp" href={`https://wa.me/${whatsappPhone(m.contactPhone)}`} target="_blank" rel="noreferrer">{t('WhatsApp', 'WhatsApp')}</a>}
        <a className="contact-action call" href={`tel:${m.contactPhone}`}>{t('Call', 'Piga simu')}</a>
      </div>}
      <details className="more">
        <summary>{t('Details and negotiation help', 'Maelezo na msaada wa kujadiliana')}</summary>
      <p className="desc">{m.description}</p>
      <dl className="facts">
        <div><dt>{t('Offer', 'Bei')}</dt><dd>KES {m.pricePerKg}/kg</dd></div>
        <div><dt>{t('Transport', 'Usafiri')}</dt><dd>{m.collectsFromFarm ? t('Buyer collects', 'Anakuja kuchukua') : `−${m.transportPerKg}/kg`}</dd></div>
        <div><dt>{t('Still needs', 'Bado anahitaji')}</dt><dd>{kg(m.demandKg)}{m.frequency === 'weekly' ? t('/wk', '/wiki') : ''}</dd></div>
        <div><dt>{t('vs market', 'dhidi ya soko')}</dt><dd className={m.priceVsWholesalePct !== null && m.priceVsWholesalePct >= 0 ? 'good' : ''}>{m.priceVsWholesalePct === null ? '—' : `${m.priceVsWholesalePct > 0 ? '+' : ''}${m.priceVsWholesalePct}%`}</dd></div>
      </dl>
      {m.alreadyCoveredKg > 0 && <p className="muted small">{t(
        `Wants ${kg(m.totalDemandKg)}${m.frequency === 'weekly' ? ' a week' : ''}, already has ${kg(m.alreadyCoveredKg)}.`,
        `Anahitaji ${kg(m.totalDemandKg)}${m.frequency === 'weekly' ? ' kwa wiki' : ''}, tayari ana ${kg(m.alreadyCoveredKg)}.`)}</p>}
      <div className="negotiation">
        <p className="negotiation-title">{t('Negotiate with AI help', 'Jadiliana kwa msaada wa AI')}</p>
        <NegotiationChat input={result.input} listingId={m.listingId} replyLang={language} />
      </div>
      </details>
    </article>)}

    <details className="card fold">
      <summary>{t('Public market prices', 'Bei za masoko ya umma')} <span className="pill">KAMIS</span></summary>
      <p className="muted small">{t('Reference prices, not buyer offers. Median wholesale over the last 30 days, minus estimated transport.', 'Bei za kulinganisha, si ofa za wanunuzi. Bei ya kati ya jumla kwa siku 30 zilizopita, ukiondoa makadirio ya usafiri.')}</p>
      {result.marketReferences.map(r => <div className="ref" key={r.market + r.county}><div><b>{r.market}</b><span className="muted"> · {r.county} · {r.distanceKm} km</span></div><div className="mono">{r.wholesalePerKg} → <b>{r.netPerKg}</b></div></div>)}
      <p className="muted small">{t('Source', 'Chanzo')}: <a href={result.priceSource.url} target="_blank" rel="noreferrer">{result.priceSource.name}</a>, {t('retrieved', 'ilipatikana')} {result.priceSource.retrievedAt}.</p>
    </details>

    <details className="card how fold">
      <summary>{t('How we calculated this', 'Jinsi tulivyohesabu')}</summary>
      <p>{t(
        `Net KES/kg = buyer price − transport − handling. Transport ≈ KES ${result.assumptions.transportKesPerKgKm} per kg per km of estimated road distance (zero if the buyer collects). Handling ≈ KES ${result.assumptions.handlingKesPerKg}/kg. Distances are estimated between county towns. Buyers only show demand they still have open.`,
        `KES/kg halisi = bei ya mnunuzi − usafiri − gharama za kupakia. Usafiri ≈ KES ${result.assumptions.transportKesPerKgKm} kwa kila kilo kwa kila km ya makadirio ya barabara (sifuri ikiwa mnunuzi anakuja kuchukua). Gharama za kupakia ≈ KES ${result.assumptions.handlingKesPerKg}/kg. Umbali ni makadirio kati ya miji ya kaunti. Wanunuzi wanaonyesha tu mahitaji ambayo bado yako wazi.`)}</p>
      {comparison && <p>{t(
        `The "more than the nearest market" figure uses the KAMIS wholesale price at ${comparison.market} (KES ${comparison.wholesalePerKg}/kg) minus transport. Farm-gate prices are usually lower, so the real gain may be bigger.`,
        `Kiasi cha "zaidi ya soko lililo karibu" kinatumia bei ya jumla ya KAMIS katika ${comparison.market} (KES ${comparison.wholesalePerKg}/kg) ukiondoa usafiri. Bei za shambani huwa chini zaidi, kwa hivyo faida halisi inaweza kuwa kubwa zaidi.`)}</p>}
      <p>{t(
        'The AI chooses the split and explains it, using the evidence below. Code checks that every buyer can take what the AI gives them and that the total fits your harvest, then calculates the money. The AI\'s text is rejected if it mentions figures that aren\'t in the evidence. If anything fails, you get the price-only split and a rule-based summary.',
        'AI inachagua mgawanyo na kuueleza, ikitumia ushahidi ulio hapa chini. Programu inakagua kwamba kila mnunuzi anaweza kuchukua kiasi alichopewa na AI na kwamba jumla inatosha mavuno yako, kisha inahesabu pesa. Maandishi ya AI yanakataliwa ikiwa yanataja takwimu ambazo haziko kwenye ushahidi. Chochote kikishindikana, unapata mgawanyo kwa bei pekee na muhtasari wa kawaida.')}</p>
      {advice.status === 'done' ? <pre>{JSON.stringify(advice.advice.evidenceSent, null, 1)}</pre> : <p className="muted small">{t('Waiting for the AI step…', 'Tunasubiri hatua ya AI…')}</p>}
    </details>
  </div>;
}

function ConfirmCard({ meta, details, heard, said, loading, error, onChange, onConfirm, onBack }: {
  meta: Meta; details: Details; heard?: Understood<HarvestFields>; said?: string | null; loading: boolean; error: string;
  onChange: (d: Details) => void; onConfirm: () => void; onBack: () => void;
}) {
  const t = useT();
  const set = (key: keyof Details) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...details, [key]: e.target.value });
  const missing = (key: keyof Details) => (!details[key] ? ' missing' : '');
  const words = said ?? heard?.transcript;
  return <form className="card form confirm" onSubmit={e => { e.preventDefault(); onConfirm(); }}>
    {heard ? <div className="chat">
      {words && <p className="bubble me">{heard.transcript && !said ? '🎤 ' : ''}{words}</p>}
      <div className="bubble ai">
        <p className="bubble-title"><SparkIcon size={13} /> {t('Here\'s what I understood', 'Hivi ndivyo nilivyoelewa')}</p>
        {heard.notes.map(n => <p key={n}>✓ {n}</p>)}
        {heard.unclear.map(u => <p key={u} className="warn-text">? {u}</p>)}
        <p className="muted small">{t('Is this right? Fix anything below.', 'Je, ni sahihi? Rekebisha chochote hapa chini.')}</p>
      </div>
    </div> : <h2 className="display">{t('Your harvest', 'Mavuno yako')}</h2>}
    <label className={missing('crop')}>{t('Crop', 'Zao')}<select value={details.crop} onChange={set('crop')} required><option value="">{t('Choose…', 'Chagua…')}</option>{meta.crops.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
    <label className={missing('county')}>{t('Farm county', 'Kaunti ya shamba')}<select value={details.county} onChange={set('county')} required><option value="">{t('Choose…', 'Chagua…')}</option>{meta.counties.map(c => <option key={c}>{c}</option>)}</select></label>
    <div className="row">
      <label className={missing('harvestKg')}>{t('How much (kg)', 'Kiasi (kg)')}<input type="number" inputMode="numeric" min="10" value={details.harvestKg} onChange={set('harvestKg')} placeholder="kg" required /></label>
      <label className={missing('harvestDate')}>{t('Ready on', 'Tayari tarehe')}<input type="date" value={details.harvestDate} onChange={set('harvestDate')} required /></label>
    </div>
    {!complete(details) && <p className="warn-text small">{t('Fill in the highlighted details to continue.', 'Jaza maelezo yaliyowekwa alama ili kuendelea.')}</p>}
    <button className="primary" disabled={loading || !complete(details)}>{loading ? t('Finding buyers…', 'Tunatafuta wanunuzi…') : heard ? t('Yes, find buyers', 'Ndiyo, tafuta wanunuzi') : t('Find buyers', 'Tafuta wanunuzi')}</button>
    <button type="button" className="link" onClick={onBack}>{t('← Describe it again', '← Eleza tena')}</button>
    {error && <p className="error" role="alert">{error}</p>}
  </form>;
}

function PlanCard({ result, plan, comparison, advice, rulesPlanNet }: { result: Analysis; plan: Plan; comparison: Analysis['comparison']; advice: AdviceState; rulesPlanNet: number }) {
  const t = useT();
  const { input } = result;
  if (!plan.allocations.length) return null;
  const aiPending = advice.status === 'loading';
  const priceOnlyDiff = rulesPlanNet - plan.estimatedNet;
  const source = plan.source === 'ai' ? t('✦ AI-suggested split', '✦ Mgawanyo uliopendekezwa na AI')
    : aiPending ? t('Price-only split (AI reviewing…)', 'Mgawanyo kwa bei pekee (AI inakagua…)') : t('Price-only split', 'Mgawanyo kwa bei pekee');
  return <section className="card plan">
    {comparison && <div className={`gain${comparison.differenceKes > 0 ? '' : ' flat'}`}>
      {comparison.differenceKes > 0
        ? <><strong>+{kes(comparison.differenceKes)}</strong><span>{t(
          `more than selling it all at the nearest market (${comparison.market})`,
          `zaidi ya kuuza yote katika soko lililo karibu (${comparison.market})`)}</span></>
        : <><strong>{t('No gain', 'Hakuna faida ya ziada')}</strong><span>{t(
          `Selling everything at ${comparison.market} (${comparison.distanceKm} km) earns about the same or more: ${kes(comparison.baselineNet)}`,
          `Kuuza yote katika ${comparison.market} (km ${comparison.distanceKm}) kunaleta kiasi sawa au zaidi: ${kes(comparison.baselineNet)}`)}</span></>}
    </div>}
    <div className="plan-head">
      <span className="muted">{source} · {kg(input.harvestKg)}</span>
      <strong>{kes(plan.estimatedNet)}</strong>
    </div>
    <div className="stack">{plan.allocations.map((a, i) => <span key={a.listingId} className={`seg s${i % 4}`} style={{ flex: a.kg }} />)}{plan.unallocatedKg > 0 && <span className="seg rest" style={{ flex: plan.unallocatedKg }} />}</div>
    {plan.allocations.map((a, i) => <div className="alloc" key={a.listingId}><span className={`dot s${i % 4}`} />{a.businessName}<b>{kes(a.estimatedNet)}</b><span className="muted">{kg(a.kg)}</span></div>)}
    {plan.unallocatedKg > 0 && <div className="alloc"><span className="dot rest" />{t('No buyer yet', 'Bado hakuna mnunuzi')}<b>—</b><span className="muted">{kg(plan.unallocatedKg)}</span></div>}
    {plan.source === 'ai' && priceOnlyDiff > 0 && <p className="muted small">{t(
      `A price-only split would earn ${kes(priceOnlyDiff)} more (${kes(rulesPlanNet)}). The AI traded that for the reasons in its advice.`,
      `Mgawanyo kwa bei pekee ungeleta ${kes(priceOnlyDiff)} zaidi (${kes(rulesPlanNet)}). AI iliacha hiyo kwa sababu ilizoeleza kwenye ushauri wake.`)}</p>}
    <p className="muted small">{t('Estimated income after transport, if every buyer confirms.', 'Makadirio ya mapato baada ya usafiri, ikiwa kila mnunuzi atathibitisha.')}</p>
    {!aiPending && <ConfirmWithBuyers plan={plan} input={input} />}
  </section>;
}

/** "Should I ask these buyers to confirm they still need it?" Sends requests and shows their answers live. */
function ConfirmWithBuyers({ plan, input }: { plan: Plan; input: Analysis['input'] }) {
  const t = useT();
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
      catch (err) { failed.push(`${a.businessName}: ${err instanceof Error ? err.message : t('failed', 'imeshindwa')}`); }
    }
    stored.set(key, sent);
    setIds(sent);
    if (failed.length) setError(failed.join(' '));
    setSending(false);
  };

  if (!ids.length) {
    const one = plan.allocations.length === 1;
    return <div className="ask">
      <p><b>{one ? t('Ask this buyer to confirm they still need it?', 'Nimuulize mnunuzi huyu kuthibitisha kama bado anahitaji?')
        : t('Ask these buyers to confirm they still need it?', 'Niwaulize wanunuzi hawa kuthibitisha kama bado wanahitaji?')}</b></p>
      <button type="button" className="primary" onClick={send} disabled={sending}>{sending ? t('Sending…', 'Inatuma…') : t('Yes, ask them', 'Ndiyo, waulize')}</button>
      {error && <p className="error">{error}</p>}
    </div>;
  }
  const label = (s: RequestStatus) => s.status === 'accepted' ? t('✓ Confirmed', '✓ Amethibitisha')
    : s.status === 'declined' ? t('✗ Declined', '✗ Amekataa')
    : s.canReply ? t('⏳ Waiting', '⏳ Tunasubiri') : t('Demo buyer (can\'t reply)', 'Mnunuzi wa mfano (hawezi kujibu)');
  return <div className="ask">
    <p><b>{t('Buyer confirmations', 'Uthibitisho wa wanunuzi')}</b></p>
    {statuses.map(s => <div className={`req ${s.status}`} key={s.id}><span>{s.businessName} · {kg(s.kg)}</span><b>{label(s)}</b></div>)}
    {error && <p className="error">{error}</p>}
    <p className="muted small">{t('Updates automatically. Declined? Search again: that buyer\'s demand is updated.', 'Inasasishwa yenyewe. Amekataa? Tafuta tena: mahitaji ya mnunuzi huyo yamesasishwa.')}</p>
  </div>;
}
