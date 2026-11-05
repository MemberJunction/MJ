/**
 * In-memory snapshot of a set of files, restorable byte for byte.
 *
 * Used by the upgrade path to put back the files its package step changed when the package
 * install fails (#5517), so the host is left at the app's previous, still-installed version
 * instead of pointing at a version that never installed. Nothing is written to disk until a
 * restore, and no backup files are left behind.
 *
 * @module install/file-snapshot
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

/** One file's content at snapshot time; `null` when it did not exist. */
export interface FileSnapshotEntry {
  Path: string;
  Content: Buffer | null;
}

/** A set of files as they were when {@link SnapshotFiles} ran. */
export interface FileSnapshot {
  Entries: FileSnapshotEntry[];
}

/** Outcome of {@link RestoreFileSnapshot}. */
export interface FileRestoreResult {
  /** Files written back (or removed, for one that did not exist at snapshot time). */
  Restored: string[];
  /** Files that could not be put back, with the reason. */
  Failed: Array<{ Path: string; Message: string }>;
}

/** Reads every given file into memory. A missing file is recorded as absent. */
export function SnapshotFiles(paths: readonly string[]): FileSnapshot {
  return {
    Entries: paths.map((path) => ({ Path: path, Content: readFileIfPresent(path) })),
  };
}

/**
 * Reads a file, or returns null when it does not exist. Reading directly instead of checking
 * `existsSync` first leaves no window between the check and the use.
 */
function readFileIfPresent(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Puts every snapshotted file back as it was: rewrites a file whose bytes changed, removes one
 * that did not exist at snapshot time, and leaves an unchanged file alone. Never throws; a file
 * that cannot be restored is reported in `Failed`.
 */
export function RestoreFileSnapshot(snapshot: FileSnapshot): FileRestoreResult {
  const result: FileRestoreResult = { Restored: [], Failed: [] };
  for (const entry of snapshot.Entries) {
    try {
      if (restoreEntry(entry)) result.Restored.push(entry.Path);
    } catch (error) {
      result.Failed.push({ Path: entry.Path, Message: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

/** Restores one entry; returns whether anything had to change. */
function restoreEntry(entry: FileSnapshotEntry): boolean {
  const current = readFileIfPresent(entry.Path);
  if (entry.Content === null) {
    if (current === null) return false;
    rmSync(entry.Path, { force: true });
    return true;
  }
  if (current !== null && current.equals(entry.Content)) return false;
  writeFileSync(entry.Path, entry.Content);
  return true;
}
