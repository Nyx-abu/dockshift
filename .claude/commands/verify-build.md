---
description: Build, package, and launch the resulting .exe to verify the packaged runtime works
---

Verify that the packaged build actually runs — not just that `electron-builder` exits successfully. A green build that crashes on launch is still broken.

## Steps

1. Run `npm run dist:dir` (unpacked build — faster than the NSIS installer for verification). Stream the output.

2. If the build fails, stop and report the error. Don't proceed to step 3.

3. Locate the `.exe` in `release/win-unpacked/` (typically `release/win-unpacked/DockShift.exe`). Confirm it exists with `Get-ChildItem release/win-unpacked/*.exe`.

4. Launch the packaged exe in the background: `Start-Process release/win-unpacked/DockShift.exe`. Wait a few seconds.

5. Check the process is still running: `Get-Process DockShift -ErrorAction SilentlyContinue`. If it exited immediately, the runtime failed — surface that as a failure even though the build succeeded.

6. Report:
   - ✓ Build succeeded
   - ✓ .exe exists at `<path>`
   - ✓ Runtime launched and is still running (PID `<n>`)
   - OR: ✗ specific failure mode

## Why this exists

Memory rule: don't claim a build task is done until the packaged runtime launches. `electron-builder` can produce an installer that immediately crashes due to a missing native module, a wrong main entry, or a renderer load failure — none of which surface in the build log.
