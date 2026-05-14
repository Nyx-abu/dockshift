import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { HEADER_STYLE, TITLE_STYLE, CLOSE_BTN, INPUT_STYLE } from '../hooks/usePanelPosition';
import ResizablePanel from './ResizablePanel';
import '../styles/panels.css';

const LANGUAGES = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'es-ES', label: 'Spanish' },
  { code: 'fr-FR', label: 'French' },
  { code: 'de-DE', label: 'German' },
  { code: 'ja-JP', label: 'Japanese' },
  { code: 'ko-KR', label: 'Korean' },
  { code: 'zh-CN', label: 'Chinese' },
  { code: 'ar-SA', label: 'Arabic' },
  { code: 'pt-BR', label: 'Portuguese (BR)' },
];

export default function VoicePanel({ isOpen, onClose, anchorRect }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [language, setLanguage] = useState('en-US');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const api = useMemo(() => window.electronAPI, []);



  // Stop recording when panel closes
  useEffect(() => {
    if (!isOpen && mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isOpen, isRecording]);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      setIsRecording(false);
      return;
    }

    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());

        if (chunksRef.current.length === 0) return;
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];

        setIsTranscribing(true);
        try {
          // Convert blob to base64 and send to main process for transcription
          const reader = new FileReader();
          const base64Promise = new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
          });
          reader.readAsDataURL(blob);
          const base64Audio = await base64Promise;

          const result = await api.invoke('ai:transcribe', {
            audio: base64Audio,
            language: language.split('-')[0],
          });

          if (result?.text) {
            setTranscript(prev => prev + (prev ? ' ' : '') + result.text);
          }
        } catch (err) {
          setError(err.message || 'Transcription failed');
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      setError('Microphone access denied or not supported');
    }
  }, [isRecording, language]);

  const handleCopy = useCallback(() => {
    if (!transcript) return;
    if (api?.clipboard?.copy) api.clipboard.copy(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [transcript, api]);

  const handleClear = useCallback(() => {
    setTranscript(''); setError(null);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcript, isTranscribing]);

  if (!isOpen || !anchorRect) return null;

  const panel = (
    <ResizablePanel
      isOpen={isOpen}
      dockAction="mic"
    >
      {/* Header */}
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>🎤 Voice to Text</span>
        <select value={language} onChange={e => setLanguage(e.target.value)}
          style={{ ...INPUT_STYLE, width: 'auto', fontSize: 11, padding: '4px 8px', borderRadius: 6 }}>
          {LANGUAGES.map(l => <option key={l.code} value={l.code} style={{ background: 'var(--ds-bg-elevated)' }}>{l.label}</option>)}
        </select>
        <button onClick={onClose} style={CLOSE_BTN}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--ds-text-primary)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--ds-text-faint)'}>✕</button>
      </div>

      {/* Record Button */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
        <button onClick={toggleRecording} style={{
          width: 72, height: 72, borderRadius: '50%',
          background: isRecording
            ? 'radial-gradient(circle, #ff4444 60%, #cc0000 100%)'
            : 'radial-gradient(circle, #6e7dff 60%, #4a5adf 100%)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isRecording
            ? '0 0 0 8px rgba(255,68,68,0.15), 0 0 30px rgba(255,68,68,0.3)'
            : '0 0 0 4px rgba(110,125,255,0.15)',
          transition: 'all 0.3s ease',
          animation: isRecording ? 'voicePulse 1.5s ease-in-out infinite' : 'none',
          WebkitAppRegion: 'no-drag',
        }}>
          {isRecording ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>
      </div>

      {/* Status */}
      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--ds-text-faint)', flexShrink: 0 }}>
        {isRecording ? (
          <span style={{ color: 'var(--ds-danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ds-danger)', animation: 'voiceDot 1s ease-in-out infinite' }} />
            Listening... (Click to Stop)
          </span>
        ) : isTranscribing ? (
          <span style={{ color: 'var(--ds-accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ width: 12, height: 12, border: '2px solid var(--ds-accent-cyan)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            Transcribing...
          </span>
        ) : 'Click to start recording'}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: 'var(--ds-danger-bg)', border: '1px solid var(--ds-danger-border)',
          borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--ds-danger-text)',
        }}>{error}</div>
      )}

      {/* Transcript */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', minHeight: 0,
        background: 'var(--ds-bg-subtle)', borderRadius: 10,
        padding: 12, fontSize: 13, lineHeight: 1.6,
        color: 'var(--ds-text-secondary)',
        scrollbarWidth: 'thin', scrollbarColor: 'var(--ds-scrollbar-thumb) transparent',
      }}>
        {transcript && <span>{transcript}</span>}
        {!transcript && !isTranscribing && (
          <span style={{ color: 'var(--ds-text-dim)', fontStyle: 'italic' }}>
            Your transcript will appear here...
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button onClick={handleCopy} disabled={!transcript} style={{
          flex: 1, padding: '8px 0', borderRadius: 8,
          background: copied ? 'var(--ds-accent-bg)' : 'var(--ds-accent-bg)',
          border: `1px solid ${copied ? 'var(--ds-accent-border)' : 'var(--ds-accent-border)'}`,
          color: copied ? 'var(--ds-accent-cyan)' : transcript ? 'var(--ds-accent-light)' : 'var(--ds-text-dim)',
          fontSize: 12, fontWeight: 600, cursor: transcript ? 'pointer' : 'default',
          transition: 'all 0.2s', WebkitAppRegion: 'no-drag',
        }}>{copied ? '✓ Copied!' : 'Copy to Clipboard'}</button>
        <button onClick={handleClear} disabled={!transcript} style={{
          padding: '8px 16px', borderRadius: 8,
          background: 'var(--ds-bg-control)', border: '1px solid var(--ds-border-strong)',
          color: transcript ? 'var(--ds-text-muted)' : 'var(--ds-text-dim)',
          fontSize: 12, fontWeight: 600,
          cursor: transcript ? 'pointer' : 'default',
          WebkitAppRegion: 'no-drag',
        }}>Clear</button>
      </div>
    </ResizablePanel>
  );

  return ReactDOM.createPortal(panel, document.body);
}
