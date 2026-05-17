import { useEffect, useMemo, useRef, useState } from 'react';
import DockMenu from './components/DockMenu';
import './styles/App.css';

export default function App() {
  const [activePanel, setActivePanel] = useState(null);
  const [dockLayout, setDockLayout] = useState({
    position: 'right',
    width: 480,
    activeTabId: null,
  });
  const [restoreAnim, setRestoreAnim] = useState(false);
  // Which screen edge the dock bar aligns to. Drives the data-dock-pos
  // attribute below; CSS does the actual alignment. Kept in sync with the
  // main process so changing it in Settings takes effect live.
  const [dockPos, setDockPos] = useState('bottom-center');
  // Once the main process has handed us the saved layout we flip this true,
  // and only then does the activePanel-effect start writing back. Prevents
  // the initial `null` from clobbering whatever the user had open.
  const layoutHydrated = useRef(false);

  const api = useMemo(() => window.electronAPI, []);

  const handleAction = (action) => {
    if (action === 'snaps-restore') {
      // Restore handled by DockMenu — don't change activePanel.
      return;
    }
    setActivePanel(action);
  };

  useEffect(() => {
    if (!api?.onDockLayoutRestore) return undefined;

    const unsubscribe = api.onDockLayoutRestore(async (layout) => {
      if (!layout) return;

      // Update renderer state (for UI/animation)
      setDockLayout(layout);
      if (layout.activeTabId) setActivePanel(layout.activeTabId);

      // Tiny animation pulse
      setRestoreAnim(true);
      setTimeout(() => setRestoreAnim(false), 240);

      // Ask main process to reposition/resize the BrowserWindow
      try {
        await api.invoke('dock:applyLayout', { layout });
      } catch (e) {
        console.warn('dock:applyLayout failed', e);
      }
    });

    return unsubscribe;
  }, [api]);

  // Track the dock position: load the saved value once, then follow live
  // updates the main process pushes when it changes in Settings.
  useEffect(() => {
    if (!api) return undefined;
    api.invoke?.('settings:get')
      ?.then(s => { if (s?.dockPosition) setDockPos(s.dockPosition); })
      ?.catch(() => {});
    return api.onDockPosition?.((pos) => { if (pos) setDockPos(pos); });
  }, [api]);

  // Non-activating-dock support: the BrowserWindow is created with
  // `focusable: false` so dock-bar clicks never steal focus from the user's
  // foreground app. When the user clicks a typing element (input/textarea/
  // contenteditable/xterm), flip focusable→true so the natural click-focus
  // flow lands the caret. Capture phase so we fire before React handlers.
  useEffect(() => {
    if (!api?.invoke) return undefined;
    const TYPING_SELECTOR = 'input, textarea, [contenteditable="true"], .xterm, .xterm-helper-textarea';
    const onMouseDown = (e) => {
      const t = e.target;
      if (t && t.closest && t.closest(TYPING_SELECTOR)) {
        api.invoke('dock:activate').catch(() => {});
      }
    };
    document.addEventListener('mousedown', onMouseDown, true);
    return () => document.removeEventListener('mousedown', onMouseDown, true);
  }, [api]);

  // Windows Explorer context-menu integration: main process pushes
  // `shell:openPanel` after handling a `--shell-<kind>` launch (or a second
  // instance fired from a right-click). Switch to the requested panel.
  // Notes get an extra `noteId` so the panel can scroll the new note into view.
  useEffect(() => {
    if (!api?.on) return undefined;
    const unsubscribe = api.on('shell:openPanel', (payload) => {
      if (!payload || !payload.panel) return;
      setActivePanel(payload.panel);
      if (payload.panel === 'notes' && payload.noteId) {
        // Stash for NotesPanel to pick up on its next render — read once.
        window.__dockshiftPendingNoteId = payload.noteId;
      }
    });
    // Tell main we're ready so it can drain any startup-time pending intent.
    api.invoke?.('shell:rendererReady')?.catch?.(() => {});
    return unsubscribe;
  }, [api]);

  // Hydrate the last-open panel from the persisted dock layout. Until this
  // resolves we keep `layoutHydrated.current` false so the save-effect below
  // doesn't write a `null` activePanel over the user's saved one.
  useEffect(() => {
    let cancelled = false;
    api?.invoke?.('dock:layout:get')
      ?.then((layout) => {
        if (cancelled) return;
        if (layout?.activeTabId) setActivePanel(layout.activeTabId);
        layoutHydrated.current = true;
      })
      ?.catch(() => { layoutHydrated.current = true; });
    return () => { cancelled = true; };
  }, [api]);

  // Persist the active panel whenever it changes. The main process debounces
  // the actual disk write; this side just fires a single IPC per change.
  useEffect(() => {
    if (!layoutHydrated.current) return;
    api?.invoke?.('dock:layout:save', {
      layout: {
        activeTabId: activePanel,
        openWidgets: activePanel ? [activePanel] : [],
        position: dockPos,
      },
    })?.catch(() => {});
  }, [api, activePanel, dockPos]);

  return (
    <div
      className={`dock-container ${restoreAnim ? 'layout-restore' : ''}`}
      data-dock-pos={dockPos}
      style={{
        transition: 'width 180ms ease',
      }}
    >
      <DockMenu onAction={handleAction} activePanel={activePanel} />
    </div>
  );
}
