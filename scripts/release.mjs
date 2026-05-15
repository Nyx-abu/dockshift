#!/usr/bin/env node
// Release helper. Bumps version + syncs the three places that need to agree
// (package.json, README badge, CHANGELOG date), prints the next git steps,
// and stops. Does not touch git — that stays in your hands so you can review
// the diff first.
//
// Usage:
//   node scripts/release.mjs 0.9.0          # production release
//   node scripts/release.mjs 0.9.0-rc.2     # pre-release (auto-detected)
//   node scripts/release.mjs --check        # validate the three are in sync
//
// Conventions:
// - Version must be valid semver (MAJOR.MINOR.PATCH, optionally with -rc.N etc).
// - Pre-release suffix (anything after the first `-`) is auto-detected; the
//   README badge will show "X.Y.Z_rc.N" or "X.Y.Z_beta" accordingly.
// - CHANGELOG: the current `[Unreleased]` block is renamed to `[X.Y.Z] - YYYY-MM-DD`,
//   and a fresh empty `[Unreleased]` is inserted above it.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PKG = resolve(ROOT, 'package.json');
const CHANGELOG = resolve(ROOT, 'CHANGELOG.md');
const README = resolve(ROOT, 'README.md');

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const BADGE_RE = /\[!\[Version\]\(https:\/\/img\.shields\.io\/badge\/Version-[^)]+\)\]/;

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node scripts/release.mjs <version> | --check');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(PKG, 'utf8'));

if (arg === '--check') {
  console.log(`package.json version: ${pkg.version}`);
  const readme = readFileSync(README, 'utf8');
  const badgeMatch = readme.match(BADGE_RE);
  console.log(`README badge:         ${badgeMatch ? badgeMatch[0].slice(0, 90) + '…' : '(NO MATCH)'}`);
  const changelog = readFileSync(CHANGELOG, 'utf8');
  const top = changelog.match(/## \[([^\]]+)\](?:\s+-\s+(\d{4}-\d{2}-\d{2}))?/g) || [];
  console.log(`CHANGELOG top blocks: ${top.slice(0, 3).join(' | ')}`);
  process.exit(0);
}

const version = arg.replace(/^v/, '');
if (!SEMVER.test(version)) {
  console.error(`Invalid semver: "${arg}". Expected MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-suffix.`);
  process.exit(1);
}

// Pre-release suffix detection
const dashIdx = version.indexOf('-');
const isPrerelease = dashIdx !== -1;
const suffix = isPrerelease ? version.slice(dashIdx + 1).replace(/\./g, '_') : 'beta';
const badgeLabel = isPrerelease ? `${version.slice(0, dashIdx)}_${suffix}` : `${version}_${suffix}`;

// Today's date — used for the new CHANGELOG header
const today = new Date().toISOString().slice(0, 10);

// 1. package.json
pkg.version = version;
writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n');

// 2. README badge
let readme = readFileSync(README, 'utf8');
const newBadge = `[![Version](https://img.shields.io/badge/Version-${badgeLabel}-7AA2F7?style=flat-square&labelColor=1A1B26)]`;
if (BADGE_RE.test(readme)) {
  readme = readme.replace(BADGE_RE, newBadge);
  writeFileSync(README, readme);
} else {
  console.warn('⚠ README badge pattern not found — skipped (update manually).');
}

// 3. CHANGELOG: rename [Unreleased] → [version] - today, prepend fresh [Unreleased].
// If the version already exists (e.g. promoting from rc to final, or a re-tag),
// leave the changelog alone — assume the entry is already correct.
const changelog = readFileSync(CHANGELOG, 'utf8');
const unreleasedRe = /## \[Unreleased\]\s*$/m;
const versionAlreadyInChangelog = new RegExp(
  `^## \\[${version.replace(/[.\-]/g, '\\$&')}\\]`, 'm'
).test(changelog);
let changelogStatus;
if (versionAlreadyInChangelog) {
  changelogStatus = `[${version}] already present — left as-is`;
} else if (!unreleasedRe.test(changelog)) {
  changelogStatus = '⚠ `## [Unreleased]` heading not found — update manually';
} else {
  const updated = changelog.replace(
    unreleasedRe,
    `## [Unreleased]\n\n## [${version}] - ${today}`,
  );
  writeFileSync(CHANGELOG, updated);
  changelogStatus = `[${version}] - ${today}`;
}

const tag = `v${version}`;
console.log(`✓ package.json    → ${version}`);
console.log(`✓ README badge    → Version-${badgeLabel}`);
console.log(`✓ CHANGELOG       → ${changelogStatus}${isPrerelease ? ' (will publish as Pre-release)' : ''}`);
console.log('');
console.log('Next steps (review the diff, then push):');
console.log('');
console.log(`    git add -A`);
console.log(`    git diff --cached`);
console.log(`    git commit -m "Release ${tag}"`);
console.log(`    git tag ${tag}`);
console.log(`    git push && git push origin ${tag}`);
console.log('');
console.log('GitHub Actions will build the Windows installer + portable .exe and publish');
console.log('them at https://github.com/Salah-XD/dockshift/releases/tag/' + tag);
console.log('Watch the run at https://github.com/Salah-XD/dockshift/actions');
