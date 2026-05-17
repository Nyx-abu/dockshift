---
description: Bump version across package.json, README badge, and CHANGELOG (wraps scripts/release.mjs)
argument-hint: <version>
---

Cut a release of DockShift version `$ARGUMENTS`. This wraps the existing `scripts/release.mjs` helper — don't reimplement what it already does.

## Steps

1. **Sanity check current state** — run `npm run release -- --check` to confirm `package.json`, README badge, and CHANGELOG top blocks are in sync before bumping. If they're already out of sync, surface that and ask the user how to proceed.

2. **Bump versions** — run `npm run release $ARGUMENTS`. The script edits `package.json`, the README version badge, and renames the `## [Unreleased]` CHANGELOG block to `## [$ARGUMENTS] - <today>` with a fresh empty `[Unreleased]` above it.

3. **Show the diff** — run `git diff` and present the changes. Don't commit yet — the helper script intentionally stops before git so the maintainer can eyeball it.

4. **Stop and hand off.** Print the exact next commands for the maintainer to run themselves:
   ```
   git add -A
   git commit -m "Release v$ARGUMENTS"
   git push
   git tag v$ARGUMENTS
   git push origin v$ARGUMENTS    # this is what fires the GitHub Actions release workflow
   ```

## Don't

- Don't `git commit` or `git tag` automatically — the maintainer wants to review the diff first.
- Don't `git push` — pushing is the maintainer's call.
- Don't manually edit `package.json`, the README badge, or the CHANGELOG. The release script handles all three atomically; manual edits cause drift.
- If `$ARGUMENTS` includes a `-rc.N` or `-beta` suffix, the script auto-detects it as a pre-release. Don't do anything special — just pass it through.
