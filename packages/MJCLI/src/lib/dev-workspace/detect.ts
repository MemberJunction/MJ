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
 *  - any package its workspace globs enumerate mentions the `@mj-biz-apps/`
 *    scope in its own name or dependency sections — such a repo either publishes
 *    into that scope or consumes it, which is exactly what makes linking it
 *    locally worthwhile,
 *  - it is the MJ monorepo (root package name `memberjunction-workspace`).
 *
 * Each member's own `pnpm-workspace.yaml` is read here too: its `packages:` globs
 * (positives filtered to packages-rooted ones) become the member's
 * {@link CandidateRepo.WorkspaceGlobs}, so a repo that nests its packages (the MJ
 * monorepo declares 42 globs) contributes all of them to the generated workspace
 * instead of a hardcoded `packages/*` (#3795). Those same globs drive the package
 * ENUMERATION here, so nested packages feed the family `workspace:*` overrides —
 * one-level enumeration would see 59 of MJ's 307 packages. The member's committed
 * lockfile is loaded here too (see `lockfile.ts`).
 *
 * @module lib/dev-workspace/detect
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { ReadMemberLockfile } from './lockfile.js';
import type { CandidateReason, CandidateRepo, MemberPackageInfo, MemberPackageJson, WorkspaceGlobsSource } from './types.js';

/** Root package name that identifies the MJ monorepo checkout. */
export const MJ_MONOREPO_PACKAGE_NAME = 'memberjunction-workspace';

/** Workspace globs assumed for a member repo that has no `pnpm-workspace.yaml`. */
export const DEFAULT_WORKSPACE_GLOBS: readonly string[] = ['packages/*'];

/** Hard caps so every walk is bounded; hitting one is an error, not a truncation. */
const MAX_SIBLING_DIRS = 500;
const MAX_PACKAGES_PER_REPO = 1000;
/** Directory-visit cap for one repo's recursive `**` glob walks. */
const MAX_GLOB_WALK_DIRS = 30_000;
/** Longest member pnpm-workspace.yaml we will parse (a bigger file is not plausibly one). */
const MAX_MEMBER_WORKSPACE_YAML_BYTES = 1_000_000;

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

/**
 * Converts a workspace glob to an anchored RegExp over repo-relative paths:
 * `*` matches within one segment; `**` matches across `/` INCLUDING zero
 * segments (globstar-zero, as fast-glob/pnpm behave) — so a `!**\/dist\/**`
 * guard rejects `packages/a/dist` itself, not only paths beneath it.
 * Exported for tests.
 */
export function GlobToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped
    .replace(/\/\*\*/g, '<SLASH_GLOBSTAR>')
    .replace(/\*\*\//g, '<GLOBSTAR_SLASH>')
    .replace(/\*\*/g, '<GLOBSTAR>')
    .replace(/\*/g, '[^/]*')
    .replace(/<SLASH_GLOBSTAR>/g, '(?:/.*)?')
    .replace(/<GLOBSTAR_SLASH>/g, '(?:.*/)?')
    .replace(/<GLOBSTAR>/g, '.*');
  return new RegExp(`^${pattern}$`);
}

/** True when any of the negation regexes rejects this repo-relative path. */
function isNegated(relPath: string, negations: readonly RegExp[]): boolean {
  return negations.some((negation) => negation.test(relPath));
}

/** Lists immediate subdirectories of a dir, skipping dot-dirs and node_modules. */
function childDirs(dirPath: string): string[] {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) return [];
  return readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
    .map((e) => e.name);
}

/** Recursively collects package dirs under `base` for a `base/**` glob (bounded walk). */
function walkRecursiveGlob(repoPath: string, base: string, negations: readonly RegExp[]): string[] {
  const found: string[] = [];
  const stack = [base];
  let visited = 0;
  while (stack.length > 0) {
    const rel = stack.pop()!;
    if (++visited > MAX_GLOB_WALK_DIRS) {
      throw new Error(`Glob walk under ${path.join(repoPath, base)} exceeded ${MAX_GLOB_WALK_DIRS} directories — not a plausible packages tree`);
    }
    if (rel !== base && !isNegated(rel, negations) && existsSync(path.join(repoPath, rel, 'package.json'))) {
      found.push(rel);
    }
    for (const child of childDirs(path.join(repoPath, rel))) {
      stack.push(`${rel}/${child}`);
    }
  }
  return found;
}

/**
 * Expands one positive glob to package-dir paths relative to the repo root.
 * Supported shapes (100% of those observed in the wild): a fixed path, a
 * trailing `/*` (one level), a trailing `/**` (recursive). Anything else is
 * refused — returned as unsupported so the command reports it, never silent.
 */
function expandPositiveGlob(repoPath: string, glob: string, negations: readonly RegExp[]): { Dirs: string[]; Unsupported: boolean } {
  const hasPackageJson = (rel: string): boolean => existsSync(path.join(repoPath, rel, 'package.json'));
  if (!glob.includes('*')) {
    const keep = !isNegated(glob, negations) && hasPackageJson(glob);
    return { Dirs: keep ? [glob] : [], Unsupported: false };
  }
  if (glob.endsWith('/*') && !glob.slice(0, -2).includes('*')) {
    const base = glob.slice(0, -2);
    const dirs = childDirs(path.join(repoPath, base))
      .map((child) => `${base}/${child}`)
      .filter((rel) => !isNegated(rel, negations) && hasPackageJson(rel));
    return { Dirs: dirs, Unsupported: false };
  }
  if (glob.endsWith('/**') && !glob.slice(0, -3).includes('*')) {
    return { Dirs: walkRecursiveGlob(repoPath, glob.slice(0, -3), negations), Unsupported: false };
  }
  return { Dirs: [], Unsupported: true };
}

/**
 * Enumerates every package the member's own workspace globs cover — nested dirs
 * included, so the family `workspace:*` overrides see all of MJ's 307 packages,
 * not the 59 a one-level scan finds. Bounded; over-cap throws.
 */
function loadRepoPackages(repoPath: string, globs: readonly string[]): { Packages: MemberPackageInfo[]; UnsupportedGlobs: string[] } {
  const negations = globs.filter((g) => g.startsWith('!')).map((g) => GlobToRegExp(g.slice(1)));
  const unsupported: string[] = [];
  const seen = new Set<string>();
  for (const glob of globs.filter((g) => !g.startsWith('!'))) {
    const expanded = expandPositiveGlob(repoPath, glob, negations);
    if (expanded.Unsupported) unsupported.push(glob);
    for (const dir of expanded.Dirs) seen.add(dir);
  }
  if (seen.size > MAX_PACKAGES_PER_REPO) {
    throw new Error(`${repoPath} globs enumerate ${seen.size} packages — over the ${MAX_PACKAGES_PER_REPO} cap; not a plausible member repo`);
  }
  const packages: MemberPackageInfo[] = [];
  for (const rel of [...seen].sort()) {
    const pkgJson = readJsonFile(path.join(repoPath, rel, 'package.json'));
    if (pkgJson !== null) packages.push({ RelPath: rel, PackageJson: pkgJson });
  }
  return { Packages: packages, UnsupportedGlobs: unsupported };
}

/** Matches one YAML block-list entry at ANY indent (zero included): `- value`, `- 'value'`, `- "value"`, optional trailing comment. */
const YAML_LIST_ENTRY_PATTERN = /^\s*-\s+(?:'([^']*)'|"([^"]*)"|([^\s#][^#]*?))\s*(?:#.*)?$/;
/** Matches the top-level `packages:` key line, capturing whatever follows the colon. */
const PACKAGES_KEY_PATTERN = /^packages:\s*(.*)$/;

/**
 * Parses the top-level `packages:` list out of a pnpm-workspace.yaml. Pure.
 * Deliberately minimal — pnpm-workspace.yaml's `packages:` list is the only YAML
 * this command reads, so a hand-rolled parser beats a yaml dependency. Handles
 * block lists at any indent (zero included) and single- or multi-line flow style;
 * anchors/aliases and other exotica yield [] and are surfaced by the command's
 * zero-globs warning. Returns every entry verbatim (negations included).
 */
export function ParseWorkspacePackagesGlobs(yamlText: string): string[] {
  const lines = yamlText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = PACKAGES_KEY_PATTERN.exec(lines[i].trimEnd());
    if (match === null) continue;
    const remainder = match[1].trim();
    if (remainder.startsWith('[')) return parseFlowEntries(lines, i);
    if (remainder.length === 0 || remainder.startsWith('#')) return parseBlockEntries(lines, i + 1);
    return []; // `packages: <scalar/anchor>` — not a list this parser understands
  }
  return [];
}

/**
 * Reads block-list entries starting at `startIndex`. Blank lines and full-line
 * comments NEVER end the list — a maintainer's `# --- AI ---` section comment
 * inside MJ's 42-glob list must not silently truncate the parse (review finding
 * on #3795: it dropped 39 of 42 globs). Only a line that is not an entry, not
 * blank, and not a comment (i.e. the next `key:` line) ends it.
 */
function parseBlockEntries(lines: readonly string[], startIndex: number): string[] {
  const entries: string[] = [];
  for (let i = startIndex; i < lines.length; i++) {
    const bare = lines[i].trim();
    if (bare.length === 0 || bare.startsWith('#')) continue;
    const match = YAML_LIST_ENTRY_PATTERN.exec(lines[i].trimEnd());
    if (match === null) break; // the next key (any indent) ends the list
    const value = match[1] ?? match[2] ?? match[3];
    if (value !== undefined && value.length > 0) entries.push(value);
  }
  return entries;
}

/**
 * Reads a flow-style list (`packages: ['a', 'b']`), which may span lines, up to
 * its closing bracket. An unterminated list yields whatever was collected — the
 * command's zero-globs warning surfaces any resulting nonsense.
 */
function parseFlowEntries(lines: readonly string[], keyIndex: number): string[] {
  const pieces: string[] = [];
  let text = lines[keyIndex].slice(lines[keyIndex].indexOf('[') + 1);
  for (let i = keyIndex; i < lines.length; i++) {
    const close = text.indexOf(']');
    if (close >= 0) {
      pieces.push(text.slice(0, close));
      break;
    }
    pieces.push(text);
    text = i + 1 < lines.length ? lines[i + 1].trimEnd() : '';
  }
  return pieces
    .join(',')
    .split(',')
    .map((entry) => stripQuotes(entry.trim()))
    .filter((entry) => entry.length > 0);
}

/** Strips one matching pair of surrounding quotes off a scalar, if present. */
function stripQuotes(value: string): string {
  const match = /^'([^']*)'$|^"([^"]*)"$/.exec(value);
  return match === null ? value : (match[1] ?? match[2] ?? '');
}

/** Result of {@link SelectPackagesGlobs}: the globs plus whether the default had to stand in. */
export interface SelectedPackagesGlobs {
  Globs: string[];
  /** True when the member declared no packages-rooted positive glob and {@link DEFAULT_WORKSPACE_GLOBS} was substituted. */
  UsedFallback: boolean;
}

/**
 * Filters a member's declared workspace globs down to the ones this generator
 * re-prefixes. POSITIVE globs must be rooted under `packages/` (producer packages
 * only — app-shell globs like `apps/*` are dropped because shell names collide
 * across repos; see `build.ts`). NEGATIONS are ALL kept, packages-rooted or not
 * (a `!**\/dist\/**` guard included): a negation only subtracts, and dropping one inverts
 * its guard — dist/ copies of package.json would join the workspace (review
 * finding on #3795). Leading `./` is stripped and duplicates collapse. When no
 * packages-rooted positive remains, the default stands in (negations still kept)
 * and `UsedFallback` reports it so the command can warn — a silent fallback was
 * the core #3795 disease. Pure.
 */
export function SelectPackagesGlobs(declaredGlobs: readonly string[]): SelectedPackagesGlobs {
  const selected: string[] = [];
  const seen = new Set<string>();
  for (const raw of declaredGlobs) {
    const negated = raw.startsWith('!');
    const body = (negated ? raw.slice(1) : raw).replace(/^\.\//, '');
    if (!negated && !body.startsWith('packages/')) continue;
    const glob = negated ? `!${body}` : body;
    if (seen.has(glob)) continue;
    seen.add(glob);
    selected.push(glob);
  }
  const hasPositiveGlob = selected.some((glob) => !glob.startsWith('!'));
  if (hasPositiveGlob) return { Globs: selected, UsedFallback: false };
  return { Globs: [...DEFAULT_WORKSPACE_GLOBS, ...selected], UsedFallback: true };
}

/** Loads a repo's workspace globs, with their provenance, from its pnpm-workspace.yaml (bounded read). */
function loadWorkspaceGlobs(repoPath: string): { Globs: string[]; Source: WorkspaceGlobsSource } {
  const yamlPath = path.join(repoPath, 'pnpm-workspace.yaml');
  if (!existsSync(yamlPath)) return { Globs: [...DEFAULT_WORKSPACE_GLOBS], Source: 'no-workspace-yaml' };
  const size = statSync(yamlPath).size;
  if (size > MAX_MEMBER_WORKSPACE_YAML_BYTES) {
    throw new Error(`${yamlPath} is ${size} bytes — over the ${MAX_MEMBER_WORKSPACE_YAML_BYTES} cap; not a plausible pnpm-workspace.yaml`);
  }
  const selected = SelectPackagesGlobs(ParseWorkspacePackagesGlobs(readFileSync(yamlPath, 'utf8')));
  return { Globs: selected.Globs, Source: selected.UsedFallback ? 'workspace-yaml-without-packages-globs' : 'member-workspace-yaml' };
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
  const workspaceGlobs = loadWorkspaceGlobs(repoPath);
  const enumerated = loadRepoPackages(repoPath, workspaceGlobs.Globs);
  const turboPath = path.join(repoPath, 'turbo.json');
  return {
    Name: dirName,
    Path: repoPath,
    Reasons: detectReasons(repoPath, rootPkg, enumerated.Packages),
    RootPackageJson: rootPkg,
    Packages: enumerated.Packages,
    UnsupportedGlobs: enumerated.UnsupportedGlobs,
    Lockfile: ReadMemberLockfile(repoPath),
    TurboJson: existsSync(turboPath) ? readFileSync(turboPath, 'utf8') : null,
    WorkspaceGlobs: workspaceGlobs.Globs,
    WorkspaceGlobsSource: workspaceGlobs.Source,
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
