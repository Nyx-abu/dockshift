import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Switch,
  Keys,
  ClipboardIcon,
  SparkleIcon,
  WindowIcon,
  SearchIcon,
} from './ui';

const TERMS_URL = 'https://dock-shift.vercel.app/terms';
const PRIVACY_URL = 'https://dock-shift.vercel.app/privacy';

const STEPS = ['intro', 'features', 'hotkey', 'confirm'];

// Standalone first-run window. Renders inside its own BrowserWindow (created by
// the main process with frame + taskbar entry), so unlike the old WelcomeModal
// this is not a portal/backdrop overlay — it owns the whole viewport. The dock
// window isn't created until the user clicks "Get started" (which fires the
// welcome:complete IPC handled by main).
export default function WelcomeWindow() {
  const [step, setStep] = useState(0);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const api = window.electronAPI;

  const next = useCallback(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), []);
  const back = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);
  const skip = useCallback(() => setStep(STEPS.length - 1), []);

  const openLink = useCallback((url) => {
    api?.invoke?.('app:openExternal', { url })?.catch(() => {});
  }, [api]);

  const finish = useCallback(async () => {
    if (!agreed || submitting) return;
    setSubmitting(true);
    try {
      await api?.invoke?.('welcome:complete', { analyticsEnabled });
      // Main process closes this window once the dock is up; if for some
      // reason it didn't, fall back to closing here so the user isn't stuck.
      setTimeout(() => window.close?.(), 600);
    } catch (e) {
      setSubmitting(false);
    }
  }, [agreed, submitting, analyticsEnabled, api]);

  // Enter advances through the tour and submits on the confirm step (when
  // agreed). Keeps the keyboard-only path workable.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Enter') return;
      if (step < STEPS.length - 1) next();
      else if (agreed && !submitting) finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, agreed, submitting, next, finish]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ds-bg-panel, #101218)',
        color: 'var(--ds-text-primary, #e6e8ee)',
        fontFamily: 'inherit',
        overflow: 'hidden',
      }}
    >
      <Header step={step} totalSteps={STEPS.length} onSkip={skip} />

      <main
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '12px 56px',
        }}
      >
        {step === 0 && <StepIntro />}
        {step === 1 && <StepFeatures />}
        {step === 2 && <StepHotkey />}
        {step === 3 && (
          <StepConfirm
            analyticsEnabled={analyticsEnabled}
            setAnalyticsEnabled={setAnalyticsEnabled}
            agreed={agreed}
            setAgreed={setAgreed}
            openLink={openLink}
          />
        )}
      </main>

      <Footer
        step={step}
        totalSteps={STEPS.length}
        onBack={back}
        onNext={next}
        onFinish={finish}
        canFinish={agreed && !submitting}
        submitting={submitting}
      />
    </div>
  );
}

function Header({ step, totalSteps, onSkip }) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: '1px solid var(--ds-border-subtle, #1f2330)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Logo />
        <span style={{
          fontSize: 'var(--ds-font-base, 14px)',
          fontWeight: 'var(--ds-weight-semibold, 600)',
          color: 'var(--ds-text-strong, #fff)',
          letterSpacing: 0.2,
        }}>
          DockShift
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{
          fontSize: 'var(--ds-font-xs, 12px)',
          color: 'var(--ds-text-muted, #8a90a0)',
        }}>
          Step {step + 1} of {totalSteps}
        </span>
        {step < totalSteps - 1 && (
          <button
            onClick={onSkip}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--ds-text-muted, #8a90a0)',
              fontSize: 'var(--ds-font-sm, 13px)',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: 'var(--ds-radius-sm, 6px)',
              fontFamily: 'inherit',
            }}
          >
            Skip tour
          </button>
        )}
      </div>
    </header>
  );
}

function Footer({ step, totalSteps, onBack, onNext, onFinish, canFinish, submitting }) {
  const isFirst = step === 0;
  const isLast = step === totalSteps - 1;
  return (
    <footer
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '18px 24px',
        borderTop: '1px solid var(--ds-border-subtle, #1f2330)',
        flexShrink: 0,
      }}
    >
      <Dots current={step} total={totalSteps} />
      <div style={{ display: 'flex', gap: 8 }}>
        {!isFirst && (
          <Button onClick={onBack} variant="ghost">
            Back
          </Button>
        )}
        {isLast ? (
          <Button variant="primary" disabled={!canFinish} onClick={onFinish}>
            {submitting ? 'Starting…' : 'Get started'}
          </Button>
        ) : (
          <Button variant="primary" onClick={onNext}>
            Next
          </Button>
        )}
      </div>
    </footer>
  );
}

function Dots({ current, total }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          style={{
            width: i === current ? 20 : 6,
            height: 6,
            borderRadius: 3,
            background: i === current
              ? 'var(--ds-accent, #6c8cff)'
              : 'var(--ds-border-strong, #2a2f3d)',
            transition: 'width 180ms var(--ds-ease, ease), background 180ms var(--ds-ease, ease)',
          }}
        />
      ))}
    </div>
  );
}

function Logo() {
  return (
    <div style={{
      width: 28,
      height: 28,
      borderRadius: 7,
      background: 'linear-gradient(135deg, var(--ds-accent, #6c8cff), var(--ds-accent-light, #9fb4ff))',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontWeight: 700,
      fontSize: 14,
      letterSpacing: -0.5,
      boxShadow: '0 2px 8px rgba(108, 140, 255, 0.35)',
    }}>
      D
    </div>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────────

function StepIntro() {
  return (
    <div style={{ textAlign: 'center', maxWidth: 520 }}>
      <div style={{
        width: 72,
        height: 72,
        borderRadius: 18,
        margin: '0 auto 20px',
        background: 'linear-gradient(135deg, var(--ds-accent, #6c8cff), var(--ds-accent-light, #9fb4ff))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 700,
        fontSize: 34,
        letterSpacing: -1,
        boxShadow: '0 8px 28px rgba(108, 140, 255, 0.4)',
      }}>
        D
      </div>
      <h1 style={{
        margin: 0,
        fontSize: 28,
        fontWeight: 600,
        color: 'var(--ds-text-strong, #fff)',
        letterSpacing: -0.4,
      }}>
        Welcome to DockShift
      </h1>
      <p style={{
        margin: '12px 0 0',
        fontSize: 15,
        lineHeight: 1.5,
        color: 'var(--ds-text-muted, #8a90a0)',
      }}>
        A floating productivity dock for Windows. Clipboard history, workspace
        snapshots, an AI panel, a quick launcher, and more — one keystroke away.
      </p>
    </div>
  );
}

function StepFeatures() {
  const features = [
    {
      icon: <ClipboardIcon size={20} />,
      title: 'Clipboard history',
      body: 'Every copy is kept — text, images, files. Paste from anywhere, any time.',
    },
    {
      icon: <SparkleIcon size={20} />,
      title: 'AI panel',
      body: 'Chat with Gemini without leaving your flow. Voice transcription included.',
    },
    {
      icon: <WindowIcon size={20} />,
      title: 'Workspace snapshots',
      body: 'Save and restore exactly which windows you had open, where.',
    },
    {
      icon: <SearchIcon size={20} />,
      title: 'Quick launcher',
      body: 'Apps, folders, system commands — start typing and hit Enter.',
    },
  ];
  return (
    <div style={{ width: '100%', maxWidth: 560 }}>
      <h2 style={{
        margin: '0 0 18px',
        fontSize: 20,
        fontWeight: 600,
        textAlign: 'center',
        color: 'var(--ds-text-strong, #fff)',
      }}>
        What's inside
      </h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
      }}>
        {features.map((f) => (
          <div
            key={f.title}
            style={{
              padding: 14,
              borderRadius: 'var(--ds-radius-md, 10px)',
              background: 'var(--ds-bg-subtle, #161922)',
              border: '1px solid var(--ds-border-subtle, #1f2330)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'var(--ds-accent-bg, rgba(108, 140, 255, 0.12))',
              color: 'var(--ds-accent-light, #9fb4ff)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {f.icon}
            </div>
            <div style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--ds-text-strong, #fff)',
            }}>
              {f.title}
            </div>
            <div style={{
              fontSize: 12.5,
              lineHeight: 1.45,
              color: 'var(--ds-text-muted, #8a90a0)',
            }}>
              {f.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepHotkey() {
  return (
    <div style={{ textAlign: 'center', maxWidth: 480 }}>
      <h2 style={{
        margin: 0,
        fontSize: 20,
        fontWeight: 600,
        color: 'var(--ds-text-strong, #fff)',
      }}>
        One key to summon it
      </h2>
      <p style={{
        margin: '10px 0 28px',
        fontSize: 14,
        lineHeight: 1.5,
        color: 'var(--ds-text-muted, #8a90a0)',
      }}>
        Press this combo anytime — even from a full-screen app — to toggle the dock.
      </p>
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        marginBottom: 24,
      }}>
        <Keys keys={['Ctrl', 'Shift', 'D']} />
      </div>
      <div style={{
        fontSize: 12.5,
        color: 'var(--ds-text-faint, #6b6f7c)',
        padding: '10px 14px',
        borderRadius: 'var(--ds-radius-sm, 6px)',
        background: 'var(--ds-bg-subtle, #161922)',
        border: '1px solid var(--ds-border-subtle, #1f2330)',
        display: 'inline-block',
      }}>
        Tip: DockShift lives in your system tray. Right-click it to quit or
        change the shortcut later in Settings.
      </div>
    </div>
  );
}

function StepConfirm({ analyticsEnabled, setAnalyticsEnabled, agreed, setAgreed, openLink }) {
  return (
    <div style={{ width: '100%', maxWidth: 500 }}>
      <h2 style={{
        margin: '0 0 18px',
        fontSize: 20,
        fontWeight: 600,
        textAlign: 'center',
        color: 'var(--ds-text-strong, #fff)',
      }}>
        Almost there
      </h2>

      <div style={{
        padding: 14,
        borderRadius: 'var(--ds-radius-md, 10px)',
        background: 'var(--ds-bg-subtle, #161922)',
        border: '1px solid var(--ds-border-subtle, #1f2330)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        marginBottom: 12,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--ds-text-strong, #fff)',
          }}>
            Help improve DockShift
          </div>
          <div style={{
            fontSize: 12.5,
            color: 'var(--ds-text-muted, #8a90a0)',
            marginTop: 2,
            lineHeight: 1.4,
          }}>
            Send an anonymous heartbeat once a day (install ID, version, OS).
            No personal data. Change anytime in Settings.
          </div>
        </div>
        <Switch checked={analyticsEnabled} onChange={setAnalyticsEnabled} />
      </div>

      <label style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        fontSize: 13,
        color: 'var(--ds-text-secondary, #b5bac6)',
        cursor: 'pointer',
        userSelect: 'none',
        padding: '10px 4px',
      }}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          style={{
            marginTop: 3,
            accentColor: 'var(--ds-accent, #6c8cff)',
            cursor: 'pointer',
            width: 14,
            height: 14,
          }}
        />
        <span>
          I agree to the{' '}
          <LinkSpan onClick={() => openLink(TERMS_URL)}>Terms</LinkSpan>
          {' '}and{' '}
          <LinkSpan onClick={() => openLink(PRIVACY_URL)}>Privacy Policy</LinkSpan>.
        </span>
      </label>

      <div style={{
        marginTop: 16,
        padding: '10px 12px',
        borderRadius: 'var(--ds-radius-sm, 6px)',
        background: 'rgba(108, 140, 255, 0.08)',
        border: '1px solid rgba(108, 140, 255, 0.2)',
        fontSize: 12,
        color: 'var(--ds-text-muted, #8a90a0)',
        lineHeight: 1.45,
      }}>
        DockShift will launch automatically when you sign in to Windows. You can
        turn this off any time in Settings.
      </div>
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
        color: 'var(--ds-accent-light, #9fb4ff)',
        textDecoration: 'underline',
        cursor: 'pointer',
      }}
    >
      {children}
    </span>
  );
}
