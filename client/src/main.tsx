import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, stored, type Meta } from './api';
import { LangContext, type UiLang } from './i18n';
import { BuyView } from './BuyView';
import { ChartIcon, LogoMark, SproutIcon, StoreIcon } from './icons';
import { PricesView } from './PricesView';
import { SellView } from './SellView';
import './styles.css';

type Tab = 'sell' | 'buy' | 'prices';
const TABS: { id: Tab; label: [string, string]; Icon: typeof SproutIcon }[] = [
  { id: 'sell', label: ['Sell', 'Uza'], Icon: SproutIcon },
  { id: 'buy', label: ['Buyers', 'Wanunuzi'], Icon: StoreIcon },
  { id: 'prices', label: ['Prices', 'Bei'], Icon: ChartIcon }
];

function App() {
  const [tab, setTab] = useState<Tab>('sell');
  // App language (the AI's replies follow whatever language the person speaks). Remembered on the phone.
  const [lang, setLangState] = useState<UiLang>(() => stored.get<UiLang>('uiLang', 'en'));
  const setLang = (l: UiLang) => { setLangState(l); stored.set('uiLang', l); document.documentElement.lang = l; };
  const t = (en: string, sw: string) => (lang === 'sw' ? sw : en);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState('');

  const load = () => { setError(''); api.meta().then(setMeta).catch(err => setError(err.message)); };
  useEffect(load, []);

  return <LangContext.Provider value={lang}><div className="app">
    <header className="top">
      <div className="brand"><LogoMark /><span className="wordmark">Farmconnect <b>AI</b></span></div>
      <div className="lang" role="group" aria-label={t('App language', 'Lugha ya programu')}>
        {(['en', 'sw'] as const).map(l => <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)} aria-pressed={lang === l}>{l.toUpperCase()}</button>)}
      </div>
    </header>
    <main key={tab} className="fade-in">
      {error && <div className="card"><p className="error">{error}</p><button className="primary" onClick={load}>{t('Retry', 'Jaribu tena')}</button></div>}
      {!meta && !error && <p className="muted center">{t('Loading…', 'Inapakia…')}</p>}
      {meta && tab === 'sell' && <SellView meta={meta} />}
      {meta && tab === 'buy' && <BuyView meta={meta} />}
      {meta && tab === 'prices' && <PricesView meta={meta} />}
      <p className="footnote">{t('Decision support only. Prices are estimates. Always confirm with the buyer.', 'Msaada wa kufanya uamuzi tu. Bei ni makadirio. Thibitisha na mnunuzi kila mara.')}</p>
    </main>
    <nav className="tabs">{TABS.map(({ id, label, Icon }) =>
      <button key={id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); window.scrollTo(0, 0); }} aria-current={tab === id ? 'page' : undefined}>
        <span className="tab-icon"><Icon /></span>{label[lang === 'sw' ? 1 : 0]}
      </button>)}
    </nav>
  </div></LangContext.Provider>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js');
