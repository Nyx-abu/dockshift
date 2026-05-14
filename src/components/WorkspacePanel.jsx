import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import SaveWorkspaceModal from './SaveWorkspaceModal';

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

import { HEADER_STYLE, TITLE_STYLE, CLOSE_BTN, SCROLL_AREA } from '../hooks/usePanelPosition';
import ResizablePanel from './ResizablePanel';

export default function WorkspacePanel({ isOpen, onClose, anchorRect }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(false);
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
    <ResizablePanel
      isOpen={isOpen}
      dockAction="folder"
    >
      <div style={HEADER_STYLE}>
        <div style={TITLE_STYLE}>🗂️ Workspaces</div>
        <button onClick={onClose} style={CLOSE_BTN} aria-label="Close workspace panel">✕</button>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div
          style={{
            fontSize: 12,
            color: 'var(--ds-text-secondary)',
            flex: 1,
          }}
        >
          Save your current layout as a named workspace snapshot.
        </div>
        <button
          onClick={() => setSaveModalOpen(true)}
          disabled={loading}
          style={{
            padding: '6px 10px',
            borderRadius: 8,
            border: 'none',
            background: loading
              ? 'var(--ds-bg-hover)'
              : 'linear-gradient(135deg, #4ac1ff, #6e7dff)',
            color: 'white',
            fontSize: 13,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          Save Current
        </button>
      </div>

      {error && <div style={{ color: 'var(--ds-danger)', fontSize: 12 }}>{error}</div>}

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          borderRadius: 8,
          background: 'var(--ds-bg-subtle)',
          padding: 6,
        }}
      >
        {workspaces.length === 0 ? (
          <div
            style={{
              fontSize: 13,
              color: 'var(--ds-text-muted)',
              textAlign: 'center',
              padding: 16,
            }}
          >
            No workspaces yet. Save your current workspace to get started.
          </div>
        ) : (
          workspaces.map((ws) => (
            <div
              key={ws.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '6px 8px',
                borderRadius: 6,
                marginBottom: 4,
                background: 'var(--ds-bg-subtle)',
                gap: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {ws.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ds-text-muted)' }}>
                  {formatDate(ws.createdAt)}
                </div>
              </div>
              <button
                onClick={() => handleRestore(ws.name)}
                disabled={loading}
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'linear-gradient(135deg, #4ac1ff, #6e7dff)',
                  color: 'white',
                  fontSize: 11,
                  cursor: loading ? 'default' : 'pointer',
                }}
              >
                Restore
              </button>
              <button
                onClick={() => handleDelete(ws.name)}
                disabled={loading}
                style={{
                  padding: '4px 6px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'var(--ds-danger-bg)',
                  color: 'var(--ds-danger-text)',
                  fontSize: 11,
                  cursor: loading ? 'default' : 'pointer',
                }}
              >
                Delete
              </button>
            </div>
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

