/**
 * Committed-lockfile reading and override-pin derivation for `mj dev workspace`.
 *
 * WHY: a pnpm workspace has ONE lockfile, so joining N repos discards N committed
 * lockfiles — every `^`/`~` range re-floats to whatever is latest on generation
 * day. Measured in the field (#3795): 945 packages resolved differently from MJ's
 * committed lockfile, breaking real builds one float at a time. The cure that
 * worked was mechanical: pin the parent to what the members' lockfiles already
 * resolved. This module is that derivation — PURE file reading, NO network.
 *
 * SIDE EFFECTS: read-only filesystem access in {@link ReadMemberLockfile} only;
 * the parsers and {@link DeriveLockfilePins} are pure.
 *
 * What is read, per member with a committed lockfile:
 *  - the DIRECT dependencies of the member's importers and every `@types/*` at
 *    any depth — these define WHICH names get pinned;
 *  - EVERY resolved `name@version` at any depth — these define WHAT versions
 *    exist per name, so multi-major names are pinned per major.
 * Entries that cannot be pinned (workspace links, npm-alias resolutions,
 * git/url specifiers, non-semver versions) are returned as {@link LockfileSkip}s
 * — dropped loudly, never silently. A lockfile in a format this module cannot
 * read (npm lockfileVersion 1, pnpm < 9) is returned as an
 * {@link UnsupportedLockfile} so the command can warn — never a silent zero.
 *
 * Pin semantics (adversarial-review revision): values are EXACT versions —
 * `^resolved` let 6 of the 7 field-measured breaks straight through, including
 * a `@babel/*` PATCH bump that broke type compat. Keys are per-major when a
 * name resolves in more than one major anywhere in the members' committed
 * graphs (`"chalk@^5": "5.6.2"`, `"chalk@^4": "4.1.2"`), because one global
 * pin would force every transitive consumer cross-major; single-major names
 * get a plain `"name": "exact"` key.
 *
 * @module lib/dev-workspace/lockfile
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { DevDepConflict, LockfileSkip, MemberLockfile, ResolvedLockEntry, UnsupportedLockfile } from './types.js';

/** Largest lockfile we will parse (MJ's is ~4MB; anything past this is not plausibly a lockfile). */
const MAX_LOCKFILE_BYTES = 50_000_000;

/** A concrete semver resolution: `X.Y.Z` with optional prerelease/build suffix. */
const RESOLVED_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

/** Declared-specifier prefixes that resolve outside the registry — never pinnable. */
const GIT_OR_URL_SPECIFIER = /^(git\+|git:|github:|https?:|file:)/;

/** True when the string is a plain concrete semver version. */
export function IsResolvedVersion(version: string): boolean {
  return RESOLVED_VERSION_PATTERN.test(version);
}

/** Major-version number of a concrete resolution. Throws on non-semver input (precondition). */
export function MajorOf(version: string): number {
  const match = RESOLVED_VERSION_PATTERN.exec(version);
  if (match === null) {
    throw new Error(`MajorOf requires a concrete semver version, got: ${version}`);
  }
  return Number(match[1]);
}

/**
 * Compares two CONCRETE versions: numeric triple first; on a triple tie a
 * release beats a prerelease, and two prereleases compare by tag string.
 * Throws on non-semver input — callers filter through {@link IsResolvedVersion} first.
 */
export function CompareResolvedVersions(a: string, b: string): number {
  const ma = RESOLVED_VERSION_PATTERN.exec(a);
  const mb = RESOLVED_VERSION_PATTERN.exec(b);
  if (ma === null || mb === null) {
    throw new Error(`CompareResolvedVersions requires concrete versions, got: '${a}' vs '${b}'`);
  }
  for (let i = 1; i <= 3; i++) {
    if (Number(ma[i]) !== Number(mb[i])) return Number(ma[i]) - Number(mb[i]);
  }
  const preA = ma[4] ?? '';
  const preB = mb[4] ?? '';
  if (preA === preB) return 0;
  if (preA === '') return 1; // release > prerelease
  if (preB === '') return -1;
  return preA < preB ? -1 : 1;
}

/** Strips the pnpm peer-suffix (`1.2.3(peer@x)(...)`) off a lockfile version. */
function stripPeerSuffix(version: string): string {
  const paren = version.indexOf('(');
  return paren >= 0 ? version.slice(0, paren) : version;
}

/** Classifies one importer resolution: a usable entry, or a skip with the reason. */
function classifyResolution(name: string, rawVersion: string): { Entry?: ResolvedLockEntry; Skip?: LockfileSkip } {
  const version = stripPeerSuffix(rawVersion);
  if (version.startsWith('link:')) {
    return { Skip: { Name: name, Version: version, Reason: 'workspace-internal link' } };
  }
  if (GIT_OR_URL_SPECIFIER.test(version)) {
    return { Skip: { Name: name, Version: version, Reason: 'git/url resolution' } };
  }
  if (!IsResolvedVersion(version)) {
    return { Skip: { Name: name, Version: version, Reason: 'non-semver resolution (npm alias / catalog / file)' } };
  }
  return { Entry: { Name: name, Version: version } };
}

/** Strips surrounding single/double quotes off a YAML key. */
function unquoteKey(key: string): string {
  const match = /^'([^']*)'$|^"([^"]*)"$/.exec(key);
  return match === null ? key : (match[1] ?? match[2] ?? '');
}

/** Splits a pnpm packages-section key (`@types/node@24.10.11`) into name + version, or null. */
function splitPackageKey(key: string): { Name: string; Version: string } | null {
  const at = key.lastIndexOf('@');
  if (at <= 0) return null; // leading @ is a scope, not a separator
  return { Name: key.slice(0, at), Version: key.slice(at + 1) };
}

/** Matches `  name:` / `  'name':` section lines at a given indent, capturing the key. */
function keyAtIndent(line: string, indent: number): string | null {
  if (!line.startsWith(' '.repeat(indent)) || line.charAt(indent) === ' ') return null;
  const body = line.slice(indent);
  if (!body.endsWith(':')) return null;
  return unquoteKey(body.slice(0, -1));
}

/** Extracts the `lockfileVersion` value from a pnpm-lock.yaml, or null. */
function pnpmLockVersion(lines: readonly string[]): string | null {
  for (const line of lines) {
    const match = /^lockfileVersion:\s*'?([0-9.]+)'?\s*$/.exec(line.trimEnd());
    if (match !== null) return match[1];
  }
  return null;
}

/** Parses the `importers:` section of a pnpm-lock.yaml into direct-dep resolutions. */
function parsePnpmImporters(lines: readonly string[]): { Direct: ResolvedLockEntry[]; Skipped: LockfileSkip[] } {
  const direct: ResolvedLockEntry[] = [];
  const skipped: LockfileSkip[] = [];
  let inImporters = false;
  let currentDep: string | null = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line === 'importers:') {
      inImporters = true;
      continue;
    }
    if (!inImporters) continue;
    if (line.length > 0 && !line.startsWith(' ')) break; // next top-level key ends the section
    const depName = keyAtIndent(line, 6);
    if (depName !== null) currentDep = depName;
    const versionMatch = /^ {8}version: (.+)$/.exec(line);
    if (versionMatch === null || currentDep === null) continue;
    const classified = classifyResolution(currentDep, versionMatch[1].trim());
    if (classified.Entry) direct.push(classified.Entry);
    if (classified.Skip) skipped.push(classified.Skip);
    currentDep = null;
  }
  return { Direct: direct, Skipped: skipped };
}

/** Parses the `packages:` section keys of a pnpm-lock.yaml into EVERY resolved name@version. */
function parsePnpmResolutions(lines: readonly string[]): ResolvedLockEntry[] {
  const resolutions: ResolvedLockEntry[] = [];
  let inPackages = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line === 'packages:' || line === 'snapshots:') {
      inPackages = line === 'packages:';
      continue;
    }
    if (!inPackages) continue;
    if (line.length > 0 && !line.startsWith(' ')) inPackages = false;
    const key = keyAtIndent(line, 2);
    if (key === null) continue;
    const split = splitPackageKey(key);
    if (split !== null && IsResolvedVersion(split.Version)) resolutions.push(split);
  }
  return resolutions;
}

/**
 * Parses the `snapshots:` section into a dependents map: `@types/x@V` -> the
 * package NAMES whose snapshots depend on that exact resolution. This is how
 * pnpm parentage is derived, so `@types` that exist only beneath a registry
 * copy of a family package can be excluded from pin authority.
 */
function parsePnpmTypesDependents(lines: readonly string[]): Map<string, Set<string>> {
  const dependents = new Map<string, Set<string>>();
  let inSnapshots = false;
  let currentSnapshotName: string | null = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line === 'snapshots:' || line === 'packages:') {
      inSnapshots = line === 'snapshots:';
      continue;
    }
    if (!inSnapshots) continue;
    if (line.length > 0 && !line.startsWith(' ')) break; // next top-level key ends the section
    const snapshotKey = keyAtIndent(line.replace(/: \{\}$/, ':'), 2);
    if (snapshotKey !== null) {
      const split = splitPackageKey(stripPeerSuffix(snapshotKey));
      currentSnapshotName = split?.Name ?? null;
      continue;
    }
    const depMatch = /^ {6}(?:'([^']+)'|([^\s:]+)): (.+)$/.exec(line);
    if (depMatch === null || currentSnapshotName === null) continue;
    const depName = depMatch[1] ?? depMatch[2];
    if (!depName.startsWith('@types/')) continue;
    const depVersion = stripPeerSuffix(depMatch[3].trim());
    const key = `${depName}@${depVersion}`;
    const set = dependents.get(key) ?? new Set<string>();
    set.add(currentSnapshotName);
    dependents.set(key, set);
  }
  return dependents;
}

/** Parses a committed pnpm-lock.yaml. Only v9+ is readable; older formats return an unsupported marker. */
export function ParsePnpmLockfile(lockText: string): MemberLockfile | UnsupportedLockfile {
  const lines = lockText.split('\n');
  const version = pnpmLockVersion(lines);
  if (version === null || Number(version.split('.')[0]) < 9) {
    return { Kind: 'unsupported', File: 'pnpm-lock.yaml', Version: version ?? 'unknown' };
  }
  const importers = parsePnpmImporters(lines);
  const resolutions = parsePnpmResolutions(lines);
  const typesDependents = parsePnpmTypesDependents(lines);
  return {
    Kind: 'pnpm',
    Direct: importers.Direct,
    Types: resolutions
      .filter((entry) => entry.Name.startsWith('@types/'))
      .map((entry) => ({ ...entry, Dependents: [...(typesDependents.get(`${entry.Name}@${entry.Version}`) ?? [])].sort() })),
    Resolutions: resolutions,
    Skipped: importers.Skipped,
  };
}

/** The npm package-lock.json fields this derivation reads. */
interface NpmLockPackageEntry {
  version?: string;
  link?: boolean;
  resolved?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

/** Resolves one declared name from an importer via npm's nearest-node_modules walk. */
function resolveNpmDep(packages: Record<string, NpmLockPackageEntry>, importerKey: string, name: string): NpmLockPackageEntry | null {
  const segments = importerKey === '' ? [] : importerKey.split('/');
  for (let depth = segments.length; depth >= 0; depth--) {
    const prefix = segments.slice(0, depth).join('/');
    const entry = packages[`${prefix === '' ? '' : `${prefix}/`}node_modules/${name}`];
    if (entry !== undefined) return entry;
  }
  return null;
}

/** Classifies one npm importer dependency: entry, or skip with a stated reason. */
function classifyNpmDep(name: string, declaredSpec: string, entry: NpmLockPackageEntry | null): { Entry?: ResolvedLockEntry; Skip?: LockfileSkip } {
  if (GIT_OR_URL_SPECIFIER.test(declaredSpec)) {
    return { Skip: { Name: name, Version: declaredSpec, Reason: 'git/url specifier' } };
  }
  if (entry === null) {
    return { Skip: { Name: name, Version: declaredSpec, Reason: 'not present in lockfile' } };
  }
  if (entry.link === true) {
    return { Skip: { Name: name, Version: entry.version ?? 'link', Reason: 'workspace-internal link' } };
  }
  if (entry.resolved !== undefined && /^git/.test(entry.resolved)) {
    return { Skip: { Name: name, Version: entry.version ?? entry.resolved, Reason: 'git/url resolution' } };
  }
  const version = entry.version ?? '';
  if (!IsResolvedVersion(version)) {
    return { Skip: { Name: name, Version: version, Reason: 'non-semver resolution' } };
  }
  return { Entry: { Name: name, Version: version } };
}

/** Collects direct-dep resolutions for one npm importer entry. */
function collectNpmImporterDeps(
  packages: Record<string, NpmLockPackageEntry>,
  importerKey: string,
  importer: NpmLockPackageEntry,
  direct: ResolvedLockEntry[],
  skipped: LockfileSkip[]
): void {
  const declared = { ...importer.dependencies, ...importer.devDependencies, ...importer.optionalDependencies };
  for (const [name, spec] of Object.entries(declared)) {
    const classified = classifyNpmDep(name, spec, resolveNpmDep(packages, importerKey, name));
    if (classified.Entry) direct.push(classified.Entry);
    if (classified.Skip) skipped.push(classified.Skip);
  }
}

/** Parses a committed npm package-lock.json. Only lockfileVersion 2/3 is readable. */
export function ParseNpmLockfile(lockText: string): MemberLockfile | UnsupportedLockfile {
  const parsed: unknown = JSON.parse(lockText);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('package-lock.json did not parse to an object');
  }
  const shape = parsed as { lockfileVersion?: number; packages?: Record<string, NpmLockPackageEntry> };
  if (shape.lockfileVersion === undefined || shape.lockfileVersion < 2 || shape.packages === undefined) {
    return { Kind: 'unsupported', File: 'package-lock.json', Version: String(shape.lockfileVersion ?? 'unknown') };
  }
  const packages = shape.packages;
  const direct: ResolvedLockEntry[] = [];
  const skipped: LockfileSkip[] = [];
  const resolutions: ResolvedLockEntry[] = [];
  const types: ResolvedLockEntry[] = [];
  for (const [key, entry] of Object.entries(packages)) {
    if (!key.includes('node_modules')) {
      collectNpmImporterDeps(packages, key, entry, direct, skipped);
      continue;
    }
    const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const gitResolved = entry.resolved !== undefined && /^git/.test(entry.resolved);
    if (entry.version === undefined || gitResolved || entry.link === true || !IsResolvedVersion(entry.version)) continue;
    resolutions.push({ Name: name, Version: entry.version });
    if (name.startsWith('@types/')) {
      types.push({ Name: name, Version: entry.version, Dependents: npmNestingParent(key) });
    }
  }
  return { Kind: 'npm', Direct: direct, Types: types, Resolutions: resolutions, Skipped: skipped };
}

/**
 * The package this npm lockfile entry is physically nested under, from its key
 * path: `node_modules/@memberjunction/x/node_modules/@types/y` -> `@memberjunction/x`.
 * A top-level (hoisted) entry has no derivable single parent -> [] (parentage
 * unknown, treated as legitimate authority).
 */
function npmNestingParent(key: string): string[] {
  const segments = key.split(/node_modules\//).map((s) => s.replace(/\/$/, '')).filter((s) => s.length > 0);
  // segments = [<importer prefix if any>, parentPkg?, ..., ownName]; nesting parent = the segment before the last
  if (segments.length < 2) return [];
  const parent = segments[segments.length - 2];
  return parent.includes('/') && !parent.startsWith('@') ? [] : [parent]; // importer paths (e.g. packages/core) are not registry parents
}

/** Reads a size-checked lockfile off disk; throws over the cap (not plausibly a lockfile). */
function readBoundedLockfile(filePath: string): string {
  const size = statSync(filePath).size;
  if (size > MAX_LOCKFILE_BYTES) {
    throw new Error(`${filePath} is ${size} bytes — over the ${MAX_LOCKFILE_BYTES} cap; not a plausible lockfile`);
  }
  return readFileSync(filePath, 'utf8');
}

/**
 * Reads a member's committed lockfile: `pnpm-lock.yaml` first, `package-lock.json`
 * otherwise, null when the repo commits neither. An unsupported format comes back
 * as a marker (the command warns); unparseable content throws — a corrupt
 * lockfile must never silently become "no pins for this member".
 */
export function ReadMemberLockfile(repoPath: string): MemberLockfile | UnsupportedLockfile | null {
  const pnpmPath = path.join(repoPath, 'pnpm-lock.yaml');
  if (existsSync(pnpmPath)) {
    return ParsePnpmLockfile(readBoundedLockfile(pnpmPath));
  }
  const npmPath = path.join(repoPath, 'package-lock.json');
  if (!existsSync(npmPath)) return null;
  try {
    return ParseNpmLockfile(readBoundedLockfile(npmPath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unparseable package-lock.json at ${npmPath}: ${message}`);
  }
}

/** The pure result of the cross-member pin derivation. */
export interface LockfilePinsResult {
  /**
   * Override entries, sorted by key. Values are EXACT versions. Keys are plain
   * names for single-major names, per-major selectors (`name@^N`) otherwise.
   */
  Pins: Record<string, string>;
  /** Same-major disagreements the highest committed exact resolution won (key names the emitted selector). */
  Conflicts: DevDepConflict[];
  /** Names excluded because a workspace member provides them (workspace:* covers those). */
  ExcludedFamilyNames: string[];
}

/** One member's candidate resolutions, tagged with the repo for conflict reporting. */
export interface MemberLockfileCandidates {
  Repo: string;
  Lockfile: MemberLockfile;
}

/**
 * True when an at-depth `@types` resolution is legitimate pin authority: its
 * parentage is unknown (hoisted / importer-level), or at least one dependent is
 * NOT a family package. A `@types` living ONLY beneath registry copies of
 * family packages describes a graph that cannot exist in the generated
 * workspace (family packages are workspace-linked there), so it must not vote.
 */
function isLegitimateTypesAuthority(entry: ResolvedLockEntry, familyNames: ReadonlySet<string>): boolean {
  if (entry.Dependents === undefined || entry.Dependents.length === 0) return true;
  return entry.Dependents.some((dependent) => !familyNames.has(dependent));
}

/** Decides one (name, major) group's exact pin; records a conflict when sources disagreed. */
function decideMajorPin(key: string, candidates: Array<{ Repo: string; Version: string }>, result: LockfilePinsResult): void {
  let winner = candidates[0];
  for (const candidate of candidates.slice(1)) {
    if (CompareResolvedVersions(candidate.Version, winner.Version) > 0) winner = candidate;
  }
  result.Pins[key] = winner.Version;
  const losers = candidates.filter((c) => c.Version !== winner.Version);
  if (losers.length > 0) {
    result.Conflicts.push({ Package: key, Winner: winner, Losers: losers });
  }
}

/**
 * Derives the parent `pnpm.overrides` pins from the members' committed lockfiles.
 * Pure.
 *
 * AUTHORITY RULE (adversarial-review round 3): a version may vote only where a
 * member DIRECTLY declares the name (its importers resolve it), plus `@types/*`
 * at any depth minus those parented solely by registry copies of family
 * packages. At-depth resolutions of ordinary packages are NOT candidates — a
 * bizapps lockfile resolved with registry `@memberjunction/*` describes a graph
 * that cannot exist in the generated workspace, and letting it vote handed the
 * field's floated versions (`@cerebras` 1.91.0, `@foblex` 18.6.1) a win over
 * MJ's committed 1.64.1/18.0.0.
 *
 * KEY SCOPING: at-depth majors still decide the KEY SHAPE — when any member's
 * graph holds another major of a pinned name anywhere, the pin is emitted as a
 * `name@^N` selector so transitive consumers of the other majors float within
 * their declared ranges (never forced cross-major); only majors present among
 * the candidates get a selector at all. Values are EXACT — `^resolved` provably
 * passed 6 of 7 field-measured breaks through. Disagreements within a major
 * among direct declarations are genuine: highest committed exact wins, reported.
 */
export function DeriveLockfilePins(members: readonly MemberLockfileCandidates[], familyNames: ReadonlySet<string>): LockfilePinsResult {
  const excludedFamily = new Set<string>();
  const sorted = [...members].sort((a, b) => (a.Repo < b.Repo ? -1 : a.Repo > b.Repo ? 1 : 0));
  const byNameMajor = new Map<string, Map<number, Array<{ Repo: string; Version: string }>>>();
  for (const member of sorted) {
    const legitimateTypes = member.Lockfile.Types.filter((t) => isLegitimateTypesAuthority(t, familyNames));
    for (const entry of [...member.Lockfile.Direct, ...legitimateTypes]) {
      if (familyNames.has(entry.Name)) {
        excludedFamily.add(entry.Name);
        continue;
      }
      const majors = byNameMajor.get(entry.Name) ?? new Map<number, Array<{ Repo: string; Version: string }>>();
      const candidates = majors.get(MajorOf(entry.Version)) ?? [];
      if (!candidates.some((c) => c.Repo === member.Repo && c.Version === entry.Version)) {
        candidates.push({ Repo: member.Repo, Version: entry.Version });
      }
      majors.set(MajorOf(entry.Version), candidates);
      byNameMajor.set(entry.Name, majors);
    }
  }
  const majorsAnywhere = collectMajorsAnywhere(sorted, byNameMajor);
  const result: LockfilePinsResult = { Pins: {}, Conflicts: [], ExcludedFamilyNames: [...excludedFamily].sort() };
  for (const name of [...byNameMajor.keys()].sort()) {
    const majors = byNameMajor.get(name)!;
    const singleMajorEverywhere = (majorsAnywhere.get(name)?.size ?? majors.size) === 1;
    for (const major of [...majors.keys()].sort((a, b) => a - b)) {
      decideMajorPin(singleMajorEverywhere ? name : `${name}@^${major}`, majors.get(major)!, result);
    }
  }
  return result;
}

/**
 * Majors present ANYWHERE (any depth, any member) for each pinned name — used
 * only to decide key shape: a plain `name` key is safe only when no other major
 * exists anywhere in any member's graph; otherwise every pin must be a scoped
 * selector so at-depth consumers of other majors are never forced cross-major.
 */
function collectMajorsAnywhere(
  members: readonly MemberLockfileCandidates[],
  byNameMajor: ReadonlyMap<string, unknown>
): Map<string, Set<number>> {
  const majorsAnywhere = new Map<string, Set<number>>();
  for (const member of members) {
    for (const entry of [...member.Lockfile.Resolutions, ...member.Lockfile.Direct, ...member.Lockfile.Types]) {
      if (!byNameMajor.has(entry.Name)) continue;
      const majors = majorsAnywhere.get(entry.Name) ?? new Set<number>();
      majors.add(MajorOf(entry.Version));
      majorsAnywhere.set(entry.Name, majors);
    }
  }
  return majorsAnywhere;
}
