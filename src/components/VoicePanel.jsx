import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { HEADER_STYLE, TITLE_STYLE } from '../hooks/usePanelPosition';
import ResizablePanel from './ResizablePanel';
import { Button, IconButton, Select, Callout, Badge, XIcon, MicIcon, StopIcon } from './ui';
import '../styles/panels.css';

/**
 * Curated language list shown in the top selector. The first entry — 'auto' —
 * means "let the provider detect the spoken language", and is only enabled
 * when the active STT provider advertises `capabilities.autoDetectLanguage`.
 *
 * The values are BCP-47 tags; the main process normalizes them to whatever
 * shape each provider expects (e.g. trims to ISO-639-1 for Whisper).
 */
const LANGUAGES = [
  { value: 'auto', label: 'Auto Detect' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'hi-IN', label: 'Hindi' },
  { value: 'es-ES', label: 'Spanish' },
  { value: 'fr-FR', label: 'French' },
  { value: 'de-DE', label: 'German' },
  { value: 'ja-JP', label: 'Japanese' },
  { value: 'ko-KR', label: 'Korean' },
  { value: 'zh-CN', label: 'Chinese' },
  { value: 'ar-SA', label: 'Arabic' },
  { value: 'pt-BR', label: 'Portuguese (BR)' },
  { value: 'ru-RU', label: 'Russian' },
  { value: 'it-IT', label: 'Italian' },
];

/** MIME type the renderer records in. Kept in sync with what providers accept. */
const RECORDER_MIME = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
  ? 'audio/webm;codecs=opus'
  : 'audio/webm';

/**
 * Convert a Blob to base64 (without the data: prefix). Uses FileReader so the
 * heavy lifting stays off the main thread for large clips.
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function VoicePanel({ isOpen, onClose, anchorRect }) {
  const api = useMemo(() => window.electronAPI, []);

  // ── Recording / transcription state ────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [language, setLanguage] = useState('auto');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [detectedLanguage, setDetectedLanguage] = useState(null);

  // ── Provider catalog (capabilities, label) ─────────────────────────────────
  const [providers, setProviders] = useState([]);
  const [activeProviderId, setActiveProviderId] = useState('');

  // ── Refs for live recording (don't trigger re-renders) ─────────────────────
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  // Snapshot of the language at recording-start time. Mutating the selector
  // mid-recording must NOT change which language hint is sent for the
  // already-captured audio — this ref freezes it.
  const recordingLanguageRef = useRef('auto');
  const scrollRef = useRef(null);

  const activeProvider = useMemo(
    () => providers.find((p) => p.id === activeProviderId) || null,
    [providers, activeProviderId]
  );
  const supportsAutoDetect = activeProvider
    ? !!activeProvider.capabilities?.autoDetectLanguage
    : true; // assume yes until catalog loads, so the UI doesn't flicker

  // Catalog + persisted language preference. Reload on every panel open so
  // changes made in Settings (provider switch, key added) take effect without
  // re-mounting the panel.
  useEffect(() => {
    if (!isOpen || !api) return;
    let cancelled = false;
    api.invoke('transcription:providers').then((res) => {
      if (cancelled) return;
      setProviders(Array.isArray(res?.providers) ? res.providers : []);
      setActiveProviderId(res?.activeId || '');
    }).catch(() => {});
    api.invoke('settings:get').then((s) => {
      if (cancelled || !s) return;
      if (typeof s.sttLanguage === 'string' && s.sttLanguage) {
        setLanguage(s.sttLanguage);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [isOpen, api]);

  // When the catalog reveals the active provider can't auto-detect, fall back
  // to a safe default — but only if the user has 'auto' selected. We never
  // silently overwrite a manual choice the user actually made.
  useEffect(() => {
    if (activeProvider && !supportsAutoDetect && language === 'auto') {
      setLanguage('en-US');
    }
  }, [activeProvider, supportsAutoDetect, language]);

  // Persist the user's language choice. Excluded from the recording-start
  // capture above so an in-flight transcription is unaffected. Defensively
  // rejects 'auto' for providers that don't support it (Select can't render
  // per-option disabled, so we enforce here instead).
  const handleLanguageChange = useCallback((value) => {
    const next = (value === 'auto' && !supportsAutoDetect) ? 'en-US' : value;
    setLanguage(next);
    api?.invoke?.('settings:set', { settings: { sttLanguage: next } })?.catch(() => {});
  }, [api, supportsAutoDetect]);

  // Stop a live recording when the panel closes — releases the mic and avoids
  // a transcription firing after the user dismissed the panel.
  useEffect(() => {
    if (isOpen) return;
    if (mediaRecorderRef.current && isRecording) {
      try { mediaRecorderRef.current.stop(); } catch (_) {}
      setIsRecording(false);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [isOpen, isRecording]);

  // Cleanup on unmount: belt-and-braces release of the mic stream.
  useEffect(() => () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      try { mediaRecorderRef.current?.stop(); } catch (_) {}
      setIsRecording(false);
      return;
    }

    setError(null);
    setDetectedLanguage(null);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (_) {
      setError('Microphone access denied or not supported.');
      return;
    }

    let recorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: RECORDER_MIME });
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      setError(`Could not start recorder: ${err.message}`);
      return;
    }

    chunksRef.current = [];
    recordingLanguageRef.current = language;
    streamRef.current = stream;
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      // Release the mic immediately so the OS indicator clears even if the
      // transcription request hangs.
      stream.getTracks().forEach((t) => t.stop());
      if (streamRef.current === stream) streamRef.current = null;

      if (chunksRef.current.length === 0) return;
      const blob = new Blob(chunksRef.current, { type: RECORDER_MIME });
      chunksRef.current = [];

      setIsTranscribing(true);
      try {
        const base64Audio = await blobToBase64(blob);
        // language: 'auto' (or null) → main process omits the param so the
        // provider auto-detects. The captured value comes from the ref so a
        // mid-recording UI change can't poison the request.
        const lang = recordingLanguageRef.current;
        const result = await api.invoke('transcription:transcribe', {
          audio: base64Audio,
          mimeType: blob.type || RECORDER_MIME,
          language: lang === 'auto' ? null : lang,
        });
        if (!result?.ok) {
          setError(result?.error || 'Transcription failed.');
        } else if (result.text) {
          setTranscript((prev) => prev + (prev ? ' ' : '') + result.text);
          if (result.detectedLanguage) setDetectedLanguage(result.detectedLanguage);
        }
      } catch (err) {
        setError(err?.message || 'Transcription failed.');
      } finally {
        setIsTranscribing(false);
      }
    };

    try {
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      setError(`Could not start recording: ${err.message}`);
    }
  }, [isRecording, language, api]);

  const handleCopy = useCallback(() => {
    if (!transcript) return;
    if (api?.clipboard?.copy) api.clipboard.copy(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [transcript, api]);

  const handleClear = useCallback(() => {
    setTranscript('');
    setError(null);
    setDetectedLanguage(null);
  }, []);

  // Auto-scroll the transcript area as new text arrives.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcript, isTranscribing]);

  if (!isOpen || !anchorRect) return null;

  // Build the language option list — disabling 'auto' for providers that don't
  // support it preserves the UI affordance while preventing invalid requests.
  const languageOptions = LANGUAGES.map((opt) =>
    opt.value === 'auto' && !supportsAutoDetect
      ? { ...opt, label: `${opt.label} (unsupported)`, disabled: true }
      : opt
  );

  const panel = (
    <ResizablePanel isOpen={isOpen} dockAction="mic">
      {/* Header */}
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>Voice to Text</span>
        <Select
          value={language}
          onChange={handleLanguageChange}
          options={languageOptions}
          searchable
          size="sm"
          style={{ width: 160 }}
        />
        <IconButton variant="danger" title="Close" onClick={onClose}>
          <XIcon size={14} />
        </IconButton>
      </div>

      {/* Provider hint row — shows active provider + detected language when present.
          Kept lightweight so it never crowds the recording control. */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--ds-space-2)',
        flexWrap: 'wrap',
        fontSize: 'var(--ds-font-xs)',
        color: 'var(--ds-text-dim)',
        flexShrink: 0,
      }}>
        {activeProvider && (
          <Badge tone="neutral" title="Configured in Settings → Voice to Text">
            {activeProvider.label}
          </Badge>
        )}
        {language === 'auto' && supportsAutoDetect && (
          <Badge tone="accent">Auto-detect on</Badge>
        )}
        {detectedLanguage && language === 'auto' && (
          <Badge tone="success">Detected: {detectedLanguage}</Badge>
        )}
      </div>

      {/* Capability warning — only shown when the user picked 'auto' against a
          provider that doesn't support it (rare, since we auto-fallback above). */}
      {!supportsAutoDetect && language === 'auto' && (
        <Callout tone="warning">
          {activeProvider?.label || 'This provider'} doesn't support auto-detection — pick a language.
        </Callout>
      )}

      {/* Record button */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--ds-space-3) 0' }}>
        <button
          onClick={toggleRecording}
          title={isRecording ? 'Stop recording' : 'Start recording'}
          style={{
            width: 68,
            height: 68,
            borderRadius: '50%',
            background: isRecording ? 'var(--ds-danger)' : 'var(--ds-accent)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: isRecording
              ? '0 0 0 6px var(--ds-danger-bg)'
              : '0 0 0 4px var(--ds-accent-bg)',
            transition: 'background var(--ds-dur-base) var(--ds-ease)',
            animation: isRecording ? 'voicePulse 1.5s ease-in-out infinite' : 'none',
            WebkitAppRegion: 'no-drag',
          }}
        >
          {isRecording ? <StopIcon size={24} /> : <MicIcon size={26} />}
        </button>
      </div>

      {/* Status */}
      <div style={{
        textAlign: 'center',
        fontSize: 'var(--ds-font-sm)',
        color: 'var(--ds-text-faint)',
        flexShrink: 0,
      }}>
        {isRecording ? (
          <span style={{ color: 'var(--ds-danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--ds-space-2)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ds-danger)', animation: 'voiceDot 1s ease-in-out infinite' }} />
            Listening… click to stop
          </span>
        ) : isTranscribing ? (
          <span style={{ color: 'var(--ds-accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--ds-space-2)' }}>
            <span style={{ width: 12, height: 12, border: '2px solid var(--ds-accent-cyan)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            Transcribing…
          </span>
        ) : (
          'Click to start recording'
        )}
      </div>

      {/* Error */}
      {error && <Callout tone="danger">{error}</Callout>}

      {/* Transcript */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 0,
          background: 'var(--ds-bg-subtle)',
          borderRadius: 'var(--ds-radius-md)',
          padding: 'var(--ds-space-3)',
          fontSize: 'var(--ds-font-base)',
          lineHeight: 1.6,
          color: 'var(--ds-text-secondary)',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--ds-scrollbar-thumb) transparent',
        }}
      >
        {transcript && <span>{transcript}</span>}
        {!transcript && !isTranscribing && (
          <span style={{ color: 'var(--ds-text-dim)', fontStyle: 'italic' }}>
            Your transcript will appear here…
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 'var(--ds-space-2)', flexShrink: 0 }}>
        <Button variant="primary" fullWidth onClick={handleCopy} disabled={!transcript}>
          {copied ? 'Copied' : 'Copy to Clipboard'}
        </Button>
        <Button variant="secondary" onClick={handleClear} disabled={!transcript}>
          Clear
        </Button>
      </div>
    </ResizablePanel>
  );

  return ReactDOM.createPortal(panel, document.body);
}
