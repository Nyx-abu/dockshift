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

  return (
    <div
      className={`dock-container ${restoreAnim ? 'layout-restore' : ''}`}
      style={{
        transition: 'width 180ms ease',
      }}
    >
      <DockMenu onAction={handleAction} activePanel={activePanel} />
    </div>
  );
}
