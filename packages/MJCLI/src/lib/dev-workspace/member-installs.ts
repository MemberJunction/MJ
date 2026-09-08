/**
 * Standalone-install detection and cleanup for `mj dev workspace` members.
 *
 * WHY: a member that was installed standalone carries its own `node_modules` —
 * the root one AND per-package ones throughout its tree (290 in MJ, some 5
 * levels deep). Installing at the parent over those leaves two overlapping
 * stores; removing only the root swaps one broken state for another, because the
 * nested trees keep symlinks into the deleted store — a rotating cast of
 * `TS2307 Cannot find module` errors that look like missing dependencies but
 * aren't (field finding on #3795). The walk here is therefore DEPTH-INDEPENDENT
 * by design: "a `-maxdepth` guess is exactly the mistake I made" — AN-BC.
 *
 * SIDE EFFECTS: read-only walk in {@link FindMemberInstallTrees};
 * {@link RemoveMemberInstallTrees} deletes exactly the enumerated paths, with
 * the same rmSync discipline `clean.ts` uses. Never a glob delete — every
 * removed path was individually enumerated and can be printed first.
 *
 * Deletion hardening (adversarial-review revision):
 *  - an unreadable directory mid-walk is skipped and REPORTED, never a mid-run
 *    abort (an EACCES throw between deletions is worse than either extreme);
 *  - removal re-verifies the on-disk entry is named exactly `node_modules` —
 *    on case-insensitive APFS, `rmSync('.../node_modules')` would otherwise
 *    delete a dir actually named `Node_Modules`;
 *  - {@link IsInsideDirectory} lets the command exclude out-of-parent members
 *    (possible via --include) from deletion enumeration entirely.
 *
 * @module lib/dev-workspace/member-installs
 */
import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

/** Directory-visit cap for one member walk; hitting it is an error, not a truncation. */
const MAX_WALK_DIRS = 200_000;

/** Matches clean.ts: Windows and virus scanners hold file handles briefly. */
const RM_MAX_RETRIES = 3;

/** True when `childPath` is strictly inside `parentDir` (never equal, never outside). */
export function IsInsideDirectory(parentDir: string, childPath: string): boolean {
  if (!path.isAbsolute(parentDir) || !path.isAbsolute(childPath)) {
    throw new Error(`IsInsideDirectory requires absolute paths, got: '${parentDir}', '${childPath}'`);
  }
  const rel = path.relative(parentDir, childPath);
  return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** What one member walk found: install trees plus any directories it could not read. */
export interface InstallTreeScan {
  /** Absolute paths of every dir named exactly `node_modules`, sorted. */
  Trees: string[];
  /** Directories the walk could not list (permissions etc.) — reported, never a mid-run abort. */
  UnreadableDirs: string[];
}

/** Real (non-symlink) subdirectories of a dir, skipping dot-dirs; unreadable dirs are recorded, not thrown. */
function subDirs(dirPath: string, unreadable: string[]): string[] {
  try {
    return readdirSync(dirPath, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name);
  } catch {
    unreadable.push(dirPath); // recorded for the caller's report — never swallowed silently
    return [];
  }
}

/**
 * Finds every directory named EXACTLY `node_modules` (case-sensitive comparison,
 * real dirs only — symlinks are invisible to `Dirent.isDirectory`) anywhere under
 * a member repo — depth-independent, never descending INTO a found tree.
 * Bounded by {@link MAX_WALK_DIRS}; exceeding it throws.
 */
export function FindMemberInstallTrees(repoPath: string): InstallTreeScan {
  if (!path.isAbsolute(repoPath)) {
    throw new Error(`FindMemberInstallTrees requires an absolute path, got: ${repoPath}`);
  }
  const trees: string[] = [];
  const unreadable: string[] = [];
  const stack = [repoPath];
  let visited = 0;
  while (stack.length > 0) {
    const dir = stack.pop()!;
    if (++visited > MAX_WALK_DIRS) {
      throw new Error(`Walk of ${repoPath} exceeded ${MAX_WALK_DIRS} directories — refusing to continue`);
    }
    for (const child of subDirs(dir, unreadable)) {
      const childPath = path.join(dir, child);
      if (child === 'node_modules') {
        trees.push(childPath); // record, never descend into it
      } else {
        stack.push(childPath);
      }
    }
  }
  return { Trees: trees.sort(), UnreadableDirs: unreadable.sort() };
}

/** Outcome of a removal run: what was deleted, what was already gone, what was refused (with reasons). */
export interface RemoveTreesResult {
  Removed: string[];
  AlreadyGone: string[];
  /** Paths NOT deleted, each with the reason — reported by the command, never silent. */
  Skipped: Array<{ Path: string; Reason: string }>;
}

/**
 * Verifies the on-disk directory entry for `treePath` is named exactly
 * `node_modules`: 'gone' when absent, 'exact' on a true match, 'mismatch' when
 * only a case-variant exists (case-insensitive filesystems would let rmSync
 * delete `Node_Modules` through a `node_modules` path), 'unreadable' when the
 * containing dir cannot be listed.
 */
function classifyOnDiskEntry(treePath: string): 'exact' | 'gone' | 'mismatch' | 'unreadable' {
  let entries: string[];
  try {
    entries = readdirSync(path.dirname(treePath));
  } catch {
    return 'unreadable';
  }
  if (entries.includes('node_modules')) return 'exact';
  const caseVariant = entries.some((e) => e.toLowerCase() === 'node_modules');
  return caseVariant ? 'mismatch' : 'gone';
}

/**
 * Removes the enumerated `node_modules` trees. Precondition (asserted): every
 * path is absolute and ends in `node_modules` — this function deletes install
 * trees and nothing else. Each deletion re-verifies the exact on-disk entry
 * name first. Paths already gone are reported, not errors, so a repeat run is
 * safe; refusals come back in `Skipped` with reasons. rmSync failures propagate.
 */
export function RemoveMemberInstallTrees(treePaths: readonly string[]): RemoveTreesResult {
  for (const treePath of treePaths) {
    if (!path.isAbsolute(treePath) || path.basename(treePath) !== 'node_modules') {
      throw new Error(`RemoveMemberInstallTrees only deletes node_modules trees; refusing: ${treePath}`);
    }
  }
  const result: RemoveTreesResult = { Removed: [], AlreadyGone: [], Skipped: [] };
  for (const treePath of treePaths) {
    const onDisk = classifyOnDiskEntry(treePath);
    if (onDisk === 'gone') {
      result.AlreadyGone.push(treePath);
      continue;
    }
    if (onDisk === 'mismatch') {
      result.Skipped.push({ Path: treePath, Reason: 'on-disk entry is a case variant of node_modules — not an install tree' });
      continue;
    }
    if (onDisk === 'unreadable') {
      result.Skipped.push({ Path: treePath, Reason: 'containing directory is unreadable — cannot verify the entry' });
      continue;
    }
    rmSync(treePath, { recursive: true, force: true, maxRetries: RM_MAX_RETRIES });
    result.Removed.push(treePath);
  }
  return result;
}
