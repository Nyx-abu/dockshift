/**
 * Encrypted secret storage for the main process.
 *
 * API keys (OpenAI, Anthropic, OpenRouter, Gemini, …) are stored encrypted
 * with Electron's `safeStorage`, which on Windows is backed by DPAPI — the
 * ciphertext is bound to the current OS user account and cannot be read by
 * another user or copied to another machine.
 *
 * Hard rules:
 *   - The renderer NEVER receives a raw key. The `secrets:` IPC surface can
 *     only set / check-existence / delete / list-names. Decryption happens
 *     only here, only to hand a key to a provider request.
 *   - If `safeStorage` reports encryption unavailable (rare on Windows, can
 *     happen on some Linux setups), we refuse to persist rather than write a
 *     plaintext key to disk.
 *
 * Storage shape (`secrets.json` under userData):
 *   { "<name>": "<base64 of safeStorage-encrypted bytes>", ... }
 */
import fs from 'fs';
import path from 'path';
import { app, safeStorage } from 'electron';
import { readJson, writeJsonAtomic } from './electron-persistence.js';

const secretsFile = () => path.join(app.getPath('userData'), 'secrets.json');

/** Whether OS-backed encryption is usable on this machine. */
export function isEncryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch (_) {
    return false;
  }
}

function readStore() {
  const store = readJson(secretsFile(), {});
  return store && typeof store === 'object' ? store : {};
}

/**
 * Encrypt and persist a secret. Empty/blank value deletes it instead.
 * @param {string} name
 * @param {string} value
 * @returns {{ ok: boolean, reason?: string }}
 */
export function setSecret(name, value) {
  if (!name || typeof name !== 'string') return { ok: false, reason: 'invalid-name' };
  if (typeof value !== 'string' || value.trim() === '') {
    deleteSecret(name);
    return { ok: true };
  }
  if (!isEncryptionAvailable()) {
    return { ok: false, reason: 'encryption-unavailable' };
  }
  try {
    const encrypted = safeStorage.encryptString(value.trim());
    const store = readStore();
    store[name] = encrypted.toString('base64');
    writeJsonAtomic(secretsFile(), store);
    return { ok: true };
  } catch (err) {
    console.error('[secrets] setSecret failed:', err.message);
    return { ok: false, reason: 'encrypt-failed' };
  }
}

/**
 * Decrypt and return a secret. MAIN-PROCESS ONLY — never expose over IPC.
 * @param {string} name
 * @returns {string | null}
 */
export function getSecret(name) {
  const store = readStore();
  const blob = store[name];
  if (!blob) return null;
  if (!isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(blob, 'base64'));
  } catch (err) {
    // A failed decrypt usually means the OS user / machine changed — the
    // ciphertext is unrecoverable, so drop it rather than wedge the app.
    console.warn('[secrets] decrypt failed for', name, '— removing stale entry');
    deleteSecret(name);
    return null;
  }
}

/** @param {string} name @returns {boolean} */
export function hasSecret(name) {
  const store = readStore();
  return Boolean(store[name]);
}

/** @param {string} name */
export function deleteSecret(name) {
  const store = readStore();
  if (store[name] === undefined) return;
  delete store[name];
  try {
    writeJsonAtomic(secretsFile(), store);
  } catch (err) {
    console.error('[secrets] deleteSecret failed:', err.message);
  }
}

/** @returns {string[]} names of stored secrets (no values) */
export function listSecrets() {
  return Object.keys(readStore());
}
