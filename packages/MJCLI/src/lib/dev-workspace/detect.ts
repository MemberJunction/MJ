/**
 * Member-repo detection for `mj dev workspace`.
 *
 * SIDE EFFECTS: read-only filesystem access (directory listings + JSON reads).
 * All content decisions belong to the pure builders in `build.ts`; this module
 * only loads the metadata they consume.
 *
 * A sibling directory of the parent qualifies as a candidate when it has a root
 * `package.json` AND any of:
 *  - it carries an `mj-app.json` (an Open App repo),
 *  - any package.json one level under its `packages/` dir mentions the
 *    `@mj-biz-apps/` scope in its own name or dependency sections (the
 *    quickstart's `grep -l '@mj-biz-apps/'` member detection),
 *  - it is the MJ monorepo (root package name `memberjunction-workspace`).
 *
 * @module lib/dev-workspace/detect
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { CandidateReason, CandidateRepo, MemberPackageInfo, MemberPackageJson } from './types.js';

/** Root package name that identifies the MJ monorepo checkout. */
export const MJ_MONOREPO_PACKAGE_NAME = 'memberjunction-workspace';

/** Hard caps so every walk is bounded; hitting one is an error, not a truncation. */
const MAX_SIBLING_DIRS = 500;
const MAX_PACKAGES_PER_REPO = 1000;

export interface DetectOptions {
  /** Override for tests only; defaults to {@link MAX_SIBLING_DIRS}. */
  MaxSiblingDirs?: number;
}

/** Reads and parses a JSON file, returning null when absent; throws on unparseable JSON. */
function readJsonFile(filePath: string): MemberPackageJson | null {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw) as MemberPackageJson;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unparseable JSON at ${filePath}: ${message}`);
  }
}

/** Loads every package.json one level under a repo's `packages/` dir (bounded). */
function loadRepoPackages(repoPath: string): MemberPackageInfo[] {
  const packagesDir = path.join(repoPath, 'packages');
  if (!existsSync(packagesDir) || !statSync(packagesDir).isDirectory()) return [];
  const entries = readdirSync(packagesDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  if (entries.length > MAX_PACKAGES_PER_REPO) {
    throw new Error(`${packagesDir} has ${entries.length} entries — over the ${MAX_PACKAGES_PER_REPO} cap; not a plausible packages dir`);
  }
  const packages: MemberPackageInfo[] = [];
  for (const entry of entries) {
    const pkgJson = readJsonFile(path.join(packagesDir, entry.name, 'package.json'));
    if (pkgJson !== null) packages.push({ DirName: entry.name, PackageJson: pkgJson });
  }
  return packages;
}

/** True when any of the package's name/dependency sections mentions the bizapps scope. */
function mentionsBizAppsScope(pkg: MemberPackageJson): boolean {
  if (pkg.name?.startsWith('@mj-biz-apps/')) return true;
  const sections = [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies];
  return sections.some((section) => Object.keys(section ?? {}).some((name) => name.startsWith('@mj-biz-apps/')));
}

/** Computes the detection reasons for one sibling repo (empty array = not a candidate). */
function detectReasons(repoPath: string, rootPkg: MemberPackageJson, packages: MemberPackageInfo[]): CandidateReason[] {
  const reasons: CandidateReason[] = [];
  if (existsSync(path.join(repoPath, 'mj-app.json'))) reasons.push('mj-app-json');
  if (packages.some((p) => mentionsBizAppsScope(p.PackageJson))) reasons.push('bizapps-packages');
  if (rootPkg.name === MJ_MONOREPO_PACKAGE_NAME) reasons.push('mj-monorepo');
  return reasons;
}

/**
 * Loads one sibling directory as a repo, with detection reasons.
 * Returns null when the directory has no root package.json (not a repo at all).
 */
export function LoadRepo(parentDir: string, dirName: string): CandidateRepo | null {
  const repoPath = path.join(parentDir, dirName);
  const rootPkg = readJsonFile(path.join(repoPath, 'package.json'));
  if (rootPkg === null) return null;
  const packages = loadRepoPackages(repoPath);
  const turboPath = path.join(repoPath, 'turbo.json');
  return {
    Name: dirName,
    Path: repoPath,
    Reasons: detectReasons(repoPath, rootPkg, packages),
    RootPackageJson: rootPkg,
    Packages: packages,
    TurboJson: existsSync(turboPath) ? readFileSync(turboPath, 'utf8') : null,
  };
}

/**
 * Scans the parent directory's immediate subdirectories and returns every
 * candidate member repo, sorted by name.
 */
export function DetectCandidates(parentDir: string, options?: DetectOptions): CandidateRepo[] {
  if (!path.isAbsolute(parentDir)) {
    throw new Error(`DetectCandidates requires an absolute path, got: ${parentDir}`);
  }
  if (!existsSync(parentDir) || !statSync(parentDir).isDirectory()) {
    throw new Error(`Parent directory does not exist: ${parentDir}`);
  }
  const maxSiblings = options?.MaxSiblingDirs ?? MAX_SIBLING_DIRS;
  const dirs = readdirSync(parentDir, { withFileTypes: true }).filter(
    (e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules'
  );
  if (dirs.length > maxSiblings) {
    throw new Error(`${parentDir} has ${dirs.length} subdirectories — over the ${maxSiblings} cap; is this really the repos' parent dir?`);
  }
  const candidates: CandidateRepo[] = [];
  for (const dir of dirs) {
    const repo = LoadRepo(parentDir, dir.name);
    if (repo !== null && repo.Reasons.length > 0) candidates.push(repo);
  }
  return candidates.sort((a, b) => a.Name.localeCompare(b.Name));
}
