/**
 * Build-output census for `mj dev workspace doctor`.
 *
 * SIDE EFFECTS: READ-ONLY filesystem access — `existsSync`, `readdirSync` and `statSync` under
 * member package directories. Never writes, never spawns a build.
 *
 * Linking a member package into the workspace links its SOURCE folder, so a package whose output
 * was never built, or was built before its last source edit, still resolves at install time. It
 * fails only when a host imports it: a missing export, or "No form is registered for …" in
 * Explorer. This census names those packages before anything starts (#5494).
 *
 * @module lib/dev-workspace/build-output
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { DetectCandidates } from './detect.js';
import type { BuildOutputEntry, BuildOutputState, MemberPackageJson } from './types.js';

/** Where a package builds to when its package.json names no entry point. */
const DEFAULT_OUTPUT_DIR = 'dist';

/** Source folder whose files the output is compared against. */
const SOURCE_DIR = 'src';

/** Directories never descended into while finding the newest file. */
const SKIPPED_DIRS = new Set(['node_modules', '__tests__', '__mocks__']);

/** Test files: editing one does not make the build output stale. */
const TEST_FILE_PATTERN = /\.(spec|test)\.[cm]?[jt]sx?$/;

/**
 * The root export's file from an `exports` field: a string, or the `.` entry of a conditions
 * object, itself a string or a conditions object whose `import` / `default` / `require` is one.
 * Any other shape returns null, and the caller falls back to `main` / `module`. Pure.
 */
function rootExportPath(exportsField: unknown): string | null {
  if (typeof exportsField === 'string') return exportsField;
  if (exportsField === null || typeof exportsField !== 'object') return null;
  const root = (exportsField as Record<string, unknown>)['.'];
  if (typeof root === 'string') return root;
  if (root === null || typeof root !== 'object') return null;
  for (const condition of ['import', 'default', 'require']) {
    const target = (root as Record<string, unknown>)[condition];
    if (typeof target === 'string') return target;
  }
  return null;
}

/**
 * The entry file a package declares, relative to its directory, or null when it declares none.
 * `main` first: it is what Node and the Angular builders resolve for every MJ package. Pure.
 */
export function ResolveEntryFile(pkg: MemberPackageJson): string | null {
  const entry = pkg.main ?? pkg.module ?? rootExportPath(pkg.exports);
  if (entry === undefined || entry === null || entry.length === 0) return null;
  return path.normalize(entry);
}

/**
 * The output folder for a declared entry file: its first path segment (`dist/esm/index.js` →
 * `dist`). Null when the entry sits at the package root or inside `src/` — such a package ships
 * its source, so there is no build output to compare. Pure.
 */
export function OutputDirOf(entryFile: string): string | null {
  const segments = entryFile.split(path.sep).filter((segment) => segment.length > 0 && segment !== '.');
  if (segments.length < 2) return null;
  const first = segments[0];
  if (first === '..' || first === SOURCE_DIR) return null;
  return first;
}

/**
 * Newest modification time of any file under `dir`, skipping {@link SKIPPED_DIRS}, dot
 * directories and (when `skipTests`) test files. Returns 0 for a missing or empty folder.
 */
function newestFileTime(dir: string, skipTests: boolean): number {
  let newest = 0;
  const pending = [dir];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name) && !entry.name.startsWith('.')) pending.push(path.join(current, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      if (skipTests && TEST_FILE_PATTERN.test(entry.name)) continue;
      newest = Math.max(newest, statSync(path.join(current, entry.name)).mtimeMs);
    }
  }
  return newest;
}

/** Build state of one package directory with the given output folder and optional entry file. */
function readBuildState(packageDir: string, outputDir: string, entryFile: string | null): BuildOutputState {
  const outputPath = path.join(packageDir, outputDir);
  const builtMarker = entryFile === null ? outputPath : path.join(packageDir, entryFile);
  if (!existsSync(builtMarker)) return 'missing';
  const newestOutput = newestFileTime(outputPath, false);
  if (newestOutput === 0) return 'missing';
  return newestFileTime(path.join(packageDir, SOURCE_DIR), true) > newestOutput ? 'stale' : 'fresh';
}

/**
 * Reads the build state of every member package that has a `build` script and a `src/` folder.
 *
 * `memberNames` is passed in for the same reason {@link CollectClientPackageCensus} takes it:
 * detection finds every Open App repo on disk, and an excluded sibling is not this workspace's
 * concern. A package whose entry points into `src/` or sits at its root ships source and is left
 * out — it has no output to go stale.
 */
export function CollectBuildOutputCensus(parentDir: string, memberNames: readonly string[]): BuildOutputEntry[] {
  const inWorkspace = new Set(memberNames);
  const entries: BuildOutputEntry[] = [];
  for (const member of DetectCandidates(parentDir).filter((candidate) => inWorkspace.has(candidate.Name))) {
    for (const pkg of member.Packages) {
      const name = pkg.PackageJson.name;
      if (name === undefined || name.length === 0 || pkg.PackageJson.scripts?.build === undefined) continue;
      const packageDir = path.join(member.Path, pkg.RelPath);
      if (!existsSync(path.join(packageDir, SOURCE_DIR))) continue;
      const entryFile = ResolveEntryFile(pkg.PackageJson);
      const outputDir = entryFile === null ? DEFAULT_OUTPUT_DIR : OutputDirOf(entryFile);
      if (outputDir === null) continue;
      entries.push({
        Package: name,
        Repo: member.Name,
        RelPath: pkg.RelPath,
        OutputDir: outputDir,
        State: readBuildState(packageDir, outputDir, entryFile),
      });
    }
  }
  return entries.sort((a, b) => (a.Package < b.Package ? -1 : a.Package > b.Package ? 1 : 0));
}
