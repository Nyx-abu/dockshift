import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { HEADER_STYLE, TITLE_STYLE, CLOSE_BTN } from '../hooks/usePanelPosition';
import ResizablePanel from './ResizablePanel';

export default function LauncherPanel({ isOpen, onClose, anchorRect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const api = useMemo(() => window.electronAPI, []);



  // Focus on open
  useEffect(() => {
    if (isOpen) {
      setQuery(''); setResults([]); setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Search on query change
  useEffect(() => {
    if (!isOpen) return;
    if (!query.trim()) { setResults([]); setSelected(0); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.invoke('launcher:search', { query: query.trim() });
        setResults(Array.isArray(res) ? res : []);
        setSelected(0);
      } catch { setResults([]); }
      setLoading(false);
    }, 150);
    return () => clearTimeout(timer);
  }, [query, isOpen, api]);

  const launch = useCallback(async (item) => {
    try { await api.invoke('launcher:open', { path: item.path, type: item.type }); } catch (e) { console.warn('Launch error:', e); }
    onClose();
  }, [api, onClose]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && results[selected]) { e.preventDefault(); launch(results[selected]); }
    else if (e.key === 'Escape') { onClose(); }
  };

  if (!isOpen || !anchorRect) return null;

  const typeIcons = { app: '🚀', folder: '📁', system: '⚙️', url: '🌐' };

  const panel = (
    <ResizablePanel
      isOpen={isOpen}
      dockAction="lightning"
    >
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>⚡ Quick Launcher</span>
        <button onClick={onClose} style={CLOSE_BTN}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--ds-text-primary)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--ds-text-faint)'}>✕</button>
      </div>

      {/* Search */}
      <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKeyDown}
        placeholder="Search apps, commands..."
        style={{
          background: 'var(--ds-bg-control)', border: '1px solid var(--ds-border-strong)',
          borderRadius: 10, padding: '12px 14px', color: 'var(--ds-text-primary)', fontSize: 14, fontWeight: 500,
          outline: 'none', width: '100%', boxSizing: 'border-box', WebkitAppRegion: 'no-drag',
        }} />

      {/* Results */}
      <div style={{
        flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2,
        scrollbarWidth: 'thin', scrollbarColor: 'var(--ds-text-dim) transparent',
      }}>
        {!query && !loading && (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⚡</div>
            <p style={{ color: 'var(--ds-text-faint)', fontSize: 12 }}>Type to search for apps and commands.</p>
          </div>
        )}
        {loading && <p style={{ color: 'var(--ds-text-muted)', fontSize: 12, textAlign: 'center', padding: 16 }}>Searching…</p>}
        {!loading && query && results.length === 0 && (
          <p style={{ color: 'var(--ds-text-faint)', fontSize: 12, textAlign: 'center', padding: 24 }}>No results found.</p>
        )}
        {results.map((item, i) => (
          <button key={item.path + i} onClick={() => launch(item)} onMouseEnter={() => setSelected(i)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
              background: i === selected ? 'var(--ds-accent-bg)' : 'transparent',
              color: 'var(--ds-text-primary)', transition: 'background 0.1s', WebkitAppRegion: 'no-drag',
            }}>
            <span style={{ fontSize: 18, width: 24, textAlign: 'center', flexShrink: 0 }}>
              {typeIcons[item.type] || '📄'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--ds-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.path}
              </div>
            </div>
            {i === selected && (
              <span style={{ fontSize: 10, color: 'var(--ds-accent-border)', fontWeight: 600, flexShrink: 0 }}>Enter ↵</span>
            )}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 10, color: 'var(--ds-text-dim)', textAlign: 'center', flexShrink: 0 }}>
        ↑↓ Navigate · Enter to launch · Esc to close
      </div>
    </ResizablePanel>
  );

  return ReactDOM.createPortal(panel, document.body);
}
