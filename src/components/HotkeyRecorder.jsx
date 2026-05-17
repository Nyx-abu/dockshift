import { useCallback, useEffect, useRef, useState } from 'react';
import { Keys, EditIcon } from './ui';

// Electron accelerator format reference:
// https://www.electronjs.org/docs/latest/api/accelerator
// We emit canonical names ("Control", "Alt", "Shift", "Meta", "F1", "Up", "A")
// so the main process can register without further normalization.

const SPECIAL_KEY_MAP = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Enter: 'Return',
  Escape: 'Esc',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
};

function eventToAccelerator(e) {
  // Pure modifier presses don't form a complete shortcut yet — wait for the
  // user to press the actual key.
  if (['Control', 'Shift', 'Alt', 'Meta', 'OS'].includes(e.key)) return null;

  const parts = [];
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');

  let main;
  if (/^Key[A-Z]$/.test(e.code)) main = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) main = e.code.slice(5);
  else if (/^F\d{1,2}$/.test(e.code)) main = e.code;
  else if (SPECIAL_KEY_MAP[e.key]) main = SPECIAL_KEY_MAP[e.key];
  else if (e.key && e.key.length === 1) main = e.key.toUpperCase();
  else return null;

  // Require a non-Shift modifier — "Shift+A" alone would hijack normal typing
  // of capital letters globally, which is almost never what the user wants.
  if (!e.ctrlKey && !e.altKey && !e.metaKey) return null;
  parts.push(main);
  return parts.join('+');
}

function acceleratorToKeyLabels(accel) {
  if (!accel) return [];
  return accel.split('+').map((p) => {
    if (p === 'Control' || p === 'CommandOrControl') return 'Ctrl';
    if (p === 'Meta') return 'Win';
    if (p === 'Return') return 'Enter';
    if (p === 'Esc') return 'Esc';
    return p;
  });
}

// Styles live in ui.css under .ds-hotkey-recorder so :hover and :focus-visible
// can be real CSS states (inline styles can't express those).

export default function HotkeyRecorder({ value, defaultValue, onChange }) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState(null);
  const buttonRef = useRef(null);

  const stopRecording = useCallback(() => {
    setRecording(false);
    if (buttonRef.current) buttonRef.current.blur();
  }, []);

  const submit = useCallback(async (accel) => {
    setError(null);
    const result = await onChange(accel);
    if (result && result.ok === false) {
      setError(result.error || 'Could not register that shortcut');
    }
    stopRecording();
  }, [onChange, stopRecording]);

  useEffect(() => {
    if (!recording) return;

    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        stopRecording();
        return;
      }
      const accel = eventToAccelerator(e);
      if (!accel) return;
      submit(accel);
    };

    // Capture phase + true so we beat any panel/global keydown handlers
    // (the dock has a few of those for shortcuts within panels).
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [recording, submit, stopRecording]);

  const labels = acceleratorToKeyLabels(value);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {recording ? (
          <button
            ref={buttonRef}
            type="button"
            className="ds-hotkey-recorder ds-hotkey-recorder--recording"
            onClick={stopRecording}
            title="Press Esc to cancel"
          >
            Press a key combination…
          </button>
        ) : (
          <button
            ref={buttonRef}
            type="button"
            className="ds-hotkey-recorder"
            onClick={() => {
              // Dock is non-activating by default — request activation so the
              // window.keydown capture below actually receives the user's
              // chord. The button itself isn't a typing element, so the
              // global App.jsx mousedown listener won't trigger this for us.
              window.electronAPI?.invoke?.('dock:activate')?.catch?.(() => {});
              setError(null);
              setRecording(true);
            }}
            title="Click to edit shortcut"
          >
            <span className="ds-hotkey-recorder__icon" aria-hidden="true">
              <EditIcon size={11} />
            </span>
            <Keys keys={labels} />
          </button>
        )}
        {!recording && value !== defaultValue && (
          <button
            type="button"
            onClick={() => submit(defaultValue)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--ds-text-muted)',
              fontSize: 'var(--ds-font-xs)',
              cursor: 'pointer',
              padding: '2px 4px',
            }}
            title="Reset to default"
          >
            Reset
          </button>
        )}
      </div>
      {error && (
        <div style={{
          fontSize: 'var(--ds-font-xs)',
          color: 'var(--ds-text-danger, #f87171)',
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
