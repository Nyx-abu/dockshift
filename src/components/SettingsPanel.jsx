import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { HEADER_STYLE, TITLE_STYLE, CLOSE_BTN, SCROLL_AREA } from '../hooks/usePanelPosition';
import ResizablePanel from './ResizablePanel';

const POSITIONS = [
  { value: 'bottom-center', label: 'Bottom Center' },
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'top-center', label: 'Top Center' },
];

function Toggle({ value, onChange, label, description }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
        WebkitAppRegion: 'no-drag',
        opacity: hovered ? 1 : 0.9,
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: '#fff', letterSpacing: '-0.01em' }}>{label}</div>
        {description && <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)', marginTop: 3, lineHeight: 1.4 }}>{description}</div>}
      </div>
      <button onClick={() => onChange(!value)} style={{
        width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: value
          ? 'linear-gradient(135deg, rgba(110,125,255,0.6), rgba(74,193,255,0.4))'
          : 'rgba(255,255,255,0.08)',
        position: 'relative',
        transition: 'background 0.3s ease, box-shadow 0.3s ease',
        flexShrink: 0,
        WebkitAppRegion: 'no-drag',
        boxShadow: value ? '0 0 12px rgba(110,125,255,0.25)' : 'none',
      }}>
        <span style={{
          position: 'absolute', top: 3, left: value ? 21 : 3,
          width: 18, height: 18, borderRadius: '50%',
          background: value ? '#fff' : 'rgba(255,255,255,0.4)',
          transition: 'left 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.5), background 0.2s',
          boxShadow: value ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
        }} />
      </button>
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.2)',
        textTransform: 'uppercase', letterSpacing: '0.1em', padding: '10px 0 6px',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {icon && <span style={{ fontSize: 11 }}>{icon}</span>}
        {title}
      </div>
      <div style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 12, padding: '4px 14px',
        transition: 'border-color 0.2s',
      }}>{children}</div>
    </div>
  );
}

export default function SettingsPanel({ isOpen, onClose, anchorRect }) {
  const [settings, setSettings] = useState({
    dockPosition: 'bottom-center',
    alwaysOnTop: true,
    launchOnStartup: false,
    clipboardMaxItems: 200,
    clipboardPollingMs: 500,
    theme: 'dark',
  });
  const panelRef = useRef(null);
  const api = useMemo(() => window.electronAPI, []);

  useEffect(() => {
    if (!isOpen) return;
    api?.invoke?.('settings:get')?.then(s => { if (s) setSettings(prev => ({ ...prev, ...s })); })?.catch(() => {});
  }, [isOpen, api]);

  const update = useCallback((key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      api?.invoke?.('settings:set', { settings: next })?.catch(() => {});
      return next;
    });
  }, [api]);

  if (!isOpen || !anchorRect) return null;

  const selStyle = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11.5,
    padding: '6px 10px',
    cursor: 'pointer',
    outline: 'none',
    WebkitAppRegion: 'no-drag',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s',
  };

  const panel = (
    <ResizablePanel
      isOpen={isOpen}
      dockAction="settings"
      defaultWidth={370}
      defaultHeight={440}
      minWidth={300}
      minHeight={300}
    >
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>⚙️ Settings</span>
        <button onClick={onClose} style={CLOSE_BTN}
          onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,59,48,0.15)'; e.currentTarget.style.borderColor = 'rgba(255,59,48,0.3)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}>✕</button>
      </div>

      <div style={SCROLL_AREA}>
        <Section title="Appearance" icon="🎨">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', WebkitAppRegion: 'no-drag' }}>
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: '#fff' }}>Dock Position</span>
            <select value={settings.dockPosition} onChange={e => update('dockPosition', e.target.value)} style={selStyle}>
              {POSITIONS.map(p => <option key={p.value} value={p.value} style={{ background: '#14161e', color: '#fff' }}>{p.label}</option>)}
            </select>
          </div>
          <Toggle label="Always on Top" value={settings.alwaysOnTop} onChange={v => update('alwaysOnTop', v)} />
        </Section>

        <Section title="System" icon="💻">
          <Toggle label="Launch on Startup" description="Start Float Dock when Windows boots"
            value={settings.launchOnStartup} onChange={v => update('launchOnStartup', v)} />
        </Section>

        <Section title="Clipboard" icon="📋">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', WebkitAppRegion: 'no-drag' }}>
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: '#fff' }}>Max History Items</span>
            <select value={settings.clipboardMaxItems} onChange={e => update('clipboardMaxItems', Number(e.target.value))} style={selStyle}>
              {[50, 100, 200, 500].map(n => <option key={n} value={n} style={{ background: '#14161e', color: '#fff' }}>{n}</option>)}
            </select>
          </div>
        </Section>

        <Section title="Keyboard Shortcuts" icon="⌨️">
          <div style={{ padding: '10px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              display: 'flex', gap: 4,
            }}>
              {['Ctrl', 'Shift', 'D'].map((key, i) => (
                <span key={i}>
                  <span style={{
                    padding: '4px 8px', borderRadius: 6,
                    background: 'rgba(110,125,255,0.08)',
                    border: '1px solid rgba(110,125,255,0.15)',
                    fontFamily: "'Inter', monospace", fontSize: 11, fontWeight: 600,
                    color: 'rgba(255,255,255,0.7)', letterSpacing: '0.02em',
                  }}>{key}</span>
                  {i < 2 && <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 2px', fontSize: 10 }}>+</span>}
                </span>
              ))}
            </div>
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.3)' }}>Toggle dock</span>
          </div>
        </Section>

        <Section title="About" icon="ℹ️">
          <div style={{ padding: '10px 0' }}>
            <div style={{
              fontWeight: 700, fontSize: 13, marginBottom: 4,
              color: '#fff',
            }}>Float Dock v1.0.0</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
              A floating productivity dock for Windows.
            </div>
          </div>
        </Section>
      </div>
    </ResizablePanel>
  );

  return ReactDOM.createPortal(panel, document.body);
}
