import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { HEADER_STYLE, TITLE_STYLE } from '../hooks/usePanelPosition';
import ResizablePanel from './ResizablePanel';
import {
  Input,
  IconButton,
  XIcon,
  SearchIcon,
  BoxIcon,
  FolderIcon,
  GearIcon,
  GlobeIcon,
  FileIcon,
} from './ui';

// Line-icon per result type — replaces the old emoji map.
const TYPE_ICON = {
  app: BoxIcon,
  folder: FolderIcon,
  system: GearIcon,
  url: GlobeIcon,
};

export default function LauncherPanel({ isOpen, onClose, anchorRect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  // Real OS icon per result path: '' = no icon (use the generic glyph),
  // a data URL = the actual app icon, absent = not fetched yet.
  const [icons, setIcons] = useState({});
  const iconReqRef = useRef(new Set());
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const api = useMemo(() => window.electronAPI, []);

  // Focus on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Search on query change
  useEffect(() => {
    if (!isOpen) return undefined;
    if (!query.trim()) {
      setResults([]);
      setSelected(0);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.invoke('launcher:search', { query: query.trim() });
        setResults(Array.isArray(res) ? res : []);
        setSelected(0);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 150);
    return () => clearTimeout(timer);
  }, [query, isOpen, api]);

  // Lazily pull the real OS icon for each result (cached in main + here, so a
  // path is only ever requested once).
  useEffect(() => {
    let cancelled = false;
    results.forEach((item) => {
      const key = item.path;
      if (!key || iconReqRef.current.has(key)) return;
      iconReqRef.current.add(key);
      api.invoke('app:getIcon', { path: key })
        .then((url) => { if (!cancelled) setIcons((prev) => ({ ...prev, [key]: url || '' })); })
        .catch(() => { if (!cancelled) setIcons((prev) => ({ ...prev, [key]: '' })); });
    });
    return () => { cancelled = true; };
  }, [results, api]);

  const launch = useCallback(async (item) => {
    try {
      await api.invoke('launcher:open', { path: item.path, type: item.type });
    } catch (e) {
      console.warn('Launch error:', e);
    }
    onClose();
  }, [api, onClose]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && results[selected]) {
      e.preventDefault();
      launch(results[selected]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen || !anchorRect) return null;

  const panel = (
    <ResizablePanel isOpen={isOpen} dockAction="lightning">
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>Quick Launcher</span>
        <IconButton variant="danger" title="Close" onClick={onClose}>
          <XIcon size={14} />
        </IconButton>
      </div>

      {/* Search */}
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search apps, commands…"
        icon={<SearchIcon size={14} />}
      />

      {/* Results */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--ds-scrollbar-thumb) transparent',
        }}
      >
        {!query && !loading && (
          <div style={{ textAlign: 'center', padding: 'var(--ds-space-8)' }}>
            <div style={{ color: 'var(--ds-text-dim)', marginBottom: 'var(--ds-space-2)' }}>
              <SearchIcon size={26} />
            </div>
            <p style={{ color: 'var(--ds-text-faint)', fontSize: 'var(--ds-font-sm)' }}>
              Type to search for apps and commands.
            </p>
          </div>
        )}
        {loading && (
          <p style={{ color: 'var(--ds-text-muted)', fontSize: 'var(--ds-font-sm)', textAlign: 'center', padding: 'var(--ds-space-4)' }}>
            Searching…
          </p>
        )}
        {!loading && query && results.length === 0 && (
          <p style={{ color: 'var(--ds-text-faint)', fontSize: 'var(--ds-font-sm)', textAlign: 'center', padding: 'var(--ds-space-6)' }}>
            No results found.
          </p>
        )}
        {results.map((item, i) => {
          const TypeIcon = TYPE_ICON[item.type] || FileIcon;
          const realIcon = icons[item.path];
          const isSel = i === selected;
          return (
            <button
              key={item.path + i}
              onClick={() => launch(item)}
              onMouseEnter={() => setSelected(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--ds-space-3)',
                padding: '9px 10px',
                borderRadius: 'var(--ds-radius-md)',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                background: isSel ? 'var(--ds-accent-bg)' : 'transparent',
                color: 'var(--ds-text-primary)',
                transition: 'background var(--ds-dur-fast) var(--ds-ease)',
                WebkitAppRegion: 'no-drag',
                fontFamily: 'inherit',
              }}
            >
              <span style={{
                width: 24,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                flexShrink: 0,
                color: isSel ? 'var(--ds-accent-light)' : 'var(--ds-text-muted)',
              }}>
                {realIcon
                  ? <img src={realIcon} alt="" width={18} height={18} style={{ display: 'block', borderRadius: 3 }} />
                  : <TypeIcon size={16} />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 'var(--ds-font-base)',
                  fontWeight: 'var(--ds-weight-medium)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.name}
                </div>
                <div style={{
                  fontSize: 'var(--ds-font-xs)',
                  color: 'var(--ds-text-faint)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {item.path}
                </div>
              </div>
              {isSel && (
                <span style={{
                  fontSize: 'var(--ds-font-xs)',
                  color: 'var(--ds-accent-light)',
                  fontWeight: 'var(--ds-weight-semibold)',
                  flexShrink: 0,
                }}>
                  Enter ↵
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{
        fontSize: 'var(--ds-font-xs)',
        color: 'var(--ds-text-dim)',
        textAlign: 'center',
        flexShrink: 0,
      }}>
        ↑↓ Navigate · Enter to launch · Esc to close
      </div>
    </ResizablePanel>
  );

  return ReactDOM.createPortal(panel, document.body);
}
