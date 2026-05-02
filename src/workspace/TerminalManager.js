import os from 'os';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * NOTE:
 * The original plan used node-pty, but that requires native builds.
 * This implementation restores terminals as *reconstruction instructions*
 * by launching a new terminal window with cwd + optional startup command.
 *
 * @typedef {import('./SnapshotManager').TerminalSnapshot} TerminalSnapshot
 */

// Characters that could be used for shell injection
const SHELL_META_RE = /[;&|`$<>!{}()\[\]'"\\]/;

/**
 * Validate that a path is a real, existing directory.
 * Returns the resolved path or null.
 */
function validateCwd(cwd) {
  if (!cwd || typeof cwd !== 'string') return null;
  try {
    const resolved = path.resolve(cwd);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return resolved;
    }
  } catch (_) {}
  return null;
}

/**
 * Validate a startup command — reject anything with shell metacharacters
 * that could be used for injection.
 */
function validateStartupCommand(cmd) {
  if (!cmd || typeof cmd !== 'string') return '';
  const trimmed = cmd.trim();
  if (trimmed.length > 500) return ''; // unreasonably long
  if (SHELL_META_RE.test(trimmed)) {
    console.warn('[TerminalManager] Startup command rejected (shell metacharacters):', trimmed);
    return '';
  }
  return trimmed;
}

export class TerminalManager {
  /**
   * @param {TerminalSnapshot[]} snapshots
   */
  restoreTerminals(snapshots) {
    if (!Array.isArray(snapshots)) return;
    for (const snap of snapshots) {
      this.launchTerminal(snap);
    }
  }

  /**
   * @param {TerminalSnapshot} snap
   */
  launchTerminal(snap) {
    const platform = os.platform();
    if (platform !== 'win32') {
      console.warn('[TerminalManager] Non-Windows terminal restore stubbed');
      return;
    }

    const cwd = validateCwd(snap.cwd) || process.cwd();
    const shell = (snap.shell || 'powershell.exe').toLowerCase();
    const startup = validateStartupCommand(snap.startupCommand);

    const isPwsh = shell.includes('powershell');

    // Build argument arrays instead of interpolated command strings
    let args;
    if (isPwsh) {
      // PowerShell: -NoExit -WorkingDirectory <cwd>
      const pwshArgs = ['-NoExit', '-WorkingDirectory', cwd];
      if (startup) {
        pwshArgs.push('-Command', startup);
      }
      args = ['/c', 'start', '""', 'powershell.exe', ...pwshArgs];
    } else {
      args = ['/c', 'start', '""', 'cmd.exe', '/k', `cd /d "${cwd}"`];
    }

    try {
      const child = spawn('cmd.exe', args, { detached: true, stdio: 'ignore' });
      child.unref();
    } catch (err) {
      console.warn('[TerminalManager] Failed to launch terminal', err);
    }
  }
}
