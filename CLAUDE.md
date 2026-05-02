# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev           # Start Vite + Electron concurrently (typical dev workflow)
npm run dev:vite      # Vite only (port 5173) — for renderer-only HMR work
npm run dev:electron  # Electron only — assumes Vite is already running
npm run build         # Production Vite build → dist/
```

There is no test runner, linter, or formatter configured. Do not invent commands for them.

A `.env` file at the repo root is required for AI features. Copy `.env.example` and add a `VITE_GEMINI_API_KEY`. The main process loads `.env` manually (see `loadEnv()` in `electron-main.js`) — there is no `dotenv` package.

## Architecture

This is an Electron desktop app with a React/Vite renderer. The two halves communicate exclusively over IPC; understanding that boundary is the key to working productively here.

### Process split

- **Main process** (`electron-main.js`, ~960 lines, monolithic) owns all system access: filesystem, clipboard polling, screenshots (`desktopCapturer`), `node-pty` terminals, app launching, the Gemini API client, and persistence to `app.getPath('userData')`. It also imports the three modules under `src/workspace/` directly — those run in main, not the renderer, despite their location.
- **Renderer** (`src/`) is React 18 + Vite. It is sandboxed (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`) and reaches main only via `window.electronAPI` exposed by `preload.js`.
- **Preload** (`preload.js`) is the only file that runs in both worlds. It is **CommonJS** (required by Electron's sandboxed preload) even though the rest of the project uses ES modules (`"type": "module"`).

### Adding an IPC channel — three places must agree

When adding new functionality that crosses the process boundary:

1. `ipcMain.handle('namespace:action', ...)` in `electron-main.js`.
2. Add `'namespace:action'` to the corresponding allowlist array in `preload.js` (`allowed` for `invoke`, `allowedSendChannels` for `send`). **Channels not on the allowlist are silently dropped** — this is the most common foot-gun.
3. Call it from a renderer component via `window.electronAPI.invoke('namespace:action', payload)`.

Existing namespaces: `clipboard:`, `workspace:`, `dock:`, `notes:`, `ai:`, `screenshot:`, `settings:`, `launcher:`, `terminal:`, `browser:`, plus `notify`. Push channels (main → renderer) use `webContents.send` with subscriptions like `onClipboardUpdate`, `onTerminalData`, `onDockLayoutRestore`, `onNotification`.

### Persistence model

Each feature manages its own JSON file under `app.getPath('userData')` — there is no database or shared store. Examples: `clipboard-history.json`, `notes.json`, `settings.json`, `browser-bookmarks.json`, `screenshots-index.json`, `workspaces/<name>.json`. Image blobs (clipboard images, screenshots) live as files alongside their index. When deleting items, remember to unlink the associated blob (the clipboard manager does this; copy that pattern).

### Renderer structure

- `App.jsx` keeps a single `activePanel` string and renders `DockMenu`, which conditionally mounts one `*Panel.jsx` at a time.
- `ResizablePanel.jsx` is the shared draggable + 8-direction resizable wrapper — wrap new panels in it rather than reinventing positioning.
- `usePanelPosition.js` (the only hook) owns drag math.
- Vite alias: `@` → `src/`.

### Security invariants worth preserving

- The Gemini API key never leaves the main process — renderer calls `ai:chat` / `ai:transcribe` and gets back text. Don't move SDK calls to the renderer.
- `terminal:spawn` strips env vars matching `VITE_GEMINI_API_KEY`, `GEMINI_API_KEY`, `API_KEY`, `SECRET`, `TOKEN`, `PASSWORD` before passing to PTY. Preserve this filter when modifying terminal handling.
- `TerminalManager.js` validates cwd is a real directory and rejects startup commands containing shell metacharacters (`;&|\`$<>!{}()[]'"\\`). Workspace restore relies on this — don't loosen it.
- Browser panel uses a `webview` with an isolated partition; preserve sandboxing if you touch `BrowserPanel.jsx`.

### Platform & build notes

- Windows-only in practice. Clipboard file support uses Windows `CF_HDROP` buffers (`buildCFHDROP` in `electron-main.js`); the parsing/writing is hand-rolled and platform-specific.
- `node-pty` requires native compilation — `npm install` needs Windows build tools (MSVC + Python). If install fails, that's usually why.
- Renderer changes hot-reload via Vite. **Main process changes require a full Electron restart** (kill `npm run dev` and re-run, or restart `dev:electron`).
- The dev/prod URL switch in `createWindow()` keys on `process.env.NODE_ENV === 'development' || !app.isPackaged`. The `npm start` script in `package.json` (`electron dist/index.html`) is broken — the working production path is via `app.isPackaged` after a real Electron build, not `npm start`.

## Global hotkey

`Ctrl+Shift+D` toggles dock visibility (registered in `app.on('ready')`).
