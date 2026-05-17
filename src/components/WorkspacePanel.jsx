import { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import SaveWorkspaceModal from './SaveWorkspaceModal';
import { HEADER_STYLE, TITLE_STYLE } from '../hooks/usePanelPosition';
import ResizablePanel from './ResizablePanel';
import {
  Button,
  IconButton,
  Callout,
  XIcon,
  PlusIcon,
  TrashIcon,
  ChevronRightIcon,
  BoxIcon,
  FolderIcon,
} from './ui';

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** "Code.exe" → "Code"; falls back gracefully. */
function appLabel(app) {
  return String(app?.processName || 'Unknown').replace(/\.exe$/i, '');
}

/** Dedup apps by executable path, preserving first-seen order. */
function uniqueApps(apps) {
  const seen = new Set();
  const out = [];
  for (const app of apps) {
    const key = app?.executablePath;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(app);
  }
  return out;
}

const PREVIEW_ICON_LIMIT = 6;

// ─── Workspace card ──────────────────────────────────────────────────────────
// Compact by default; expands to reveal exactly what the snapshot captured.

function WorkspaceCard({ ws, loading, onRestore, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  // Real OS icon per executablePath, fetched lazily once the card is expanded.
  const [icons, setIcons] = useState({});
  const apps = Array.isArray(ws.apps) ? ws.apps : [];
  const unique = uniqueApps(apps);
  const previewApps = unique.slice(0, PREVIEW_ICON_LIMIT);
  const extraCount = unique.length - previewApps.length;
  const previewNames = previewApps.map(appLabel).join(', ');

  // Fetch icons for the preview strip eagerly (always shown); fetch all when
  // the card is expanded. Both write into the same `icons` state.
  useEffect(() => {
    const api = window.electronAPI;
    let cancelled = false;
    const targets = expanded ? unique : previewApps;
    targets.forEach((app) => {
      const key = app?.executablePath;
      if (!key) return;
      // Skip paths we've already requested (icons[key] becomes '' or data URL).
      if (Object.prototype.hasOwnProperty.call(icons, key)) return;
      api?.invoke?.('app:getIcon', { path: key })
        ?.then((url) => { if (!cancelled) setIcons((prev) => ({ ...prev, [key]: url || '' })); })
        ?.catch(() => {});
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, unique.length]);

  return (
    <div
      style={{
        borderRadius: 'var(--ds-radius-md)',
        marginBottom: 'var(--ds-space-2)',
        background: 'var(--ds-bg-control)',
        border: `1px solid ${expanded ? 'var(--ds-border-strong)' : 'var(--ds-border)'}`,
        overflow: 'hidden',
        transition: 'border-color var(--ds-dur-fast) var(--ds-ease)',
      }}
    >
      {/* Summary row — click anywhere (except the action buttons) to expand */}
      <div
        onClick={() => setExpanded((e) => !e)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--ds-space-2)',
          padding: '10px',
          cursor: 'pointer',
          background: hovered ? 'var(--ds-bg-hover)' : 'transparent',
          transition: 'background var(--ds-dur-fast) var(--ds-ease)',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            color: 'var(--ds-text-faint)',
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform var(--ds-dur-fast) var(--ds-ease)',
            flexShrink: 0,
          }}
        >
          <ChevronRightIcon size={13} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 'var(--ds-font-base)',
            fontWeight: 'var(--ds-weight-semibold)',
            color: 'var(--ds-text-strong)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {ws.name}
          </div>
          <div style={{
            fontSize: 'var(--ds-font-xs)',
            color: 'var(--ds-text-muted)',
            marginTop: 1,
          }}>
            {apps.length} {apps.length === 1 ? 'app' : 'apps'} · {formatDate(ws.createdAt)}
          </div>
          {previewApps.length > 0 && (
            <div
              title={previewNames}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                marginTop: 4,
              }}
            >
              {previewApps.map((app, i) => {
                const key = app.executablePath;
                const realIcon = icons[key];
                return (
                  <span
                    key={i}
                    style={{
                      width: 16,
                      height: 16,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: 'var(--ds-text-faint)',
                    }}
                  >
                    {realIcon
                      ? <img
                          src={realIcon}
                          alt=""
                          width={16}
                          height={16}
                          onError={() => setIcons((p) => ({ ...p, [key]: '' }))}
                          style={{ display: 'block', borderRadius: 3 }}
                        />
                      : <BoxIcon size={13} />}
                  </span>
                );
              })}
              {extraCount > 0 && (
                <span style={{
                  fontSize: 'var(--ds-font-xs)',
                  color: 'var(--ds-text-faint)',
                  marginLeft: 2,
                }}>
                  +{extraCount}
                </span>
              )}
            </div>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onRestore(ws.name); }}
          disabled={loading}
        >
          Restore
        </Button>
        <IconButton
          variant="danger"
          title="Delete"
          onClick={(e) => { e.stopPropagation(); onDelete(ws.name); }}
          disabled={loading}
        >
          <TrashIcon size={13} />
        </IconButton>
      </div>

      {/* Details — the captured windows */}
      {expanded && (
        <div style={{
          borderTop: '1px solid var(--ds-border-subtle)',
          background: 'var(--ds-bg-subtle)',
          padding: 'var(--ds-space-2) var(--ds-space-3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--ds-space-2)',
        }}>
          {apps.length === 0 ? (
            <div style={{
              fontSize: 'var(--ds-font-sm)',
              color: 'var(--ds-text-faint)',
              padding: '2px 0',
            }}>
              No windows were captured in this snapshot.
            </div>
          ) : (
            apps.map((app, i) => {
              const realIcon = icons[app?.executablePath];
              return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--ds-space-2)' }}>
                <span style={{ color: 'var(--ds-text-faint)', display: 'inline-flex', marginTop: 1, flexShrink: 0 }}>
                  {realIcon
                    ? <img
                        src={realIcon}
                        alt=""
                        width={15}
                        height={15}
                        onError={() => setIcons((prev) => ({ ...prev, [app.executablePath]: '' }))}
                        style={{ display: 'block', borderRadius: 3 }}
                      />
                    : <BoxIcon size={13} />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 'var(--ds-font-sm)',
                    fontWeight: 'var(--ds-weight-medium)',
                    color: 'var(--ds-text-secondary)',
                  }}>
                    {appLabel(app)}
                  </div>
                  {app.windowTitle && (
                    <div style={{
                      fontSize: 'var(--ds-font-xs)',
                      color: 'var(--ds-text-faint)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {app.windowTitle}
                    </div>
                  )}
                </div>
              </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export default function WorkspacePanel({ isOpen, onClose, anchorRect }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  const api = useMemo(() => window.electronAPI, []);

  async function refreshList() {
    try {
      setError(null);
      const list = await api.invoke('workspace:list');
      setWorkspaces(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error(e);
      setError('Failed to load workspaces');
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  async function handleSave(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      setError(null);
      await api.invoke('workspace:save', { name: trimmed });
      await refreshList();
      setSaveModalOpen(false);
    } catch (e) {
      console.error(e);
      setError('Failed to save workspace');
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore(name) {
    setLoading(true);
    try {
      setError(null);
      await api.invoke('workspace:restore', { name });
    } catch (e) {
      console.error(e);
      setError('Failed to restore workspace');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(name) {
    setLoading(true);
    try {
      setError(null);
      await api.invoke('workspace:delete', { name });
      await refreshList();
    } catch (e) {
      console.error(e);
      setError('Failed to delete workspace');
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen || !anchorRect) return null;

  const panel = (
    <ResizablePanel isOpen={isOpen} dockAction="folder">
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>Workspaces</span>
        <IconButton variant="danger" title="Close" onClick={onClose}>
          <XIcon size={14} />
        </IconButton>
      </div>

      <div style={{ display: 'flex', gap: 'var(--ds-space-3)', alignItems: 'center' }}>
        <div style={{ fontSize: 'var(--ds-font-sm)', color: 'var(--ds-text-muted)', flex: 1, lineHeight: 1.5 }}>
          Save your open windows as a named snapshot you can restore later.
        </div>
        <Button
          variant="primary"
          icon={<PlusIcon size={14} />}
          onClick={() => setSaveModalOpen(true)}
          disabled={loading}
        >
          Save Current
        </Button>
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          borderRadius: 'var(--ds-radius-md)',
          background: 'var(--ds-bg-subtle)',
          border: '1px solid var(--ds-border-subtle)',
          padding: 'var(--ds-space-2)',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--ds-scrollbar-thumb) transparent',
        }}
      >
        {!loaded ? (
          <div style={{
            fontSize: 'var(--ds-font-sm)',
            color: 'var(--ds-text-faint)',
            textAlign: 'center',
            padding: 'var(--ds-space-6)',
          }}>
            Loading…
          </div>
        ) : workspaces.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: 'var(--ds-space-8) var(--ds-space-4)',
          }}>
            <div style={{ color: 'var(--ds-text-dim)', marginBottom: 'var(--ds-space-2)' }}>
              <FolderIcon size={28} />
            </div>
            <p style={{
              fontSize: 'var(--ds-font-sm)',
              color: 'var(--ds-text-muted)',
              lineHeight: 1.5,
              margin: 0,
            }}>
              No saved workspaces yet.<br />
              Use <strong style={{ color: 'var(--ds-text-secondary)' }}>Save Current</strong> to snapshot
              your open windows.
            </p>
          </div>
        ) : (
          workspaces.map((ws) => (
            <WorkspaceCard
              key={ws.name}
              ws={ws}
              loading={loading}
              onRestore={handleRestore}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </ResizablePanel>
  );

  return (
    <>
      {ReactDOM.createPortal(panel, document.body)}
      <SaveWorkspaceModal
        isOpen={saveModalOpen}
        onSave={handleSave}
        onClose={() => setSaveModalOpen(false)}
      />
    </>
  );
}
