import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * The "AI / Models" block inside the Settings panel.
 *
 * Lets the user pick an AI provider + model and manage that provider's API
 * key. Keys are written through the `secrets:` IPC surface, which encrypts
 * them in the main process — a raw key value is never read back here, only
 * its existence (`secrets:has` / `secrets:list`).
 *
 * Props:
 *   - settings: current settings object (reads aiProvider, aiModel)
 *   - update(key, value): persist a single setting
 *   - api: window.electronAPI
 */
export default function AiSettings({ settings, update, api }) {
  const [providers, setProviders] = useState([]);
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);
  const [savedKeyNames, setSavedKeyNames] = useState([]);
  const [keyDraft, setKeyDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { kind: 'ok'|'err', text }

  const activeId = settings.aiProvider || 'gemini';
  const activeProvider = useMemo(
    () => providers.find(p => p.id === activeId) || null,
    [providers, activeId]
  );

  const refreshKeys = useCallback(() => {
    api?.invoke?.('secrets:list')
      ?.then(res => setSavedKeyNames(Array.isArray(res?.names) ? res.names : []))
      ?.catch(() => {});
  }, [api]);

  // Load the provider catalog + which keys already exist, once.
  useEffect(() => {
    api?.invoke?.('ai:providers')
      ?.then(res => {
        setProviders(Array.isArray(res?.providers) ? res.providers : []);
        setEncryptionAvailable(res?.encryptionAvailable !== false);
      })
      ?.catch(() => {});
    refreshKeys();
  }, [api, refreshKeys]);

  // Clear the draft + any notice when switching providers.
  useEffect(() => { setKeyDraft(''); setNotice(null); }, [activeId]);

  const hasKey = activeProvider && activeProvider.keyName
    ? savedKeyNames.includes(activeProvider.keyName)
    : false;

  const handleProviderChange = (id) => {
    const next = providers.find(p => p.id === id);
    update('aiProvider', id);
    // Reset the model to that provider's default — models don't cross providers.
    if (next) update('aiModel', next.defaultModel);
  };

  const handleSaveKey = async () => {
    if (!activeProvider?.keyName || !keyDraft.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await api.invoke('secrets:set', {
        name: activeProvider.keyName,
        value: keyDraft.trim(),
      });
      if (res?.ok) {
        setKeyDraft('');
        setNotice({ kind: 'ok', text: 'Key saved (encrypted).' });
        refreshKeys();
      } else {
        const reason = res?.reason === 'encryption-unavailable'
          ? 'Secure storage unavailable on this system — key not saved.'
          : 'Could not save the key.';
        setNotice({ kind: 'err', text: reason });
      }
    } catch (_) {
      setNotice({ kind: 'err', text: 'Could not save the key.' });
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveKey = async () => {
    if (!activeProvider?.keyName) return;
    setBusy(true);
    try {
      await api.invoke('secrets:delete', { name: activeProvider.keyName });
      setNotice({ kind: 'ok', text: 'Key removed.' });
      refreshKeys();
    } catch (_) {
      setNotice({ kind: 'err', text: 'Could not remove the key.' });
    } finally {
      setBusy(false);
    }
  };

  const selStyle = {
    background: 'var(--ds-bg-input)', border: '1px solid var(--ds-border)',
    borderRadius: 8, color: 'var(--ds-text-secondary)', fontSize: 11.5,
    padding: '6px 10px', cursor: 'pointer', outline: 'none',
    WebkitAppRegion: 'no-drag', fontFamily: 'inherit',
  };
  const inputStyle = {
    flex: 1, minWidth: 0, background: 'var(--ds-bg-input)',
    border: '1px solid var(--ds-border)', borderRadius: 8,
    color: 'var(--ds-text-primary)', fontSize: 11.5, padding: '6px 10px',
    outline: 'none', WebkitAppRegion: 'no-drag', fontFamily: 'inherit',
  };
  const rowStyle = {
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
    WebkitAppRegion: 'no-drag',
  };
  const labelStyle = { flex: 1, fontSize: 12.5, fontWeight: 500, color: 'var(--ds-text-primary)' };
  const btnStyle = {
    background: 'var(--ds-accent-bg)', border: '1px solid var(--ds-accent-border)',
    borderRadius: 8, color: 'var(--ds-accent-light)', fontSize: 11.5, fontWeight: 600,
    padding: '6px 12px', cursor: 'pointer', WebkitAppRegion: 'no-drag', fontFamily: 'inherit',
    flexShrink: 0,
  };

  return (
    <>
      {!encryptionAvailable && (
        <div style={{
          margin: '8px 0', padding: '8px 10px', borderRadius: 8,
          background: 'var(--ds-danger-bg)', border: '1px solid var(--ds-danger-border)',
          fontSize: 10.5, color: 'var(--ds-danger-text)', lineHeight: 1.5,
        }}>
          Secure key storage isn't available on this system. API keys can't be saved
          encrypted — use a <code>.env</code> file instead.
        </div>
      )}

      {/* Provider */}
      <div style={rowStyle}>
        <span style={labelStyle}>Provider</span>
        <select
          value={activeId}
          onChange={e => handleProviderChange(e.target.value)}
          style={selStyle}
        >
          {providers.map(p => (
            <option key={p.id} value={p.id}
              style={{ background: 'var(--ds-bg-elevated)', color: 'var(--ds-text-primary)' }}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Model — datalist lets advanced users type a model the list doesn't include */}
      <div style={rowStyle}>
        <span style={labelStyle}>Model</span>
        <input
          list="ai-model-options"
          value={settings.aiModel || activeProvider?.defaultModel || ''}
          onChange={e => update('aiModel', e.target.value)}
          placeholder={activeProvider?.defaultModel || 'model'}
          style={{ ...inputStyle, maxWidth: 180 }}
        />
        <datalist id="ai-model-options">
          {(activeProvider?.models || []).map(m => <option key={m} value={m} />)}
        </datalist>
      </div>

      {/* API key management */}
      {activeProvider?.keyless ? (
        <div style={{ padding: '8px 0', fontSize: 10.5, color: 'var(--ds-text-faint)', lineHeight: 1.5 }}>
          {activeProvider.label} runs locally — no API key needed. Make sure the Ollama
          app is running and the model is pulled.
        </div>
      ) : (
        <div style={{ padding: '6px 0' }}>
          <div style={{ ...rowStyle, padding: '6px 0' }}>
            <span style={labelStyle}>
              API Key
              <span style={{
                marginLeft: 8, fontSize: 10, fontWeight: 600,
                color: hasKey ? 'var(--ds-success)' : 'var(--ds-text-dim)',
              }}>
                {hasKey ? '✓ saved' : 'not set'}
              </span>
            </span>
            {hasKey && (
              <button
                onClick={handleRemoveKey}
                disabled={busy}
                style={{
                  background: 'var(--ds-danger-bg)', border: '1px solid var(--ds-danger-border)',
                  borderRadius: 8, color: 'var(--ds-danger-text)', fontSize: 11.5, fontWeight: 600,
                  padding: '6px 12px', cursor: busy ? 'default' : 'pointer',
                  WebkitAppRegion: 'no-drag', fontFamily: 'inherit', flexShrink: 0,
                }}
              >Remove</button>
            )}
          </div>
          {!hasKey && (
            <div style={{ display: 'flex', gap: 8, padding: '2px 0 6px' }}>
              <input
                type="password"
                value={keyDraft}
                onChange={e => setKeyDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveKey(); }}
                placeholder={`Paste your ${activeProvider?.label || ''} API key`}
                style={inputStyle}
              />
              <button
                onClick={handleSaveKey}
                disabled={busy || !keyDraft.trim()}
                style={{
                  ...btnStyle,
                  opacity: busy || !keyDraft.trim() ? 0.5 : 1,
                  cursor: busy || !keyDraft.trim() ? 'default' : 'pointer',
                }}
              >Save</button>
            </div>
          )}
          {notice && (
            <div style={{
              fontSize: 10.5, lineHeight: 1.5,
              color: notice.kind === 'ok' ? 'var(--ds-success)' : 'var(--ds-danger-text)',
            }}>
              {notice.text}
            </div>
          )}
          <div style={{ fontSize: 10, color: 'var(--ds-text-dim)', lineHeight: 1.5, marginTop: 2 }}>
            Stored encrypted on this device via the OS keystore. Never sent anywhere
            except {activeProvider?.label || 'the provider'}.
          </div>
        </div>
      )}
    </>
  );
}
