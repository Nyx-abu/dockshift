// Windows Explorer context-menu integration via per-user HKCU registry keys.
//
// We never touch HKLM — that requires admin and would affect every user on the
// box. HKCU\Software\Classes\… is the per-user override and works for the
// signed-in user only, no UAC prompt. The legacy registry-based shell entries
// still surface in Windows 11 under "Show more options" (and at the top level
// of the menu on 10), which is the right ergonomic compromise — implementing
// a proper IExplorerCommand COM extension would require MSIX packaging.
//
// Keys we write (× = entry name, e.g. DockShiftTerminal):
//   HKCU\Software\Classes\Directory\shell\×                 — right-click folder
//   HKCU\Software\Classes\Directory\Background\shell\×      — right-click folder empty area
//   HKCU\Software\Classes\*\shell\×                         — right-click any file
//
// `%1` is the clicked path; `%V` is the current directory (used for the empty-
// area / Background menu since `%1` is undefined there).

import { spawn } from 'child_process';

// Bump whenever the ENTRIES array changes (adding/removing/renaming an entry,
// changing labels, AppliesTo filters, or argv flags). On app ready, main
// checks settings.shellIntegrationVersion against this constant — if a user
// already opted in but is on an older version, we silently re-install so
// auto-updates can ship new entries without requiring a manual click.
export const SHELL_INTEGRATION_VERSION = 1;

const ENTRIES = [
  // Open with DockShift Terminal — folders + folder background
  {
    name: 'DockShiftTerminal',
    label: 'Open with DockShift Terminal',
    scope: 'directory',
    arg: '--shell-terminal',
    pathToken: '%1',
  },
  {
    name: 'DockShiftTerminal',
    label: 'Open with DockShift Terminal',
    scope: 'directory-background',
    arg: '--shell-terminal',
    pathToken: '%V',
  },
  // Save to DockShift Notes — text/code files only, via AppliesTo filter
  {
    name: 'DockShiftNote',
    label: 'Save to DockShift Notes',
    scope: 'all-files',
    arg: '--shell-note',
    pathToken: '%1',
    appliesTo: [
      '*.txt', '*.md', '*.markdown', '*.rst',
      '*.json', '*.yaml', '*.yml', '*.toml', '*.xml', '*.csv', '*.ini', '*.env',
      '*.js', '*.jsx', '*.ts', '*.tsx', '*.mjs', '*.cjs',
      '*.py', '*.rb', '*.go', '*.rs', '*.java', '*.kt', '*.swift',
      '*.c', '*.cc', '*.cpp', '*.h', '*.hpp', '*.cs',
      '*.html', '*.htm', '*.css', '*.scss', '*.sass', '*.less',
      '*.sh', '*.bash', '*.zsh', '*.fish', '*.ps1', '*.bat', '*.cmd',
      '*.sql', '*.graphql', '*.proto',
      '*.log', '*.conf', '*.config',
    ],
  },
  // Copy path to DockShift Clipboard — works on any file or folder
  {
    name: 'DockShiftClipboard',
    label: 'Copy path to DockShift Clipboard',
    scope: 'all-files',
    arg: '--shell-clipboard',
    pathToken: '%1',
  },
  {
    name: 'DockShiftClipboard',
    label: 'Copy path to DockShift Clipboard',
    scope: 'directory',
    arg: '--shell-clipboard',
    pathToken: '%1',
  },
  {
    name: 'DockShiftClipboard',
    label: 'Copy path to DockShift Clipboard',
    scope: 'directory-background',
    arg: '--shell-clipboard',
    pathToken: '%V',
  },
];

// Build the parent-key path for a given scope under HKCU\Software\Classes.
function scopeParent(scope) {
  switch (scope) {
    case 'directory': return 'HKCU\\Software\\Classes\\Directory\\shell';
    case 'directory-background': return 'HKCU\\Software\\Classes\\Directory\\Background\\shell';
    case 'all-files': return 'HKCU\\Software\\Classes\\*\\shell';
    default: throw new Error(`Unknown scope: ${scope}`);
  }
}

// Wrap reg.exe in a Promise — Windows-only, no external dependency.
function runReg(args) {
  return new Promise((resolve) => {
    const p = spawn('reg.exe', args, { windowsHide: true });
    let stderr = '';
    p.stderr.on('data', (b) => { stderr += b.toString(); });
    p.on('error', () => resolve({ ok: false, error: 'reg.exe not available' }));
    p.on('close', (code) => {
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, code, error: stderr.trim() || `reg.exe exited ${code}` });
    });
  });
}

// Add a single context-menu entry. Returns { ok: true } or { ok: false, error }.
async function addEntry(exePath, entry) {
  const parent = scopeParent(entry.scope);
  const root = `${parent}\\${entry.name}`;
  const cmd = `${root}\\command`;
  const command = `"${exePath}" ${entry.arg} "${entry.pathToken}"`;

  // Label (default value of the root key).
  let r = await runReg(['add', root, '/ve', '/d', entry.label, '/f']);
  if (!r.ok) return r;

  // Icon — points at the exe so Explorer extracts the embedded icon.
  r = await runReg(['add', root, '/v', 'Icon', '/d', `"${exePath}"`, '/f']);
  if (!r.ok) return r;

  // AppliesTo filter (file-extension scoping for note entries).
  if (Array.isArray(entry.appliesTo) && entry.appliesTo.length) {
    const expr = entry.appliesTo.map((g) => `System.FileName:"${g}"`).join(' OR ');
    r = await runReg(['add', root, '/v', 'AppliesTo', '/d', expr, '/f']);
    if (!r.ok) return r;
  }

  // The actual command to launch on click.
  r = await runReg(['add', cmd, '/ve', '/d', command, '/f']);
  return r;
}

// Remove all keys for one entry (root + command + AppliesTo all live under root).
async function removeEntry(entry) {
  const root = `${scopeParent(entry.scope)}\\${entry.name}`;
  // /f = force, no confirmation. Reg.exe returns non-zero if the key is
  // already gone, which is fine — we tolerate that during uninstall.
  return runReg(['delete', root, '/f']);
}

// Check whether at least one of our entries is present. Treated as the
// authoritative install state (we install/uninstall as a set, so partial
// state shouldn't happen except after a hand-edit).
async function probeEntry(entry) {
  const root = `${scopeParent(entry.scope)}\\${entry.name}`;
  return new Promise((resolve) => {
    const p = spawn('reg.exe', ['query', root], { windowsHide: true });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
}

// Public surface: install every entry pointing at exePath.
export async function installShellIntegration(exePath) {
  if (process.platform !== 'win32') return { ok: false, error: 'Windows only' };
  if (!exePath || typeof exePath !== 'string') return { ok: false, error: 'Invalid exe path' };
  for (const entry of ENTRIES) {
    const r = await addEntry(exePath, entry);
    if (!r.ok) return { ok: false, error: r.error };
  }
  return { ok: true };
}

// Public surface: remove every entry. Tolerates missing keys so calling
// uninstall on a fresh box is a no-op rather than an error.
export async function uninstallShellIntegration() {
  if (process.platform !== 'win32') return { ok: true };
  for (const entry of ENTRIES) {
    await removeEntry(entry); // ignore individual failures
  }
  return { ok: true };
}

// Public surface: is anything installed right now?
export async function isShellIntegrationInstalled() {
  if (process.platform !== 'win32') return false;
  for (const entry of ENTRIES) {
    if (await probeEntry(entry)) return true;
  }
  return false;
}
