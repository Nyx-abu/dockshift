import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { HEADER_STYLE, TITLE_STYLE, CLOSE_BTN, SCROLL_AREA } from '../hooks/usePanelPosition';
import ResizablePanel from './ResizablePanel';

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

const TYPE_LABELS = { text: 'Text', image: 'Image', file: 'File', link: 'Link', color: 'Color' };
const TYPE_COLORS = {
    text: '#6e7dff',
    image: '#4ac1ff',
    file: '#ffd166',
    link: '#06d6a0',
    color: '#ff6b6b',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypeBadge({ type }) {
    return (
        <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: `${TYPE_COLORS[type] || '#aaa'}20`,
            color: TYPE_COLORS[type] || '#aaa',
            letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0,
        }}>
            {TYPE_LABELS[type] || type}
        </span>
    );
}

function ColorSwatch({ hex }) {
    const safe = hex.trim();
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
                width: 26, height: 26, borderRadius: '50%', background: safe, flexShrink: 0,
                border: '2px solid var(--ds-border-strong)',
                boxShadow: `0 0 10px ${safe}55`,
            }} />
            <span style={{ fontFamily: 'monospace', fontSize: 14, color: 'var(--ds-text-primary)', fontWeight: 700 }}>{safe}</span>
        </div>
    );
}

function ImagePreview({ src }) {
    return (
        <img src={src} alt="Clipboard img"
            style={{
                maxWidth: '100%', maxHeight: 72, borderRadius: 6, objectFit: 'cover',
                border: '1px solid var(--ds-border)'
            }} />
    );
}

function FilePreview({ content, paths: pathsProp }) {
    const files = (Array.isArray(pathsProp) && pathsProp.length)
        ? pathsProp
        : content.split('\n').map(f => f.trim()).filter(Boolean);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {files.slice(0, 3).map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13 }}>📄</span>
                    <span style={{
                        fontSize: 12, color: 'var(--ds-text-secondary)', whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240
                    }}>
                        {f.split(/[\\/]/).pop()}
                    </span>
                </div>
            ))}
            {files.length > 3 && <span style={{ fontSize: 11, color: 'var(--ds-text-faint)' }}>+{files.length - 3} more</span>}
        </div>
    );
}

function LinkPreview({ url }) {
    let host = url;
    try { host = new URL(url.startsWith('www') ? `http://${url}` : url).hostname; } catch (_) { }
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--ds-success)', fontWeight: 600 }}>{host}</span>
            <span style={{
                fontSize: 12, color: 'var(--ds-text-muted)', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280
            }}>{url}</span>
        </div>
    );
}

function CopyIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
    );
}

const btnBase = {
    background: 'none', border: 'none', cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', borderRadius: 5,
    padding: '4px', flexShrink: 0, transition: 'background 0.15s, color 0.15s',
    WebkitAppRegion: 'no-drag',
};

function ItemRow({ item, onCopy, onDelete, onPreviewImage }) {
    const [copied, setCopied] = useState(false);
    const [hovered, setHovered] = useState(false);

    const handleCopy = (e) => {
        e.stopPropagation();
        onCopy(item.id);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const handleRowClick = () => {
        // Click image items to preview, text items to copy
        if (item.type === 'image' && item.preview && onPreviewImage) {
            onPreviewImage(item.preview);
        } else {
            onCopy(item.id);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }
    };

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={handleRowClick}
            style={{
                display: 'flex', flexDirection: 'column', gap: 6,
                padding: '8px 10px', borderRadius: 8,
                background: copied
                    ? 'var(--ds-accent-bg)'
                    : hovered ? 'var(--ds-bg-control)' : 'var(--ds-bg-subtle)',
                border: `1px solid ${copied ? 'var(--ds-accent-border)' : 'var(--ds-border)'}`,
                transition: 'background 0.15s, border 0.15s',
                WebkitAppRegion: 'no-drag',
                cursor: 'pointer',
            }}
        >
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <TypeBadge type={item.type} />
                <span style={{ fontSize: 11, color: 'var(--ds-text-faint)', flex: 1 }}>
                    {formatTime(item.timestamp)}
                </span>

                {copied && (
                    <span style={{ fontSize: 11, color: 'var(--ds-accent-cyan)', fontWeight: 700, marginRight: 4 }}>
                        Copied!
                    </span>
                )}

                {/* Copy icon button */}
                <button
                    onClick={handleCopy}
                    title="Copy again"
                    style={{
                        ...btnBase,
                        color: copied ? 'var(--ds-accent-cyan)' : 'var(--ds-text-faint)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--ds-accent-cyan)'}
                    onMouseLeave={e => e.currentTarget.style.color = copied ? 'var(--ds-accent-cyan)' : 'var(--ds-text-faint)'}
                >
                    <CopyIcon />
                </button>

                {/* Delete button */}
                <button
                    onClick={e => { e.stopPropagation(); onDelete(item.id); }}
                    title="Delete"
                    style={{ ...btnBase, color: 'var(--ds-text-dim)', fontSize: 13 }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--ds-danger)'; e.currentTarget.style.background = 'var(--ds-danger-bg)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--ds-text-dim)'; e.currentTarget.style.background = 'none'; }}
                >✕</button>
            </div>

            {/* Content preview */}
            <div style={{ paddingLeft: 2 }}>
                {item.type === 'color' && <ColorSwatch hex={item.content} />}
                {item.type === 'image' && <ImagePreview src={item.preview} />}
                {item.type === 'file' && <FilePreview content={item.content} paths={item.paths} />}
                {item.type === 'link' && <LinkPreview url={item.content.trim()} />}
                {item.type === 'text' && (
                    <p style={{
                        margin: 0, fontSize: 12, color: 'var(--ds-text-secondary)',
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        display: '-webkit-box', WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>{item.content}</p>
                )}
            </div>
        </div>
    );
}

function ImageOverlay({ src, onClose }) {
    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            // Image lightbox scrim stays a fixed dark — independent of theme.
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
            animation: 'fadeInUp 0.15s ease',
        }}>
            <img src={src} alt="Preview" style={{
                maxWidth: '90%', maxHeight: '90%', borderRadius: 8,
                objectFit: 'contain',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }} />
            <button onClick={onClose} style={{
                position: 'absolute', top: 16, right: 16,
                background: 'rgba(255,255,255,0.1)', border: 'none',
                color: '#fff', fontSize: 18, width: 36, height: 36,
                borderRadius: '50%', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
        </div>
    );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

const FILTERS = [
    { value: 'all', label: 'All Types' },
    { value: 'text', label: 'Text Only' },
    { value: 'image', label: 'Images Only' },
    { value: 'file', label: 'Files Only' },
    { value: 'link', label: 'Links Only' },
    { value: 'color', label: 'Colors Only' },
];

const PANEL_WIDTH = 420;

export default function ClipboardPanel({ isOpen, onClose, anchorRect }) {
    const [items, setItems] = useState([]);
    const [filter, setFilter] = useState('all');
    const [loading, setLoading] = useState(false);
    const [previewImage, setPreviewImage] = useState(null);
    const panelRef = useRef(null);
    const api = useMemo(() => window.electronAPI, []);

    // Load on open
    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        api.invoke('clipboard:getHistory')
            .then(list => { setItems(Array.isArray(list) ? list : []); setLoading(false); })
            .catch(() => setLoading(false));
    }, [isOpen, api]);

    // Live push: main process sends either a new item or an existing item (bubbled dedup)
    useEffect(() => {
        if (!isOpen || !api.onClipboardUpdate) return;
        return api.onClipboardUpdate(newItem => {
            setItems(prev => {
                // Remove any existing item with the same id OR same content (bubble dedup)
                const rest = prev.filter(i =>
                    i.id !== newItem.id &&
                    !(i.type === newItem.type && i.content === newItem.content)
                );
                return [newItem, ...rest];
            });
        });
    }, [isOpen, api]);

    const handleCopy = useCallback(id => api.invoke('clipboard:copyItem', { id }), [api]);
    const handleDelete = useCallback(id => {
        setItems(prev => prev.filter(i => i.id !== id));
        api.invoke('clipboard:deleteItem', { id });
    }, [api]);
    const handleClear = useCallback(() => {
        setItems([]);
        api.invoke('clipboard:clearAll');
    }, [api]);



    if (!isOpen || !anchorRect) return null;

    const filtered = filter === 'all' ? items : items.filter(i => i.type === filter);

    // Group by date label
    const groups = [];
    const seen = new Map();
    for (const item of filtered) {
        const lbl = dateLabel(item.timestamp);
        if (!seen.has(lbl)) { seen.set(lbl, []); groups.push({ lbl, items: seen.get(lbl) }); }
        seen.get(lbl).push(item);
    }

    const panel = (
        <ResizablePanel
            isOpen={isOpen}
            dockAction="clipboard"
        >
            {/* ── Header ── */}
            <div style={HEADER_STYLE}>
                <span style={TITLE_STYLE}>📋 Clipboard History</span>

                {/* Filter select */}
                <select
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    style={{
                        background: 'var(--ds-bg-hover)',
                        border: '1px solid var(--ds-border-strong)',
                        borderRadius: 6, color: 'var(--ds-text-secondary)',
                        fontSize: 11, padding: '4px 8px', cursor: 'pointer',
                        outline: 'none', WebkitAppRegion: 'no-drag',
                        appearance: 'auto',
                    }}
                >
                    {FILTERS.map(f => <option key={f.value} value={f.value} style={{ background: 'var(--ds-bg-elevated)' }}>{f.label}</option>)}
                </select>

                {/* Clear all */}
                {items.length > 0 && (
                    <button onClick={handleClear} style={{
                        background: 'var(--ds-danger-bg)', border: '1px solid var(--ds-danger-border)',
                        borderRadius: 6, color: 'var(--ds-danger-text)', fontSize: 11, padding: '4px 9px',
                        cursor: 'pointer', WebkitAppRegion: 'no-drag',
                    }}>
                        Clear All
                    </button>
                )}

                {/* Close */}
                <button onClick={onClose} aria-label="Close" style={CLOSE_BTN}>✕</button>
            </div>

            {/* ── Scrollable list ── */}
            <div style={{ ...SCROLL_AREA, flexDirection: 'column', gap: 4, paddingRight: 4 }}>
                {loading && (
                    <p style={{ color: 'var(--ds-text-faint)', fontSize: 12, textAlign: 'center', padding: 24, margin: 0 }}>
                        Loading…
                    </p>
                )}

                {!loading && filtered.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 32 }}>
                        <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                        <p style={{ color: 'var(--ds-text-dim)', fontSize: 12, margin: 0 }}>
                            {filter === 'all' ? 'Nothing copied yet.' : `No ${filter} items in history.`}
                        </p>
                    </div>
                )}

                {!loading && groups.map(({ lbl, items: grpItems }) => (
                    <div key={lbl}>
                        <div style={{
                            fontSize: 10, fontWeight: 700, color: 'var(--ds-text-dim)',
                            textTransform: 'uppercase', letterSpacing: '0.08em',
                            padding: '8px 2px 4px',
                        }}>{lbl}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {grpItems.map(item => (
                                <ItemRow key={item.id} item={item} onCopy={handleCopy} onDelete={handleDelete}
                                    onPreviewImage={setPreviewImage} />
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
