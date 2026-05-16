import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Button, Switch } from './ui';

const TERMS_URL = 'https://dock-shift.vercel.app/terms';
const PRIVACY_URL = 'https://dock-shift.vercel.app/privacy';

export default function WelcomeModal({ isOpen, onComplete }) {
  const [launchOnStartup, setLaunchOnStartup] = useState(true);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [animIn, setAnimIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    setAnimIn(false);
    const id = setTimeout(() => setAnimIn(true), 0);
    return () => clearTimeout(id);
  }, [isOpen]);

  if (!isOpen) return null;

  const api = window.electronAPI;

  const openLink = (url) => {
    api?.invoke?.('app:openExternal', { url })?.catch(() => {});
  };

  const handleSubmit = async () => {
    if (!agreed || submitting) return;
    setSubmitting(true);
    try {
      await api?.invoke?.('settings:set', {
        settings: {
          hasCompletedWelcome: true,
          launchOnStartup,
          analyticsEnabled,
        },
      });
      if (analyticsEnabled) {
        await api?.invoke?.('analytics:setEnabled', { enabled: true })?.catch(() => {});
      }
    } finally {
      onComplete?.();
    }
  };

  const modal = (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(8, 9, 12, 0.55)',
          zIndex: 10000,
          pointerEvents: 'auto',
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to DockShift"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) scale(${animIn ? 1 : 0.96})`,
          opacity: animIn ? 1 : 0,
          transition: 'opacity 180ms var(--ds-ease), transform 180ms var(--ds-ease)',
          width: 440,
          maxWidth: '92vw',
          borderRadius: 'var(--ds-radius-lg)',
          background: 'var(--ds-bg-panel)',
          border: '1px solid var(--ds-border-strong)',
          boxShadow: 'var(--ds-shadow-panel)',
          padding: 'var(--ds-space-5)',
          color: 'var(--ds-text-primary)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--ds-space-4)',
          zIndex: 10001,
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-1)' }}>
          <div style={{
            fontSize: 'var(--ds-font-xl)',
            fontWeight: 'var(--ds-weight-semibold)',
            color: 'var(--ds-text-strong)',
          }}>
            Welcome to DockShift
          </div>
          <div style={{
            fontSize: 'var(--ds-font-sm)',
            color: 'var(--ds-text-muted)',
          }}>
            Your floating productivity dock. A couple of quick choices to get you set up.
          </div>
        </div>

        <SettingRow
          label="Launch on startup"
          description="Start DockShift automatically when Windows boots."
          control={
            <Switch
              checked={launchOnStartup}
              onChange={setLaunchOnStartup}
            />
          }
        />

        <SettingRow
          label="Help improve DockShift"
          description="Send an anonymous heartbeat once a day (install ID, version, OS). No personal data. Change anytime in Settings."
          control={
            <Switch
              checked={analyticsEnabled}
              onChange={setAnalyticsEnabled}
            />
          }
        />

        <label style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--ds-space-2)',
          fontSize: 'var(--ds-font-sm)',
          color: 'var(--ds-text-secondary)',
          cursor: 'pointer',
          userSelect: 'none',
        }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{
              marginTop: 3,
              accentColor: 'var(--ds-accent)',
              cursor: 'pointer',
            }}
          />
          <span>
            I agree to the{' '}
            <LinkSpan onClick={() => openLink(TERMS_URL)}>Terms</LinkSpan>
            {' '}and{' '}
            <LinkSpan onClick={() => openLink(PRIVACY_URL)}>Privacy Policy</LinkSpan>.
          </span>
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="primary"
            disabled={!agreed || submitting}
            onClick={handleSubmit}
          >
            Get started
          </Button>
        </div>

        <div style={{
          fontSize: 'var(--ds-font-xs)',
          color: 'var(--ds-text-faint)',
          textAlign: 'center',
          paddingTop: 'var(--ds-space-1)',
          borderTop: '1px solid var(--ds-border-subtle)',
        }}>
          Tip: Press <Kbd>Ctrl</Kbd> + <Kbd>Shift</Kbd> + <Kbd>D</Kbd> anytime to toggle the dock.
        </div>
      </div>
    </>
  );

  return ReactDOM.createPortal(modal, document.body);
}

function SettingRow({ label, description, control }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--ds-space-3)',
      padding: 'var(--ds-space-3)',
      background: 'var(--ds-bg-subtle)',
      border: '1px solid var(--ds-border-subtle)',
      borderRadius: 'var(--ds-radius-md)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 'var(--ds-font-base)',
          fontWeight: 'var(--ds-weight-medium)',
          color: 'var(--ds-text-strong)',
        }}>
          {label}
        </div>
        <div style={{
          fontSize: 'var(--ds-font-xs)',
          color: 'var(--ds-text-muted)',
          marginTop: 2,
        }}>
          {description}
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>{control}</div>
    </div>
  );
}

function LinkSpan({ children, onClick }) {
  return (
    <span
      role="link"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
      style={{
        color: 'var(--ds-accent-light)',
        textDecoration: 'underline',
        cursor: 'pointer',
      }}
    >
      {children}
    </span>
  );
}

function Kbd({ children }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 6px',
      fontSize: 'var(--ds-font-xs)',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      color: 'var(--ds-text-secondary)',
      background: 'var(--ds-bg-control)',
      border: '1px solid var(--ds-border)',
      borderRadius: 'var(--ds-radius-sm)',
    }}>
      {children}
    </span>
  );
}
