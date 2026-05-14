import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { HEADER_STYLE, TITLE_STYLE } from '../hooks/usePanelPosition';
import ResizablePanel from './ResizablePanel';
import {
  Button,
  IconButton,
  XIcon,
  ChevronLeftIcon,
  MonitorIcon,
  WindowIcon,
  CameraIcon,
  CopyIcon,
  TrashIcon,
  FolderIcon,
  CheckIcon,
} from './ui';

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
    api.invoke('screenshot:getHistory')
      .then((list) => setScreenshots(Array.isArray(list) ? list : []))
      .catch(() => {});
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
        setScreenshots((prev) => [result.screenshot, ...prev]);
      }
    } catch (err) {
      console.warn('Screenshot error:', err);
    }
    setCapturing(false);
  }, [api]);

  const handleCopy = useCallback(async (id) => {
    await api.invoke('screenshot:copy', { id });
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }, [api]);

  const handleDelete = useCallback(async (id) => {
    await api.invoke('screenshot:delete', { id });
    setScreenshots((prev) => prev.filter((s) => s.id !== id));
  }, [api]);

  const handleOpen = useCallback((id) => { api.invoke('screenshot:open', { id }); }, [api]);

  if (!isOpen || !anchorRect) return null;

  const gridStyle = {
    flex: 1,
    overflowY: 'auto',
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 'var(--ds-space-2)',
    alignContent: 'start',
    padding: 2,
    scrollbarWidth: 'thin',
    scrollbarColor: 'var(--ds-scrollbar-thumb) transparent',
  };

  const panel = (
    <ResizablePanel isOpen={isOpen} dockAction="camera">
      <div style={HEADER_STYLE}>
        {selectingWindow && (
          <IconButton variant="ghost" title="Back" onClick={() => setSelectingWindow(false)}>
            <ChevronLeftIcon size={14} />
          </IconButton>
        )}
        <span style={TITLE_STYLE}>{selectingWindow ? 'Select Window' : 'Screenshots'}</span>
        <IconButton variant="danger" title="Close" onClick={onClose}>
          <XIcon size={14} />
        </IconButton>
      </div>

      {!selectingWindow && (
        <>
          {/* Capture Buttons */}
          <div style={{ display: 'flex', gap: 'var(--ds-space-2)', flexShrink: 0 }}>
            <Button
              variant="secondary"
              fullWidth
              icon={<MonitorIcon size={14} />}
              onClick={() => capture('fullscreen')}
              disabled={capturing}
            >
              Full Screen
            </Button>
            <Button
              variant="secondary"
              fullWidth
              icon={<WindowIcon size={14} />}
              onClick={startWindowSelection}
              disabled={capturing}
            >
              Window
            </Button>
          </div>

          {capturing && (
            <div style={{ textAlign: 'center', padding: 'var(--ds-space-2)', fontSize: 'var(--ds-font-sm)', color: 'var(--ds-accent-cyan)' }}>
              Capturing…
            </div>
          )}

          {/* Screenshots Grid */}
          <div style={gridStyle}>
            {screenshots.length === 0 && !capturing && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 'var(--ds-space-8)' }}>
                <div style={{ color: 'var(--ds-text-dim)', marginBottom: 'var(--ds-space-2)' }}>
                  <CameraIcon size={26} />
                </div>
                <p style={{ color: 'var(--ds-text-faint)', fontSize: 'var(--ds-font-sm)', margin: 0 }}>
                  No screenshots yet. Capture one with a button above.
                </p>
              </div>
            )}
            {screenshots.map((ss) => (
              <ScreenshotCard
                key={ss.id}
                ss={ss}
                copied={copied === ss.id}
                onCopy={() => handleCopy(ss.id)}
                onDelete={() => handleDelete(ss.id)}
                onOpen={() => handleOpen(ss.id)}
                onPreview={() => setPreviewImage(ss.preview)}
              />
            ))}
          </div>
        </>
      )}

      {selectingWindow && (
        <div style={gridStyle}>
          {windowSources.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 'var(--ds-space-8)', color: 'var(--ds-text-muted)' }}>
              Loading windows…
            </div>
          ) : (
            windowSources.map((src) => (
              <div
                key={src.id}
                onClick={() => capture('window', src.id)}
                style={{
                  borderRadius: 'var(--ds-radius-md)',
                  overflow: 'hidden',
                  background: 'var(--ds-bg-input)',
                  border: '1px solid var(--ds-border)',
                  cursor: 'pointer',
                  WebkitAppRegion: 'no-drag',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'border-color var(--ds-dur-fast) var(--ds-ease)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--ds-accent-border)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--ds-border)'; }}
              >
                <img src={src.preview} alt={src.name} style={{ width: '100%', height: 80, objectFit: 'contain', background: '#000' }} />
                <div style={{
                  padding: '4px 6px',
                  fontSize: 'var(--ds-font-xs)',
                  color: 'var(--ds-text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                }}>
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
        <div
          onClick={() => setPreviewImage(null)}
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
            src={previewImage}
            alt="Preview"
            style={{ maxWidth: '90%', maxHeight: '90%', borderRadius: 'var(--ds-radius-md)', objectFit: 'contain', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
          />
          <div style={{ position: 'absolute', top: 16, right: 16 }}>
            <IconButton variant="subtle" size={32} title="Close preview" onClick={() => setPreviewImage(null)}>
              <XIcon size={16} />
            </IconButton>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}

function ScreenshotCard({ ss, copied, onCopy, onDelete, onOpen, onPreview }) {
  const [hovered, setHovered] = useState(false);
  const time = (() => {
    try {
      return new Date(ss.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  })();

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 'var(--ds-radius-md)',
        overflow: 'hidden',
        position: 'relative',
        background: 'var(--ds-bg-subtle)',
        border: `1px solid ${hovered ? 'var(--ds-border-strong)' : 'var(--ds-border)'}`,
        cursor: 'pointer',
        WebkitAppRegion: 'no-drag',
        transition: 'border-color var(--ds-dur-fast) var(--ds-ease)',
      }}
    >
      <img
        src={ss.preview}
        alt="screenshot"
        onClick={onPreview}
        style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }}
      />
      <div style={{ padding: '5px 6px', display: 'flex', alignItems: 'center', gap: 2 }}>
        <span style={{ fontSize: 'var(--ds-font-xs)', color: 'var(--ds-text-faint)', flex: 1 }}>{time}</span>
        {hovered && (
          <>
            <IconButton size={22} title="Open in Explorer" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
              <FolderIcon size={12} />
            </IconButton>
            <IconButton size={22} title="Copy" onClick={(e) => { e.stopPropagation(); onCopy(); }}>
              {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
            </IconButton>
            <IconButton variant="danger" size={22} title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
              <TrashIcon size={12} />
            </IconButton>
          </>
        )}
      </div>
    </div>
  );
}
