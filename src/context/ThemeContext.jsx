import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Theme state for the whole app.
 *
 * `theme` is the user's *preference* — 'light' | 'dark' | 'system'.
 * `resolved` is the concrete theme actually applied — 'light' | 'dark'
 * ('system' is resolved against the OS setting and tracked live).
 *
 * The provider writes `data-theme` onto <html>, which is what the CSS custom
 * properties in theme.css key off of. The preference is persisted to
 * settings.json so it survives restarts.
 */

const ThemeContext = createContext(null);
const THEMES = ['light', 'dark', 'system'];

function prefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
}

function resolveTheme(pref) {
  if (pref === 'system') return prefersDark() ? 'dark' : 'light';
  return pref === 'light' ? 'light' : 'dark';
}

export function ThemeProvider({ children }) {
  // Default to 'dark' — the app's original look — until the saved pref loads.
  const [theme, setThemeState] = useState('dark');
  const [resolved, setResolved] = useState(() => resolveTheme('dark'));
  const api = useMemo(() => window.electronAPI, []);

  // Load the saved preference once on mount.
  useEffect(() => {
    let cancelled = false;
    api?.invoke?.('settings:get')
      ?.then((s) => {
        if (!cancelled && s && THEMES.includes(s.theme)) setThemeState(s.theme);
      })
      ?.catch(() => {});
    return () => { cancelled = true; };
  }, [api]);

  // Apply the resolved theme to <html>; when on 'system', track OS changes.
  useEffect(() => {
    const apply = () => {
      const next = resolveTheme(theme);
      setResolved(next);
      document.documentElement.setAttribute('data-theme', next);
    };
    apply();
    if (theme !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  const setTheme = useCallback((next) => {
    if (!THEMES.includes(next)) return;
    setThemeState(next);
    // Persist just this key — settings:set merges, so other settings are safe.
    api?.invoke?.('settings:set', { settings: { theme: next } })?.catch(() => {});
  }, [api]);

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
