import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { HEADER_STYLE, TITLE_STYLE, SCROLL_AREA } from '../hooks/usePanelPosition';
import ResizablePanel from './ResizablePanel';
import {
  Button,
  IconButton,
  Input,
  XIcon,
  CopyIcon,
  TrashIcon,
  CheckIcon,
  ClipboardIcon,
  FileIcon,
  SearchIcon,
} from './ui';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return ''; }
}

function dateLabel(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (itemDay.getTime() === today.getTime()) return 'Today';
    if (itemDay.getTime() === yesterday.getTime()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
}

const TYPE_LABELS = { text: 'Text', image: 'Image', file: 'File', link: 'Link', color: 'Color', code: 'Code' };
// Category accent colors for the type badge — functional colour-coding, kept
// as a small fixed palette.
const TYPE_COLORS = {
  text: 'var(--ds-accent)',
  image: 'var(--ds-accent-cyan)',
  file: 'var(--ds-warning)',
  link: 'var(--ds-success)',
  color: 'var(--ds-danger)',
  code: '#b388ff',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypeBadge({ type }) {
  const color = TYPE_COLORS[type] || 'var(--ds-text-muted)';
  return (
    <span style={{
      fontSize: 'var(--ds-font-xs)',
      fontWeight: 'var(--ds-weight-semibold)',
      padding: '1px 6px',
      borderRadius: 'var(--ds-radius-sm)',
      border: `1px solid ${color}`,
      color,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      flexShrink: 0,
    }}>
      {TYPE_LABELS[type] || type}
    </span>
  );
}

function FilterChip({ label, color, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 'var(--ds-font-xs)',
        fontWeight: 'var(--ds-weight-semibold)',
        padding: '2px 8px',
        borderRadius: 'var(--ds-radius-sm)',
        border: `1px solid ${active ? color : 'var(--ds-border)'}`,
        background: active ? `color-mix(in srgb, ${color} 14%, transparent)` : 'transparent',
        color: active ? color : 'var(--ds-text-muted)',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        fontFamily: 'inherit',
        transition: 'background var(--ds-dur-fast) var(--ds-ease), border-color var(--ds-dur-fast) var(--ds-ease), color var(--ds-dur-fast) var(--ds-ease)',
      }}
    >
      {label}
    </button>
  );
}

function FilterChips({ value, onChange }) {
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      padding: '6px 0 2px',
      WebkitAppRegion: 'no-drag',
    }}>
      <FilterChip
        label="All"
        color="var(--ds-text-primary)"
        active={value === 'all'}
        onClick={() => onChange('all')}
      />
      {Object.keys(TYPE_LABELS).map((t) => (
        <FilterChip
          key={t}
          label={TYPE_LABELS[t]}
          color={TYPE_COLORS[t]}
          active={value === t}
          onClick={() => onChange(t)}
        />
      ))}
    </div>
  );
}

function ColorSwatch({ hex }) {
  const safe = hex.trim();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-3)' }}>
      <div style={{
        width: 26, height: 26, borderRadius: '50%', background: safe, flexShrink: 0,
        border: '2px solid var(--ds-border-strong)',
      }} />
      <span style={{
        fontFamily: "'Cascadia Code', 'Consolas', monospace",
        fontSize: 'var(--ds-font-md)',
        color: 'var(--ds-text-primary)',
        fontWeight: 'var(--ds-weight-semibold)',
      }}>
        {safe}
      </span>
    </div>
  );
}

function ImagePreview({ src }) {
  return (
    <img
      src={src}
      alt="Clipboard img"
      style={{
        maxWidth: '100%', maxHeight: 72, borderRadius: 'var(--ds-radius-sm)',
        objectFit: 'cover', border: '1px solid var(--ds-border)',
      }}
    />
  );
}

function FilePreview({ content, paths: pathsProp }) {
  const files = (Array.isArray(pathsProp) && pathsProp.length)
    ? pathsProp
    : content.split('\n').map((f) => f.trim()).filter(Boolean);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {files.slice(0, 3).map((f, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-2)' }}>
          <span style={{ color: 'var(--ds-text-faint)', display: 'inline-flex' }}>
            <FileIcon size={13} />
          </span>
          <span style={{
            fontSize: 'var(--ds-font-sm)', color: 'var(--ds-text-secondary)', whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240,
          }}>
            {f.split(/[\\/]/).pop()}
          </span>
        </div>
      ))}
      {files.length > 3 && (
        <span style={{ fontSize: 'var(--ds-font-xs)', color: 'var(--ds-text-faint)' }}>
          +{files.length - 3} more
        </span>
      )}
    </div>
  );
}

function LinkPreview({ url }) {
  let host = url;
  try { host = new URL(url.startsWith('www') ? `http://${url}` : url).hostname; } catch (_) { /* not a URL */ }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 'var(--ds-font-xs)', color: 'var(--ds-success)', fontWeight: 'var(--ds-weight-semibold)' }}>
        {host}
      </span>
      <span style={{
        fontSize: 'var(--ds-font-sm)', color: 'var(--ds-text-muted)', whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280,
      }}>
        {url}
      </span>
    </div>
  );
}

function ItemRow({ item, onCopy, onDelete, onPreviewImage }) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const flashCopied = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleCopy = (e) => {
    e.stopPropagation();
    onCopy(item.id);
    flashCopied();
  };

  const handleRowClick = () => {
    // Click image items to preview, everything else to copy.
    if (item.type === 'image' && item.preview && onPreviewImage) {
      onPreviewImage(item.preview);
    } else {
      onCopy(item.id);
      flashCopied();
    }
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleRowClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--ds-space-2)',
        padding: '8px 10px',
        borderRadius: 'var(--ds-radius-md)',
        background: copied
          ? 'var(--ds-accent-bg)'
          : hovered ? 'var(--ds-bg-control)' : 'var(--ds-bg-subtle)',
        border: `1px solid ${copied ? 'var(--ds-accent-border)' : 'var(--ds-border)'}`,
        transition: 'background var(--ds-dur-fast) var(--ds-ease), border-color var(--ds-dur-fast) var(--ds-ease)',
        WebkitAppRegion: 'no-drag',
        cursor: 'pointer',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-2)' }}>
        <TypeBadge type={item.type} />
        <span style={{ fontSize: 'var(--ds-font-xs)', color: 'var(--ds-text-faint)', flex: 1 }}>
          {formatTime(item.timestamp)}
        </span>
        {copied && (
          <span style={{ fontSize: 'var(--ds-font-xs)', color: 'var(--ds-accent-light)', fontWeight: 'var(--ds-weight-semibold)' }}>
            Copied
          </span>
        )}
        <IconButton size={22} title="Copy again" onClick={handleCopy}>
          {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
        </IconButton>
        <IconButton
          variant="danger"
          size={22}
          title="Delete"
          onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
        >
          <TrashIcon size={12} />
        </IconButton>
      </div>

      {/* Content preview */}
      <div style={{ paddingLeft: 2 }}>
        {item.type === 'color' && <ColorSwatch hex={item.content} />}
        {item.type === 'image' && <ImagePreview src={item.preview} />}
        {item.type === 'file' && <FilePreview content={item.content} paths={item.paths} />}
        {item.type === 'link' && <LinkPreview url={item.content.trim()} />}
        {item.type === 'text' && (
          <p style={{
            margin: 0,
            fontSize: 'var(--ds-font-sm)',
            color: 'var(--ds-text-secondary)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {item.content}
          </p>
        )}
        {item.type === 'code' && (
          <pre style={{
            margin: 0,
            fontFamily: "'Cascadia Code', 'Consolas', monospace",
            fontSize: 'var(--ds-font-xs)',
            color: 'var(--ds-text-secondary)',
            background: 'var(--ds-bg-control)',
            border: '1px solid var(--ds-border-subtle)',
            borderRadius: 'var(--ds-radius-sm)',
            padding: '6px 8px',
            whiteSpace: 'pre',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 4,
            WebkitBoxOrient: 'vertical',
          }}>
            {item.content}
          </pre>
        )}
      </div>
    </div>
  );
}

function ImageOverlay({ src, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'zoom-out',
        animation: 'fadeInUp 0.15s ease',
      }}
    >
      <img
        src={src}
        alt="Preview"
        style={{ maxWidth: '90%', maxHeight: '90%', borderRadius: 'var(--ds-radius-md)', objectFit: 'contain', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
      />
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <IconButton variant="subtle" size={32} title="Close preview" onClick={onClose}>
          <XIcon size={16} />
        </IconButton>
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function ClipboardPanel({ isOpen, onClose, anchorRect }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const panelRef = useRef(null);
  const api = useMemo(() => window.electronAPI, []);

  // Load on open
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api.invoke('clipboard:getHistory')
      .then((list) => { setItems(Array.isArray(list) ? list : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [isOpen, api]);

  // Live push: main process sends either a new item or an existing item (bubbled dedup)
  useEffect(() => {
    if (!isOpen || !api.onClipboardUpdate) return undefined;
    return api.onClipboardUpdate((newItem) => {
      setItems((prev) => {
        // Remove any existing item with the same id OR same content (bubble dedup)
        const rest = prev.filter((i) =>
          i.id !== newItem.id &&
          !(i.type === newItem.type && i.content === newItem.content)
        );
        return [newItem, ...rest];
      });
    });
  }, [isOpen, api]);

  const handleCopy = useCallback((id) => api.invoke('clipboard:copyItem', { id }), [api]);
  const handleDelete = useCallback((id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    api.invoke('clipboard:deleteItem', { id });
  }, [api]);
  const handleClear = useCallback(() => {
    setItems([]);
    api.invoke('clipboard:clearAll');
  }, [api]);

  if (!isOpen || !anchorRect) return null;

  const q = search.trim().toLowerCase();
  const filtered = items.filter((i) => {
    if (filter !== 'all' && i.type !== filter) return false;
    if (!q) return true;
    // Search content for text/code/link/color; for files, search every path;
    // for images, search the filename portion of the on-disk path.
    if (i.type === 'file' && Array.isArray(i.paths)) {
      return i.paths.some((p) => typeof p === 'string' && p.toLowerCase().includes(q));
    }
    if (i.type === 'image' && typeof i.content === 'string') {
      return i.content.toLowerCase().includes(q);
    }
    return typeof i.content === 'string' && i.content.toLowerCase().includes(q);
  });

  // Group by date label
  const groups = [];
  const seen = new Map();
  for (const item of filtered) {
    const lbl = dateLabel(item.timestamp);
    if (!seen.has(lbl)) { seen.set(lbl, []); groups.push({ lbl, items: seen.get(lbl) }); }
    seen.get(lbl).push(item);
  }

  const panel = (
    <ResizablePanel isOpen={isOpen} dockAction="clipboard">
      {/* ── Header ── */}
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>Clipboard History</span>
        {items.length > 0 && (
          <Button variant="danger" size="sm" onClick={handleClear}>Clear All</Button>
        )}
        <IconButton variant="danger" title="Close" onClick={onClose}>
          <XIcon size={14} />
        </IconButton>
      </div>

      {/* ── Filter chips ── */}
      <FilterChips value={filter} onChange={setFilter} />

      {/* ── Search ── */}
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search clipboard…"
        icon={<SearchIcon size={14} />}
        size="sm"
        flat
      />

      {/* ── Scrollable list ── */}
      <div style={{ ...SCROLL_AREA, flexDirection: 'column', gap: 'var(--ds-space-1)', paddingRight: 4 }}>
        {loading && (
          <p style={{ color: 'var(--ds-text-faint)', fontSize: 'var(--ds-font-sm)', textAlign: 'center', padding: 'var(--ds-space-6)', margin: 0 }}>
            Loading…
          </p>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 'var(--ds-space-8)' }}>
            <div style={{ color: 'var(--ds-text-dim)', marginBottom: 'var(--ds-space-2)' }}>
              <ClipboardIcon size={26} />
            </div>
            <p style={{ color: 'var(--ds-text-dim)', fontSize: 'var(--ds-font-sm)', margin: 0 }}>
              {q ? `No matches for "${search.trim()}".`
                : filter === 'all' ? 'Nothing copied yet.'
                : `No ${filter} items in history.`}
            </p>
          </div>
        )}

        {!loading && groups.map(({ lbl, items: grpItems }) => (
          <div key={lbl}>
            <div style={{
              fontSize: 'var(--ds-font-xs)',
              fontWeight: 'var(--ds-weight-semibold)',
              color: 'var(--ds-text-dim)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              padding: '8px 2px 4px',
            }}>
              {lbl}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-1)' }}>
              {grpItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onCopy={handleCopy}
                  onDelete={handleDelete}
                  onPreviewImage={setPreviewImage}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </ResizablePanel>
  );

  return ReactDOM.createPortal(
    <>
      {panel}
      {previewImage && <ImageOverlay src={previewImage} onClose={() => setPreviewImage(null)} />}
    </>,
    document.body
  );
}
