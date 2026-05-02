import { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { HEADER_STYLE, TITLE_STYLE, CLOSE_BTN } from '../hooks/usePanelPosition';
import ResizablePanel from './ResizablePanel';
import '@xterm/xterm/css/xterm.css';

export default function TerminalPanel({ isOpen, onClose, anchorRect }) {
  const panelRef = useRef(null);
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [isSpawned, setIsSpawned] = useState(false);
  const api = useMemo(() => window.electronAPI, []);


  useEffect(() => {
    if (!isOpen || !terminalRef.current) return;

    if (!xtermRef.current) {
      // Initialize xterm
      const term = new Terminal({
        fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
        fontSize: 13,
        lineHeight: 1.2,
        theme: {
          background: 'transparent',
          foreground: '#f8f8f2',
          cursor: '#f8f8f0',
          cursorAccent: '#282a36',
          selectionBackground: 'rgba(255, 255, 255, 0.3)',
          black: '#21222c',
          red: '#ff5555',
          green: '#50fa7b',
          yellow: '#f1fa8c',
          blue: '#bd93f9',
          magenta: '#ff79c6',
          cyan: '#8be9fd',
          white: '#f8f8f2',
          brightBlack: '#6272a4',
          brightRed: '#ff6e6e',
          brightGreen: '#69ff94',
          brightYellow: '#ffffa5',
          brightBlue: '#d6acff',
          brightMagenta: '#ff92df',
          brightCyan: '#a4ffff',
          brightWhite: '#ffffff'
        },
        cursorBlink: true,
        allowProposedApi: true
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);
      fitAddon.fit();

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      // Handle user input
      term.onData((data) => {
        api.invoke('terminal:write', { data });
      });

      // Handle resize
      term.onResize(({ cols, rows }) => {
        api.invoke('terminal:resize', { cols, rows });
      });
    }

    // Spawn the backend process if not already spawned
    if (!isSpawned) {
      api.invoke('terminal:spawn').then(() => {
        setIsSpawned(true);
        if (fitAddonRef.current) fitAddonRef.current.fit();
      });
    }

    // Handle data from backend
    const cleanupOnData = api.onTerminalData((data) => {
      if (xtermRef.current) {
        xtermRef.current.write(data);
      }
    });

    // Resize observer to auto-fit terminal on panel resize
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    });
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    // Focus terminal slightly after opening
    const focusTimeout = setTimeout(() => {
      if (xtermRef.current) {
        xtermRef.current.focus();
        
        // Print the panda once on initialization
        if (!xtermRef.current._hasPrintedPanda) {
          xtermRef.current._hasPrintedPanda = true;
          const t = xtermRef.current;
          t.writeln('\x1b[38;2;230;80;50m    _..---.._    \x1b[0m');
          t.writeln('\x1b[38;2;230;80;50m  .\'  _   _  \'.  \x1b[0m');
          t.writeln('\x1b[38;2;230;80;50m /   \x1b[38;2;255;255;255m(o_ _o)\x1b[38;2;230;80;50m   \\ \x1b[0m');
          t.writeln('\x1b[38;2;230;80;50m |    \x1b[38;2;255;255;255m_ " _\x1b[38;2;230;80;50m    | \x1b[0m');
          t.writeln('\x1b[38;2;230;80;50m \\   \x1b[38;2;255;255;255m\'--Y--\'\x1b[38;2;230;80;50m   / \x1b[0m');
          t.writeln('\x1b[38;2;230;80;50m  \'._\x1b[38;2;50;50;50m#######\x1b[38;2;230;80;50m_.  \x1b[0m');
          t.writeln('\x1b[38;2;230;80;50m     \'--^--\'     \x1b[0m');
          t.writeln('\x1b[38;2;154;165;255m Welcome to Float Dock Terminal!\x1b[0m\r\n');
          // send an enter to get the prompt
          api.invoke('terminal:write', { data: '\r' });
        }
      }
    }, 150);

    return () => {
      cleanupOnData();
      resizeObserver.disconnect();
      clearTimeout(focusTimeout);
    };
  }, [isOpen, api, isSpawned]);

  // Clean up terminal on unmount
  useEffect(() => {
    return () => {
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
    };
  }, []);

  // When reopened, refit terminal
  useEffect(() => {
    if (isOpen && fitAddonRef.current) {
      setTimeout(() => fitAddonRef.current.fit(), 50);
    }
  }, [isOpen]);

  if (!anchorRect) return null;

  const panel = (
    <ResizablePanel
      isOpen={isOpen}
      dockAction="terminal"
      defaultWidth={600}
      defaultHeight={480}
      minWidth={300}
      minHeight={250}
      style={{
        background: 'radial-gradient(circle at top left, #1c1e26, #151820)',
      }}
    >
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>🖥️ Terminal</span>
        <button onClick={() => { if (xtermRef.current) xtermRef.current.clear(); }}
          style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6, color: 'rgba(255,255,255,0.5)', fontSize: 11, padding: '4px 8px',
            cursor: 'pointer', WebkitAppRegion: 'no-drag',
          }}>Clear</button>
        <button onClick={onClose} style={CLOSE_BTN}
          onMouseEnter={e => e.currentTarget.style.color = '#fff'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}>✕</button>
      </div>

      <div style={{
        flex: 1, position: 'relative', overflow: 'hidden', padding: '0 8px 8px 8px',
        WebkitAppRegion: 'no-drag', background: 'transparent'
      }}>
        {/* xterm.js container */}
        <div ref={terminalRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </ResizablePanel>
  );

  return ReactDOM.createPortal(panel, document.body);
}
