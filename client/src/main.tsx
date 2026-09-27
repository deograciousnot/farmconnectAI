import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, type Lang, type Meta } from './api';
import { BuyView } from './BuyView';
import { ChartIcon, LogoMark, SproutIcon, StoreIcon } from './icons';
import { PricesView } from './PricesView';
import { SellView } from './SellView';
import './styles.css';

type Tab = 'sell' | 'buy' | 'prices';
const TABS: { id: Tab; label: string; Icon: typeof SproutIcon }[] = [
  { id: 'sell', label: 'Sell', Icon: SproutIcon },
  { id: 'buy', label: 'Buyers', Icon: StoreIcon },
  { id: 'prices', label: 'Prices', Icon: ChartIcon }
];

function App() {
  const [tab, setTab] = useState<Tab>('sell');
  const [lang, setLang] = useState<Lang>('en');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState('');

  const load = () => { setError(''); api.meta().then(setMeta).catch(err => setError(err.message)); };
  useEffect(load, []);

  return <div className="app">
    <header className="top">
      <div className="brand"><LogoMark /><span className="wordmark">Farmconnect <b>AI</b></span></div>
      <div className="lang" role="group" aria-label="Language for AI advice">
        {(['en', 'sw'] as const).map(l => <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)} aria-pressed={lang === l}>{l.toUpperCase()}</button>)}
      </div>
    </header>
    <main key={tab} className="fade-in">
      {error && <div className="card"><p className="error">{error}</p><button className="primary" onClick={load}>Retry</button></div>}
      {!meta && !error && <p className="muted center">Loading…</p>}
      {meta && tab === 'sell' && <SellView meta={meta} lang={lang} />}
      {meta && tab === 'buy' && <BuyView meta={meta} />}
      {meta && tab === 'prices' && <PricesView meta={meta} />}
      <p className="footnote">Decision support only. Prices are estimates. Always confirm with the buyer.</p>
    </main>
    <nav className="tabs">{TABS.map(({ id, label, Icon }) =>
      <button key={id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); window.scrollTo(0, 0); }} aria-current={tab === id ? 'page' : undefined}>
        <span className="tab-icon"><Icon /></span>{label}
      </button>)}
    </nav>
  </div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js');
