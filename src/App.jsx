import { useEffect, useMemo, useState } from 'react';
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

  const api = useMemo(() => window.electronAPI, []);

  const handleAction = (action) => {
    if (action === 'snaps-restore') {
      // Handle snapshot restore
      console.log('Restoring workspace from snapshot...');
      // The actual restore logic is in DockMenu component
    } else {
      console.log('Action:', action);
      setActivePanel(action);
    }
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
