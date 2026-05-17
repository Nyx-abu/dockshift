# CLAUDE.md

@AGENTS.md is the canonical context file — architecture, IPC rules, persistence model, security invariants, build notes. Read it first. Everything below is Claude Code-specific.

## Slash commands

Available in `.claude/commands/`:

- `/add-ipc <namespace:action>` — scaffold a new IPC channel across `electron-main.js`, `preload.js`, and a renderer caller. Covers the three-place foot-gun.
- `/new-panel <Name>` — scaffold `<Name>Panel.jsx` wrapped in `ResizablePanel` and wire it into `DockMenu` + `App.jsx`.
- `/verify-build` — `npm run dist:dir` then launch the resulting `.exe` from `release/`. Don't claim a build is done until the runtime starts.
- `/release <version>` — wraps `npm run release <version>` (bumps `package.json`, README badge, CHANGELOG). Stops before `git commit` / `git tag` so the maintainer can review the diff.

## Hook

`.claude/settings.json` registers a PostToolUse hook that runs `scripts/hooks/check-ipc-sync.mjs` after any Edit/Write/MultiEdit. The script scans `electron-main.js` for `ipcMain.handle(...)` channel names and warns if any are missing from the `preload.js` allowlists — the silently-dropped-channel foot-gun, automated away.
