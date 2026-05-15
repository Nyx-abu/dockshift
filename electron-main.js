import { app, BrowserWindow, globalShortcut, screen, ipcMain, clipboard, nativeImage, shell, desktopCapturer, Tray, Menu } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import os from 'os';
import pty from 'node-pty';
import { spawn } from 'child_process';
import { SnapshotManager } from './src/workspace/SnapshotManager.js';
import { WindowTracker } from './src/workspace/WindowTracker.js';
import { TerminalManager } from './src/workspace/TerminalManager.js';
import { readJson, writeJsonAtomic, setCorruptionNotifier } from './electron-persistence.js';
import { setSecret, getSecret, hasSecret, deleteSecret, listSecrets, isEncryptionAvailable } from './electron-secrets.js';
import { PROVIDER_LIST, getProvider } from './electron-ai-providers.js';
// electron-updater is CommonJS — interop via the default import.
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Load .env ────────────────────────────────────────────────────────────────
// Minimal .env parser (no dotenv dependency). Handles `KEY=value`, surrounding
// single/double quotes, inline `#` comments on unquoted values, and trims
// stray whitespace — the old regex kept quotes and trailing spaces verbatim,
// which silently broke API auth.
function parseEnvValue(raw) {
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    // Quoted: strip the quotes, keep everything inside as-is.
    return value.slice(1, -1);
  }
  // Unquoted: a `#` begins a comment.
  const hashIndex = value.indexOf(' #');
  if (hashIndex !== -1) value = value.slice(0, hashIndex);
  return value.trim();
}

function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) continue;
      if (process.env[key] !== undefined) continue; // real env wins
      process.env[key] = parseEnvValue(trimmed.slice(eq + 1));
    }
  } catch (err) {
    console.warn('[env] Failed to load .env:', err.message);
  }
}
loadEnv();

// ─── Clipboard History Manager ────────────────────────────────────────────────

const HEX_COLOR_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
const URL_RE = /^(https?:\/\/|ftp:\/\/|www\.)\S+/i;
const MAX_HISTORY = 200;

/**
 * Build a Windows CF_HDROP clipboard buffer.
 * Structure: DROPFILES header (20 bytes) + UTF-16LE null-separated path list + double-null.
 *
 * typedef struct _DROPFILES {
 *   DWORD pFiles;  // offset to file list = 20
 *   POINT pt;      // drop point (ignored, set to 0,0)
 *   BOOL  fNC;     // non-client drop (false = 0)
 *   BOOL  fWide;   // Unicode paths (true = 1)
 * } DROPFILES;
 */
function buildCFHDROP(filePaths) {
  const header = Buffer.alloc(20);
  header.writeUInt32LE(20, 0);  // pFiles: file list starts right after header
  header.writeUInt32LE(0,  4);  // pt.x
  header.writeUInt32LE(0,  8);  // pt.y
  header.writeUInt32LE(0, 12);  // fNC = false
  header.writeUInt32LE(1, 16);  // fWide = true → UTF-16LE paths
  // Null-separated paths + double-null terminator, UTF-16LE
  const pathStr = filePaths.join('\0') + '\0\0';
  const pathBuf = Buffer.from(pathStr, 'ucs2');
  return Buffer.concat([header, pathBuf]);
}

class ClipboardHistoryManager {
  constructor(userDataPath) {
    this.historyFile = path.join(userDataPath, 'clipboard-history.json');
    this.imagesDir = path.join(userDataPath, 'clipboard-images');
    this.history = [];
    this.maxHistory = MAX_HISTORY; // overridable via the Settings panel
    this._lastHash = null;
    this._pollInterval = null;
    this._win = null;
    this._ensureDirs();
    this._load();
  }

  /**
   * Update the history cap (from the `clipboardMaxItems` setting) and trim
   * immediately if the new cap is smaller than the current history.
   * @param {number} limit
   */
  setMaxHistory(limit) {
    const n = Number(limit);
    if (!Number.isFinite(n) || n < 1) return;
    this.maxHistory = Math.floor(n);
    if (this.history.length > this.maxHistory) {
      const removed = this.history.splice(this.maxHistory);
      for (const old of removed) {
        if (old.type === 'image' && old.content && fs.existsSync(old.content)) {
          fs.unlink(old.content, () => {});
        }
      }
      this._save();
    }
  }

  _ensureDirs() {
    fs.mkdirSync(this.imagesDir, { recursive: true });
  }

  _load() {
    // readJson preserves a corrupted history file as a `.corrupt-<ts>` backup
    // and notifies, instead of silently starting from an empty list.
    this.history = readJson(this.historyFile, []);
  }

  _save() {
    try {
      writeJsonAtomic(this.historyFile, this.history);
    } catch (e) {
      console.warn('[ClipboardHistory] Save error:', e.message);
    }
  }

  _hash(str) {
    return crypto.createHash('sha1').update(str).digest('hex');
  }

  _detectType(text) {
    if (HEX_COLOR_RE.test(text.trim())) return 'color';
    if (URL_RE.test(text.trim())) return 'link';
    return 'text';
  }

  _poll() {
    try {
      const formats = clipboard.availableFormats();

      // ── 1. Files — always try CF_HDROP directly (availableFormats returns MIME types,
      //    NOT Windows format names, so we can't gate on format strings) ──
      try {
        const rawFiles = clipboard.readBuffer('CF_HDROP');
        if (rawFiles && rawFiles.length > 20) {
          const pFiles = rawFiles.readUInt32LE(0);
          const fWide  = rawFiles.readUInt32LE(16);
          const pathBuf = rawFiles.slice(pFiles);
          const raw = fWide ? pathBuf.toString('ucs2') : pathBuf.toString('ascii');
          const paths = raw.split('\0').map(p => p.trim()).filter(Boolean);
          if (paths.length > 0) {
            const key = paths.join('\n');
            const hash = this._hash(key);
            if (hash !== this._lastHash) {
              this._push({ type: 'file', content: key, paths, preview: paths[0] });
              this._lastHash = hash;
            }
            return;
          }
        }
      } catch (_) { /* no CF_HDROP data — continue */ }

      // ── 2. Images — check MIME types from availableFormats ──
      if (formats.some(f => f.startsWith('image/'))) {
        const img = clipboard.readImage();
        if (!img.isEmpty()) {
          const pngData = img.toPNG();
          const hash = this._hash(pngData.toString('base64').slice(0, 256));
          if (hash !== this._lastHash) {
            try {
              const filename = `${Date.now()}.png`;
              const imgPath = path.join(this.imagesDir, filename);
              fs.writeFileSync(imgPath, pngData);

              let preview;
              try {
                const { width } = img.getSize();
                const thumbImg = width > 300 ? img.resize({ width: 300 }) : img;
                preview = `data:image/png;base64,${thumbImg.toPNG().toString('base64')}`;
              } catch (_) {
                preview = `data:image/png;base64,${pngData.toString('base64')}`;
              }

              this._push({ type: 'image', content: imgPath, preview });
              this._lastHash = hash;
            } catch (e) {
              console.warn('[ClipboardHistory] Image capture error:', e.message);
            }
          }
          return;
        }
      }

      // ── 3. Text / Links / Colors ──
      const text = clipboard.readText();
      if (!text) return;
      const hash = this._hash(text);
      if (hash === this._lastHash) return;
      this._lastHash = hash;

      const type = this._detectType(text);
      this._push({ type, content: text, preview: text });

    } catch (e) {
      console.warn('[ClipboardHistory] Poll error:', e.message);
    }
  }

  _push(partial) {
    const item = {
      id: crypto.randomUUID(),
      type: partial.type,
      content: partial.content,
      preview: partial.preview,
      timestamp: new Date().toISOString(),
    };

    // Deduplicate against most recent same-type item
    const recent = this.history.find(h => h.type === item.type && h.content === item.content);
    if (recent) {
      // Bubble to top with new timestamp instead of duplicating
      this.history = this.history.filter(h => h.id !== recent.id);
      recent.timestamp = item.timestamp;
      this.history.unshift(recent);
    } else {
      this.history.unshift(item);
      if (this.history.length > this.maxHistory) {
        const removed = this.history.splice(this.maxHistory);
        // Clean up orphaned image files
        for (const old of removed) {
          if (old.type === 'image' && old.content && fs.existsSync(old.content)) {
            fs.unlink(old.content, () => { });
          }
        }
      }
    }

    this._save();

    // ── Notify renderer ──────────────────────────────────────────────
    if (this._win && !this._win.isDestroyed()) {
      // IMPORTANT: send `recent` in the dedup path, NOT `item`.
      // If we sent `item` (new UUID) the renderer would store a different id
      // than what this.history holds, making copyItem(id) fail silently.
      const toSend = recent ?? item;
      this._win.webContents.send('clipboard:newItem', toSend);
    }
  }

  start(win) {
    this._win = win;
    if (this._pollInterval) return;
    // Seed hash from current clipboard so we don't immediately re-add existing content
    try {
      const img = clipboard.readImage();
      if (!img.isEmpty()) {
        const pngData = img.toPNG();
        this._lastHash = this._hash(pngData.toString('base64').slice(0, 256));
      } else {
        const text = clipboard.readText();
        if (text) this._lastHash = this._hash(text);
      }
    } catch (_) { }
    this._pollInterval = setInterval(() => this._poll(), 500);
  }

  stop() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  getHistory() { return this.history; }

  deleteItem(id) {
    const item = this.history.find(h => h.id === id);
    if (item && item.type === 'image' && item.content && fs.existsSync(item.content)) {
      fs.unlink(item.content, () => { });
    }
    this.history = this.history.filter(h => h.id !== id);
    this._save();
  }

  clearAll() {
    for (const item of this.history) {
      if (item.type === 'image' && item.content && fs.existsSync(item.content)) {
        fs.unlink(item.content, () => { });
      }
    }
    this.history = [];
    this._save();
  }

  copyItem(id) {
    const item = this.history.find(h => h.id === id);
    if (!item) {
      console.warn('[ClipboardHistory] copyItem: id not found:', id);
      return false;
    }

    if (item.type === 'image') {
      try {
        // Primary: read from the saved PNG file
        const data = fs.readFileSync(item.content);
        const img  = nativeImage.createFromBuffer(data);
        clipboard.writeImage(img);
        this._lastHash = this._hash(img.toPNG().toString('base64').slice(0, 256));
      } catch (_) {
        // Fallback: recreate from the preview thumbnail stored in memory
        try {
          const b64 = item.preview.replace(/^data:image\/png;base64,/, '');
          const img = nativeImage.createFromBuffer(Buffer.from(b64, 'base64'));
          clipboard.writeImage(img);
          this._lastHash = this._hash(img.toPNG().toString('base64').slice(0, 256));
        } catch (e2) {
          console.warn('[ClipboardHistory] copyItem image fallback error:', e2.message);
          return false;
        }
      }

    } else if (item.type === 'file') {
      // Prefer the stored paths array; fall back to parsing the content string
      const paths = Array.isArray(item.paths) && item.paths.length
        ? item.paths
        : item.content.split('\n').map(f => f.trim()).filter(Boolean);

      let written = false;
      try {
        // Primary: CF_HDROP (required for Windows Explorer file paste)
        const buf = buildCFHDROP(paths);
        clipboard.writeBuffer('CF_HDROP', buf);
        written = true;
      } catch (e1) {
        console.warn('[ClipboardHistory] CF_HDROP write error:', e1.message);
      }

      if (!written) {
        try {
          // Secondary: FileNameW (works in some apps but not Explorer)
          const buf = Buffer.from(paths.join('\0') + '\0\0', 'ucs2');
          clipboard.writeBuffer('FileNameW', buf);
          written = true;
        } catch (e2) {
          console.warn('[ClipboardHistory] FileNameW write error:', e2.message);
        }
      }

      if (!written) return false; // do not fall back to text for files
      this._lastHash = this._hash(item.content);

    } else {
      clipboard.writeText(item.content);
      this._lastHash = this._hash(item.content);
    }

    return true;
  }
}

let clipboardHistory = null;
function getClipboardHistory() {
  if (!clipboardHistory) {
    clipboardHistory = new ClipboardHistoryManager(app.getPath('userData'));
  }
  return clipboardHistory;
}

let mainWindow;
let isVisible = true;
let isDockExpanded = false;

// When a stored JSON file is found corrupted, tell the user instead of
// silently dropping their data — the original file is preserved as a
// `.corrupt-<ts>` backup by the persistence layer.
setCorruptionNotifier((filePath, backupPath) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('show-notification', {
    title: 'Recovered from a corrupted file',
    body: backupPath
      ? `${path.basename(filePath)} was unreadable. A backup was saved so nothing is lost.`
      : `${path.basename(filePath)} was unreadable and has been reset.`,
  });
});

/** @type {SnapshotManager | null} */
let snapshotManager = null;
const windowTracker = new WindowTracker();
const terminalManager = new TerminalManager();

// ─── Dock window ─────────────────────────────────────────────────────────────
// The window is a single, permanently fullscreen, transparent overlay — it is
// NEVER resized. Resizing a transparent window on Windows is visibly janky (the
// dock bar slides, because the OS changes x and width on separate frames), so:
//   • the window always covers the whole work area;
//   • while no panel is open it is made click-through with setIgnoreMouseEvents,
//     so the transparent area doesn't swallow clicks meant for the desktop —
//     the renderer re-enables hit-testing while the cursor is over the dock bar
//     (or a panel is open);
//   • the dock bar is positioned and dragged entirely in the renderer, since
//     `-webkit-app-region: drag` would drag the whole fullscreen window.
function getWorkArea() {
  return screen.getPrimaryDisplay().workAreaSize;
}

function getSnapshotManager() {
  if (!snapshotManager) {
    const workspaceDir = path.join(app.getPath('userData'), 'workspaces');
    snapshotManager = new SnapshotManager(workspaceDir);
  }
  return snapshotManager;
}

function createWindow() {
  // One permanently fullscreen, transparent overlay — never resized.
  const { width: sw, height: sh } = getWorkArea();

  mainWindow = new BrowserWindow({
    width: sw,
    height: sh,
    x: 0,
    y: 0,
    // important for clean overlay on Windows
    frame: false,
    transparent: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: true,
    },
    show: false,
  });

  const isDevelopment = process.env.NODE_ENV === 'development' || !app.isPackaged;
  const devPort = process.env.VITE_PORT || '5173';
  const indexPath = isDevelopment
    ? `http://localhost:${devPort}`
    : `file://${path.join(__dirname, 'dist', 'index.html')}`;

  // Click-outside-to-close: when the window loses focus while a panel is open
  // (user clicked another app, the taskbar, alt-tabbed away), tell the renderer
  // to collapse. The renderer owns panel state and does the actual close.
  mainWindow.on('blur', () => {
    if (isDockExpanded && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('dock:blurClose');
    }
  });

  mainWindow.loadURL(indexPath);
  mainWindow.show();

  // Collapsed by default → the fullscreen overlay is click-through everywhere.
  // The renderer re-enables hit-testing over the dock bar via dock:setMouseIgnore.
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Start clipboard history monitoring
  getClipboardHistory().start(mainWindow);

  // Apply saved preferences so they actually take effect on launch.
  applySettings(readSettings());

  // Hydrate the in-memory dock layout from disk so the renderer can ask
  // `dock:layout:get` and immediately get the user's last session.
  currentDockLayout = readDockLayout();

  // DevTools is NOT auto-opened. While DevTools is open, Chromium overlays the
  // live viewport size in the page corner on every window resize — which fires
  // each time the dock collapses/expands, and reads as a distracting flicker.
  // Open it manually with Ctrl+Shift+I, or set DOCKSHIFT_DEVTOOLS=1 to auto-open.
  if (isDevelopment && process.env.DOCKSHIFT_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// In-memory mirror of the persisted dock layout. The renderer pushes updates
// here every time the user opens/closes a panel; we lazy-write them to disk
// (debounced) and read them on startup. `getCurrentDockLayoutSnapshot()`
// exposes the live value to the workspace snapshot path.
const dockLayoutFile = () => path.join(app.getPath('userData'), 'dock-layout.json');
const DEFAULT_DOCK_LAYOUT = {
  activeTabId: null,
  openWidgets: [],
  position: 'bottom-center',
};
let currentDockLayout = { ...DEFAULT_DOCK_LAYOUT };
let dockLayoutWriteTimer = null;

function readDockLayout() {
  const stored = readJson(dockLayoutFile(), null);
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_DOCK_LAYOUT };
  return { ...DEFAULT_DOCK_LAYOUT, ...stored };
}

function scheduleDockLayoutWrite() {
  if (dockLayoutWriteTimer) clearTimeout(dockLayoutWriteTimer);
  dockLayoutWriteTimer = setTimeout(() => {
    dockLayoutWriteTimer = null;
    try {
      writeJsonAtomic(dockLayoutFile(), currentDockLayout);
    } catch (err) {
      console.warn('[dock-layout] write failed:', err.message);
    }
  }, 400);
}

function getCurrentDockLayoutSnapshot() {
  return { ...currentDockLayout };
}

function getCurrentTerminalSnapshots() {
  // If you track terminals in-app, return them here. For now, snapshot is empty.
  return [];
}

// Notification handler - send to renderer to display
ipcMain.handle('notify', (event, { title, body }) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('show-notification', { title, body });
  }
  return { success: true };
});

// ─── Clipboard History IPC ────────────────────────────────────────────────────
ipcMain.handle('clipboard:getHistory', () => {
  return getClipboardHistory().getHistory();
});

ipcMain.handle('clipboard:deleteItem', (_event, { id }) => {
  getClipboardHistory().deleteItem(id);
  return { ok: true };
});

ipcMain.handle('clipboard:clearAll', () => {
  getClipboardHistory().clearAll();
  return { ok: true };
});

ipcMain.handle('clipboard:copyItem', (_event, { id }) => {
  return getClipboardHistory().copyItem(id);
});

// Workspace Snapshot IPC
ipcMain.handle('workspace:save', async (_event, { name }) => {
  // Sanitize up front so the stored `name` field matches the on-disk filename
  // and never carries path-traversal payloads.
  const safeName = SnapshotManager.sanitizeName(name);

  const apps = await windowTracker.captureAppSnapshotsAsync();
  const terminals = getCurrentTerminalSnapshots();
  const dockLayout = getCurrentDockLayoutSnapshot();

  const snapshot = {
    name: safeName,
    createdAt: new Date().toISOString(),
    apps,
    terminals,
    dockLayout,
  };

  const manager = getSnapshotManager();
  await manager.saveSnapshot(safeName, snapshot);
  return snapshot;
});

ipcMain.handle('workspace:list', async () => {
  const manager = getSnapshotManager();
  const snapshots = await manager.listSnapshots();
  return snapshots;
});

ipcMain.handle('workspace:restore', async (event, { name }) => {
  const manager = getSnapshotManager();
  const snapshot = await manager.loadSnapshot(name);
  if (!snapshot) throw new Error(`Workspace "${name}" not found`);

  await windowTracker.restoreFromSnapshots(snapshot.apps || []);
  terminalManager.restoreTerminals(snapshot.terminals || []);

  // Notify renderer to restore dock layout
  event.sender.send('workspace:dockLayoutRestore', snapshot.dockLayout || null);

  return { ok: true };
});

ipcMain.handle('workspace:delete', async (_event, { name }) => {
  const manager = getSnapshotManager();
  await manager.deleteSnapshot(name);
  return { ok: true };
});

// Restore a dock layout from a workspace snapshot. The window never moves or
// resizes anymore — this just tells the renderer where to place the dock bar.
ipcMain.handle('dock:applyLayout', async (_event, { layout }) => {
  if (!mainWindow || mainWindow.isDestroyed() || !layout) return { ok: false };
  const map = { top: 'top-center', left: 'bottom-left', right: 'bottom-right', bottom: 'bottom-center' };
  const position = map[layout.position] || 'bottom-center';
  if (mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('dock:positionChanged', position);
  }
  return { ok: true };
});

// Track whether a panel is open. The window itself never resizes — it is
// permanently fullscreen — so this only updates the flag the `blur` handler
// and the show/hide logic read. Hit-testing is driven by `dock:setMouseIgnore`.
ipcMain.handle('dock:setExpanded', (_event, { expanded }) => {
  isDockExpanded = !!expanded;
  return { ok: true, expanded: isDockExpanded };
});

// Toggle whether the (always-fullscreen, transparent) overlay swallows mouse
// events. The renderer sends `ignore: true` when nothing should be hit-testable
// (collapsed dock, cursor away from the bar) and `false` when the dock bar is
// hovered/dragged or a panel is open. `forward: true` keeps mousemove flowing
// to the page so the renderer can still detect the cursor entering the bar.
ipcMain.handle('dock:setMouseIgnore', (_event, { ignore }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
  mainWindow.setIgnoreMouseEvents(!!ignore, { forward: true });
  return { ok: true };
});

// Read the persisted dock layout (active panel, open widgets, edge). Renderer
// calls this once on mount so the dock reopens to whatever the user had open
// last. Returns the in-memory mirror so it never blocks on disk.
ipcMain.handle('dock:layout:get', () => getCurrentDockLayoutSnapshot());

// Renderer pushes layout changes here whenever the user opens/closes a panel
// or the dock edge changes. Merge into the in-memory mirror and schedule a
// debounced write so we don't hammer disk on rapid toggles.
ipcMain.handle('dock:layout:save', (_event, { layout } = {}) => {
  if (!layout || typeof layout !== 'object') return { ok: false };
  const next = { ...currentDockLayout };
  if ('activeTabId' in layout) next.activeTabId = layout.activeTabId ?? null;
  if (Array.isArray(layout.openWidgets)) next.openWidgets = layout.openWidgets.slice(0, 32);
  if (typeof layout.position === 'string') next.position = layout.position;
  currentDockLayout = next;
  scheduleDockLayoutWrite();
  return { ok: true };
});

// IPC Handlers for Clipboard
ipcMain.handle('clipboard:copy', async (event, text) => {
  try {
    if (typeof text !== 'string' || text.length > 1000000) {
      throw new Error('Invalid clipboard content');
    }
    clipboard.writeText(text);
    return { success: true };
  } catch (error) {
    console.error('Clipboard error:', error);
    throw error;
  }
});

// ─── Notes IPC ────────────────────────────────────────────────────────────────
const notesFile = () => path.join(app.getPath('userData'), 'notes.json');
function readNotes() {
  return readJson(notesFile(), []);
}
function writeNotes(notes) {
  writeJsonAtomic(notesFile(), notes);
}

ipcMain.handle('notes:list', () => readNotes());
ipcMain.handle('notes:save', (_e, { note }) => {
  const notes = readNotes();
  const idx = notes.findIndex(n => n.id === note.id);
  if (idx >= 0) notes[idx] = note; else notes.unshift(note);
  writeNotes(notes);
  return { ok: true };
});
ipcMain.handle('notes:delete', (_e, { id }) => {
  writeNotes(readNotes().filter(n => n.id !== id));
  return { ok: true };
});
ipcMain.handle('notes:togglePin', (_e, { id }) => {
  const notes = readNotes();
  const note = notes.find(n => n.id === id);
  if (note) { note.pinned = !note.pinned; writeNotes(notes); }
  return { ok: true };
});

// ─── AI Chat IPC (multi-provider) ─────────────────────────────────────────────
//
// Provider selection lives in settings.json (`aiProvider`, `aiModel`). API
// keys live in the encrypted secrets store — except Gemini, which also accepts
// a `.env` VITE_GEMINI_API_KEY as a dev-time override so existing setups keep
// working without re-entering the key.

/** Resolve the API key for a provider: secrets store first, .env fallback for Gemini. */
function resolveApiKey(provider) {
  if (provider.keyless) return '';
  const stored = getSecret(provider.keyName);
  if (stored) return stored;
  if (provider.id === 'gemini') {
    const envKey = process.env.VITE_GEMINI_API_KEY;
    if (envKey && envKey !== 'your_api_key_here') return envKey;
  }
  return null;
}

/** The provider + model the user has selected (with sane defaults). */
function getActiveProvider() {
  const settings = readSettings();
  const provider = getProvider(settings.aiProvider) || getProvider('gemini');
  const model = settings.aiModel || provider.defaultModel;
  return { provider, model };
}

/** True if a provider is ready to use (keyless, or has a resolvable key). */
function providerReady(provider) {
  return provider.keyless || resolveApiKey(provider) !== null;
}

// Renderer gates the AI panel on this before letting a user type a doomed prompt.
ipcMain.handle('ai:status', () => {
  const { provider, model } = getActiveProvider();
  return {
    hasKey: providerReady(provider),
    provider: provider.id,
    providerLabel: provider.label,
    model,
  };
});

// Static provider catalog for the Settings "AI / Models" picker.
ipcMain.handle('ai:providers', () => ({
  providers: PROVIDER_LIST,
  encryptionAvailable: isEncryptionAvailable(),
}));

// ── AI model lists ───────────────────────────────────────────────────────────
// Live model catalogs fetched from each provider, with the curated `models[]`
// as a never-fail fallback. Successful live results are cached briefly so
// reopening Settings or flipping providers doesn't re-hit the network; failures
// are NOT cached, so a retry happens as soon as e.g. Ollama is started.
const MODEL_LIST_TTL = 5 * 60 * 1000;
const modelListCache = new Map(); // providerId -> { at, payload }

ipcMain.handle('ai:listModels', async (_e, { provider: providerId } = {}) => {
  const provider = getProvider(providerId) || getActiveProvider().provider;
  if (!provider) {
    return { ok: false, models: [], source: 'fallback', reason: 'unknown-provider' };
  }

  const cached = modelListCache.get(provider.id);
  if (cached && Date.now() - cached.at < MODEL_LIST_TTL) return cached.payload;

  const curated = provider.models || [];
  let payload;
  try {
    if (typeof provider.listModels !== 'function') {
      payload = { ok: true, models: curated, source: 'fallback', reason: 'no-fetcher' };
    } else {
      const apiKey = resolveApiKey(provider);
      if (!provider.keyless && !apiKey) {
        payload = { ok: false, models: curated, source: 'fallback', reason: 'no-key' };
      } else {
        const live = await provider.listModels({ apiKey });
        const models = Array.isArray(live) ? live.filter(Boolean) : [];
        payload = models.length
          ? { ok: true, models, source: 'live' }
          : { ok: false, models: curated, source: 'fallback', reason: 'empty' };
      }
    }
  } catch (err) {
    // Never throw across IPC — always degrade to the curated list.
    payload = { ok: false, models: curated, source: 'fallback', reason: err?.message || 'fetch-failed' };
  }

  // Only cache genuine live results — keep retrying on failure.
  if (payload.source === 'live') {
    modelListCache.set(provider.id, { at: Date.now(), payload });
  }
  return payload;
});

/** Run a chat turn on the active provider. `onChunk` may be undefined. */
async function runChat(prompt, onChunk, signal) {
  const { provider, model } = getActiveProvider();
  const apiKey = resolveApiKey(provider);
  if (!provider.keyless && apiKey === null) {
    throw new Error(`No API key configured for ${provider.label}. Add one in Settings.`);
  }
  return provider.chat({ apiKey, model, prompt, onChunk, signal });
}

// Total-time and idle timeouts so a slow or stalled provider doesn't hang the
// chat panel forever. Tunable here — generous enough to absorb cold-start
// latency on Ollama / OpenRouter, tight enough to surface a real network
// failure within a minute.
const AI_CHAT_TOTAL_TIMEOUT_MS = 60_000;     // non-streaming: hard cap on the whole request
const AI_STREAM_IDLE_TIMEOUT_MS = 60_000;    // streaming: max gap between chunks
const AI_STREAM_FIRST_CHUNK_TIMEOUT_MS = 45_000; // streaming: max wait for the first chunk

class AiTimeoutError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'AiTimeoutError';
    this.code = 'TIMEOUT';
  }
}

/**
 * Run `runChat` under an AbortController. If `idleMs` is set, the timer
 * resets every time a chunk arrives (idle/streaming mode). Otherwise the
 * timer is a single hard deadline (total/non-streaming mode).
 */
async function runChatWithTimeout(prompt, onChunk, { totalMs, idleMs, firstChunkMs }) {
  const ctrl = new AbortController();
  let timer = null;
  let receivedChunk = false;
  const trip = (msg) => {
    if (ctrl.signal.aborted) return;
    ctrl.abort(new AiTimeoutError(msg));
  };
  const arm = (ms, msg) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => trip(msg), ms);
  };

  if (idleMs) {
    arm(firstChunkMs ?? idleMs, 'AI request stalled — no response from provider');
  } else if (totalMs) {
    arm(totalMs, 'AI request timed out');
  }

  const wrappedChunk = onChunk
    ? (delta) => {
        receivedChunk = true;
        if (idleMs) arm(idleMs, 'AI stream stalled — no new tokens');
        onChunk(delta);
      }
    : undefined;

  try {
    return await runChat(prompt, wrappedChunk, ctrl.signal);
  } catch (err) {
    // Surface our timeout as the canonical error even when fetch wraps it.
    if (ctrl.signal.aborted && ctrl.signal.reason instanceof AiTimeoutError) {
      throw ctrl.signal.reason;
    }
    if (err?.name === 'AbortError' && idleMs && !receivedChunk) {
      throw new AiTimeoutError('AI request stalled — no response from provider');
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Non-streaming chat — kept for callers that just want the final text.
ipcMain.handle('ai:chat', async (_e, { prompt }) => {
  try {
    const text = await runChatWithTimeout(prompt, undefined, { totalMs: AI_CHAT_TOTAL_TIMEOUT_MS });
    return { text: text || 'No response.' };
  } catch (err) {
    if (err instanceof AiTimeoutError) {
      return { text: '', error: err.message, code: 'TIMEOUT' };
    }
    throw err;
  }
});

// Streaming chat. The renderer calls this, then listens on the push channels
// `ai:streamChunk` / `ai:streamDone` / `ai:streamError`, all tagged with the
// `streamId` returned here so multiple panels could stream independently.
let _streamSeq = 0;
ipcMain.handle('ai:chatStream', async (e, { prompt }) => {
  const streamId = `s${++_streamSeq}`;
  const send = (channel, payload) => {
    if (e.sender && !e.sender.isDestroyed()) e.sender.send(channel, { streamId, ...payload });
  };
  // Run detached — resolve the invoke immediately with the id so the renderer
  // can start listening; chunks arrive over the push channels.
  (async () => {
    try {
      const text = await runChatWithTimeout(
        prompt,
        (delta) => send('ai:streamChunk', { delta }),
        { idleMs: AI_STREAM_IDLE_TIMEOUT_MS, firstChunkMs: AI_STREAM_FIRST_CHUNK_TIMEOUT_MS },
      );
      send('ai:streamDone', { text: text || 'No response.' });
    } catch (err) {
      console.error('[AI:chatStream] Error:', err.message);
      const code = err instanceof AiTimeoutError ? 'TIMEOUT' : (err.code || undefined);
      send('ai:streamError', { error: err.message || 'Failed to get response', code });
    }
  })();
  return { streamId };
});

ipcMain.handle('ai:transcribe', async (_e, { audio, language }) => {
  try {
    // Prefer the active provider if it can transcribe; otherwise fall back to
    // any configured provider that can (Gemini or OpenAI).
    const { provider: active } = getActiveProvider();
    let provider = active.canTranscribe && providerReady(active) ? active : null;
    if (!provider) {
      provider = [getProvider('gemini'), getProvider('openai')]
        .find(p => p && p.canTranscribe && providerReady(p)) || null;
    }
    if (!provider) {
      throw new Error('No transcription-capable provider configured (needs Gemini or OpenAI).');
    }
    const text = await provider.transcribe({
      apiKey: resolveApiKey(provider),
      audioBase64: audio,
      language: language || 'en',
    });
    return { text: text || '' };
  } catch (err) {
    console.error('[AI:Transcribe] Error:', err.message);
    throw new Error('Transcription failed: ' + (err.message || 'Unknown error'));
  }
});

// ─── Secrets IPC ──────────────────────────────────────────────────────────────
// The renderer can set / check / delete / list secret NAMES only — a raw key
// value is never returned across this boundary.
ipcMain.handle('secrets:set', (_e, { name, value }) => setSecret(name, value));
ipcMain.handle('secrets:has', (_e, { name }) => ({ has: hasSecret(name) }));
ipcMain.handle('secrets:delete', (_e, { name }) => { deleteSecret(name); return { ok: true }; });
ipcMain.handle('secrets:list', () => ({ names: listSecrets() }));

// ─── Screenshot IPC ───────────────────────────────────────────────────────────
const screenshotsDir = () => path.join(app.getPath('userData'), 'screenshots');
const screenshotsIndex = () => path.join(app.getPath('userData'), 'screenshots-index.json');

function ensureScreenshotsDir() { fs.mkdirSync(screenshotsDir(), { recursive: true }); }
function readScreenshotIndex() {
  return readJson(screenshotsIndex(), []);
}
function writeScreenshotIndex(idx) {
  writeJsonAtomic(screenshotsIndex(), idx);
}

ipcMain.handle('screenshot:getSources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 400, height: 400 },
  });
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    preview: s.thumbnail.toDataURL()
  }));
});

ipcMain.handle('screenshot:capture', async (_e, { mode, sourceId }) => {
  ensureScreenshotsDir();
  const sources = await desktopCapturer.getSources({
    types: mode === 'window' ? ['window'] : ['screen'],
    thumbnailSize: { width: 1920, height: 1080 },
  });
  if (!sources.length) return { screenshot: null };
  
  let source;
  if (mode === 'window' && sourceId) {
    source = sources.find(s => s.id === sourceId);
  } else {
    source = sources[0];
  }
  if (!source) return { screenshot: null };

  const img = source.thumbnail;
  if (img.isEmpty()) return { screenshot: null };

  const id = crypto.randomUUID();
  const filename = `${Date.now()}.png`;
  const filePath = path.join(screenshotsDir(), filename);
  fs.writeFileSync(filePath, img.toPNG());

  // Create thumbnail preview
  let preview;
  try {
    const { width } = img.getSize();
    const thumbImg = width > 400 ? img.resize({ width: 400 }) : img;
    preview = `data:image/png;base64,${thumbImg.toPNG().toString('base64')}`;
  } catch (_) {
    preview = `data:image/png;base64,${img.toPNG().toString('base64')}`;
  }

  const entry = { id, path: filePath, preview, timestamp: new Date().toISOString(), mode };
  const idx = readScreenshotIndex();
  idx.unshift(entry);
  if (idx.length > 50) idx.splice(50);
  writeScreenshotIndex(idx);

  return { screenshot: entry };
});

ipcMain.handle('screenshot:getHistory', () => readScreenshotIndex());
ipcMain.handle('screenshot:delete', (_e, { id }) => {
  const idx = readScreenshotIndex();
  const item = idx.find(s => s.id === id);
  if (item?.path && fs.existsSync(item.path)) fs.unlinkSync(item.path);
  writeScreenshotIndex(idx.filter(s => s.id !== id));
  return { ok: true };
});
ipcMain.handle('screenshot:copy', (_e, { id }) => {
  const idx = readScreenshotIndex();
  const item = idx.find(s => s.id === id);
  if (item?.path && fs.existsSync(item.path)) {
    const data = fs.readFileSync(item.path);
    clipboard.writeImage(nativeImage.createFromBuffer(data));
    return { ok: true };
  }
  return { ok: false };
});
ipcMain.handle('screenshot:open', (_e, { id }) => {
  const idx = readScreenshotIndex();
  const item = idx.find(s => s.id === id);
  // Validate path is within screenshots directory to prevent path traversal
  if (item?.path) {
    const resolvedPath = path.resolve(item.path);
    const resolvedDir = path.resolve(screenshotsDir());
    if (!resolvedPath.startsWith(resolvedDir + path.sep) && resolvedPath !== resolvedDir) {
      console.warn('[Screenshot] Path traversal attempt blocked:', item.path);
      return { ok: false };
    }
    shell.openPath(resolvedPath);
  }
  return { ok: true };
});

// ─── Settings IPC ─────────────────────────────────────────────────────────────
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function readSettings() {
  return readJson(settingsFile(), {});
}

/**
 * Move the dock bar to one of the four preset positions. The window is
 * permanently fullscreen, so this just broadcasts the preset to the renderer,
 * which positions (and snaps) the dock bar within the overlay.
 */
function applyDockPosition(position) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('dock:positionChanged', position);
  }
}

/**
 * Apply every setting that has a runtime effect. Called both from the
 * Settings panel (settings:set) and once at startup so saved preferences
 * actually take effect — previously dockPosition and clipboardMaxItems were
 * persisted but silently ignored.
 */
function applySettings(settings) {
  if (!settings || typeof settings !== 'object') return;
  if (mainWindow && !mainWindow.isDestroyed() && typeof settings.alwaysOnTop === 'boolean') {
    mainWindow.setAlwaysOnTop(settings.alwaysOnTop);
  }
  if (typeof settings.launchOnStartup === 'boolean') {
    app.setLoginItemSettings({ openAtLogin: settings.launchOnStartup });
  }
  if (settings.clipboardMaxItems != null) {
    getClipboardHistory().setMaxHistory(settings.clipboardMaxItems);
  }
  if (settings.dockPosition) {
    applyDockPosition(settings.dockPosition);
  }
}

ipcMain.handle('settings:get', () => readSettings());
ipcMain.handle('settings:set', (_e, { settings }) => {
  // Merge rather than overwrite: callers (Settings panel, ThemeContext, …)
  // each own only a subset of keys, so a partial write must not wipe the rest.
  writeJsonAtomic(settingsFile(), { ...readSettings(), ...settings });
  // Apply only what changed — applySettings guards each key by presence, so
  // toggling the theme won't, say, re-snap a window the user dragged.
  applySettings(settings);
  return { ok: true };
});

// ─── Launcher IPC ─────────────────────────────────────────────────────────────
function getStartMenuPaths() {
  return [
    path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ];
}

function scanApps(dir, results = [], depth = 0) {
  if (depth > 3) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanApps(full, results, depth + 1);
      } else if (entry.name.endsWith('.lnk') || entry.name.endsWith('.url')) {
        results.push({
          name: entry.name.replace(/\.(lnk|url)$/i, ''),
          path: full,
          type: 'app',
        });
      }
    }
  } catch (_) {}
  return results;
}

let cachedApps = null;
let cacheTime = 0;

ipcMain.handle('launcher:search', (_e, { query }) => {
  // Refresh cache every 60s
  if (!cachedApps || Date.now() - cacheTime > 60000) {
    cachedApps = [];
    for (const dir of getStartMenuPaths()) cachedApps = scanApps(dir, cachedApps);
    // Add built-in system commands
    cachedApps.push(
      { name: 'Calculator', path: 'calc.exe', type: 'system' },
      { name: 'Notepad', path: 'notepad.exe', type: 'system' },
      { name: 'Task Manager', path: 'taskmgr.exe', type: 'system' },
      { name: 'Control Panel', path: 'control.exe', type: 'system' },
      { name: 'File Explorer', path: 'explorer.exe', type: 'system' },
      { name: 'Command Prompt', path: 'cmd.exe', type: 'system' },
      { name: 'PowerShell', path: 'powershell.exe', type: 'system' },
      { name: 'Settings', path: 'ms-settings:', type: 'system' },
    );
    cacheTime = Date.now();
  }
  const q = query.toLowerCase();
  return cachedApps
    .filter(a => a.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const aStartsWith = a.name.toLowerCase().startsWith(q);
      const bStartsWith = b.name.toLowerCase().startsWith(q);
      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 20);
});

ipcMain.handle('launcher:open', async (_e, { path: appPath, type }) => {
  try {
    // Validate appPath to prevent injection
    if (typeof appPath !== 'string' || appPath.length > 1024) {
      throw new Error('Invalid application path');
    }

    if (type === 'system' && appPath.startsWith('ms-')) {
      // Only allow ms-settings: URIs
      if (!/^ms-[a-z]+:/i.test(appPath)) throw new Error('Invalid system URI');
      await shell.openExternal(appPath);
    } else if (type === 'system') {
      // Use spawn with argument array instead of exec to prevent command injection
      const child = spawn('cmd.exe', ['/c', 'start', '""', appPath], {
        detached: true, stdio: 'ignore'
      });
      child.unref();
    } else {
      // Validate the path exists and is a file (not a shell command)
      if (!fs.existsSync(appPath)) throw new Error('Path not found');
      await shell.openPath(appPath);
    }
    return { ok: true };
  } catch (err) {
    console.warn('[Launcher] open error:', err.message);
    return { ok: false, error: err.message };
  }
});

// ─── App icons ────────────────────────────────────────────────────────────────
// Extract the real icon for a file path (.exe / .lnk / .url / any file) so the
// launcher and workspace lists can show actual app icons instead of generic
// glyphs. Results are cached by path; an unresolvable path returns '' and the
// renderer falls back to its generic icon. Bare command names (e.g. `calc.exe`)
// and URI schemes (e.g. `ms-settings:`) won't resolve — that's expected.
//
// LRU-bounded: a `Map` preserves insertion order, so re-`set`ing a key on hit
// promotes it to "most recent." Once we hit `ICON_CACHE_LIMIT`, the oldest
// entry (front of iteration) is evicted. Caps long-session memory growth on
// machines with thousands of installed apps.
const ICON_CACHE_LIMIT = 500;
const iconCache = new Map();
ipcMain.handle('app:getIcon', async (_e, { path: filePath } = {}) => {
  if (typeof filePath !== 'string' || !filePath || filePath.length > 1024) return '';
  if (iconCache.has(filePath)) {
    const cached = iconCache.get(filePath);
    iconCache.delete(filePath);
    iconCache.set(filePath, cached);
    return cached;
  }
  let url = '';
  try {
    if (fs.existsSync(filePath)) {
      const img = await app.getFileIcon(filePath, { size: 'normal' });
      if (img && !img.isEmpty()) url = img.toDataURL();
    }
  } catch (_) { /* unresolvable — fall through to '' */ }
  iconCache.set(filePath, url);
  if (iconCache.size > ICON_CACHE_LIMIT) {
    iconCache.delete(iconCache.keys().next().value);
  }
  return url;
});

// ─── Terminal IPC ─────────────────────────────────────────────────────────────
// One persistent pty for the whole app session. The renderer reattaches to it
// on every panel reopen (via `terminal:ensure` + `terminal:getBuffer` replay)
// instead of restarting the shell each time. `terminal:spawn` is kept as the
// explicit "Restart" action.
let ptyProcess = null;
let ptyBuffer = '';
const PTY_BUFFER_MAX = 256 * 1024; // cap the replay buffer at ~256 KB

// MOTD banner — an ASCII ">>" double-chevron logo, run as a real PowerShell
// `-Command` at shell startup so it lives in ConPTY's own screen buffer and
// survives resizes/repaints (a banner written straight to xterm gets wiped the
// moment ConPTY repaints on a resize). Built with [char]0x2588 + single-quoted
// strings so the command line carries no unicode and no double-quotes.
const TERMINAL_BANNER = [
  '$b=[string][char]0x2588+[string][char]0x2588',
  "Write-Host ''",
  "Write-Host ('   '+$b+'     '+$b) -ForegroundColor Blue",
  "Write-Host ('     '+$b+'     '+$b) -ForegroundColor Cyan",
  "Write-Host ('       '+$b+'     '+$b) -ForegroundColor White",
  "Write-Host ('     '+$b+'     '+$b) -ForegroundColor Cyan",
  "Write-Host ('   '+$b+'     '+$b) -ForegroundColor Blue",
  "Write-Host ''",
  "Write-Host '   DockShift Terminal ' -ForegroundColor White -NoNewline",
  "Write-Host '- PowerShell session ready' -ForegroundColor DarkGray",
  "Write-Host '   Ctrl+Shift+C/V copy-paste   Ctrl+F search   Ctrl+(+/-) zoom' -ForegroundColor DarkGray",
  "Write-Host ''",
].join('; ');

/** Spawn a fresh pty, wire its data/exit, and make it the current session. */
function spawnPty() {
  const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
  const shellArgs = os.platform() === 'win32'
    ? ['-NoLogo', '-NoExit', '-Command', TERMINAL_BANNER]
    : [];
  // Filter sensitive environment variables before passing to the PTY.
  // This is a *denylist of patterns* rather than a list of known key names —
  // any var whose name looks secret-ish (e.g. a user's own GOOGLE_API_KEY)
  // is stripped, not just the handful we happen to ship with.
  const safeEnv = { ...process.env };
  const SECRET_NAME_RE = /(KEY|SECRET|TOKEN|PASS(WORD|WD)?|CREDENTIAL|PRIVATE|AUTH|SESSION|COOKIE|SIGNATURE|CERT)/i;
  for (const key of Object.keys(safeEnv)) {
    if (SECRET_NAME_RE.test(key)) {
      delete safeEnv[key];
    }
  }

  const proc = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.USERPROFILE || process.env.HOME || process.cwd(),
    env: safeEnv,
  });
  ptyBuffer = '';

  proc.onData((data) => {
    if (ptyProcess !== proc) return; // a newer pty has replaced this one
    // Keep a capped scrollback so a reopened panel can replay it.
    ptyBuffer = (ptyBuffer + data).slice(-PTY_BUFFER_MAX);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal:onData', data);
    }
  });

  proc.onExit(() => {
    if (ptyProcess !== proc) return; // already replaced — stale exit
    ptyProcess = null;
    ptyBuffer = '';
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal:onExit');
    }
  });

  ptyProcess = proc;
}

// Explicit restart — always kills the current shell and spawns a fresh one.
ipcMain.handle('terminal:spawn', () => {
  if (ptyProcess) {
    try { ptyProcess.kill(); } catch (_) { /* already dead */ }
  }
  ptyProcess = null;
  spawnPty();
  return { ok: true };
});

// Spawn only if there's no live shell — used on panel open so a reopened panel
// reattaches to the existing session instead of restarting it.
ipcMain.handle('terminal:ensure', () => {
  if (ptyProcess) return { ok: true, alreadyRunning: true };
  spawnPty();
  return { ok: true, alreadyRunning: false };
});

// Current scrollback, for replaying into a freshly-created xterm instance.
ipcMain.handle('terminal:getBuffer', () => ptyBuffer);

ipcMain.handle('terminal:write', (_e, { data }) => {
  if (ptyProcess) ptyProcess.write(data);
});

ipcMain.handle('terminal:resize', (_e, { cols, rows }) => {
  if (ptyProcess) {
    try { ptyProcess.resize(cols, rows); } catch (err) {}
  }
});

// Open a terminal hyperlink in the default browser — http/https only.
ipcMain.handle('terminal:openLink', (_e, { url }) => {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false };
    shell.openExternal(u.href);
    return { ok: true };
  } catch (_) {
    return { ok: false };
  }
});

// ─── Browser IPC ──────────────────────────────────────────────────────────────
const bookmarksFile = () => path.join(app.getPath('userData'), 'browser-bookmarks.json');
const browserHistFile = () => path.join(app.getPath('userData'), 'browser-history.json');

ipcMain.handle('browser:getBookmarks', () => readJson(bookmarksFile(), []));
ipcMain.handle('browser:saveBookmark', (_e, { url, title }) => {
  const bm = readJson(bookmarksFile(), []);
  if (!bm.find(b => b.url === url)) { bm.unshift({ url, title, addedAt: new Date().toISOString() }); }
  if (bm.length > 50) bm.splice(50);
  writeJsonAtomic(bookmarksFile(), bm);
  return { ok: true };
});
ipcMain.handle('browser:getHistory', () => readJson(browserHistFile(), []));
ipcMain.handle('browser:addHistory', (_e, { url, title }) => {
  let hist = readJson(browserHistFile(), []);
  hist = hist.filter(h => h.url !== url);
  hist.unshift({ url, title, visitedAt: new Date().toISOString() });
  if (hist.length > 100) hist.splice(100);
  writeJsonAtomic(browserHistFile(), hist);
  return { ok: true };
});

function toggleWindowVisibility() {
  if (isVisible) {
    mainWindow.hide();
    isVisible = false;
  } else {
    mainWindow.show();
    // Re-assert hit-testing after show(): interactive only if a panel is open,
    // otherwise click-through (the renderer re-syncs on the next mouse move).
    mainWindow.setIgnoreMouseEvents(!isDockExpanded, { forward: true });
    isVisible = true;
  }
  refreshTrayMenu();
}

// ─── Toggle hotkey ────────────────────────────────────────────────────────────
// User-customizable, persisted in settings.json under `toggleDockShortcut`.
// Whatever's currently registered lives here so we can unregister cleanly when
// the user picks a new combo.
const DEFAULT_TOGGLE_SHORTCUT = 'Control+Shift+D';
let currentToggleShortcut = null;

function registerToggleShortcut(accelerator) {
  const accel = String(accelerator || '').trim() || DEFAULT_TOGGLE_SHORTCUT;
  if (currentToggleShortcut && currentToggleShortcut !== accel) {
    globalShortcut.unregister(currentToggleShortcut);
  } else if (currentToggleShortcut === accel && globalShortcut.isRegistered(accel)) {
    return { ok: true, accelerator: accel };
  }
  let ok = false;
  try {
    ok = globalShortcut.register(accel, toggleWindowVisibility);
  } catch (err) {
    return { ok: false, error: err.message || 'Invalid shortcut' };
  }
  if (!ok) {
    // register() returns false silently when the combo is already taken by
    // another app or is malformed. Fall back to the previous binding so the
    // dock isn't left without a hotkey.
    if (currentToggleShortcut && currentToggleShortcut !== accel) {
      globalShortcut.register(currentToggleShortcut, toggleWindowVisibility);
    }
    return { ok: false, error: 'Shortcut is already in use by another app' };
  }
  currentToggleShortcut = accel;
  refreshTrayMenu();
  return { ok: true, accelerator: accel };
}

ipcMain.handle('settings:hotkey:set', (_e, { accelerator } = {}) => {
  const result = registerToggleShortcut(accelerator);
  if (result.ok) {
    writeJsonAtomic(settingsFile(), {
      ...readSettings(),
      toggleDockShortcut: result.accelerator,
    });
  }
  return result;
});

// ─── System tray ──────────────────────────────────────────────────────────────
let tray = null;

function trayIconPath() {
  // Bundled inside the asar in packaged builds (see package.json build.files).
  // In dev __dirname resolves to the repo root so the same path works.
  const ico = path.join(app.getAppPath(), 'assets', 'icon.ico');
  return fs.existsSync(ico) ? ico : path.join(app.getAppPath(), 'assets', 'icon.png');
}

function formatAcceleratorForTray(accel) {
  if (!accel) return '';
  return accel
    .replace(/CommandOrControl/gi, 'Ctrl')
    .replace(/Control/gi, 'Ctrl')
    .replace(/\bMeta\b/g, 'Win')
    .replace(/\+/g, '+');
}

function buildTrayMenu() {
  const shortcut = formatAcceleratorForTray(currentToggleShortcut || DEFAULT_TOGGLE_SHORTCUT);
  return Menu.buildFromTemplate([
    {
      label: isVisible ? 'Hide Dock' : 'Show Dock',
      accelerator: currentToggleShortcut || DEFAULT_TOGGLE_SHORTCUT,
      click: toggleWindowVisibility,
    },
    { type: 'separator' },
    {
      label: 'Quit DockShift',
      click: () => app.quit(),
    },
  ]);
}

function refreshTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(buildTrayMenu());
  const shortcut = formatAcceleratorForTray(currentToggleShortcut || DEFAULT_TOGGLE_SHORTCUT);
  tray.setToolTip(`DockShift • ${shortcut}`);
}

function createTray() {
  if (tray) return;
  const image = nativeImage.createFromPath(trayIconPath());
  if (image.isEmpty()) {
    console.warn('[tray] icon not found at', trayIconPath());
    return;
  }
  tray = new Tray(image);
  tray.on('click', toggleWindowVisibility);
  refreshTrayMenu();
}

// ─── Auto-updater ─────────────────────────────────────────────────────────────
// electron-updater pulls release manifests from GitHub Releases (configured in
// package.json `build.publish`). We expose a small state machine to the
// renderer instead of relying on the OS toast that `checkForUpdatesAndNotify`
// produces — users get a real in-app indicator and a manual "Check now" /
// "Restart and install" pair in Settings → About.
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
let updateCheckTimer = null;

const updateState = {
  status: 'idle',          // idle | checking | available | downloading | downloaded | not-available | error | unsupported
  currentVersion: app.getVersion(),
  latestVersion: null,
  releaseNotes: null,
  releaseName: null,
  progress: null,          // { percent, transferred, total, bytesPerSecond }
  error: null,
  lastCheckedAt: null,
};

function broadcastUpdateState() {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('updater:state', updateState);
  }
}

function setUpdateState(patch) {
  Object.assign(updateState, patch);
  broadcastUpdateState();
}

function setupAutoUpdater() {
  if (!app.isPackaged) {
    setUpdateState({ status: 'unsupported' });
    return;
  }

  // Defaults are already what we want (autoDownload=true, autoInstallOnAppQuit=true)
  // — set explicitly so a future electron-updater bump can't surprise us.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = !!readSettings().receivePrerelease;

  autoUpdater.on('checking-for-update', () => {
    setUpdateState({ status: 'checking', error: null });
  });
  autoUpdater.on('update-available', (info) => {
    setUpdateState({
      status: 'downloading',
      latestVersion: info?.version || null,
      releaseNotes: typeof info?.releaseNotes === 'string' ? info.releaseNotes : null,
      releaseName: info?.releaseName || null,
      progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 },
      error: null,
    });
  });
  autoUpdater.on('update-not-available', (info) => {
    setUpdateState({
      status: 'not-available',
      latestVersion: info?.version || updateState.currentVersion,
      lastCheckedAt: new Date().toISOString(),
      error: null,
    });
  });
  autoUpdater.on('download-progress', (p) => {
    setUpdateState({
      status: 'downloading',
      progress: {
        percent: Math.round(p?.percent || 0),
        transferred: p?.transferred || 0,
        total: p?.total || 0,
        bytesPerSecond: p?.bytesPerSecond || 0,
      },
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    setUpdateState({
      status: 'downloaded',
      latestVersion: info?.version || updateState.latestVersion,
      progress: null,
      error: null,
    });
  });
  autoUpdater.on('error', (err) => {
    console.warn('[updater] error:', err?.message || err);
    setUpdateState({
      status: 'error',
      error: (err && err.message) ? err.message : 'Update check failed',
    });
  });

  // Initial check + recurring poll. Long sessions still see updates without
  // needing an app restart.
  triggerUpdateCheck();
  updateCheckTimer = setInterval(triggerUpdateCheck, UPDATE_CHECK_INTERVAL_MS);
}

function triggerUpdateCheck() {
  if (!app.isPackaged) {
    setUpdateState({ status: 'unsupported' });
    return;
  }
  // Don't stomp an in-flight download with a fresh check.
  if (updateState.status === 'downloading' || updateState.status === 'downloaded') return;
  setUpdateState({ status: 'checking', error: null });
  autoUpdater.checkForUpdates().catch((err) => {
    setUpdateState({
      status: 'error',
      error: (err && err.message) ? err.message : 'Update check failed',
    });
  });
}

ipcMain.handle('updater:status', () => updateState);

ipcMain.handle('updater:check', () => {
  triggerUpdateCheck();
  return updateState;
});

ipcMain.handle('updater:install', () => {
  if (!app.isPackaged || updateState.status !== 'downloaded') {
    return { ok: false, error: 'No update is ready to install' };
  }
  // isSilent=true uses the NSIS one-click installer flow; isForceRunAfter=true
  // relaunches DockShift after the install completes.
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return { ok: true };
});

ipcMain.handle('app:getVersion', () => app.getVersion());

app.on('ready', () => {
  createWindow();
  createTray();

  // Register the user's saved toggle shortcut, falling back to the default if
  // it's missing or no longer valid (e.g. another app claimed it).
  const saved = readSettings().toggleDockShortcut;
  const r = registerToggleShortcut(saved || DEFAULT_TOGGLE_SHORTCUT);
  if (!r.ok && saved) {
    registerToggleShortcut(DEFAULT_TOGGLE_SHORTCUT);
  }

  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (clipboardHistory) clipboardHistory.stop();
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
});
