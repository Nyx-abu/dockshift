import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { HEADER_STYLE, TITLE_STYLE, CLOSE_BTN } from '../hooks/usePanelPosition';
import ResizablePanel from './ResizablePanel';

export default function ScreenshotPanel({ isOpen, onClose, anchorRect }) {
  const [screenshots, setScreenshots] = useState([]);
  const [capturing, setCapturing] = useState(false);
  const [copied, setCopied] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  
  // Window selection state
  const [selectingWindow, setSelectingWindow] = useState(false);
  const [windowSources, setWindowSources] = useState([]);

  const panelRef = useRef(null);
  const api = useMemo(() => window.electronAPI, []);



  useEffect(() => {
    if (!isOpen) {
      setSelectingWindow(false);
      return;
    }
    api.invoke('screenshot:getHistory').then(list => setScreenshots(Array.isArray(list) ? list : [])).catch(() => {});
  }, [isOpen, api]);

  const startWindowSelection = useCallback(async () => {
    setSelectingWindow(true);
    setWindowSources([]);
    try {
      const sources = await api.invoke('screenshot:getSources');
      setWindowSources(Array.isArray(sources) ? sources : []);
    } catch (err) {
      console.warn('Get sources error:', err);
      setSelectingWindow(false);
    }
  }, [api]);

  const capture = useCallback(async (mode, sourceId = null) => {
    setSelectingWindow(false);
    setCapturing(true);
    try {
      const result = await api.invoke('screenshot:capture', { mode, sourceId });
      if (result?.screenshot) {
        setScreenshots(prev => [result.screenshot, ...prev]);
      }
    } catch (err) { console.warn('Screenshot error:', err); }
    setCapturing(false);
  }, [api]);

  const handleCopy = useCallback(async (id) => {
    await api.invoke('screenshot:copy', { id });
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }, [api]);

  const handleDelete = useCallback(async (id) => {
    await api.invoke('screenshot:delete', { id });
    setScreenshots(prev => prev.filter(s => s.id !== id));
  }, [api]);

  const handleOpen = useCallback((id) => { api.invoke('screenshot:open', { id }); }, [api]);

  if (!isOpen || !anchorRect) return null;

  const btnStyle = (active) => ({
    flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 11,
    background: active ? 'rgba(74,193,255,0.15)' : 'var(--ds-bg-control)',
    border: `1px solid ${active ? 'rgba(74,193,255,0.25)' : 'var(--ds-border)'}`,
    color: active ? 'var(--ds-accent-cyan)' : 'var(--ds-text-muted)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    WebkitAppRegion: 'no-drag', transition: 'all 0.2s',
  });

  const panel = (
    <ResizablePanel
      isOpen={isOpen}
      dockAction="camera"
    >
      <div style={HEADER_STYLE}>
        {selectingWindow && (
          <button onClick={() => setSelectingWindow(false)}
            style={{ ...CLOSE_BTN, color: 'var(--ds-text-muted)', fontSize: 14 }}>←</button>
        )}
        <span style={TITLE_STYLE}>{selectingWindow ? 'Select Window' : '📷 Screenshots'}</span>
        <button onClick={onClose} style={CLOSE_BTN}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--ds-text-primary)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--ds-text-faint)'}>✕</button>
      </div>

      {!selectingWindow && (
        <>
          {/* Capture Buttons */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={() => capture('fullscreen')} disabled={capturing} style={btnStyle(false)}>
              🖥️ Full Screen
            </button>
            <button onClick={startWindowSelection} disabled={capturing} style={btnStyle(false)}>
              📐 Window
            </button>
          </div>

          {capturing && (
            <div style={{ textAlign: 'center', padding: 8, fontSize: 12, color: 'var(--ds-accent-cyan)' }}>
              Capturing...
            </div>
          )}

          {/* Screenshots Grid */}
          <div style={{
            flex: 1, overflowY: 'auto', minHeight: 0,
            display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8,
            alignContent: 'start', padding: 2,
            scrollbarWidth: 'thin', scrollbarColor: 'var(--ds-border-strong) transparent',
          }}>
            {screenshots.length === 0 && !capturing && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 32 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📷</div>
                <p style={{ color: 'var(--ds-text-faint)', fontSize: 12, margin: 0 }}>No screenshots yet. Click a button above to capture.</p>
              </div>
            )}
            {screenshots.map(ss => (
              <ScreenshotCard key={ss.id} ss={ss} copied={copied === ss.id}
                onCopy={() => handleCopy(ss.id)}
                onDelete={() => handleDelete(ss.id)}
                onOpen={() => handleOpen(ss.id)}
                onPreview={() => setPreviewImage(ss.preview)} />
            ))}
          </div>
        </>
      )}

      {selectingWindow && (
        <div style={{
          flex: 1, overflowY: 'auto', minHeight: 0,
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8,
          alignContent: 'start', padding: 2,
          scrollbarWidth: 'thin', scrollbarColor: 'var(--ds-border-strong) transparent',
        }}>
          {windowSources.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 32, color: 'var(--ds-text-muted)' }}>
              Loading windows...
            </div>
          ) : (
            windowSources.map(src => (
              <div key={src.id} onClick={() => capture('window', src.id)}
                style={{
                  borderRadius: 8, overflow: 'hidden',
                  background: 'var(--ds-bg-input)', border: '1px solid var(--ds-border)',
                  cursor: 'pointer', WebkitAppRegion: 'no-drag',
                  display: 'flex', flexDirection: 'column',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--ds-accent-cyan)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--ds-border)'}
              >
                <img src={src.preview} alt={src.name} style={{ width: '100%', height: 80, objectFit: 'contain', background: '#000' }} />
                <div style={{ padding: '4px 6px', fontSize: 10, color: 'var(--ds-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                  {src.name}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </ResizablePanel>
  );

  return ReactDOM.createPortal(
    <>
      {panel}
      {previewImage && (
        <div onClick={() => setPreviewImage(null)} style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'zoom-out',
          animation: 'fadeInUp 0.15s ease',
        }}>
          <img src={previewImage} alt="Preview" style={{
            maxWidth: '90%', maxHeight: '90%', borderRadius: 8,
            objectFit: 'contain',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }} />
          <button onClick={() => setPreviewImage(null)} style={{
            position: 'absolute', top: 16, right: 16,
            background: 'var(--ds-bg-hover)', border: 'none',
            color: 'var(--ds-text-primary)', fontSize: 18, width: 36, height: 36,
            borderRadius: '50%', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>
      )}
    </>,
    document.body
  );
}

function ScreenshotCard({ ss, copied, onCopy, onDelete, onOpen, onPreview }) {
  const [hovered, setHovered] = useState(false);
  const time = (() => { try { return new Date(ss.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } })();

  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 8, overflow: 'hidden', position: 'relative',
        background: 'var(--ds-bg-subtle)', border: '1px solid var(--ds-border)',
        cursor: 'pointer', WebkitAppRegion: 'no-drag',
        transition: 'border-color 0.15s',
        borderColor: hovered ? 'var(--ds-border-strong)' : 'var(--ds-border)',
      }}>
      <img src={ss.preview} alt="screenshot" onClick={onPreview}
        style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }} />
      <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--ds-text-faint)', flex: 1 }}>{time}</span>
        {hovered && (
          <>
            <button onClick={e => { e.stopPropagation(); onOpen(); }} title="Open in Explorer"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ds-text-faint)', fontSize: 11, padding: 2, WebkitAppRegion: 'no-drag' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--ds-accent-cyan)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--ds-text-faint)'}
            >📂</button>
            <button onClick={e => { e.stopPropagation(); onCopy(); }} title="Copy"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--ds-accent-cyan)' : 'var(--ds-text-faint)', fontSize: 11, padding: 2, WebkitAppRegion: 'no-drag' }}>
              {copied ? '✓' : '📋'}
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete(); }} title="Delete"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ds-text-faint)', fontSize: 11, padding: 2, WebkitAppRegion: 'no-drag' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--ds-danger)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--ds-text-faint)'}>✕</button>
          </>
        )}
      </div>
    </div>
  );
}
