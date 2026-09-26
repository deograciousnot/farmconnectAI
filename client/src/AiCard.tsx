import { useEffect, useState } from 'react';
import type { AdviceState } from './SellView';

const MS_PER_WORD = 35;

/**
 * Reveals `total` words one at a time. The advice has already passed the server's number check before
 * it arrives, so typing it out never shows an unchecked figure. Skipped for users who prefer reduced motion.
 */
function useWordReveal(total: number, key: unknown) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return setShown(total);
    setShown(0);
    const timer = setInterval(() => setShown(n => {
      if (n >= total) clearInterval(timer);
      return Math.min(n + 1, total);
    }), MS_PER_WORD);
    return () => clearInterval(timer);
  }, [total, key]);
  return shown;
}

export function AiCard({ state }: { state: AdviceState }) {
  if (state.status === 'loading') {
    return <section className="card ai" aria-busy="true">
      <div className="ai-label"><span className="spark pulse">✦</span> AI advice <span className="pill">thinking…</span></div>
      <div className="skeleton wide" /><div className="skeleton" /><div className="skeleton short" />
      <p className="muted small">Your buyers and split are ready below. The AI is reading the numbers.</p>
    </section>;
  }
  if (state.status === 'error') {
    return <section className="card ai">
      <div className="ai-label"><span className="spark">✦</span> AI advice</div>
      <p className="error">{state.message}</p>
      <p className="muted small">The buyer list and split below don't depend on the AI and are still correct.</p>
    </section>;
  }
  return <TypedAdvice advice={state.advice} />;
}

function TypedAdvice({ advice }: { advice: Extract<AdviceState, { status: 'done' }>['advice'] }) {
  const { explanation, provider, model, latencyMs, fallbackReason } = advice;
  const blocks = [explanation.headline, ...explanation.points, ...explanation.nextSteps].map(text => text.split(/\s+/));
  const total = blocks.reduce((n, words) => n + words.length, 0);
  const shown = useWordReveal(total, advice);
  const typing = shown < total;

  // Hand out the revealed word budget to each block in reading order.
  let budget = shown;
  const visible = blocks.map(words => {
    const take = Math.max(0, Math.min(words.length, budget));
    budget -= take;
    return { text: words.slice(0, take).join(' '), started: take > 0, typingHere: take > 0 && take < words.length };
  });
  const [headline, ...rest] = visible;
  const points = rest.slice(0, explanation.points.length);
  const steps = rest.slice(explanation.points.length);
  const caret = (b: { typingHere: boolean }) => (b.typingHere ? <span className="caret" /> : null);

  return <section className="card ai" aria-busy={typing}>
    <div className="ai-label"><span className="spark">✦</span> AI advice <span className="pill">{provider === 'gemini' ? `${model} · ${(latencyMs / 1000).toFixed(1)}s` : 'offline summary'}</span></div>
    {/* Screen readers get the full text once, instead of every word as it appears. */}
    <p className="sr-only" aria-live="polite">{typing ? '' : [explanation.headline, ...explanation.points, ...explanation.nextSteps].join(' ')}</p>
    <div aria-hidden="true">
      <h3>{headline.text}{caret(headline)}</h3>
      <ul>{points.filter(p => p.started).map((p, i) => <li key={i}>{p.text}{caret(p)}</li>)}</ul>
      {steps.some(s => s.started) && <>
        <h4>Before you decide</h4>
        <ul className="steps">{steps.filter(s => s.started).map((s, i) => <li key={i}>{s.text}{caret(s)}</li>)}</ul>
      </>}
    </div>
    {!typing && provider === 'fallback' && <p className="muted small">AI model unavailable ({fallbackReason}). Showing a rule-based summary of the same numbers.</p>}
    {!typing && <p className="muted small">Estimates only. Confirm price, quantity and pickup with the buyer before harvesting.</p>}
  </section>;
}
