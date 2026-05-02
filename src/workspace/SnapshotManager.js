import fs from 'fs';
import path from 'path';

/**
 * @typedef {Object} AppWindowSnapshot
 * @property {number} pid
 * @property {string} processName
 * @property {string} executablePath
 * @property {string[]} launchArgs
 * @property {string} [windowTitle]
 * @property {{x:number,y:number,width:number,height:number}} bounds
 */

/**
 * @typedef {Object} TerminalSnapshot
 * @property {string} shell
 * @property {string} cwd
 * @property {string} [startupCommand]
 */

/**
 * @typedef {Object} DockLayoutSnapshot
 * @property {'left'|'right'|'top'|'bottom'} position
 * @property {number} width
 * @property {string} [activeTabId]
 * @property {string[]} [openWidgets]
 */

/**
 * @typedef {Object} WorkspaceSnapshot
 * @property {string} name
 * @property {string} createdAt
 * @property {AppWindowSnapshot[]} apps
 * @property {TerminalSnapshot[]} terminals
 * @property {DockLayoutSnapshot} dockLayout
 */

export class SnapshotManager {
  /**
   * @param {string} baseDir Absolute workspace directory (typically app.getPath('userData')/workspaces)
   */
  constructor(baseDir) {
    this.baseDir = baseDir;
  }

  ensureDir() {
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  /**
   * @param {string} name
   */
  getSnapshotPath(name) {
    return path.join(this.baseDir, `${name}.json`);
  }

  /**
   * Save a snapshot to disk.
   * @param {string} name
   * @param {WorkspaceSnapshot} snapshot
   */
  async saveSnapshot(name, snapshot) {
    try {
      this.ensureDir();
      const filePath = this.getSnapshotPath(name);
      console.log('[Workspace] Saving to:', filePath);
      console.log('[Workspace] Snapshot data:', snapshot);
      const json = JSON.stringify(snapshot, null, 2);
      fs.writeFileSync(filePath, json, 'utf8');
      console.log('[Workspace] Save successful');
      return filePath;
    } catch (err) {
      console.error('[Workspace] Save failed:', err);
      throw err;
    }
  }

  /**
   * List workspace files by name (without .json).
   * @returns {Promise<string[]>}
   */
  async listWorkspaces() {
    this.ensureDir();
    console.log('[Workspace] Listing from directory:', this.baseDir);
    const files = fs.readdirSync(this.baseDir);
    return files
      .filter((file) => file.endsWith('.json'))
      .map((file) => path.basename(file, '.json'));
  }

  /**
   * Load all workspace snapshots (full JSON contents).
   * @returns {Promise<WorkspaceSnapshot[]>}
   */
  async listSnapshots() {
    this.ensureDir();
    console.log('[Workspace] Reading snapshots from:', this.baseDir);
    const files = fs.readdirSync(this.baseDir);
    /** @type {WorkspaceSnapshot[]} */
    const snapshots = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const full = path.join(this.baseDir, file);
      try {
        const content = fs.readFileSync(full, 'utf8');
        const parsed = /** @type {WorkspaceSnapshot} */ (JSON.parse(content));
        snapshots.push(parsed);
      } catch (err) {
        console.error('[Workspace] Failed to read/parse snapshot:', full, err);
        // continue with other files – but do not swallow the error silently
      }
    }
    snapshots.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return snapshots;
  }

  /**
   * @param {string} name
   * @returns {Promise<WorkspaceSnapshot|null>}
   */
  async loadSnapshot(name) {
    this.ensureDir();
    const filePath = this.getSnapshotPath(name);
    console.log('[Workspace] Loading snapshot from:', filePath);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return /** @type {WorkspaceSnapshot} */ (JSON.parse(content));
    } catch (err) {
      if (err && err.code === 'ENOENT') return null;
      console.error('[Workspace] loadSnapshot error:', err);
      throw err;
    }
  }

  /**
   * @param {string} name
   */
  async deleteSnapshot(name) {
    this.ensureDir();
    const filePath = this.getSnapshotPath(name);
    console.log('[Workspace] Deleting snapshot:', filePath);
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      if (err && err.code === 'ENOENT') return;
      console.error('[Workspace] deleteSnapshot error:', err);
      throw err;
    }
  }
}

