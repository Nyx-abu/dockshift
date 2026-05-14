import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { HEADER_STYLE, TITLE_STYLE, CLOSE_BTN } from '../hooks/usePanelPosition';
import ResizablePanel from './ResizablePanel';
import '../styles/panels.css';

// Developer-focused quick actions — each prepends a task-specific instruction
// to whatever is on the clipboard (code, an error, a diff).
const QUICK_ACTIONS = [
  { label: '🔍 Explain code', prefix: 'Explain what the following code does, step by step:\n\n' },
  { label: '✅ Write tests', prefix: 'Write unit tests for the following code. Match the conventions and style visible in the code:\n\n' },
  { label: '🩹 Fix error', prefix: 'Here is an error message or stack trace. Explain the likely cause and how to fix it:\n\n' },
  { label: '👀 Review', prefix: 'Review the following code for bugs, edge cases, and possible improvements. Be concise and specific:\n\n' },
  { label: '📝 Add docs', prefix: 'Add clear doc comments to the following code. Return only the updated code:\n\n' },
  { label: '🔤 Add types', prefix: 'Add type annotations to the following code. Return only the updated code:\n\n' },
];

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 5, padding: '6px 0', alignItems: 'center' }}>
      {[1, 2, 3].map(i => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: '50%',
          background: 'linear-gradient(135deg, #6e7dff, #4ac1ff)',
          animation: `aiDot${i} 1.4s infinite ease-in-out`,
        }} />
      ))}
    </div>
  );
}

export default function AiPanel({ isOpen, onClose, anchorRect }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // 'checking' until ai:status resolves, then 'ok' or 'missing'
  const [keyStatus, setKeyStatus] = useState('checking');
  // Label of the active provider, shown in the header (e.g. "OpenAI").
  const [providerLabel, setProviderLabel] = useState('');
  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const api = useMemo(() => window.electronAPI, []);
  // Tracks the in-flight stream so chunk/done/error events can be matched to it.
  const activeStreamRef = useRef(null);

  // Re-check provider/key status whenever the panel opens — the user may have
  // switched providers or added a key in Settings since it was last open.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setKeyStatus('checking');
    api.invoke('ai:status')
      .then(res => {
        if (cancelled) return;
        setKeyStatus(res?.hasKey ? 'ok' : 'missing');
        setProviderLabel(res?.providerLabel || '');
      })
      .catch(() => { if (!cancelled) setKeyStatus('missing'); });
    return () => { cancelled = true; };
  }, [isOpen, api]);

  // Subscribe once to the streaming push channels. Events are tagged with a
  // streamId; we only act on the one we started, so a stale stream from a
  // previous turn can't write into the current bubble.
  useEffect(() => {
    if (!api.onAiStream) return undefined;
    return api.onAiStream({
      onChunk: ({ streamId, delta }) => {
        if (streamId !== activeStreamRef.current) return;
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'ai' && last.streaming) {
            next[next.length - 1] = { ...last, text: last.text + delta };
          }
          return next;
        });
      },
      onDone: ({ streamId, text }) => {
        if (streamId !== activeStreamRef.current) return;
        activeStreamRef.current = null;
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'ai' && last.streaming) {
            // Prefer the final text from main (in case any chunk was missed).
            next[next.length - 1] = { role: 'ai', text: text || last.text };
          }
          return next;
        });
        setLoading(false);
      },
      onError: ({ streamId, error }) => {
        if (streamId !== activeStreamRef.current) return;
        activeStreamRef.current = null;
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          // Replace the empty streaming bubble with an error bubble that keeps
          // the prompt so the user can retry it.
          if (last && last.role === 'ai' && last.streaming) {
            next[next.length - 1] = {
              role: 'ai',
              text: `Error: ${error || 'Failed to get response'}`,
              error: true,
              retryPrompt: last.retryPrompt,
            };
          }
          return next;
        });
        setLoading(false);
      },
    });
  }, [api]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  // Focus input on open
  useEffect(() => {
    if (isOpen && keyStatus === 'ok' && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, keyStatus]);

  const sendMessage = useCallback(async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');
    // Append the user turn and an empty AI bubble that streamed chunks fill in.
    setMessages(prev => [
      ...prev,
      { role: 'user', text: msg },
      { role: 'ai', text: '', streaming: true, retryPrompt: msg },
    ]);
    setLoading(true);
    try {
      const { streamId } = await api.invoke('ai:chatStream', { prompt: msg });
      activeStreamRef.current = streamId;
    } catch (err) {
      // The invoke itself failed (rare) — convert the placeholder to an error.
      activeStreamRef.current = null;
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'ai' && last.streaming) {
          next[next.length - 1] = {
            role: 'ai',
            text: `Error: ${err.message || 'Failed to get response'}`,
            error: true,
            retryPrompt: msg,
          };
        }
        return next;
      });
      setLoading(false);
    }
  }, [input, loading, api]);

  // Retry a failed prompt: drop the error bubble, then resend.
  const retryMessage = useCallback((index, prompt) => {
    setMessages(prev => prev.filter((_, i) => i !== index));
    sendMessage(prompt);
  }, [sendMessage]);

  const handleQuickAction = useCallback(async (action) => {
    let clipContent = '';
    try {
      clipContent = await navigator.clipboard.readText();
    } catch (_) {}
    const text = action.prefix + (clipContent || '[paste your content here]');
    setInput(text);
    // Focus and move cursor to end
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(text.length, text.length);
      }
    }, 50);
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  if (!isOpen || !anchorRect) return null;

  const panel = (
    <ResizablePanel
      isOpen={isOpen}
      dockAction="sparkle"
    >
      {/* Header */}
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>
          ✨ AI Assistant
          {providerLabel && keyStatus === 'ok' && (
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--ds-text-faint)', marginLeft: 6 }}>
              · {providerLabel}
            </span>
          )}
        </span>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} style={{
            background: 'var(--ds-bg-input)', border: '1px solid var(--ds-border)',
            borderRadius: 7, color: 'var(--ds-text-faint)', fontSize: 10.5, padding: '4px 10px',
            cursor: 'pointer', WebkitAppRegion: 'no-drag', fontWeight: 500,
            transition: 'all 0.15s',
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--ds-text-primary)'; e.currentTarget.style.borderColor = 'var(--ds-border-strong)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--ds-text-faint)'; e.currentTarget.style.borderColor = 'var(--ds-border)'; }}
          >Clear</button>
        )}
        <button onClick={onClose} style={CLOSE_BTN}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--ds-text-primary)'; e.currentTarget.style.background = 'var(--ds-danger-bg)'; e.currentTarget.style.borderColor = 'var(--ds-danger-border)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--ds-text-faint)'; e.currentTarget.style.background = 'var(--ds-bg-input)'; e.currentTarget.style.borderColor = 'var(--ds-border)'; }}>✕</button>
      </div>

      {/* Quick Actions (shown when no messages and the AI is usable) */}
      {messages.length === 0 && keyStatus === 'ok' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flexShrink: 0 }}>
          {QUICK_ACTIONS.map(a => (
            <button key={a.label} onClick={() => handleQuickAction(a)} style={{
              background: 'var(--ds-accent-bg-soft)',
              border: '1px solid var(--ds-accent-bg)',
              borderRadius: 20, color: 'var(--ds-accent-light)', fontSize: 10.5, padding: '6px 12px',
              cursor: 'pointer', whiteSpace: 'nowrap', WebkitAppRegion: 'no-drag',
              fontWeight: 500, transition: 'all 0.2s', fontFamily: 'inherit',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--ds-accent-bg)'; e.currentTarget.style.borderColor = 'var(--ds-accent-border)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--ds-accent-bg-soft)'; e.currentTarget.style.borderColor = 'var(--ds-accent-bg)'; }}
            >{a.label}</button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10,
        scrollbarWidth: 'thin', scrollbarColor: 'var(--ds-scrollbar-thumb) transparent',
      }}>
        {messages.length === 0 && !loading && keyStatus === 'ok' && (
          <div style={{ textAlign: 'center', padding: 40, animation: 'fadeInUp 0.4s ease' }}>
            <div style={{ fontSize: 36, marginBottom: 12, filter: 'drop-shadow(0 0 12px rgba(110,125,255,0.3))' }}>✨</div>
            <p style={{ color: 'var(--ds-text-dim)', fontSize: 12, lineHeight: 1.6 }}>
              Ask me anything or use a quick action above.
            </p>
          </div>
        )}
        {messages.length === 0 && keyStatus === 'checking' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ color: 'var(--ds-text-dim)', fontSize: 12 }}>Checking AI configuration…</p>
          </div>
        )}
        {keyStatus === 'missing' && (
          <div style={{
            margin: 'auto', maxWidth: 300, textAlign: 'center', padding: '24px 20px',
            background: 'var(--ds-bg-subtle)', border: '1px solid var(--ds-border)',
            borderRadius: 14, animation: 'fadeInUp 0.4s ease',
          }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>🔑</div>
            <p style={{ color: 'var(--ds-text-secondary)', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
              {providerLabel ? `${providerLabel} isn't configured` : 'No AI provider configured'}
            </p>
            <p style={{ color: 'var(--ds-text-faint)', fontSize: 11.5, lineHeight: 1.6 }}>
              Open <strong style={{ color: 'var(--ds-text-secondary)' }}>Settings → AI / Models</strong> to
              add an API key, or switch to a provider you've already set up.
              Local models via Ollama need no key.
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%', padding: '10px 14px', borderRadius: 14,
            background: msg.role === 'user'
              ? 'linear-gradient(135deg, rgba(110,125,255,0.2), rgba(74,193,255,0.1))'
              : msg.error ? 'var(--ds-danger-bg)' : 'var(--ds-bg-input)',
            border: `1px solid ${msg.role === 'user' ? 'var(--ds-accent-bg)' : msg.error ? 'var(--ds-danger-border)' : 'var(--ds-border)'}`,
            fontSize: 12, lineHeight: 1.7, color: msg.error ? 'var(--ds-danger-text)' : 'var(--ds-text-secondary)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            animation: 'fadeInUp 0.25s ease',
            boxShadow: msg.role === 'user' ? '0 4px 16px rgba(110,125,255,0.08)' : 'none',
          }}>
            {/* A streaming bubble with no text yet shows the typing dots. */}
            {msg.streaming && !msg.text ? <TypingIndicator /> : msg.text}
            {msg.error && msg.retryPrompt && (
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => retryMessage(i, msg.retryPrompt)}
                  disabled={loading}
                  style={{
                    background: 'var(--ds-danger-bg)', border: '1px solid var(--ds-danger-border)',
                    borderRadius: 7, color: 'var(--ds-danger-text)', fontSize: 11, fontWeight: 500,
                    padding: '4px 10px', cursor: loading ? 'default' : 'pointer',
                    WebkitAppRegion: 'no-drag', fontFamily: 'inherit',
                  }}
                >↻ Retry</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input Area */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'flex-end' }}>
        <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={keyStatus === 'ok' ? 'Ask anything…' : 'AI unavailable — no API key configured'}
          disabled={loading || keyStatus !== 'ok'}
          rows={Math.min(4, Math.max(1, input.split('\n').length))}
          style={{
            flex: 1, background: 'var(--ds-bg-input)', border: '1px solid var(--ds-border)',
            borderRadius: 12, padding: '10px 14px', color: 'var(--ds-text-primary)', fontSize: 12, outline: 'none',
            WebkitAppRegion: 'no-drag', fontFamily: 'inherit', resize: 'none',
            transition: 'border-color 0.2s', lineHeight: 1.5,
            maxHeight: 100, minHeight: 38,
            opacity: keyStatus === 'ok' ? 1 : 0.5,
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--ds-accent-border)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--ds-border)'; }}
        />
        {(() => {
          const canSend = !!input.trim() && !loading && keyStatus === 'ok';
          return (
            <button onClick={() => sendMessage()} disabled={!canSend} style={{
              padding: '10px 16px', borderRadius: 10,
              background: canSend ? 'var(--ds-accent-bg)' : 'var(--ds-bg-subtle)',
              border: `1px solid ${canSend ? 'var(--ds-accent-bg)' : 'var(--ds-border)'}`,
              color: canSend ? 'var(--ds-accent-light)' : 'var(--ds-text-dim)',
              fontSize: 14, cursor: canSend ? 'pointer' : 'default',
              WebkitAppRegion: 'no-drag', transition: 'all 0.15s',
              height: 38,
            }}>↑</button>
          );
        })()}
      </div>
    </ResizablePanel>
  );

  return ReactDOM.createPortal(panel, document.body);
}
