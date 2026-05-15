import { useEffect, useMemo, useState } from 'react';
import { Button, Badge } from './ui';

// Mirror of the main-process state machine in electron-main.js. Re-rendering
// this component is cheap, so we just take whatever the main process sends.
const INITIAL = {
  status: 'idle',
  currentVersion: '',
  latestVersion: null,
  releaseNotes: null,
  releaseName: null,
  progress: null,
  error: null,
  lastCheckedAt: null,
};

function formatBytes(n) {
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

export default function UpdateStatus() {
  const [state, setState] = useState(INITIAL);
  const api = useMemo(() => window.electronAPI, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api?.invoke?.('updater:status'),
      api?.invoke?.('app:getVersion'),
    ]).then(([status, version]) => {
      if (cancelled) return;
      setState((prev) => ({
        ...prev,
        ...(status || {}),
        currentVersion: status?.currentVersion || version || prev.currentVersion,
      }));
    }).catch(() => {});

    const unsub = api?.onUpdaterState?.((next) => {
      if (cancelled) return;
      setState((prev) => ({ ...prev, ...next }));
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [api]);

  const { status, currentVersion, latestVersion, progress, error, lastCheckedAt } = state;

  const checkNow = () => api?.invoke?.('updater:check');
  const installNow = () => api?.invoke?.('updater:install');

  // Right-side action button changes with state.
  let action = null;
  if (status === 'downloaded') {
    action = (
      <Button variant="primary" size="sm" onClick={installNow}>
        Restart and install
      </Button>
    );
  } else if (status === 'unsupported') {
    action = null;
  } else {
    action = (
      <Button
        variant="secondary"
        size="sm"
        onClick={checkNow}
        loading={status === 'checking'}
        disabled={status === 'downloading'}
      >
        {status === 'downloading' ? 'Downloading…' : 'Check for updates'}
      </Button>
    );
  }

  // Status line below the version.
  let statusLine;
  if (status === 'unsupported') {
    statusLine = 'Updates are checked automatically in installed builds. (You\'re running a dev build.)';
  } else if (status === 'checking') {
    statusLine = 'Checking for updates…';
  } else if (status === 'downloading') {
    const pct = progress?.percent ?? 0;
    const total = progress?.total ? ` of ${formatBytes(progress.total)}` : '';
    statusLine = `Downloading v${latestVersion || '?'} — ${pct}%${total}`;
  } else if (status === 'downloaded') {
    statusLine = `v${latestVersion} is ready. Restart to install — or it'll apply next time you quit DockShift.`;
  } else if (status === 'available') {
    statusLine = `v${latestVersion} is available — preparing download…`;
  } else if (status === 'not-available') {
    const when = lastCheckedAt ? ` (checked ${formatRelativeTime(lastCheckedAt)})` : '';
    statusLine = `You're on the latest version${when}.`;
  } else if (status === 'error') {
    statusLine = `Couldn't check for updates: ${error || 'unknown error'}`;
  } else {
    statusLine = `Updates are checked automatically every few hours.`;
  }

  return (
    <div style={{ padding: 'var(--ds-space-3) 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            fontWeight: 'var(--ds-weight-semibold)',
            fontSize: 'var(--ds-font-base)',
            color: 'var(--ds-text-strong)',
          }}>
            <span>DockShift v{currentVersion || '—'}</span>
            {status === 'downloaded' && <Badge tone="success">Update ready</Badge>}
            {status === 'downloading' && <Badge tone="accent">Downloading</Badge>}
            {status === 'error' && <Badge tone="danger">Error</Badge>}
          </div>
          <div style={{
            marginTop: 4,
            fontSize: 'var(--ds-font-sm)',
            color: 'var(--ds-text-muted)',
            lineHeight: 1.5,
          }}>
            {statusLine}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>{action}</div>
      </div>

      {status === 'downloading' && progress && (
        <div style={{
          marginTop: 10,
          height: 4,
          borderRadius: 2,
          background: 'var(--ds-bg-control)',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${Math.max(2, progress.percent || 0)}%`,
            height: '100%',
            background: 'var(--ds-accent, #7AA2F7)',
            transition: 'width 200ms ease-out',
          }} />
        </div>
      )}
    </div>
  );
}
