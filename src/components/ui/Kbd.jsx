/**
 * Kbd — a single keycap. Render a sequence for a shortcut:
 *   <Kbd>Ctrl</Kbd><KbdSep /><Kbd>Shift</Kbd><KbdSep /><Kbd>D</Kbd>
 * or pass an array to <Keys keys={['Ctrl','Shift','D']} />.
 */
export default function Kbd({ children, ...rest }) {
  return <kbd className="ds-kbd" {...rest}>{children}</kbd>;
}

export function KbdSep() {
  return <span className="ds-kbd-sep">+</span>;
}

/** Convenience: render a full shortcut from an array of key labels. */
export function Keys({ keys = [] }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {keys.map((k, i) => (
        <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          {i > 0 && <KbdSep />}
          <Kbd>{k}</Kbd>
        </span>
      ))}
    </span>
  );
}
