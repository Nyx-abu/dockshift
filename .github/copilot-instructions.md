# GitHub Copilot instructions — DockShift

DockShift is a Windows-only Electron desktop app with a React/Vite renderer (floating productivity dock with clipboard manager, workspace snapshots, AI panel, terminal, notes, screenshots, launcher).

**See `AGENTS.md` at the repo root for canonical project context** — architecture, persistence model, security invariants, build notes. The rules below are the highest-value reminders restated inline, because Copilot doesn't always follow cross-file pointers.

## The IPC three-place rule (most common foot-gun)

Adding a new IPC channel requires changes in **three** files. Missing any one of them silently breaks the feature:

1. **`electron-main.js`** — register `ipcMain.handle('namespace:action', async (event, payload) => { ... })`.
2. **`preload.js`** — add `'namespace:action'` to the `allowed` array (for `invoke`) or `allowedSendChannels` (for `send`). **Channels not on the allowlist are silently dropped by the preload bridge.**
3. **Renderer component** — call via `window.electronAPI.invoke('namespace:action', payload)`.

Existing namespaces: `clipboard:`, `workspace:`, `dock:`, `notes:`, `ai:`, `screenshot:`, `settings:`, `launcher:`, `terminal:`, `browser:`, `notify`.

## Don'ts

- **Don't move Gemini SDK calls to the renderer.** The API key lives only in the main process; the renderer calls `ai:chat` / `ai:transcribe` and gets back text.
- **Don't loosen `TerminalManager.js` validation.** It rejects cwd that isn't a real directory and startup commands containing shell metacharacters (`` ;&|`$<>!{}()[]'"\\ ``). Workspace restore depends on this.
- **Don't strip the env-var filter in `terminal:spawn`.** It removes `VITE_GEMINI_API_KEY`, `GEMINI_API_KEY`, `API_KEY`, `SECRET`, `TOKEN`, `PASSWORD` before passing env to PTY.
- **Don't convert `preload.js` to ESM.** Electron's sandboxed preload requires CommonJS — this is the only non-ESM file in the project.
- **Don't suggest `npm test`, `npm run lint`, or `npm run format`.** No test runner, linter, or formatter is configured. The author tests manually with `npm run dev`.
- **Don't remove the `webview` partition in `BrowserPanel.jsx`.** It's an isolation boundary.

## Conventions

- Vite alias: `@` → `src/`.
- Panels: `src/components/<Feature>Panel.jsx`, wrapped in `ResizablePanel`, registered in `App.jsx` and `DockMenu.jsx`.
- Per-feature JSON persistence under `app.getPath('userData')` — no shared store, no database. Unlink blob files when deleting their index entries (see the clipboard manager for the pattern).
- Renderer changes hot-reload; main-process changes require restarting Electron.
