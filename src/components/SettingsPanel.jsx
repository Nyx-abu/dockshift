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
import HotkeyRecorder from './HotkeyRecorder';
import UpdateStatus from './UpdateStatus';

const DEFAULT_TOGGLE_SHORTCUT = 'Control+Shift+D';

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
    toggleDockShortcut: DEFAULT_TOGGLE_SHORTCUT,
    analyticsEnabled: false,
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
          <SettingRow
            label="Help improve DockShift"
            description="Send anonymous usage stats once a day (version, OS, country). No personal data, no telemetry inside the app. Off by default."
            control={
              <Switch
                checked={!!settings.analyticsEnabled}
                onChange={async (v) => {
                  // Optimistic update; rollback if the IPC says no.
                  setSettings((prev) => ({ ...prev, analyticsEnabled: v }));
                  const r = await api?.invoke?.('analytics:setEnabled', { enabled: v });
                  if (!r?.ok) {
                    setSettings((prev) => ({ ...prev, analyticsEnabled: !v }));
                  }
                }}
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
          <SettingRow
            label="Toggle dock"
            description="Global hotkey that shows or hides the dock from anywhere"
            control={
              <HotkeyRecorder
                value={settings.toggleDockShortcut || DEFAULT_TOGGLE_SHORTCUT}
                defaultValue={DEFAULT_TOGGLE_SHORTCUT}
                onChange={async (accel) => {
                  const r = await api?.invoke?.('settings:hotkey:set', { accelerator: accel });
                  if (r?.ok) {
                    setSettings((prev) => ({ ...prev, toggleDockShortcut: r.accelerator }));
                  }
                  return r;
                }}
              />
            }
          />
        </SectionGroup>

        <SectionGroup title="About">
          <UpdateStatus />
        </SectionGroup>
      </div>
    </ResizablePanel>
  );

  return ReactDOM.createPortal(panel, document.body);
}
