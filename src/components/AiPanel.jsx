import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { HEADER_STYLE, TITLE_STYLE, CLOSE_BTN } from '../hooks/usePanelPosition';
import ResizablePanel from './ResizablePanel';
import '../styles/panels.css';

const QUICK_ACTIONS = [
  { label: '📋 Summarize', prefix: 'Summarize the following text concisely:\n\n' },
  { label: '🌐 Translate', prefix: 'Translate the following to English:\n\n' },
  { label: '🐛 Fix code', prefix: 'Fix the following code and explain the issue:\n\n' },
  { label: '📖 Explain', prefix: 'Explain the following in simple terms:\n\n' },
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
  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const api = useMemo(() => window.electronAPI, []);



  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  // Focus input on open
  useEffect(() => {
    if (isOpen && inputRef.current) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  const sendMessage = useCallback(async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: msg }]);
    setLoading(true);
    try {
      const res = await api.invoke('ai:chat', { prompt: msg });
      setMessages(prev => [...prev, { role: 'ai', text: res?.text || 'No response received.' }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', text: `Error: ${err.message || 'Failed to get response'}`, error: true }]);
    }
    setLoading(false);
  }, [input, loading, api]);

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
      defaultWidth={420}
      defaultHeight={500}
      minWidth={300}
      minHeight={300}
    >
      {/* Header */}
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>✨ AI Assistant</span>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 7, color: 'rgba(255,255,255,0.4)', fontSize: 10.5, padding: '4px 10px',
            cursor: 'pointer', WebkitAppRegion: 'no-drag', fontWeight: 500,
            transition: 'all 0.15s',
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
          >Clear</button>
        )}
        <button onClick={onClose} style={CLOSE_BTN}
          onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,59,48,0.15)'; e.currentTarget.style.borderColor = 'rgba(255,59,48,0.3)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}>✕</button>
      </div>

      {/* Quick Actions (shown when no messages) */}
      {messages.length === 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flexShrink: 0 }}>
          {QUICK_ACTIONS.map(a => (
            <button key={a.label} onClick={() => handleQuickAction(a)} style={{
              background: 'rgba(110,125,255,0.06)',
              border: '1px solid rgba(110,125,255,0.12)',
              borderRadius: 20, color: '#9aa5ff', fontSize: 10.5, padding: '6px 12px',
              cursor: 'pointer', whiteSpace: 'nowrap', WebkitAppRegion: 'no-drag',
              fontWeight: 500, transition: 'all 0.2s', fontFamily: 'inherit',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(110,125,255,0.12)'; e.currentTarget.style.borderColor = 'rgba(110,125,255,0.25)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(110,125,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(110,125,255,0.12)'; }}
            >{a.label}</button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10,
        scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent',
      }}>
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: 40, animation: 'fadeInUp 0.4s ease' }}>
            <div style={{ fontSize: 36, marginBottom: 12, filter: 'drop-shadow(0 0 12px rgba(110,125,255,0.3))' }}>✨</div>
            <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, lineHeight: 1.6 }}>
              Ask me anything or use a quick action above.
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%', padding: '10px 14px', borderRadius: 14,
            background: msg.role === 'user'
              ? 'linear-gradient(135deg, rgba(110,125,255,0.2), rgba(74,193,255,0.1))'
              : msg.error ? 'rgba(255,107,107,0.08)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${msg.role === 'user' ? 'rgba(110,125,255,0.15)' : msg.error ? 'rgba(255,107,107,0.15)' : 'rgba(255,255,255,0.06)'}`,
            fontSize: 12, lineHeight: 1.7, color: msg.error ? '#ff8787' : 'rgba(255,255,255,0.85)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            animation: 'fadeInUp 0.25s ease',
            boxShadow: msg.role === 'user' ? '0 4px 16px rgba(110,125,255,0.08)' : 'none',
          }}>{msg.text}</div>
        ))}
        {loading && (
          <div style={{
            alignSelf: 'flex-start', padding: '10px 14px', borderRadius: 14,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
          }}><TypingIndicator /></div>
        )}
      </div>

      {/* Input Area */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'flex-end' }}>
        <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything…" disabled={loading}
          rows={Math.min(4, Math.max(1, input.split('\n').length))}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 12, padding: '10px 14px', color: '#fff', fontSize: 12, outline: 'none',
            WebkitAppRegion: 'no-drag', fontFamily: 'inherit', resize: 'none',
            transition: 'border-color 0.2s', lineHeight: 1.5,
            maxHeight: 100, minHeight: 38,
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(110,125,255,0.3)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; }}
        />
        <button onClick={() => sendMessage()} disabled={loading || !input.trim()} style={{
          padding: '10px 16px', borderRadius: 10,
          background: input.trim() && !loading
            ? 'rgba(110,125,255,0.2)'
            : 'rgba(255,255,255,0.03)',
          border: `1px solid ${input.trim() && !loading ? 'rgba(110,125,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
          color: input.trim() && !loading ? '#9aa5ff' : 'rgba(255,255,255,0.15)',
          fontSize: 14, cursor: input.trim() && !loading ? 'pointer' : 'default',
          WebkitAppRegion: 'no-drag', transition: 'all 0.15s',
          height: 38,
        }}>↑</button>
      </div>
    </ResizablePanel>
  );

  return ReactDOM.createPortal(panel, document.body);
}
