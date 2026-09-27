import { useState } from 'react';
import { api, type Analysis, type NegotiationTurn } from './api';
import { useT, type ReplyLang } from './i18n';

/** A per-buyer chat kept only in component memory; it is not saved to the device or server. */
export function NegotiationChat({ input, listingId, replyLang }: { input: Analysis['input']; listingId: string; replyLang: ReplyLang }) {
  const t = useT();
  const [turns, setTurns] = useState<NegotiationTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const ask = async (messages: NegotiationTurn[]) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.negotiate({ ...input, listingId, language: replyLang, messages });
      setTurns([...messages, { role: 'assistant', content: response.reply }]);
      setStarted(true);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not reach negotiation AI.', 'Imeshindwa kufikia AI ya mazungumzo.'));
    } finally {
      setLoading(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || loading) return;
    void ask([...turns, { role: 'user', content: message }]);
  };

  const reset = () => { setTurns([]); setDraft(''); setStarted(false); setError(''); };

  return <div className="negotiation-chat">
    <p className="muted small">{t('Tell the AI what the buyer says and it will help you plan your next reply. Avoid sharing names or phone numbers; obvious phone numbers and emails are removed before sending.', 'Mwambie AI mnunuzi anachosema ili ikusaidie kupanga jibu. Epuka kushiriki majina au nambari za simu; nambari za simu na barua pepe zinazoonekana huondolewa kabla ya kutuma.')}</p>
    {turns.length > 0 && <div className="chat negotiation-thread" aria-live="polite">
      {turns.map((turn, index) => <p className={`bubble ${turn.role === 'user' ? 'me' : 'ai'}`} key={index}>{turn.content}</p>)}
    </div>}
    {!started && <button type="button" className="primary small-btn" disabled={loading} onClick={() => void ask([])}>
      {loading ? t('Thinking…', 'Inafikiri…') : t('Start with this buyer', 'Anza na mnunuzi huyu')}
    </button>}
    {started && <form className="negotiation-reply" onSubmit={submit}>
      <label className="sr-only" htmlFor={`negotiation-${listingId}`}>{t('What did the buyer say?', 'Mnunuzi amesema nini?')}</label>
      <textarea id={`negotiation-${listingId}`} rows={2} maxLength={800} value={draft} onChange={e => setDraft(e.target.value)} placeholder={t('What did the buyer say?', 'Mnunuzi amesema nini?')} disabled={loading} />
      <button type="submit" className="secondary" disabled={loading || !draft.trim()}>{loading ? t('Thinking…', 'Inafikiri…') : t('Reply', 'Jibu')}</button>
    </form>}
    {error && <p className="error" role="alert">{error}</p>}
    {error && started && turns.at(-1)?.role === 'user' && <button type="button" className="link" disabled={loading} onClick={() => void ask(turns)}>{t('Try again', 'Jaribu tena')}</button>}
    {started && <button type="button" className="link" onClick={reset}>{t('Start a new chat', 'Anza mazungumzo mapya')}</button>}
  </div>;
}
