import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { HEADER_STYLE, TITLE_STYLE, CLOSE_BTN, SCROLL_AREA } from '../hooks/usePanelPosition';
import { useTheme } from '../context/ThemeContext';
import ResizablePanel from './ResizablePanel';
import AiSettings from './AiSettings';

const THEME_OPTIONS = [
  { value: 'light', label: '☀️ Light' },
  { value: 'dark', label: '🌙 Dark' },
  { value: 'system', label: '💻 System' },
];

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
        <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ds-text-primary)', letterSpacing: '-0.01em' }}>{label}</div>
        {description && <div style={{ fontSize: 10.5, color: 'var(--ds-text-faint)', marginTop: 3, lineHeight: 1.4 }}>{description}</div>}
      </div>
      <button onClick={() => onChange(!value)} style={{
        width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: value
          ? 'linear-gradient(135deg, rgba(110,125,255,0.6), rgba(74,193,255,0.4))'
          : 'var(--ds-bg-hover)',
        position: 'relative',
        transition: 'background 0.3s ease, box-shadow 0.3s ease',
        flexShrink: 0,
        WebkitAppRegion: 'no-drag',
        boxShadow: value ? '0 0 12px rgba(110,125,255,0.25)' : 'none',
      }}>
        <span style={{
          position: 'absolute', top: 3, left: value ? 21 : 3,
          width: 18, height: 18, borderRadius: '50%',
          background: value ? 'var(--ds-text-primary)' : 'var(--ds-text-faint)',
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
        fontSize: 10, fontWeight: 700, color: 'var(--ds-text-dim)',
        textTransform: 'uppercase', letterSpacing: '0.1em', padding: '10px 0 6px',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {icon && <span style={{ fontSize: 11 }}>{icon}</span>}
        {title}
      </div>
      <div style={{
        background: 'var(--ds-bg-subtle)',
        border: '1px solid var(--ds-border)',
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
  });
  const panelRef = useRef(null);
  const api = useMemo(() => window.electronAPI, []);
  const { theme, setTheme } = useTheme();

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
    background: 'var(--ds-bg-input)',
    border: '1px solid var(--ds-border)',
    borderRadius: 8,
    color: 'var(--ds-text-secondary)',
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
    >
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>⚙️ Settings</span>
        <button onClick={onClose} style={CLOSE_BTN}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--ds-text-primary)'; e.currentTarget.style.background = 'var(--ds-danger-bg)'; e.currentTarget.style.borderColor = 'var(--ds-danger-border)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--ds-text-faint)'; e.currentTarget.style.background = 'var(--ds-bg-input)'; e.currentTarget.style.borderColor = 'var(--ds-border)'; }}>✕</button>
      </div>

      <div style={SCROLL_AREA}>
        <Section title="Appearance" icon="🎨">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', WebkitAppRegion: 'no-drag' }}>
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: 'var(--ds-text-primary)' }}>Theme</span>
            <select value={theme} onChange={e => setTheme(e.target.value)} style={selStyle}>
              {THEME_OPTIONS.map(t => (
                <option key={t.value} value={t.value} style={{ background: 'var(--ds-bg-elevated)', color: 'var(--ds-text-primary)' }}>{t.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', WebkitAppRegion: 'no-drag' }}>
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: 'var(--ds-text-primary)' }}>Dock Position</span>
            <select value={settings.dockPosition} onChange={e => update('dockPosition', e.target.value)} style={selStyle}>
              {POSITIONS.map(p => <option key={p.value} value={p.value} style={{ background: 'var(--ds-bg-elevated)', color: 'var(--ds-text-primary)' }}>{p.label}</option>)}
            </select>
          </div>
          <Toggle label="Always on Top" value={settings.alwaysOnTop} onChange={v => update('alwaysOnTop', v)} />
        </Section>

        <Section title="AI / Models" icon="✨">
          <AiSettings settings={settings} update={update} api={api} />
        </Section>

        <Section title="System" icon="💻">
          <Toggle label="Launch on Startup" description="Start DockShift when Windows boots"
            value={settings.launchOnStartup} onChange={v => update('launchOnStartup', v)} />
        </Section>

        <Section title="Clipboard" icon="📋">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', WebkitAppRegion: 'no-drag' }}>
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: 'var(--ds-text-primary)' }}>Max History Items</span>
            <select value={settings.clipboardMaxItems} onChange={e => update('clipboardMaxItems', Number(e.target.value))} style={selStyle}>
              {[50, 100, 200, 500].map(n => <option key={n} value={n} style={{ background: 'var(--ds-bg-elevated)', color: 'var(--ds-text-primary)' }}>{n}</option>)}
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
                    background: 'var(--ds-accent-bg-soft)',
                    border: '1px solid var(--ds-accent-bg)',
                    fontFamily: "'Inter', monospace", fontSize: 11, fontWeight: 600,
                    color: 'var(--ds-text-secondary)', letterSpacing: '0.02em',
                  }}>{key}</span>
                  {i < 2 && <span style={{ color: 'var(--ds-text-dim)', margin: '0 2px', fontSize: 10 }}>+</span>}
                </span>
              ))}
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--ds-text-faint)' }}>Toggle dock</span>
          </div>
        </Section>

        <Section title="About" icon="ℹ️">
          <div style={{ padding: '10px 0' }}>
            <div style={{
              fontWeight: 700, fontSize: 13, marginBottom: 4,
              color: 'var(--ds-text-primary)',
            }}>DockShift v1.0.0</div>
            <div style={{ fontSize: 11, color: 'var(--ds-text-faint)', lineHeight: 1.5 }}>
              A floating productivity dock for Windows.
            </div>
          </div>
        </Section>
      </div>
    </ResizablePanel>
  );

  return ReactDOM.createPortal(panel, document.body);
}
