# AGENTS.md

Canonical context for any AI coding agent working on DockShift — Claude Code, OpenAI Codex CLI, Cursor, GitHub Copilot, Windsurf, Cline, Aider, Continue, and friends. Per-tool rule files (`CLAUDE.md`, `.cursor/rules/`, `.github/copilot-instructions.md`, `.windsurfrules`) all point back here.

## What this project is

DockShift is a floating productivity dock for Windows — an Electron desktop app with a React/Vite renderer. It bundles a clipboard manager, workspace snapshots, AI panel (Gemini), terminal, notes, screenshots, and a launcher. **Windows-only in practice** (Win32 window tracking, `CF_HDROP` clipboard, `node-pty`).

## Commands

```bash
npm run dev           # Start Vite + Electron concurrently (typical dev workflow)
npm run dev:vite      # Vite only (port 5173) — for renderer-only HMR work
npm run dev:electron  # Electron only — assumes Vite is already running
npm run build         # Production Vite build → dist/
npm run dist          # build + electron-builder → release/ (NSIS installer + portable .exe)
npm run dist:dir      # unpacked build, faster for local testing
npm run release <ver> # Bump package.json + README badge + CHANGELOG (does not git-commit)
```

There is **no test runner, linter, or formatter** configured. Do not invent commands for them.

A `.env` file at the repo root is required for AI features. Copy `.env.example` and add a `VITE_GEMINI_API_KEY`. The main process loads `.env` manually (see `loadEnv()` in `electron-main.js`) — there is no `dotenv` package.

## Architecture

Electron desktop app with a React/Vite renderer. The two halves communicate exclusively over IPC; understanding that boundary is the key to working productively here.

### Process split

- **Main process** (`electron-main.js`, ~1,800 lines, monolithic) owns all system access: filesystem, clipboard polling, screenshots (`desktopCapturer`), `node-pty` terminals, app launching, the Gemini API client, and persistence to `app.getPath('userData')`. It also imports the three modules under `src/workspace/` directly — those run in main, not the renderer, despite their location.
- **Renderer** (`src/`) is React 18 + Vite. Sandboxed (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`) and reaches main only via `window.electronAPI` exposed by `preload.js`.
- **Preload** (`preload.js`) is the only file that runs in both worlds. It is **CommonJS** (required by Electron's sandboxed preload) even though the rest of the project uses ES modules (`"type": "module"`).

### Adding an IPC channel — three places must agree

When adding new functionality that crosses the process boundary:

1. `ipcMain.handle('namespace:action', ...)` in `electron-main.js`.
2. Add `'namespace:action'` to the corresponding allowlist array in `preload.js` (`allowed` for `invoke`, `allowedSendChannels` for `send`). **Channels not on the allowlist are silently dropped** — this is the most common foot-gun.
3. Call it from a renderer component via `window.electronAPI.invoke('namespace:action', payload)`.

Existing namespaces: `clipboard:`, `workspace:`, `dock:`, `notes:`, `ai:`, `screenshot:`, `settings:`, `launcher:`, `terminal:`, `browser:`, plus `notify`. Push channels (main → renderer) use `webContents.send` with subscriptions like `onClipboardUpdate`, `onTerminalData`, `onDockLayoutRestore`, `onNotification`.

### Persistence model

Each feature manages its own JSON file under `app.getPath('userData')` — there is no database or shared store. Examples: `clipboard-history.json`, `notes.json`, `settings.json`, `browser-bookmarks.json`, `screenshots-index.json`, `workspaces/<name>.json`. Image blobs (clipboard images, screenshots) live as files alongside their index. When deleting items, remember to unlink the associated blob (the clipboard manager does this — copy that pattern).

### Renderer structure

- `App.jsx` keeps a single `activePanel` string and renders `DockMenu`, which conditionally mounts one `*Panel.jsx` at a time.
- `ResizablePanel.jsx` is the shared draggable + 8-direction resizable wrapper — wrap new panels in it rather than reinventing positioning.
- `usePanelPosition.js` (the only hook) owns drag math.
- Vite alias: `@` → `src/`.

### Security invariants worth preserving

- The Gemini API key never leaves the main process — renderer calls `ai:chat` / `ai:transcribe` and gets back text. **Don't move SDK calls to the renderer.**
- `terminal:spawn` strips env vars matching `VITE_GEMINI_API_KEY`, `GEMINI_API_KEY`, `API_KEY`, `SECRET`, `TOKEN`, `PASSWORD` before passing to PTY. Preserve this filter when modifying terminal handling.
- `TerminalManager.js` validates cwd is a real directory and rejects startup commands containing shell metacharacters (`` ;&|`$<>!{}()[]'"\\ ``). Workspace restore relies on this — don't loosen it.
- Browser panel uses a `webview` with an isolated partition; preserve sandboxing if you touch `BrowserPanel.jsx`.

### Platform & build notes

- Windows-only in practice. Clipboard file support uses Windows `CF_HDROP` buffers (`buildCFHDROP` in `electron-main.js`); the parsing/writing is hand-rolled and platform-specific.
- `node-pty` requires native compilation — `npm install` needs Windows build tools (MSVC + Python). If install fails, that's usually why.
- Renderer changes hot-reload via Vite. **Main process changes require a full Electron restart** (kill `npm run dev` and re-run, or restart `dev:electron`).
- The dev/prod URL switch in `createWindow()` keys on `process.env.NODE_ENV === 'development' || !app.isPackaged`. The `npm start` script in `package.json` is broken — the working production path is via `app.isPackaged` after a real Electron build, not `npm start`.
- Don't claim a build task is done until you've launched the packaged `.exe` from `release/` and confirmed it starts.

## Global hotkey

`Ctrl+Shift+D` toggles dock visibility (registered in `app.on('ready')`).

## Per-agent rule files

Each agent has its own conventional location. All of them point back to this file:

| Agent | File | Notes |
| --- | --- | --- |
| Claude Code | `CLAUDE.md` | Plus slash commands in `.claude/commands/` and an IPC-sync hook in `.claude/settings.json` |
| Cursor | `.cursor/rules/dockshift.mdc` | MDC format, `alwaysApply: true` |
| GitHub Copilot | `.github/copilot-instructions.md` | Auto-loaded in VS Code and on github.com |
| Windsurf | `.windsurfrules` | Plain text |
| Codex CLI, Cline, Aider, Continue | `AGENTS.md` (this file) | Read natively, no separate file needed |

If you're using an agent that isn't listed, point it at this file manually — most modern agents accept a custom system-prompt or context file.
