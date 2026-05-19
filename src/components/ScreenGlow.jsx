import { useEffect, useState } from 'react';

/**
 * Brief Copilot-style edge glow at the four corners of the viewport. Fires on
 * the custom `dockshift:screen-glow` window event (currently dispatched from
 * SaveWorkspaceModal on successful snapshot save). Pointer-events: none so it
 * never blocks input. Mounted once at App.jsx root.
 *
 * Why a custom event instead of a prop chain: the trigger lives several
 * components deep (WorkspacePanel → SaveWorkspaceModal) but the glow renders
 * at the App root. A window event keeps both ends decoupled.
 */
const GLOW_DURATION_MS = 900;

export default function ScreenGlow() {
  // Each fire bumps a key so React unmounts/remounts the inner div, restarting
  // the CSS animation cleanly even if the user double-saves rapidly.
  const [fireCount, setFireCount] = useState(0);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onFire = () => {
      setFireCount((n) => n + 1);
      setActive(true);
    };
    window.addEventListener('dockshift:screen-glow', onFire);
    return () => window.removeEventListener('dockshift:screen-glow', onFire);
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    const t = setTimeout(() => setActive(false), GLOW_DURATION_MS);
    return () => clearTimeout(t);
  }, [active, fireCount]);

  if (!active) return null;

  return <div key={fireCount} className="ds-screen-glow" aria-hidden="true" />;
}
