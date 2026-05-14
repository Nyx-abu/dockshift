import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { HEADER_STYLE, TITLE_STYLE, SCROLL_AREA } from '../hooks/usePanelPosition';
import { useTheme } from '../context/ThemeContext';
import ResizablePanel from './ResizablePanel';
import AiSettings from './AiSettings';
import {
  IconButton,
  Select,
  Switch,
  SegmentedControl,
  SectionGroup,
  SettingRow,
  Keys,
  XIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
} from './ui';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: <SunIcon size={13} /> },
  { value: 'dark', label: 'Dark', icon: <MoonIcon size={13} /> },
  { value: 'system', label: 'System', icon: <MonitorIcon size={13} /> },
];

const POSITIONS = [
  { value: 'bottom-center', label: 'Bottom Center' },
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'top-center', label: 'Top Center' },
];

const CLIPBOARD_LIMITS = [50, 100, 200, 500].map((n) => ({ value: n, label: String(n) }));

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
    api?.invoke?.('settings:get')?.then((s) => { if (s) setSettings((prev) => ({ ...prev, ...s })); })?.catch(() => {});
  }, [isOpen, api]);

  const update = useCallback((key, value) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      api?.invoke?.('settings:set', { settings: next })?.catch(() => {});
      return next;
    });
  }, [api]);

  if (!isOpen || !anchorRect) return null;

  const panel = (
    <ResizablePanel isOpen={isOpen} dockAction="settings">
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>Settings</span>
        <IconButton variant="danger" title="Close" onClick={onClose}>
          <XIcon size={14} />
        </IconButton>
      </div>

      <div style={SCROLL_AREA}>
        <SectionGroup title="Appearance">
          <SettingRow
            label="Theme"
            control={<SegmentedControl value={theme} onChange={setTheme} options={THEME_OPTIONS} />}
          />
          <SettingRow
            label="Dock Position"
            control={
              <Select
                value={settings.dockPosition}
                onChange={(v) => update('dockPosition', v)}
                options={POSITIONS}
                style={{ width: 150 }}
              />
            }
          />
          <SettingRow
            label="Always on Top"
            description="Keep the dock above other windows"
            control={
              <Switch
                checked={!!settings.alwaysOnTop}
                onChange={(v) => update('alwaysOnTop', v)}
              />
            }
          />
        </SectionGroup>

        <SectionGroup title="AI & Models">
          <AiSettings settings={settings} update={update} api={api} />
        </SectionGroup>

        <SectionGroup title="System">
          <SettingRow
            label="Launch on Startup"
            description="Start DockShift when Windows boots"
            control={
              <Switch
                checked={!!settings.launchOnStartup}
                onChange={(v) => update('launchOnStartup', v)}
              />
            }
          />
        </SectionGroup>

        <SectionGroup title="Clipboard">
          <SettingRow
            label="Max History Items"
            description="Older entries are dropped past this limit"
            control={
              <Select
                value={settings.clipboardMaxItems}
                onChange={(v) => update('clipboardMaxItems', v)}
                options={CLIPBOARD_LIMITS}
                style={{ width: 90 }}
              />
            }
          />
        </SectionGroup>

        <SectionGroup title="Shortcuts">
          <SettingRow label="Toggle dock" control={<Keys keys={['Ctrl', 'Shift', 'D']} />} />
        </SectionGroup>

        <SectionGroup title="About">
          <div style={{ padding: 'var(--ds-space-3) 0' }}>
            <div style={{
              fontWeight: 'var(--ds-weight-semibold)',
              fontSize: 'var(--ds-font-base)',
              color: 'var(--ds-text-strong)',
              marginBottom: 2,
            }}>
              DockShift v1.0.0
            </div>
            <div style={{
              fontSize: 'var(--ds-font-sm)',
              color: 'var(--ds-text-muted)',
              lineHeight: 1.5,
            }}>
              A floating productivity dock for Windows.
            </div>
          </div>
        </SectionGroup>
      </div>
    </ResizablePanel>
  );

  return ReactDOM.createPortal(panel, document.body);
}
