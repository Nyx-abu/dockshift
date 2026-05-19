#!/usr/bin/env node
// PostToolUse hook for Claude Code (.claude/settings.json).
//
// Catches the #1 foot-gun in this codebase: a new IPC channel is registered
// with `ipcMain.handle('ns:action', ...)` in electron-main.js but never added
// to the allowlist in preload.js, which silently drops it.
//
// Runs after every Edit/Write/MultiEdit. Bails quietly unless the edited file
// is electron-main.js (so other edits aren't slowed down). When it does run,
// it scans the whole file — not just the diff — so prior orphans surface too.
//
// Output goes to stderr so Claude Code sees it as a hook message without
// blocking the tool (exit 0 always).

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAIN = resolve(REPO_ROOT, 'electron-main.js');
const PRELOAD = resolve(REPO_ROOT, 'preload.js');

let input = '';
try {
  input = readFileSync(0, 'utf8');
} catch {
  // No stdin — run defensively against the full file anyway.
}

let editedPath = '';
try {
  const payload = JSON.parse(input || '{}');
  editedPath = payload?.tool_input?.file_path ?? '';
} catch {
  // Malformed payload — fall through; we'll scan regardless.
}

if (editedPath && !/electron-main\.js$/i.test(editedPath)) {
  process.exit(0);
}

if (!existsSync(MAIN) || !existsSync(PRELOAD)) {
  process.exit(0);
}

const main = readFileSync(MAIN, 'utf8');
const preload = readFileSync(PRELOAD, 'utf8');

const handled = new Set(
  [...main.matchAll(/ipcMain\.handle\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
);
const sent = new Set(
  [...main.matchAll(/webContents\.send\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
);

const inPreload = (channel) =>
  preload.includes(`'${channel}'`) || preload.includes(`"${channel}"`);

const missingHandled = [...handled].filter((c) => !inPreload(c));
const missingSent = [...sent].filter((c) => !inPreload(c));

if (missingHandled.length === 0 && missingSent.length === 0) {
  process.exit(0);
}

console.error('');
console.error('⚠  IPC sync warning — channels in electron-main.js missing from preload.js:');
if (missingHandled.length) {
  console.error('   invoke/handle channels not in `allowed`:');
  for (const c of missingHandled) console.error(`     - ${c}`);
}
if (missingSent.length) {
  console.error('   push channels not in `allowedSendChannels`:');
  for (const c of missingSent) console.error(`     - ${c}`);
}
console.error('   Channels not on the allowlist are silently dropped by the preload bridge.');
console.error('');
process.exit(0);
