import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { HEADER_STYLE, TITLE_STYLE } from '../hooks/usePanelPosition';
import ResizablePanel from './ResizablePanel';
import { Button, IconButton, Select, Callout, XIcon, MicIcon, StopIcon } from './ui';
import '../styles/panels.css';

const LANGUAGES = [
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
        stream.getTracks().forEach((track) => track.stop());

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
            setTranscript((prev) => prev + (prev ? ' ' : '') + result.text);
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
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcript, isTranscribing]);

  if (!isOpen || !anchorRect) return null;

  const panel = (
    <ResizablePanel isOpen={isOpen} dockAction="mic">
      {/* Header */}
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>Voice to Text</span>
        <Select
          value={language}
          onChange={setLanguage}
          options={LANGUAGES}
          searchable
          size="sm"
          style={{ width: 150 }}
        />
        <IconButton variant="danger" title="Close" onClick={onClose}>
          <XIcon size={14} />
        </IconButton>
      </div>

      {/* Record Button */}
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
