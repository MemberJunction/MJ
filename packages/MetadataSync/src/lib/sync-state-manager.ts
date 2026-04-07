import fs from 'fs-extra';
import path from 'path';

/**
 * Persisted state for incremental sync operations.
 *
 * Stored as `.mj-sync-state.json` in the sync root directory
 * (same level as `.mj-sync.json`).
 *
 * NOTE: This file should be added to .gitignore — it is machine-local state.
 */
export interface SyncState {
  /** Last successful push timestamp (per entity directory) */
  pushTimestamps: Record<string, string>;  // entityDir (relative) -> ISO timestamp
  /** Last successful pull timestamp (per entity name) */
  pullTimestamps: Record<string, string>;  // entityName -> ISO timestamp
  /** File checksums from last push (per relative file path) */
  fileChecksums: Record<string, string>;   // relative file path -> SHA256
}

const STATE_FILENAME = '.mj-sync-state.json';

const EMPTY_STATE: SyncState = {
  pushTimestamps: {},
  pullTimestamps: {},
  fileChecksums: {},
};

export class SyncStateManager {
  private statePath: string;
  private state: SyncState;

  constructor(rootDir: string) {
    this.statePath = path.join(rootDir, STATE_FILENAME);
    this.state = structuredClone(EMPTY_STATE);
  }

  /** Load state from `.mj-sync-state.json`. Gracefully handles missing or corrupt files. */
  async load(): Promise<void> {
    try {
      if (await fs.pathExists(this.statePath)) {
        const raw = await fs.readJson(this.statePath);
        this.state = {
          pushTimestamps: raw.pushTimestamps && typeof raw.pushTimestamps === 'object' ? raw.pushTimestamps : {},
          pullTimestamps: raw.pullTimestamps && typeof raw.pullTimestamps === 'object' ? raw.pullTimestamps : {},
          fileChecksums:  raw.fileChecksums  && typeof raw.fileChecksums  === 'object' ? raw.fileChecksums  : {},
        };
      }
    } catch {
      // Corrupt file — start fresh
      this.state = structuredClone(EMPTY_STATE);
    }
  }

  /** Save state to `.mj-sync-state.json`. */
  async save(): Promise<void> {
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
