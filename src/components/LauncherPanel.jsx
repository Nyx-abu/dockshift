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

// Display order for sections. "Best Match" is synthesized from results[0]
// (whichever type scored highest globally) and pinned to the top, then the
// remaining results are grouped by type in this order.
const SECTION_ORDER = [
  { id: 'app', label: 'Apps' },
  { id: 'system', label: 'System' },
  { id: 'folder', label: 'Folders' },
  { id: 'url', label: 'Web' },
  { id: 'file', label: 'Files' },
];

const SUBTITLE_BY_TYPE = {
  system: 'System command',
  url: 'Open in browser',
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
  const inputRef = useRef(null);
  const resultsRef = useRef(null);
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

  // Sectioning. Results are globally sorted by relevance, so results[0] is
  // always the Best Match regardless of its type. We pin it to its own section
  // and group the remainder by type in SECTION_ORDER. `flat` is the keyboard-
  // navigable sequence; section headers themselves are non-interactive.
  const { sections, flat } = useMemo(() => {
    if (results.length === 0) return { sections: [], flat: [] };
    const bestMatch = results[0];
    const rest = results.slice(1);
    const byType = new Map();
    for (const item of rest) {
      const t = item.type || 'file';
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t).push(item);
    }
    const built = [];
    const flatList = [];
    built.push({ label: 'Best Match', items: [bestMatch], offset: 0 });
    flatList.push(bestMatch);
    for (const { id, label } of SECTION_ORDER) {
      const items = byType.get(id);
      if (!items || items.length === 0) continue;
      built.push({ label, items, offset: flatList.length });
      flatList.push(...items);
    }
    return { sections: built, flat: flatList };
  }, [results]);

  // Clamp selection back into range whenever the result set shrinks.
  useEffect(() => {
    if (selected >= flat.length) setSelected(Math.max(0, flat.length - 1));
  }, [flat.length, selected]);

  // Keep the selected row scrolled into view as the user arrows past the
  // visible window. data-attr → scrollIntoView pattern avoids holding refs
  // for every row.
  useEffect(() => {
    const el = resultsRef.current?.querySelector(`[data-launcher-index="${selected}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const launch = useCallback(async (item) => {
    if (!item) return;
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
      setSelected((s) => Math.min(s + 1, Math.max(0, flat.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && flat[selected]) {
      e.preventDefault();
      launch(flat[selected]);
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

      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search apps, folders, commands…"
        icon={<SearchIcon size={14} />}
        flat
      />

      <div
        ref={resultsRef}
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
        {!query && !loading && <EmptyHint />}
        {loading && <LoadingHint />}
        {!loading && query && results.length === 0 && <NoResultsHint query={query.trim()} />}
        {sections.map((section) => (
          <Section
            key={section.label}
            label={section.label}
            items={section.items}
            offset={section.offset}
            selected={selected}
            setSelected={setSelected}
            launch={launch}
            icons={icons}
            onIconError={(p) => setIcons((prev) => ({ ...prev, [p]: '' }))}
          />
        ))}
      </div>

      <div style={{
        fontSize: 'var(--ds-font-xs)',
        color: 'var(--ds-text-dim)',
        textAlign: 'center',
        flexShrink: 0,
        padding: '4px 0',
      }}>
        ↑↓ Navigate · Enter to launch · Esc to close
      </div>
    </ResizablePanel>
  );

  return ReactDOM.createPortal(panel, document.body);
}

function Section({ label, items, offset, selected, setSelected, launch, icons, onIconError }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <div style={{
        fontSize: 'var(--ds-font-xs)',
        fontWeight: 'var(--ds-weight-semibold)',
        textTransform: 'uppercase',
        letterSpacing: '0.6px',
        color: 'var(--ds-text-faint)',
        padding: '10px 10px 4px',
      }}>
        {label}
      </div>
      {items.map((item, i) => {
        const globalIndex = offset + i;
        const isSel = globalIndex === selected;
        return (
          <ResultRow
            key={item.path + globalIndex}
            item={item}
            isSel={isSel}
            iconUrl={icons[item.path]}
            onHover={() => setSelected(globalIndex)}
            onClick={() => launch(item)}
            globalIndex={globalIndex}
            onIconError={onIconError}
          />
        );
      })}
    </div>
  );
}

function ResultRow({ item, isSel, iconUrl, onHover, onClick, globalIndex, onIconError }) {
  const TypeIcon = TYPE_ICON[item.type] || FileIcon;
  const subtitle = SUBTITLE_BY_TYPE[item.type] || item.path;
  return (
    <button
      data-launcher-index={globalIndex}
      onClick={onClick}
      onMouseEnter={onHover}
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
        {iconUrl
          ? <img
              src={iconUrl}
              alt=""
              width={18}
              height={18}
              onError={() => onIconError?.(item.path)}
              style={{ display: 'block', borderRadius: 3 }}
            />
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
          {subtitle}
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
}

function EmptyHint() {
  return (
    <div style={{ textAlign: 'center', padding: 'var(--ds-space-8)' }}>
      <div style={{ color: 'var(--ds-text-dim)', marginBottom: 'var(--ds-space-2)' }}>
        <SearchIcon size={26} />
      </div>
      <p style={{ color: 'var(--ds-text-faint)', fontSize: 'var(--ds-font-sm)', margin: 0 }}>
        Search apps, folders, and system commands.
      </p>
      <p style={{ color: 'var(--ds-text-dim)', fontSize: 'var(--ds-font-xs)', margin: '6px 0 0' }}>
        Try “calc”, “documents”, or the start of any app name.
      </p>
    </div>
  );
}

function LoadingHint() {
  return (
    <p style={{
      color: 'var(--ds-text-muted)',
      fontSize: 'var(--ds-font-sm)',
      textAlign: 'center',
      padding: 'var(--ds-space-4)',
    }}>
      Searching…
    </p>
  );
}

function NoResultsHint({ query }) {
  return (
    <div style={{ textAlign: 'center', padding: 'var(--ds-space-6)' }}>
      <p style={{ color: 'var(--ds-text-faint)', fontSize: 'var(--ds-font-sm)', margin: 0 }}>
        No matches for “{query}”.
      </p>
      <p style={{ color: 'var(--ds-text-dim)', fontSize: 'var(--ds-font-xs)', margin: '6px 0 0' }}>
        Try a shorter or different keyword.
      </p>
    </div>
  );
}
