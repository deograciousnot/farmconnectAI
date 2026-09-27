import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Understood } from './api';
import { useT } from './i18n';
import { LogoMark, MicIcon, SendIcon, SparkIcon, StopIcon } from './icons';

const MAX_SECONDS = 30;

/** Records a voice note with the browser's MediaRecorder (WebM on Chrome/Android, MP4/M4A on iPhone). */
function useRecorder(onDone: (audioBase64: string, mimeType: string) => void, t: ReturnType<typeof useT>) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>();

  const stop = () => { clearInterval(timer.current); if (recorder.current?.state === 'recording') recorder.current.stop(); };

  const start = async () => {
    setError('');
    // Phones only allow the microphone on https (or localhost). Explain instead of hiding the button.
    if (!window.isSecureContext) return setError(t('Voice needs a secure link (https). Open the app through the https link, or type instead.', 'Sauti inahitaji kiungo salama (https). Fungua programu kupitia kiungo cha https, au andika.'));
    if (!('MediaRecorder' in window) || !navigator.mediaDevices?.getUserMedia) return setError(t('This browser can\'t record voice. Please type instead.', 'Kivinjari hiki hakiwezi kurekodi sauti. Tafadhali andika.'));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const base64 = await new Promise<string>(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] ?? ''); r.readAsDataURL(blob); });
        if (base64) onDone(base64, blob.type);
      };
      recorder.current = rec;
      rec.start();
      setRecording(true); setSeconds(0);
      timer.current = setInterval(() => setSeconds(s => { if (s + 1 >= MAX_SECONDS) stop(); return s + 1; }), 1000);
    } catch {
      setError(t('Microphone blocked. Allow microphone access in your browser, or type instead.', 'Maikrofoni imezuiwa. Ruhusu maikrofoni kwenye kivinjari, au andika.'));
    }
  };

  useEffect(() => stop, []);
  return { recording, seconds, error, start, stop };
}

type Input = { text?: string; audioBase64?: string; mimeType?: string };
type Props<F> = {
  title: string;
  subtitle?: string;
  placeholder: string;
  example: string;
  voice?: boolean;
  /** 'chat': minimal chatbot layout (greeting in the middle, one input bar pinned at the bottom). */
  layout?: 'card' | 'chat';
  kicker?: string;
  /** Extra tappable suggestions for the chat layout (the first is `example`). */
  examples?: string[];
  /** Extra chip shown with the suggestions, e.g. "fill in a form instead". */
  extra?: ReactNode;
  understand: (input: Input) => Promise<Understood<F>>;
  onUnderstood: (result: Understood<F>, said: string | null) => void;
  onFailed?: () => void;
};

/** Voice-first input, like sending a WhatsApp voice note. The AI's reading goes to the parent to confirm. */
export function SayIt<F>({ title, subtitle, placeholder, example, voice, layout = 'card', kicker, examples = [], extra, understand, onUnderstood, onFailed }: Props<F>) {
  const t = useT();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (input: Input) => {
    setBusy(true); setError('');
    try {
      onUnderstood(await understand(input), input.text ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not understand that.', 'Sikuelewa hilo.'));
      onFailed?.();
    } finally {
      setBusy(false);
    }
  };
  const mic = useRecorder((audioBase64, mimeType) => run({ audioBase64, mimeType }), t);
  const submitText = () => { if (text.trim() && !busy) run({ text }); };

  const recordLabel = mic.recording ? t('Stop recording', 'Acha kurekodi') : t('Record a voice message', 'Rekodi ujumbe wa sauti');

  if (layout === 'chat') {
    const status = busy ? t('Understanding…', 'Ninaelewa…')
      : mic.recording ? t(`Recording 0:${String(mic.seconds).padStart(2, '0')} · tap ■ to send`, `Inarekodi 0:${String(mic.seconds).padStart(2, '0')} · gusa ■ kutuma`) : null;
    return <section className="chat-start">
      <div className="greet">
        <LogoMark size={46} />
        {kicker && <p className="greet-kicker">{kicker}</p>}
        <h2 className="display">{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      <div className="dock">
        {!busy && !mic.recording && !text && <div className="suggestions">
          {[example, ...examples].map(s => <button type="button" key={s} className="chip" onClick={() => setText(s)}><SparkIcon size={11} /> {s}</button>)}
          {extra}
        </div>}
        {(error || mic.error) && <p className="error dock-error" role="alert">{error || mic.error}</p>}
        {status && <p className="dock-status">{status}</p>}
        <div className={`chat-bar${busy ? ' busy' : ''}${mic.recording ? ' recording' : ''}`}>
          <textarea rows={1} value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} aria-label={title}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitText(); } }} />
          {voice && <button type="button" className={`icon-btn mic${mic.recording ? ' on' : ''}`} onClick={mic.recording ? mic.stop : mic.start} disabled={busy} aria-label={recordLabel}>
            {mic.recording ? <StopIcon size={18} /> : <MicIcon size={22} />}
          </button>}
          <button type="button" className="icon-btn send" disabled={busy || mic.recording || !text.trim()} onClick={submitText} aria-label={t('Send', 'Tuma')}>
            {busy ? <span className="spinner" /> : <SendIcon />}
          </button>
        </div>
      </div>
    </section>;
  }

  return <section className="card sayit">
    <h2 className="display">{title}</h2>
    {subtitle && <p className="muted lead">{subtitle}</p>}

    {voice && <div className="voice">
      <button type="button" className={`mic-btn${mic.recording ? ' on' : ''}`} onClick={mic.recording ? mic.stop : mic.start} disabled={busy}
        aria-label={recordLabel}>
        {mic.recording ? <StopIcon /> : <MicIcon />}
      </button>
      <p className="voice-hint">{busy ? t('Understanding…', 'Ninaelewa…') : mic.recording ? t(`Recording 0:${String(mic.seconds).padStart(2, '0')} · tap to finish`, `Inarekodi 0:${String(mic.seconds).padStart(2, '0')} · gusa kumaliza`) : t('Tap and speak in Kiswahili, English or both', 'Gusa na uongee kwa Kiswahili, Kiingereza au vyote')}</p>
    </div>}
    {voice && <div className="or"><span>{t('or type', 'au andika')}</span></div>}

    <div className={`composer${busy ? ' busy' : ''}`}>
      <textarea rows={2} value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} aria-label={title}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitText(); } }} />
      <button type="button" className="send" disabled={busy || mic.recording || !text.trim()} onClick={submitText} aria-label={t('Send', 'Tuma')}>
        {busy ? <span className="spinner" /> : <SendIcon />}
      </button>
    </div>
    {!text && !busy && <button type="button" className="example" onClick={() => setText(example)}><SparkIcon size={12} /> {t('Try', 'Jaribu')}: “{example}”</button>}
    {(error || mic.error) && <p className="error" role="alert">{error || mic.error}</p>}
  </section>;
}
