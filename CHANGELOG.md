# Changelog

All notable changes to DockShift are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `electron-builder` configuration — `npm run dist` produces a Windows NSIS installer and a
  portable build.
- Auto-update via `electron-updater`, wired to GitHub Releases (packaged builds only).
- GitHub Actions release workflow that builds and publishes the installer on version tags.
- Atomic JSON persistence with corrupted-file recovery: stored files are written via a
  temp-file rename, and an unreadable file is preserved as a `.corrupt-<timestamp>` backup
  with a user notification instead of being silently discarded.
- Open-source project files: `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue and
  pull-request templates.

### Changed
- Rebranded from "Float Dock" to **DockShift**.
- `.env` parsing now handles quoted values and inline comments instead of storing them
  verbatim.

### Fixed
- Path traversal in workspace snapshot names — names are now sanitized to a safe filename
  component before touching the filesystem.
- Shell injection via a crafted workspace `cwd` — the working directory is no longer
  interpolated into a shell command string and is rejected if it contains shell
  metacharacters.
- The PTY environment filter now strips any secret-looking variable by pattern, not just a
  fixed list of known key names.

### Removed
- The broken `npm start` script.

## [1.0.0] - 2026

Initial release as Float Dock — a floating productivity dock for Windows with clipboard
history, workspace snapshots, an AI assistant, terminal, browser, screenshots, voice-to-text,
notes, and a quick launcher.
