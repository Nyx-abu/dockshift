## Summary

What does this PR change, and why?

## Related issue

Closes #<!-- issue number -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / code quality
- [ ] Documentation
- [ ] Build / tooling

## How was this tested?

There is no automated test suite yet — describe the manual testing you did with
`npm run dev` (which panels, which flows, edge cases).

## Checklist

- [ ] If I added or changed an IPC channel, I updated **all three** places: `ipcMain.handle`
      in `electron-main.js`, the allowlist in `preload.js`, and the renderer call site
- [ ] Main-process changes were tested after a full Electron restart (not just HMR)
- [ ] User-supplied input that reaches the filesystem, a shell, or the clipboard is validated
- [ ] I updated `CHANGELOG.md` under `[Unreleased]` if this is a user-facing change
