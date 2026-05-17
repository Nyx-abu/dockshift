---
description: Scaffold a new IPC channel across electron-main.js, preload.js, and a renderer caller
argument-hint: <namespace:action>
---

Scaffold a new IPC channel called `$ARGUMENTS` across all three places that must agree. Channels missing from the `preload.js` allowlist are **silently dropped** — this is the #1 foot-gun in this codebase, so don't skip step 2.

## Steps

1. **`electron-main.js`** — add a new `ipcMain.handle('$ARGUMENTS', async (event, payload) => { ... })` registration. Place it near the other handlers in the same namespace (group by prefix — e.g. all `clipboard:*` together). If this is a brand-new namespace, place it at the end of the IPC handlers block.

2. **`preload.js`** — add `'$ARGUMENTS'` to the `allowed` array (for `invoke`/`handle` pairs) or to `allowedSendChannels` (for one-way `send` from renderer). Match the kind of channel you registered in step 1. Keep the array sorted by namespace if it already is.

3. **Renderer call site** — show an example of how a component would call it: `const result = await window.electronAPI.invoke('$ARGUMENTS', payload)`. If the user named a panel/component that should use it, wire the call there; otherwise just print the example so they can drop it in.

## Reminders

- Existing namespaces: `clipboard:`, `workspace:`, `dock:`, `notes:`, `ai:`, `screenshot:`, `settings:`, `launcher:`, `terminal:`, `browser:`, `notify`. Reuse one if it fits — don't proliferate.
- If the channel is push (main → renderer), use `webContents.send(...)` from main and add a subscription helper to `preload.js` (see `onClipboardUpdate`, `onTerminalData` for the pattern).
- After editing, **restart Electron** (`npm run dev:electron` or full `npm run dev`) — main-process changes do not hot-reload.
- The `check-ipc-sync.mjs` PostToolUse hook will warn if you forget step 2.
