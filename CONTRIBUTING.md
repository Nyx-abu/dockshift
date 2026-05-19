# Contributing to DockShift

Thanks for your interest in improving DockShift! This guide covers everything you need to get
productive.

## Project status

DockShift is an early-stage, **Windows-only** Electron app. Several features are still
maturing — see the [README](README.md) for an honest breakdown of what's solid and what's
lightweight. Contributions that harden the core (clipboard, workspace snapshots, AI panel) are
especially welcome.

## Prerequisites

- **Node.js** 18+ and **npm**
- **Windows 10/11** — the app is Windows-only in practice (Win32/PowerShell window tracking,
  `CF_HDROP` clipboard handling)
- **Windows build tools** — `node-pty` requires native compilation (MSVC + Python). If
  `npm install` fails, this is almost always why.
- A **Gemini API key** in a `.env` file (copy `.env.example`) for the AI and voice features

## Getting started

```bash
git clone https://github.com/Salah-XD/dockshift.git
cd dockshift
npm install
cp .env.example .env   # then add your Gemini API key
npm run dev            # starts Vite + Electron together
```

## Building an installer

```bash
npm run dist           # builds the renderer + a Windows NSIS installer into release/
npm run dist:dir       # unpacked build, faster for local testing
```

## Architecture notes

Read [`AGENTS.md`](AGENTS.md) for the full architecture overview. The two things that trip up
most new contributors:

1. **Renderer changes hot-reload; main-process changes do not.** After editing
   `electron-main.js`, `preload.js`, `electron-persistence.js`, or anything in `src/workspace/`,
   restart Electron.
2. **Adding an IPC channel requires changes in three places.** `ipcMain.handle()` in
   `electron-main.js`, the allowlist array in `preload.js`, and the renderer call site.
   Channels not on the `preload.js` allowlist are **silently dropped**.

## Working with AI coding agents

DockShift ships ready-to-use context files for the most common coding agents so you don't
have to re-explain the architecture every session.

- **`AGENTS.md`** (repo root) is the canonical context. Codex CLI, Cline, Aider, Continue,
  and most other modern agents read it natively.
- **`CLAUDE.md`** — Claude Code (imports `AGENTS.md`, adds slash commands + an IPC-sync hook)
- **`.cursor/rules/dockshift.mdc`** — Cursor
- **`.github/copilot-instructions.md`** — GitHub Copilot (auto-loaded in VS Code & github.com)
- **`.windsurfrules`** — Windsurf

If you're using a different agent, point it at `AGENTS.md` manually.

Maintainers using Claude Code also have these slash commands available
(see `.claude/commands/`): `/add-ipc`, `/new-panel`, `/verify-build`, `/release`.
The PostToolUse hook in `.claude/settings.json` warns when an IPC channel handled in
`electron-main.js` is missing from the `preload.js` allowlist.

## Code style

- ES Modules everywhere except `preload.js` (which must be CommonJS — Electron requirement).
- There is **no linter or formatter** configured yet. Match the style of the surrounding code.
- Keep user-supplied input validated before it reaches the filesystem, a shell, or the
  clipboard — see `SnapshotManager.sanitizeName()` and `TerminalManager`'s `validateCwd()` for
  the expected pattern.

## Submitting changes

1. Fork the repo and create a feature branch (`git checkout -b feature/my-change`).
2. Make your change. Test it manually with `npm run dev` — there is no automated test suite
   yet, so describe your manual testing in the PR.
3. Commit with a clear message describing the *why*, not just the *what*.
4. Open a pull request against `main` and fill out the PR template.

## Reporting bugs and requesting features

Use the issue templates — they prompt for the details needed to reproduce or scope the work.

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE).
