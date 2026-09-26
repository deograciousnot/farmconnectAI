import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, type Lang, type Meta } from './api';
import { BuyView } from './BuyView';
import { PricesView } from './PricesView';
import { SellView } from './SellView';
import './styles.css';

type Tab = 'sell' | 'buy' | 'prices';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'sell', label: 'Sell', icon: '🌽' },
  { id: 'buy', label: 'Buyers', icon: '🏪' },
  { id: 'prices', label: 'Prices', icon: '📈' }
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
      <div className="brand"><span className="mark">FC</span><span>Farmconnect <b>AI</b></span></div>
      <button className="lang" onClick={() => setLang(lang === 'en' ? 'sw' : 'en')} aria-label="Change AI language">{lang === 'en' ? 'EN' : 'SW'}</button>
    </header>
    <main>
      {error && <div className="card"><p className="error">{error}</p><button className="primary" onClick={load}>Retry</button></div>}
      {!meta && !error && <p className="muted center">Loading…</p>}
      {meta && tab === 'sell' && <SellView meta={meta} lang={lang} />}
      {meta && tab === 'buy' && <BuyView meta={meta} />}
      {meta && tab === 'prices' && <PricesView meta={meta} />}
      <p className="footnote">Decision support only. Prices are estimates. Always confirm with the buyer.</p>
    </main>
    <nav className="tabs">{TABS.map(t => <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => { setTab(t.id); window.scrollTo(0, 0); }}><span aria-hidden>{t.icon}</span>{t.label}</button>)}</nav>
  </div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js');
