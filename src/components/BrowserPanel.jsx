import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { HEADER_STYLE, TITLE_STYLE, CLOSE_BTN } from '../hooks/usePanelPosition';
import ResizablePanel from './ResizablePanel';

export default function BrowserPanel({ isOpen, onClose, anchorRect }) {
  const [url, setUrl] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const panelRef = useRef(null);
  const webviewRef = useRef(null);
  const inputRef = useRef(null);
  const api = useMemo(() => window.electronAPI, []);



  useEffect(() => {
    if (!isOpen) return;
    api.invoke('browser:getBookmarks').then(b => setBookmarks(Array.isArray(b) ? b : [])).catch(() => {});
    api.invoke('browser:getHistory').then(h => setHistory(Array.isArray(h) ? h : [])).catch(() => {});
  }, [isOpen, api]);

  // Webview event listeners
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv || !isOpen) return;
    const onStart = () => setLoading(true);
    const onStop = () => { setLoading(false); setCurrentUrl(wv.getURL()); };
    const onFail = (e) => { setLoading(false); setError(e.errorDescription || 'Failed to load'); };
    const onNav = (e) => { setCurrentUrl(e.url); setUrl(e.url); };
    wv.addEventListener('did-start-loading', onStart);
    wv.addEventListener('did-stop-loading', onStop);
    wv.addEventListener('did-fail-load', onFail);
    wv.addEventListener('did-navigate', onNav);
    wv.addEventListener('did-navigate-in-page', onNav);
    return () => {
      wv.removeEventListener('did-start-loading', onStart);
      wv.removeEventListener('did-stop-loading', onStop);
      wv.removeEventListener('did-fail-load', onFail);
      wv.removeEventListener('did-navigate', onNav);
      wv.removeEventListener('did-navigate-in-page', onNav);
    };
  }, [isOpen]);

  // Blocked URL schemes that could be used for attacks
  const BLOCKED_SCHEMES = /^(file|javascript|data|chrome|chrome-extension|vbscript|about):/i;

  const navigate = useCallback((targetUrl) => {
    if (!targetUrl?.trim()) return;
    let finalUrl = targetUrl.trim();

    // Block dangerous URL schemes
    if (BLOCKED_SCHEMES.test(finalUrl)) {
      setError(`Blocked: "${finalUrl.split(':')[0]}:" URLs are not allowed for security`);
      return;
    }

    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = finalUrl.includes('.') ? `https://${finalUrl}` : `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
    }
    setUrl(finalUrl);
    setCurrentUrl(finalUrl);
    setError(null);
    if (webviewRef.current) webviewRef.current.src = finalUrl;
    // Save to history
    api.invoke('browser:addHistory', { url: finalUrl, title: finalUrl }).catch(() => {});
  }, [api]);

  const handleSubmit = (e) => { e.preventDefault(); navigate(url); };

  const addBookmark = useCallback(async () => {
    if (!currentUrl) return;
    const title = webviewRef.current?.getTitle?.() || currentUrl;
    await api.invoke('browser:saveBookmark', { url: currentUrl, title });
    const b = await api.invoke('browser:getBookmarks');
    setBookmarks(Array.isArray(b) ? b : []);
  }, [currentUrl, api]);

  if (!isOpen || !anchorRect) return null;

  const navBtn = {
    background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
    color: 'rgba(255,255,255,0.5)', fontSize: 14, borderRadius: 4,
    WebkitAppRegion: 'no-drag', display: 'flex', alignItems: 'center',
  };

  const panel = (
    <ResizablePanel
      isOpen={isOpen}
      dockAction="browser"
      defaultWidth={800}
      defaultHeight={520}
      minWidth={400}
      minHeight={300}
    >
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>🌐 Browser</span>
        <button onClick={onClose} style={CLOSE_BTN}
          onMouseEnter={e => e.currentTarget.style.color = '#fff'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}>✕</button>
      </div>

      {/* Nav Bar */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
        <button onClick={() => webviewRef.current?.goBack()} style={navBtn} title="Back">←</button>
        <button onClick={() => webviewRef.current?.goForward()} style={navBtn} title="Forward">→</button>
        <button onClick={() => webviewRef.current?.reload()} style={navBtn} title="Reload">⟳</button>
        <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex' }}>
          <input ref={inputRef} value={url} onChange={e => setUrl(e.target.value)}
            placeholder="Enter URL or search..."
            style={{
              flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px 0 0 6px', padding: '7px 10px', color: '#fff', fontSize: 11, outline: 'none',
              WebkitAppRegion: 'no-drag',
            }} />
          <button type="submit" style={{
            background: 'rgba(110,125,255,0.15)', border: '1px solid rgba(110,125,255,0.25)',
            borderRadius: '0 6px 6px 0', color: '#9aa5ff', fontSize: 11, padding: '0 10px',
            cursor: 'pointer', fontWeight: 600, WebkitAppRegion: 'no-drag',
          }}>Go</button>
        </form>
        <button onClick={addBookmark} style={navBtn} title="Bookmark">⭐</button>
      </div>

      {/* Bookmarks bar */}
      {bookmarks.length > 0 && (
        <div style={{
          display: 'flex', gap: 4, flexShrink: 0, overflowX: 'auto', paddingBottom: 2,
          scrollbarWidth: 'none',
        }}>
          {bookmarks.slice(0, 8).map((bm, i) => {
            let host = bm.title;
            try { host = new URL(bm.url).hostname.replace('www.', ''); } catch (_) {}
            return (
              <button key={i} onClick={() => navigate(bm.url)} style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4, color: 'rgba(255,255,255,0.6)', fontSize: 10, padding: '3px 8px',
                cursor: 'pointer', whiteSpace: 'nowrap', WebkitAppRegion: 'no-drag',
              }}>{host}</button>
            );
          })}
        </div>
      )}

      {/* Loading bar */}
      {loading && (
        <div style={{ height: 2, background: 'linear-gradient(90deg, #6e7dff, #4ac1ff)', borderRadius: 1, flexShrink: 0 }} />
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)',
          borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#ff8787', flexShrink: 0,
        }}>{error}</div>
      )}

      {/* Webview or placeholder */}
      {currentUrl ? (
        <webview ref={webviewRef} src={currentUrl}
          partition="persist:browser"
          allowpopups="false"
          style={{
            flex: 1, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)',
            minHeight: 0, background: '#ffffff',
          }}
        />
      ) : (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 8,
        }}>
          <div style={{ fontSize: 32 }}>🌐</div>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textAlign: 'center' }}>
            Enter a URL above to browse, or search the web.
          </p>
          {history.length > 0 && (
            <div style={{ width: '100%', marginTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.22)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 0' }}>
                Recent
              </div>
              {history.slice(0, 5).map((h, i) => (
                <button key={i} onClick={() => navigate(h.url)} style={{
                  display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
                  cursor: 'pointer', padding: '6px 0', color: 'rgba(255,255,255,0.5)', fontSize: 11,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', WebkitAppRegion: 'no-drag',
                }}>{h.title || h.url}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </ResizablePanel>
  );

  return ReactDOM.createPortal(panel, document.body);
}
