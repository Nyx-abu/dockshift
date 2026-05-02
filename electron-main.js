import { app, BrowserWindow, globalShortcut, screen, ipcMain, clipboard, nativeImage, shell, desktopCapturer } from 'electron';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Load .env ────────────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
        if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
      }
    }
  } catch (_) {}
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
    this._lastHash = null;
    this._pollInterval = null;
    this._win = null;
    this._ensureDirs();
    this._load();
  }

  _ensureDirs() {
    fs.mkdirSync(this.imagesDir, { recursive: true });
  }

  _load() {
    try {
      if (fs.existsSync(this.historyFile)) {
        const raw = fs.readFileSync(this.historyFile, 'utf8');
        this.history = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[ClipboardHistory] Load error:', e.message);
      this.history = [];
    }
  }

  _save() {
    try {
      fs.writeFileSync(this.historyFile, JSON.stringify(this.history, null, 2), 'utf8');
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
      if (this.history.length > MAX_HISTORY) {
        const removed = this.history.splice(MAX_HISTORY);
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

/** @type {SnapshotManager | null} */
let snapshotManager = null;
const windowTracker = new WindowTracker();
const terminalManager = new TerminalManager();

function getSnapshotManager() {
  if (!snapshotManager) {
    const workspaceDir = path.join(app.getPath('userData'), 'workspaces');
    console.log('[Workspace] Base directory:', workspaceDir);
    snapshotManager = new SnapshotManager(workspaceDir);
  }
  return snapshotManager;
}

function createWindow() {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 480,
    height: 140,
    // Default: horizontally centered, slightly above the bottom taskbar
    x: Math.round(screenWidth / 2 - 240),
    y: screenHeight - 150,
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

  mainWindow.loadURL(indexPath);
  mainWindow.show();

  // Start clipboard history monitoring
  getClipboardHistory().start(mainWindow);

  if (isDevelopment) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function getCurrentDockLayoutSnapshot() {
  // TODO: integrate with your real dock state (position, width, active tab)
  return {
    position: 'right',
    width: 480,
    activeTabId: 'workspaces',
    openWidgets: ['workspaces'],
  };
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
  console.log('[IPC] workspace:save', name);

  const apps = await windowTracker.captureAppSnapshotsAsync();
  const terminals = getCurrentTerminalSnapshots();
  const dockLayout = getCurrentDockLayoutSnapshot();

  const snapshot = {
    name,
    createdAt: new Date().toISOString(),
    apps,
    terminals,
    dockLayout,
  };

  const manager = getSnapshotManager();
  await manager.saveSnapshot(name, snapshot);
  return snapshot;
});

ipcMain.handle('workspace:list', async () => {
  console.log('[IPC] workspace:list');
  const manager = getSnapshotManager();
  const snapshots = await manager.listSnapshots();
  return snapshots;
});

ipcMain.handle('workspace:restore', async (event, { name }) => {
  console.log('[IPC] workspace:restore', name);
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
  console.log('[IPC] workspace:delete', name);
  const manager = getSnapshotManager();
  await manager.deleteSnapshot(name);
  return { ok: true };
});

// Apply dock layout (position + width) from renderer restore
ipcMain.handle('dock:applyLayout', async (_event, { layout }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
  if (!layout) return { ok: false };

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const margin = 20;
  const height = mainWindow.getBounds().height || 80;
  const width = Math.max(260, Math.min(Number(layout.width || 480), screenWidth - margin * 2));

  let x = mainWindow.getBounds().x;
  let y = mainWindow.getBounds().y;

  switch (layout.position) {
    case 'left':
      x = margin;
      y = Math.round(screenHeight - height - margin);
      break;
    case 'top':
      x = Math.round(screenWidth - width - margin);
      y = margin;
      break;
    case 'bottom':
      x = Math.round(screenWidth - width - margin);
      y = Math.round(screenHeight - height - margin);
      break;
    case 'right':
    default:
      x = Math.round(screenWidth - width - margin);
      y = Math.round(screenHeight - height - margin);
      break;
  }

  mainWindow.setBounds({ x, y, width, height });
  return { ok: true };
});

// Expand/collapse dock window height for workspace UI
ipcMain.handle('dock:setExpanded', async (_event, { expanded }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const currentBounds = mainWindow.getBounds();

  if (expanded) {
    if (!mainWindow.collapsedBounds) {
      mainWindow.collapsedBounds = currentBounds;
    }
    mainWindow.setResizable(true);
    mainWindow.setBounds({ x: 0, y: 0, width: screenWidth, height: screenHeight });
  } else {
    const bounds = mainWindow.collapsedBounds || {
      x: Math.round(screenWidth / 2 - 240),
      y: screenHeight - 150,
      width: 480, height: 140
    };
    mainWindow.setBounds(bounds);
    mainWindow.setResizable(false);
  }

  isDockExpanded = !!expanded;
  return { ok: true, expanded: isDockExpanded };
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
  try { return JSON.parse(fs.readFileSync(notesFile(), 'utf8')); } catch { return []; }
}
function writeNotes(notes) {
  fs.writeFileSync(notesFile(), JSON.stringify(notes, null, 2), 'utf8');
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

// ─── AI Chat IPC (Google GenAI) ───────────────────────────────────────────────
let genaiInstance = null;
async function getGenAI() {
  if (genaiInstance) return genaiInstance;
  const { GoogleGenAI } = await import('@google/genai');
  const apiKey = process.env.VITE_GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') throw new Error('API key not configured in .env');
  genaiInstance = new GoogleGenAI({ apiKey });
  return genaiInstance;
}

ipcMain.handle('ai:chat', async (_e, { prompt }) => {
  const ai = await getGenAI();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });
  return { text: response.text || 'No response.' };
});

ipcMain.handle('ai:transcribe', async (_e, { audio, language }) => {
  try {
    const ai = await getGenAI();
    const audioBuffer = Buffer.from(audio, 'base64');
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'audio/webm', data: audio } },
            { text: `Transcribe this audio to text. The language is ${language || 'en'}. Return ONLY the transcribed text, nothing else.` },
          ],
        },
      ],
    });
    return { text: response.text || '' };
  } catch (err) {
    console.error('[AI:Transcribe] Error:', err.message);
    throw new Error('Transcription failed: ' + (err.message || 'Unknown error'));
  }
});

// ─── Screenshot IPC ───────────────────────────────────────────────────────────
const screenshotsDir = () => path.join(app.getPath('userData'), 'screenshots');
const screenshotsIndex = () => path.join(app.getPath('userData'), 'screenshots-index.json');

function ensureScreenshotsDir() { fs.mkdirSync(screenshotsDir(), { recursive: true }); }
function readScreenshotIndex() {
  try { return JSON.parse(fs.readFileSync(screenshotsIndex(), 'utf8')); } catch { return []; }
}
function writeScreenshotIndex(idx) {
  fs.writeFileSync(screenshotsIndex(), JSON.stringify(idx, null, 2), 'utf8');
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
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; }
}

ipcMain.handle('settings:get', () => readSettings());
ipcMain.handle('settings:set', (_e, { settings }) => {
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2), 'utf8');
  // Apply relevant settings
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (typeof settings.alwaysOnTop === 'boolean') mainWindow.setAlwaysOnTop(settings.alwaysOnTop);
  }
  if (typeof settings.launchOnStartup === 'boolean') {
    app.setLoginItemSettings({ openAtLogin: settings.launchOnStartup });
  }
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

// ─── Terminal IPC ─────────────────────────────────────────────────────────────
let ptyProcess = null;

ipcMain.handle('terminal:spawn', (e) => {
  if (ptyProcess) {
    ptyProcess.kill();
  }
  const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
  const shellArgs = os.platform() === 'win32' ? ['-NoLogo'] : [];
  // Filter out sensitive environment variables before passing to PTY
  const safeEnv = { ...process.env };
  const sensitiveKeys = ['VITE_GEMINI_API_KEY', 'GEMINI_API_KEY', 'API_KEY', 'SECRET', 'TOKEN', 'PASSWORD'];
  for (const key of Object.keys(safeEnv)) {
    if (sensitiveKeys.some(sk => key.toUpperCase().includes(sk))) {
      delete safeEnv[key];
    }
  }

  ptyProcess = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.USERPROFILE || process.env.HOME || process.cwd(),
    env: safeEnv
  });

  ptyProcess.onData((data) => {
    if (e.sender && !e.sender.isDestroyed()) {
      e.sender.send('terminal:onData', data);
    }
  });

  ptyProcess.onExit(() => {
    ptyProcess = null;
  });
  return { ok: true };
});

ipcMain.handle('terminal:write', (_e, { data }) => {
  if (ptyProcess) ptyProcess.write(data);
});

ipcMain.handle('terminal:resize', (_e, { cols, rows }) => {
  if (ptyProcess) {
    try { ptyProcess.resize(cols, rows); } catch (err) {}
  }
});

// ─── Browser IPC ──────────────────────────────────────────────────────────────
const bookmarksFile = () => path.join(app.getPath('userData'), 'browser-bookmarks.json');
const browserHistFile = () => path.join(app.getPath('userData'), 'browser-history.json');

ipcMain.handle('browser:getBookmarks', () => {
  try { return JSON.parse(fs.readFileSync(bookmarksFile(), 'utf8')); } catch { return []; }
});
ipcMain.handle('browser:saveBookmark', (_e, { url, title }) => {
  let bm;
  try { bm = JSON.parse(fs.readFileSync(bookmarksFile(), 'utf8')); } catch { bm = []; }
  if (!bm.find(b => b.url === url)) { bm.unshift({ url, title, addedAt: new Date().toISOString() }); }
  if (bm.length > 50) bm.splice(50);
  fs.writeFileSync(bookmarksFile(), JSON.stringify(bm, null, 2), 'utf8');
  return { ok: true };
});
ipcMain.handle('browser:getHistory', () => {
  try { return JSON.parse(fs.readFileSync(browserHistFile(), 'utf8')); } catch { return []; }
});
ipcMain.handle('browser:addHistory', (_e, { url, title }) => {
  let hist;
  try { hist = JSON.parse(fs.readFileSync(browserHistFile(), 'utf8')); } catch { hist = []; }
  hist = hist.filter(h => h.url !== url);
  hist.unshift({ url, title, visitedAt: new Date().toISOString() });
  if (hist.length > 100) hist.splice(100);
  fs.writeFileSync(browserHistFile(), JSON.stringify(hist, null, 2), 'utf8');
  return { ok: true };
});

function toggleWindowVisibility() {
  if (isVisible) {
    mainWindow.hide();
    isVisible = false;
  } else {
    mainWindow.show();
    isVisible = true;
  }
}

app.on('ready', () => {
  createWindow();

  // Register Ctrl + Shift + D to toggle visibility
  globalShortcut.register('Control+Shift+D', () => {
    toggleWindowVisibility();
  });
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
});
