import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { HEADER_STYLE, TITLE_STYLE } from '../hooks/usePanelPosition';
import ResizablePanel from './ResizablePanel';
import { Button, IconButton, Input, XIcon, SearchIcon, ChevronDownIcon, RefreshIcon } from './ui';
import '@xterm/xterm/css/xterm.css';

const DEFAULT_FONT = 13;
const MIN_FONT = 8;
const MAX_FONT = 28;

// NOTE: the MOTD banner is NOT printed from here. It's emitted by the shell
// itself (a PowerShell `-Command` at spawn — see TERMINAL_BANNER in
// electron-main.js) so it lives in ConPTY's screen buffer and survives the
// resize/repaint cycles that would wipe anything written straight to xterm.

export default function TerminalPanel({ isOpen, onClose, anchorRect }) {
  const panelRef = useRef(null);
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const searchAddonRef = useRef(null);
  const api = useMemo(() => window.electronAPI, []);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sessionEnded, setSessionEnded] = useState(false);

  // ── Stable helpers ─────────────────────────────────────────────────────────
  const pasteFromClipboard = useCallback(() => {
    navigator.clipboard.readText()
      .then((text) => { if (text) api.invoke('terminal:write', { data: text }); })
      .catch(() => {});
  }, [api]);

  const adjustFont = useCallback((delta) => {
    const term = xtermRef.current;
    if (!term) return;
    const cur = term.options.fontSize || DEFAULT_FONT;
    const next = delta === 0
      ? DEFAULT_FONT
      : Math.min(MAX_FONT, Math.max(MIN_FONT, cur + delta));
    term.options.fontSize = next;
    fitAddonRef.current?.fit();
    api.invoke('settings:set', { settings: { terminalFontSize: next } });
  }, [api]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchTerm('');
    searchAddonRef.current?.clearDecorations?.();
    xtermRef.current?.focus();
  }, []);

  const handleRestart = useCallback(() => {
    api.invoke('terminal:spawn').then(() => {
      // The fresh shell re-emits the banner + prompt on its own via
      // `terminal:onData`; just clear the dead session's view.
      const term = xtermRef.current;
      if (term) {
        term.reset();
        setTimeout(() => term.focus(), 60);
      }
      setSessionEnded(false);
    }).catch(() => {});
  }, [api]);

  // ── xterm init + pty lifecycle ─────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !terminalRef.current) return undefined;

    if (!xtermRef.current) {
      const term = new Terminal({
        fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
        fontSize: DEFAULT_FONT,
        // Integer-friendly metrics: a fractional lineHeight + letterSpacing on
        // the DOM renderer was making the cursor drift on space keypresses.
        lineHeight: 1.2,
        letterSpacing: 0,
        theme: {
          background: '#0c0d14',
          foreground: '#cdd2e0',
          cursor: '#4ade80',
          cursorAccent: '#0c0d14',
          selectionBackground: 'rgba(122, 162, 247, 0.30)',
          black: '#1a1b26',
          red: '#f7768e',
          green: '#9ece6a',
          yellow: '#e0af68',
          blue: '#7aa2f7',
          magenta: '#bb9af7',
          cyan: '#7dcfff',
          white: '#cdd2e0',
          brightBlack: '#3b4261',
          brightRed: '#ff7a93',
          brightGreen: '#b9f27c',
          brightYellow: '#ff9e64',
          brightBlue: '#9aa5ff',
          brightMagenta: '#d6acff',
          brightCyan: '#a4ffff',
          brightWhite: '#ffffff',
        },
        cursorBlink: true,
        cursorStyle: 'block',
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      const searchAddon = new SearchAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(searchAddon);
      term.open(terminalRef.current);

      // WebGL renderer — GPU-accelerated, integer cell geometry; the proper fix
      // for the cursor-drift class. Auto-reverts to the DOM renderer if the GL
      // context is ever lost.
      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        term.loadAddon(webgl);
      } catch (_) { /* WebGL unavailable — DOM renderer stays */ }

      // Clickable URLs → open in the default browser (validated in main).
      term.loadAddon(new WebLinksAddon((_event, uri) => {
        api.invoke('terminal:openLink', { url: uri });
      }));

      fitAddon.fit();
      xtermRef.current = term;
      fitAddonRef.current = fitAddon;
      searchAddonRef.current = searchAddon;

      term.onData((data) => api.invoke('terminal:write', { data }));
      term.onResize(({ cols, rows }) => api.invoke('terminal:resize', { cols, rows }));

      // Copy / paste / zoom / search keybindings.
      term.attachCustomKeyEventHandler((e) => {
        if (e.type !== 'keydown') return true;
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyC' && term.hasSelection()) {
          e.preventDefault();
          navigator.clipboard.writeText(term.getSelection()).catch(() => {});
          return false;
        }
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyV') {
          e.preventDefault();
          pasteFromClipboard();
          return false;
        }
        if (e.ctrlKey && !e.shiftKey && e.code === 'KeyF') {
          e.preventDefault();
          setSearchOpen(true);
          return false;
        }
        if (e.ctrlKey && (e.code === 'Equal' || e.code === 'NumpadAdd')) {
          e.preventDefault(); adjustFont(1); return false;
        }
        if (e.ctrlKey && (e.code === 'Minus' || e.code === 'NumpadSubtract')) {
          e.preventDefault(); adjustFont(-1); return false;
        }
        if (e.ctrlKey && (e.code === 'Digit0' || e.code === 'Numpad0')) {
          e.preventDefault(); adjustFont(0); return false;
        }
        return true;
      });

      // Restore the saved font size.
      api.invoke('settings:get').then((s) => {
        if (xtermRef.current !== term) return;
        const fs = s?.terminalFontSize;
        if (typeof fs === 'number' && fs >= MIN_FONT && fs <= MAX_FONT && fs !== term.options.fontSize) {
          term.options.fontSize = fs;
          fitAddonRef.current?.fit();
        }
      }).catch(() => {});

      // Ensure a live shell: reattach to the existing one (replaying its
      // scrollback) instead of restarting it on every panel reopen.
      api.invoke('terminal:ensure').then((res) => {
        if (xtermRef.current !== term) return;
        setSessionEnded(false);
        // A fresh shell emits its banner + prompt on its own via
        // `terminal:onData`. A reattached one replays its scrollback (which
        // already contains the banner, since the banner is real shell output).
        if (res?.alreadyRunning) {
          api.invoke('terminal:getBuffer').then((buf) => {
            if (xtermRef.current === term && buf) term.write(buf);
          }).catch(() => {});
        }
        setTimeout(() => {
          if (xtermRef.current === term) { term.focus(); fitAddonRef.current?.fit(); }
        }, 60);
      }).catch(() => {});
    }

    // Push channels — re-subscribed each open, torn down on close.
    const offData = api.onTerminalData?.((data) => xtermRef.current?.write(data));
    const offExit = api.onTerminalExit?.(() => setSessionEnded(true));

    const resizeObserver = new ResizeObserver(() => fitAddonRef.current?.fit());
    resizeObserver.observe(terminalRef.current);

    return () => {
      offData?.();
      offExit?.();
      resizeObserver.disconnect();
    };
  }, [isOpen, api, pasteFromClipboard, adjustFont]);

  // Dispose xterm on unmount.
  useEffect(() => () => {
    if (xtermRef.current) {
      xtermRef.current.dispose();
      xtermRef.current = null;
    }
  }, []);

  // Refit when the panel is reopened.
  useEffect(() => {
    if (isOpen && fitAddonRef.current) {
      const id = setTimeout(() => fitAddonRef.current?.fit(), 50);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [isOpen]);

  if (!anchorRect) return null;

  const panel = (
    <ResizablePanel isOpen={isOpen} dockAction="terminal" size="wide">
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>Terminal</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { if (xtermRef.current) xtermRef.current.clear(); }}
        >
          Clear
        </Button>
        <IconButton variant="danger" title="Close" onClick={onClose}>
          <XIcon size={14} />
        </IconButton>
      </div>

      {/* Framed terminal "screen" — opaque, so it reads as a real terminal. */}
      <div
        className="term-screen"
        onContextMenu={(e) => { e.preventDefault(); pasteFromClipboard(); }}
      >
        <div ref={terminalRef} style={{ width: '100%', height: '100%' }} />

        {searchOpen && (
          <div className="term-find">
            <Input
              size="sm"
              autoFocus
              icon={<SearchIcon size={13} />}
              placeholder="Find in terminal"
              value={searchTerm}
              wrapStyle={{ width: 190 }}
              onChange={(e) => {
                const v = e.target.value;
                setSearchTerm(v);
                if (v) searchAddonRef.current?.findNext(v);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) searchAddonRef.current?.findPrevious(searchTerm);
                  else searchAddonRef.current?.findNext(searchTerm);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  closeSearch();
                }
              }}
            />
            <IconButton size={24} variant="subtle" title="Previous (Shift+Enter)"
              onClick={() => searchAddonRef.current?.findPrevious(searchTerm)}>
              <ChevronDownIcon size={13} style={{ transform: 'rotate(180deg)' }} />
            </IconButton>
            <IconButton size={24} variant="subtle" title="Next (Enter)"
              onClick={() => searchAddonRef.current?.findNext(searchTerm)}>
              <ChevronDownIcon size={13} />
            </IconButton>
            <IconButton size={24} variant="danger" title="Close (Esc)" onClick={closeSearch}>
              <XIcon size={12} />
            </IconButton>
          </div>
        )}
      </div>

      {/* tmux-style status strip */}
      <div className="term-statusbar">
        <span className={`term-statusbar__dot${sessionEnded ? ' term-statusbar__dot--ended' : ''}`} />
        <span>{sessionEnded ? 'Session ended' : 'PowerShell'}</span>
        {sessionEnded && (
          <IconButton size={20} variant="subtle" title="Restart shell" onClick={handleRestart}>
            <RefreshIcon size={12} />
          </IconButton>
        )}
        <span className="term-statusbar__spacer" />
        <span>DockShift</span>
      </div>
    </ResizablePanel>
  );

  return ReactDOM.createPortal(panel, document.body);
}
