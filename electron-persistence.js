/**
 * Shared JSON persistence helpers for the main process.
 *
 * Every feature in DockShift stores its state in its own JSON file under
 * `app.getPath('userData')`. Two failure modes were handled ad-hoc (and badly)
 * before:
 *   1. A crash or power loss mid-write left a truncated, unparseable file.
 *   2. On parse failure the old code did `catch { return [] }` — silently
 *      wiping the user's history/notes with no warning.
 *
 * This module centralizes both concerns:
 *   - `writeJsonAtomic` writes to a temp file then renames (atomic on the same
 *     filesystem) so a reader never sees a partial file.
 *   - `readJson` preserves a corrupted file as `<file>.corrupt-<ts>` and
 *     notifies, instead of throwing the data away.
 */
import fs from 'fs';

/** @type {((filePath: string, backupPath: string|null) => void)|null} */
let corruptionNotifier = null;

/**
 * Register a callback invoked when a corrupted JSON file is detected.
 * The main process wires this to a renderer notification.
 * @param {(filePath: string, backupPath: string|null) => void} fn
 */
export function setCorruptionNotifier(fn) {
  corruptionNotifier = fn;
}

/**
 * Read and parse a JSON file. Returns `fallback` if the file is missing.
 * If the file exists but is corrupted, it is renamed to a `.corrupt-<ts>`
 * backup (so the user can recover it) and `fallback` is returned.
 * @template T
 * @param {string} filePath
 * @param {T} fallback
 * @returns {T}
 */
export function readJson(filePath, fallback) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return fallback;
    console.warn('[persistence] read error:', filePath, err.message);
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch (parseErr) {
    let backup = null;
    try {
      backup = `${filePath}.corrupt-${Date.now()}`;
      fs.renameSync(filePath, backup);
      console.error(
        `[persistence] Corrupted JSON at ${filePath} — backed up to ${backup}`,
        parseErr.message
      );
    } catch (renameErr) {
      backup = null;
      console.error('[persistence] Failed to back up corrupted file:', renameErr.message);
    }
    if (corruptionNotifier) {
      try {
        corruptionNotifier(filePath, backup);
      } catch (_) {
        /* notifier must never break a read */
      }
    }
    return fallback;
  }
}

/**
 * Write `data` as pretty-printed JSON atomically: serialize to a temp file in
 * the same directory, then rename over the target. A crash mid-write leaves
 * either the old file or the new one — never a truncated file.
 * @param {string} filePath
 * @param {unknown} data
 */
export function writeJsonAtomic(filePath, data) {
  const json = JSON.stringify(data, null, 2);
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, filePath);
  } catch (err) {
    // Best-effort cleanup of the temp file so we don't litter userData.
    try {
      fs.unlinkSync(tmp);
    } catch (_) {
      /* temp file may not exist */
    }
    throw err;
  }
}
