import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

/**
 * Persisted state for incremental sync operations.
 *
 * Stored in ~/.mj/sync-state/<hash>.json where <hash> is derived from the
 * sync root directory path. This keeps machine-local state out of the project
 * directory entirely — nothing to gitignore, no risk of committing stale state.
 */
export interface SyncState {
  /** The original root directory this state belongs to (for debugging) */
  rootDir: string;
  /** Last successful push timestamp (per entity directory) */
  pushTimestamps: Record<string, string>;  // entityDir (relative) -> ISO timestamp
  /** Last successful pull timestamp (per entity name) */
  pullTimestamps: Record<string, string>;  // entityName -> ISO timestamp
  /** File checksums from last push (per relative file path) */
  fileChecksums: Record<string, string>;   // relative file path -> SHA256
}

const STATE_DIR = path.join(os.homedir(), '.mj', 'sync-state');

const EMPTY_STATE = (rootDir: string): SyncState => ({
  rootDir,
  pushTimestamps: {},
  pullTimestamps: {},
  fileChecksums: {},
});

export class SyncStateManager {
  private statePath: string;
  private state: SyncState;
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    const hash = crypto.createHash('sha256').update(rootDir).digest('hex').slice(0, 12);
    this.statePath = path.join(STATE_DIR, `${hash}.json`);
    this.state = EMPTY_STATE(rootDir);
  }

  /** Load state from ~/.mj/sync-state/. Gracefully handles missing or corrupt files. */
  async load(): Promise<void> {
    try {
      if (await fs.pathExists(this.statePath)) {
        const raw = await fs.readJson(this.statePath);
        this.state = {
          rootDir: raw.rootDir || this.rootDir,
          pushTimestamps: raw.pushTimestamps && typeof raw.pushTimestamps === 'object' ? raw.pushTimestamps : {},
          pullTimestamps: raw.pullTimestamps && typeof raw.pullTimestamps === 'object' ? raw.pullTimestamps : {},
          fileChecksums:  raw.fileChecksums  && typeof raw.fileChecksums  === 'object' ? raw.fileChecksums  : {},
        };
      }
    } catch {
      this.state = EMPTY_STATE(this.rootDir);
    }
  }

  /** Save state to ~/.mj/sync-state/. */
  async save(): Promise<void> {
    await fs.ensureDir(STATE_DIR);
    await fs.writeJson(this.statePath, this.state, { spaces: 2 });
  }

  // ---------------------------------------------------------------------------
  // Pull timestamps
  // ---------------------------------------------------------------------------

  getLastPullTimestamp(entityName: string): string | undefined {
    return this.state.pullTimestamps[entityName];
  }

  setLastPullTimestamp(entityName: string, timestamp: string): void {
    this.state.pullTimestamps[entityName] = timestamp;
  }

  // ---------------------------------------------------------------------------
  // Push timestamps
  // ---------------------------------------------------------------------------

  getLastPushTimestamp(entityDir: string): string | undefined {
    return this.state.pushTimestamps[entityDir];
  }

  setLastPushTimestamp(entityDir: string, timestamp: string): void {
    this.state.pushTimestamps[entityDir] = timestamp;
  }

  // ---------------------------------------------------------------------------
  // File checksums (push)
  // ---------------------------------------------------------------------------

  /** Returns true if the file's current checksum differs from the stored one. */
  hasFileChanged(relativePath: string, currentChecksum: string): boolean {
    const stored = this.state.fileChecksums[relativePath];
    return stored !== currentChecksum;
  }

  setFileChecksum(relativePath: string, checksum: string): void {
    this.state.fileChecksums[relativePath] = checksum;
  }

  /** Remove checksums for files that no longer exist on disk. */
  async pruneStaleChecksums(baseDir: string): Promise<number> {
    let pruned = 0;
    for (const relativePath of Object.keys(this.state.fileChecksums)) {
      const fullPath = path.join(baseDir, relativePath);
      if (!(await fs.pathExists(fullPath))) {
        delete this.state.fileChecksums[relativePath];
        pruned++;
      }
    }
    return pruned;
  }
}
