import { useRef, useState } from 'react';
import SnapsIcon from './SnapsIcon';
import WorkspacePanel from './WorkspacePanel';
import ClipboardPanel from './ClipboardPanel';
import VoicePanel from './VoicePanel';
import NotesPanel from './NotesPanel';
import AiPanel from './AiPanel';
import ScreenshotPanel from './ScreenshotPanel';
import SettingsPanel from './SettingsPanel';
import LauncherPanel from './LauncherPanel';
import TerminalPanel from './TerminalPanel';
import BrowserPanel from './BrowserPanel';
import '../styles/DockMenu.css';

const DOCK_ITEMS = [
  { id: 'folder', action: 'folder', tooltip: 'Snapshots', icon: <SnapsIcon /> },
  { id: 'terminal', action: 'terminal', tooltip: 'Terminal', icon: <TerminalIcon /> },
  { id: 'browser', action: 'browser', tooltip: 'Browser', icon: <BrowserIcon /> },
  { id: 'sep1', separator: true },
  { id: 'camera', action: 'camera', tooltip: 'Screenshots', icon: <CameraIcon /> },
  { id: 'sparkle', action: 'sparkle', tooltip: 'AI Assistant', icon: <SparkleIcon /> },
  { id: 'clipboard', action: 'clipboard', tooltip: 'Clipboard History', icon: <ClipboardIcon /> },
  { id: 'mic', action: 'mic', tooltip: 'Voice to Text', icon: <MicIcon /> },
  { id: 'sep2', separator: true },
  { id: 'lightning', action: 'lightning', tooltip: 'Quick Launcher', icon: <LightningIcon /> },
  { id: 'notes', action: 'notes', tooltip: 'Quick Notes', icon: <NotesIcon /> },
  { id: 'sep3', separator: true },
  { id: 'settings', action: 'settings', tooltip: 'Settings', icon: <SettingsIcon /> },
];

// Items that have panels (open/close behavior)
const PANEL_IDS = new Set(['folder', 'clipboard', 'mic', 'notes', 'sparkle', 'camera', 'settings', 'lightning', 'terminal', 'browser']);

function TerminalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function BrowserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="2" y1="8" x2="22" y2="8" />
      <line x1="8" y1="12" x2="8.01" y2="12" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      <path d="M19 14l.75 2.25L22 17l-2.25.75L19 20l-.75-2.25L16 17l2.25-.75L19 14z" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <path d="M9 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-3" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function LightningIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export default function DockMenu({ onAction, activePanel }) {
  const [hoveredId, setHoveredId] = useState(null);
  const [snapsReady] = useState(false);
  const [openPanel, setOpenPanel] = useState(null); // unified panel state
  const [anchorRect, setAnchorRect] = useState(null);
  const api = window.electronAPI;
  const dockRef = useRef(null);

  const handleClick = (item, e) => {
    if (PANEL_IDS.has(item.id)) {
      if (openPanel === item.id) {
        // Toggle off
        setOpenPanel(null);
        if (api?.invoke) api.invoke('dock:setExpanded', { expanded: false });
      } else {
        // Open this panel
        const rect = e.currentTarget.getBoundingClientRect();
        setAnchorRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height, bottom: rect.bottom, right: rect.right });
        setOpenPanel(item.id);
        if (api?.invoke) api.invoke('dock:setExpanded', { expanded: true });
      }
      onAction(item.action);
    } else {
      onAction(item.action);
    }
  };

  const closePanel = () => {
    setOpenPanel(null);
    if (api?.invoke) api.invoke('dock:setExpanded', { expanded: false });
  };

  return (
    <>
      <div className={`dock-menu${openPanel ? ' panel-open' : ''}`}>
        <div className="dock-items" ref={dockRef}>
          {DOCK_ITEMS.map((item) => {
            if (item.separator) {
              return <div key={item.id} className="dock-separator" />;
            }
            return (
            <button
              key={item.id}
              className={`dock-item ${activePanel === item.action ? 'active' : ''} ${item.id === 'folder' && snapsReady ? 'snaps-ready' : ''}`}
              data-dock-action={item.action}
              onClick={(e) => handleClick(item, e)}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
              title={item.tooltip}
            >
              <span className="dock-icon">{item.icon}</span>
              {hoveredId === item.id && (
                <span className="dock-tooltip">{item.tooltip}</span>
              )}
              {item.id === 'folder' && snapsReady && (
                <span className="snaps-indicator" />
              )}
            </button>
            );
          })}
        </div>
      </div>

      {/* Panels */}
      <WorkspacePanel isOpen={openPanel === 'folder'} anchorRect={anchorRect} onClose={closePanel} />
      <ClipboardPanel isOpen={openPanel === 'clipboard'} anchorRect={anchorRect} onClose={closePanel} />
      <VoicePanel isOpen={openPanel === 'mic'} anchorRect={anchorRect} onClose={closePanel} />
      <NotesPanel isOpen={openPanel === 'notes'} anchorRect={anchorRect} onClose={closePanel} />
      <AiPanel isOpen={openPanel === 'sparkle'} anchorRect={anchorRect} onClose={closePanel} />
      <ScreenshotPanel isOpen={openPanel === 'camera'} anchorRect={anchorRect} onClose={closePanel} />
      <SettingsPanel isOpen={openPanel === 'settings'} anchorRect={anchorRect} onClose={closePanel} />
      <LauncherPanel isOpen={openPanel === 'lightning'} anchorRect={anchorRect} onClose={closePanel} />
      <TerminalPanel isOpen={openPanel === 'terminal'} anchorRect={anchorRect} onClose={closePanel} />
      <BrowserPanel isOpen={openPanel === 'browser'} anchorRect={anchorRect} onClose={closePanel} />
    </>
  );
}
