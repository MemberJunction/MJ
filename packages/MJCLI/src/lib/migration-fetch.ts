/**
 * @module lib/migration-fetch
 *
 * Fetches the *minimal* slice of migration files needed to bring a database to a
 * target version, instead of cloning the entire `migrations/` history.
 *
 * Skyway's resolver already auto-selects the highest baseline and subsumes every
 * migration at or below it. This module mirrors that selection on the FETCH side
 * so we only download what Skyway will actually run:
 *
 *   run set = [ highest `B` baseline ] + [ every `V` after that baseline ] + [ all `R` repeatables ]
 *
 * The git ref bounds the top of the range (only migrations that exist at/below the
 * target are present in the tree); the latest baseline bounds the bottom. Selection
 * uses the numeric `<timestamp>` filename token — Skyway's version key — via the
 * shared {@link parseMigrationFilename}.
 */
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SimpleGit } from 'simple-git';
import { parseMigrationFilename } from '../baseline/util';

export type MigrationDialect = 'sqlserver' | 'postgresql';

export interface MigrationFetchResult {
  /** Temp clone root to hand to Skyway as the migration location. */
  dir: string;
  /** Repo-relative migration paths checked out (empty when the full-history fallback was used). */
  selected: string[];
  /** True when partial clone was unavailable and the full `migrations/` dir was fetched instead. */
  usedFallback: boolean;
  /** Removes the temp clone. Callers MUST invoke this in a finally on every exit path. */
  cleanup: () => Promise<void>;
}

/** Matches Flyway/Skyway repeatable migrations (`R__<desc>.sql`), which always run. */
const REPEATABLE_PATTERN = /^R__.+\.sql$/i;

/**
 * Resolves a user-supplied tag/branch into a git ref.
 * A semantic version (`2.123.0` / `v2.123.0`) maps to the `vX.Y.Z` release tag;
 * anything else (e.g. `main`) is treated as a branch name unchanged.
 */
export function resolveGitRef(tagOrBranch: string): string {
  const isSemver = /^v?\d+\.\d+\.\d+$/.test(tagOrBranch);
  if (!isSemver) return tagOrBranch;
  return tagOrBranch.startsWith('v') ? tagOrBranch : `v${tagOrBranch}`;
}

/**
 * Pure selector: given the repo-relative migration paths present at a ref, return
 * the minimal slice Skyway needs. With no baseline present (e.g. legacy v2), returns
 * the full versioned history. Repeatable migrations are always included.
 */
export function selectMigrationSlice(paths: readonly string[]): string[] {
  const sqlPaths = paths.filter((p) => p.toLowerCase().endsWith('.sql'));
  const repeatables = sqlPaths.filter((p) => REPEATABLE_PATTERN.test(path.basename(p)));
  const floorTimestamp = highestBaselineTimestamp(sqlPaths);
  const versioned = sqlPaths.filter((p) => isInVersionedSlice(p, floorTimestamp));
  return Array.from(new Set([...versioned, ...repeatables]));
}

/** Returns the timestamp of the latest `B` baseline among the paths, or null if none. */
function highestBaselineTimestamp(sqlPaths: readonly string[]): string | null {
  let floor: string | null = null;
  for (const p of sqlPaths) {
    const parsed = parseMigrationFilename(path.basename(p));
    if (!parsed || parsed.kind !== 'B') continue;
    if (floor === null || parsed.timestamp > floor) floor = parsed.timestamp;
  }
  return floor;
}

/** True if a versioned/baseline path belongs in the slice given the baseline floor. */
function isInVersionedSlice(filePath: string, floorTimestamp: string | null): boolean {
  const parsed = parseMigrationFilename(path.basename(filePath));
  if (!parsed) return false; // repeatables and non-migration files handled elsewhere
  if (floorTimestamp === null) return parsed.kind === 'V'; // no baseline → all versioned
  if (parsed.kind === 'B') return parsed.timestamp === floorTimestamp; // only the floor baseline
  return parsed.timestamp > floorTimestamp; // versioned migrations strictly after the baseline
}

/**
 * SIDE EFFECTS: clones from `repoUrl` over the network into a temp dir and checks out
 * only the selected migration slice. Returns the temp dir plus a `cleanup` the caller
 * MUST run in a finally. On any internal failure the temp dir is removed before throwing.
 */
export async function fetchMigrationSlice(opts: { repoUrl: string; ref: string; dialect: MigrationDialect }): Promise<MigrationFetchResult> {
  const migrationsRoot = opts.dialect === 'postgresql' ? 'migrations-pg' : 'migrations';
  const dir = mkdtempSync(path.join(tmpdir(), 'mj-migrations-'));
  const cleanup = async (): Promise<void> => {
    await rm(dir, { recursive: true, force: true });
  };

  try {
    // Deferred load: the pure selector (selectMigrationSlice/resolveGitRef) carries no
    // runtime dependency on simple-git — only an actual fetch pulls it in.
    const { simpleGit } = await import('simple-git');
    const git = simpleGit(dir);
    const partialOk = await tryPartialClone(git, opts.repoUrl, opts.ref, dir);
    if (!partialOk) {
      await fullSparseClone(git, opts.repoUrl, opts.ref, dir, migrationsRoot);
      return { dir, selected: [], usedFallback: true, cleanup };
    }
    const allPaths = await listTreePaths(git, migrationsRoot);
    const selected = selectMigrationSlice(allPaths);
    const checkoutTargets = selected.length > 0 ? selected : [migrationsRoot];
    await git.raw(['sparse-checkout', 'set', '--no-cone', ...checkoutTargets]);
    await git.raw(['checkout']);
    return { dir, selected, usedFallback: false, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

/** Attempts a blobless, no-checkout shallow clone. Returns false if the server/git rejects the filter. */
async function tryPartialClone(git: SimpleGit, repoUrl: string, ref: string, dir: string): Promise<boolean> {
  try {
    await git.clone(repoUrl, dir, ['--no-checkout', '--filter=blob:none', '--depth=1', '--branch', ref]);
    return true;
  } catch {
    return false; // caller falls back to a full sparse clone
  }
}

/** Fallback path: full shallow sparse clone of the whole migrations dir (today's behavior). */
async function fullSparseClone(git: SimpleGit, repoUrl: string, ref: string, dir: string, migrationsRoot: string): Promise<void> {
  await git.clone(repoUrl, dir, ['--sparse', '--depth=1', '--branch', ref]);
  await git.raw(['sparse-checkout', 'set', migrationsRoot]);
}

/** Lists repo-relative file paths under `migrationsRoot` at HEAD without downloading blobs. */
async function listTreePaths(git: SimpleGit, migrationsRoot: string): Promise<string[]> {
  const out = await git.raw(['ls-tree', '-r', '--name-only', 'HEAD', '--', migrationsRoot]);
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
