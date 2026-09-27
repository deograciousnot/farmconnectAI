import { useEffect, useRef, useState } from 'react';
import type { Understood } from './api';
import { MicIcon, SendIcon, SparkIcon, StopIcon } from './icons';

const MAX_SECONDS = 30;

/** Records a voice note with the browser's MediaRecorder (WebM on Chrome/Android, MP4/M4A on iPhone). */
function useRecorder(onDone: (audioBase64: string, mimeType: string) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>();

  const stop = () => { clearInterval(timer.current); if (recorder.current?.state === 'recording') recorder.current.stop(); };

  const start = async () => {
    setError('');
    // Phones only allow the microphone on https (or localhost). Explain instead of hiding the button.
    if (!window.isSecureContext) return setError('Voice needs a secure link (https). Open the app through the https link, or type instead.');
    if (!('MediaRecorder' in window) || !navigator.mediaDevices?.getUserMedia) return setError('This browser can\'t record voice. Please type instead.');
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
      setError('Microphone blocked. Allow microphone access in your browser, or type instead.');
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
  understand: (input: Input) => Promise<Understood<F>>;
  onUnderstood: (result: Understood<F>, said: string | null) => void;
  onFailed?: () => void;
};

/** Voice-first input, like sending a WhatsApp voice note. The AI's reading goes to the parent to confirm. */
export function SayIt<F>({ title, subtitle, placeholder, example, voice, understand, onUnderstood, onFailed }: Props<F>) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (input: Input) => {
    setBusy(true); setError('');
    try {
      onUnderstood(await understand(input), input.text ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not understand that.');
      onFailed?.();
    } finally {
      setBusy(false);
    }
  };
  const mic = useRecorder((audioBase64, mimeType) => run({ audioBase64, mimeType }));
  const submitText = () => { if (text.trim() && !busy) run({ text }); };

  return <section className="card sayit">
    <h2 className="display">{title}</h2>
    {subtitle && <p className="muted lead">{subtitle}</p>}

    {voice && <div className="voice">
      <button type="button" className={`mic-btn${mic.recording ? ' on' : ''}`} onClick={mic.recording ? mic.stop : mic.start} disabled={busy}
        aria-label={mic.recording ? 'Stop recording' : 'Record a voice message'}>
        {mic.recording ? <StopIcon /> : <MicIcon />}
      </button>
      <p className="voice-hint">{busy ? 'Understanding…' : mic.recording ? `Recording 0:${String(mic.seconds).padStart(2, '0')} · tap to finish` : 'Tap and speak in Kiswahili or English'}</p>
    </div>}
    {voice && <div className="or"><span>or type</span></div>}

    <div className={`composer${busy ? ' busy' : ''}`}>
      <textarea rows={2} value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} aria-label={title}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitText(); } }} />
      <button type="button" className="send" disabled={busy || mic.recording || !text.trim()} onClick={submitText} aria-label="Send">
        {busy ? <span className="spinner" /> : <SendIcon />}
      </button>
    </div>
    {!text && !busy && <button type="button" className="example" onClick={() => setText(example)}><SparkIcon size={12} /> Try: “{example}”</button>}
    {(error || mic.error) && <p className="error" role="alert">{error || mic.error}</p>}
  </section>;
}
