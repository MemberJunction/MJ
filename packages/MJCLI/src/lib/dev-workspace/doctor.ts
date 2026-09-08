/**
 * Health checks for `mj dev workspace doctor`.
 *
 * SIDE EFFECTS: READ-ONLY filesystem access, and nothing else. Two reads happen
 * here — the workspace state collection delegated to `status.ts` (existence checks
 * plus small file reads), and ONE `readdirSync` of the parent's pnpm virtual store
 * for the one-copy census. Doctor never writes, never deletes, never spawns a
 * process (the active pnpm version is probed by the command and passed in, the same
 * contract `CollectWorkspaceStatus` uses) and never touches the network.
 *
 * The census exists because the failure that actually bites a joined workspace is
 * not a missing file — it is TWO COPIES of a package the runtime requires exactly
 * one of. Two `@angular/core`s give `NG0203 inject() must be called from an
 * injection context`; two `@memberjunction/global`s give two Global Object Stores,
 * so every `BaseSingleton` silently becomes two singletons. Both look like
 * application bugs and neither names the real cause, so doctor names it.
 *
 * @module lib/dev-workspace/doctor
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import type { Dirent } from 'node:fs';
import { SENTINEL_MARKER } from './build.js';
import { LOCKFILE_NAME, NODE_MODULES_NAME } from './clean.js';
import { DescribeDirSource } from './dir-flag.js';
import { CollectWorkspaceStatus } from './status.js';
import { SENTINEL_FILE_NAME } from './write.js';
import type { DirSource, WorkspaceStatus } from './types.js';

/**
 * Packages that MUST resolve to exactly one copy across a joined workspace.
 * Angular's DI, RxJS's operator identity checks and MJ's Global Object Store all
 * key off module identity, so a second copy is not a duplicate — it is a second,
 * mutually invisible runtime.
 */
export const SINGLETON_PACKAGES: readonly string[] = [
  '@angular/core',
  '@angular/common',
  '@angular/compiler',
  'rxjs',
  'zone.js',
  '@memberjunction/core',
  '@memberjunction/global',
];

/** Hard cap on virtual-store entries the census will read; exceeding it throws rather than truncating. */
const MAX_STORE_ENTRIES = 100_000;

/** The pnpm virtual store, relative to the workspace parent. */
const STORE_REL_PATH = path.join(NODE_MODULES_NAME, '.pnpm');

/**
 * Outcome of one health check. `skip` means the check did not apply — it is never a
 * claim of health, which is exactly why it is not folded into `pass`.
 */
export type DoctorSeverity = 'pass' | 'warn' | 'fail' | 'skip';

/** One health-check result: what was checked, how it went, and for warn/fail what to do. */
export interface DoctorCheck {
  Name: string;
  Severity: DoctorSeverity;
  Detail: string;
}

/** One decoded pnpm virtual-store directory name. */
export interface StoreEntry {
  /** Package name with the scope separator decoded (`@angular+core` -> `@angular/core`). */
  Name: string;
  /** Concrete version, peer suffix stripped. */
  Version: string;
}

/** Distinct versions of one singleton package found in the parent's store. */
export interface SingletonVersions {
  Package: string;
  /** Sorted distinct versions — always at least one entry. */
  Versions: string[];
}

/** What the one-copy census read out of `<parent>/node_modules/.pnpm`. */
export interface StoreCensus {
  /** False when the parent has no virtual store — nothing has been installed there. */
  StorePresent: boolean;
  /** Every singleton package present in the store. Packages absent from it are omitted, not zero-filled. */
  Packages: SingletonVersions[];
  /**
   * Store entries that are not `name@version` (the store's own `node_modules`,
   * `file:`/`link:` entries). Counted and reported rather than silently dropped.
   */
  UnparsedEntryCount: number;
}

/** Everything `dev workspace doctor` reports. */
export interface DoctorReport {
  ParentDir: string;
  DirSource: DirSource;
  Checks: DoctorCheck[];
  Census: StoreCensus;
}

/**
 * Index of the `@` that separates name from version in a store directory name:
 * the SECOND `@` for a scoped package (`@angular+core@21.1.3`), the first
 * otherwise (`rxjs@7.8.1`). Returns -1 when there is none.
 *
 * Deliberately not "the last `@`": a peer-suffixed entry carries `@` characters
 * INSIDE its suffix — `@angular+common@21.1.3(@angular+core@21.1.3)` — so the last
 * `@` sits in the parentheses and the naive split yields nonsense.
 */
function findVersionSeparator(entry: string): number {
  return entry.startsWith('@') ? entry.indexOf('@', 1) : entry.indexOf('@');
}

/** pnpm encodes the scope separator as `+`, and only that one: `@angular+core` -> `@angular/core`. */
function decodeStoreName(encodedName: string): string {
  return encodedName.startsWith('@') ? encodedName.replace('+', '/') : encodedName;
}

/**
 * Decodes one `<parent>/node_modules/.pnpm` directory name into package name and
 * version, or null when the entry is not a resolved package (the store's own
 * `node_modules`, `file+..+repo@file+..+repo` link entries, and anything else whose
 * version segment does not start with a digit).
 *
 * Peer suffixes come in BOTH shapes and both are handled — pnpm 10.33 writes the
 * underscore form (verified against a real store: `@angular+core@21.1.3_@angular+
 * compiler@21.1.3_rxjs@7.8.2_zone.js@0.16.0`), other versions write the parenthesised
 * form (`@angular+common@21.1.3(@angular+core@21.1.3)`). Both carry `@` characters
 * INSIDE the suffix, which is why the version is taken from the name/version
 * separator forwards and then truncated, never from the LAST `@` backwards — on the
 * entry above, the last `@` yields `0.16.0`, a version of a different package.
 * Splitting the VERSION segment (not the whole entry) at `_` is safe: semver forbids
 * `_` in a version, and a package name containing one is never reached. Pure.
 */
export function ParseStoreEntry(entryName: string): StoreEntry | null {
  const withoutPeers = entryName.split('(')[0];
  const separator = findVersionSeparator(withoutPeers);
  if (separator <= 0) return null;
  const encodedName = withoutPeers.slice(0, separator);
  const version = withoutPeers.slice(separator + 1).split('_')[0];
  if (!/^\d/.test(version)) return null;
  return { Name: decodeStoreName(encodedName), Version: version };
}

/**
 * Directory names in the virtual store. Reads the directory exactly once and is
 * bounded by {@link MAX_STORE_ENTRIES} — hitting the cap throws rather than
 * silently censusing a prefix of the store, which would be a false PASS.
 */
function readStoreEntries(storeDir: string): string[] {
  let dirents: Dirent[];
  try {
    dirents = readdirSync(storeDir, { withFileTypes: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read the package store at ${storeDir}: ${message}`);
  }
  if (dirents.length > MAX_STORE_ENTRIES) {
    throw new Error(
      `${storeDir} holds ${dirents.length} entries, over the ${MAX_STORE_ENTRIES} cap — refusing to census it`
    );
  }
  return dirents.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

/** Groups parsed store entries into the distinct versions of each singleton package. Pure. */
function tallySingletons(entryNames: readonly string[]): StoreCensus {
  const wanted = new Set(SINGLETON_PACKAGES);
  const found = new Map<string, Set<string>>();
  let unparsed = 0;
  for (const entryName of entryNames) {
    const entry = ParseStoreEntry(entryName);
    if (entry === null) {
      unparsed++;
      continue;
    }
    if (!wanted.has(entry.Name)) continue;
    const versions = found.get(entry.Name) ?? new Set<string>();
    versions.add(entry.Version);
    found.set(entry.Name, versions);
  }
  const packages: SingletonVersions[] = [];
  for (const name of SINGLETON_PACKAGES) {
    const versions = found.get(name);
    if (versions === undefined) continue;
    packages.push({ Package: name, Versions: [...versions].sort() });
  }
  return { StorePresent: true, Packages: packages, UnparsedEntryCount: unparsed };
}

/**
 * Counts the distinct versions of each singleton package in the parent's pnpm
 * virtual store, reading DIRECTORY NAMES ONLY — a store entry name already carries
 * `name@version`, so no package.json is opened and the whole census is one
 * `readdirSync`. An absent store is reported as `StorePresent: false`, never as a
 * clean bill of health.
 *
 * KNOWN LIMIT, stated so the PASS is not read as more than it is: pnpm gives
 * workspace-linked packages no virtual-store entry at all (verified — an MJ
 * checkout's own store holds zero `@memberjunction+core@…` entries), so this counts
 * copies IN THE PARENT STORE. A registry copy sitting alongside a workspace link is
 * one store entry and reads as one copy. Catching that is the job of the family
 * `workspace:*` overrides the generator emits, not of this census.
 *
 * SIDE EFFECT: one read-only directory listing.
 */
export function CollectSingletonCensus(parentDir: string): StoreCensus {
  if (!path.isAbsolute(parentDir)) {
    throw new Error(`CollectSingletonCensus requires an absolute path, got: ${parentDir}`);
  }
  const storeDir = path.join(parentDir, STORE_REL_PATH);
  if (!existsSync(storeDir)) return { StorePresent: false, Packages: [], UnparsedEntryCount: 0 };
  return tallySingletons(readStoreEntries(storeDir));
}

/** The parent must be a plain directory holding sibling clones — never a git repo root itself. */
function checkParentShape(status: WorkspaceStatus): DoctorCheck {
  if (!status.ParentIsGitRepo) {
    return { Name: 'parent directory', Severity: 'pass', Detail: 'a plain directory, not a git repo root' };
  }
  return {
    Name: 'parent directory',
    Severity: 'fail',
    Detail:
      'this directory is a git repo root (.git present) — a workspace parent must be the plain directory that ' +
      'HOLDS the sibling clones; re-run with --dir pointing at their common parent',
  };
}

/** All generated files must be present; a missing one means the workspace was never (fully) generated. */
function checkGeneratedFiles(status: WorkspaceStatus): DoctorCheck {
  const missing = status.Files.filter((file) => !file.Exists).map((file) => file.Name);
  if (missing.length === 0) {
    return { Name: 'workspace files', Severity: 'pass', Detail: `all ${status.Files.length} generated files present` };
  }
  return {
    Name: 'workspace files',
    Severity: 'fail',
    Detail: `missing: ${missing.join(', ')} — run \`mj dev workspace --dir ${status.ParentDir}\` to generate them`,
  };
}

/** The lockfile and node_modules come from `pnpm install`, not the generator — absence is incomplete, not broken. */
function checkInstallArtifacts(status: WorkspaceStatus): DoctorCheck {
  const missing: string[] = [];
  if (!status.LockfileExists) missing.push(LOCKFILE_NAME);
  if (!status.NodeModulesExists) missing.push(NODE_MODULES_NAME);
  if (missing.length === 0) {
    return { Name: 'install', Severity: 'pass', Detail: `${LOCKFILE_NAME} and ${NODE_MODULES_NAME} present` };
  }
  return {
    Name: 'install',
    Severity: 'warn',
    Detail: `missing ${missing.join(' and ')} — run \`pnpm install\` at ${status.ParentDir}`,
  };
}

/** The sentinel is what proves this workspace came from the generator, and what `clean` requires. */
function checkSentinel(status: WorkspaceStatus): DoctorCheck {
  const sentinel = status.Sentinel;
  if (sentinel.Kind === 'valid') {
    const members = sentinel.Sentinel.members.join(', ') || '(none recorded)';
    return { Name: 'sentinel', Severity: 'pass', Detail: `${SENTINEL_FILE_NAME} written by ${SENTINEL_MARKER} (members: ${members})` };
  }
  if (sentinel.Kind === 'invalid') {
    return {
      Name: 'sentinel',
      Severity: 'warn',
      Detail: `${SENTINEL_FILE_NAME} is present but not ours (${sentinel.Reason}) — clean needs --force`,
    };
  }
  return {
    Name: 'sentinel',
    Severity: 'warn',
    Detail: `no ${SENTINEL_FILE_NAME} — hand-made or pre-sentinel workspace; clean needs --force`,
  };
}

/** The generated pin and the pnpm actually running at the parent must be the same version. */
function checkPnpmVersion(status: WorkspaceStatus): DoctorCheck {
  const pinned = status.PinnedPnpm === null ? null : status.PinnedPnpm.slice('pnpm@'.length);
  if (pinned === null) {
    return { Name: 'pnpm version', Severity: 'skip', Detail: 'no pnpm pin at the parent (no generated package.json)' };
  }
  if (status.ActivePnpmVersion === null) {
    return { Name: 'pnpm version', Severity: 'warn', Detail: `pinned ${pinned}, but pnpm is not runnable at the parent` };
  }
  if (status.ActivePnpmVersion === pinned) {
    return { Name: 'pnpm version', Severity: 'pass', Detail: `pinned ${pinned}, active ${status.ActivePnpmVersion} — match` };
  }
  return {
    Name: 'pnpm version',
    Severity: 'warn',
    Detail: `pinned ${pinned}, active ${status.ActivePnpmVersion} — MISMATCH; run \`corepack enable\` so the pin is honored`,
  };
}

/**
 * Every member named in pnpm-workspace.yaml must exist on disk. This is a FAIL, not
 * a warning: the generated parent manifest carries a `workspace:*` override for each
 * member-provided package name, so a member whose checkout is gone makes the next
 * `pnpm install` fail outright rather than degrade.
 */
function checkMemberDirs(status: WorkspaceStatus): DoctorCheck {
  if (status.Members.length === 0) {
    return { Name: 'member dirs', Severity: 'skip', Detail: 'no pnpm-workspace.yaml — no members to check' };
  }
  if (status.MissingMemberDirs.length === 0) {
    return { Name: 'member dirs', Severity: 'pass', Detail: `all ${status.Members.length} member directories present` };
  }
  return {
    Name: 'member dirs',
    Severity: 'fail',
    Detail:
      `in pnpm-workspace.yaml but missing on disk: ${status.MissingMemberDirs.join(', ')} — the parent manifest ` +
      `overrides each member-provided package to workspace:*, so pnpm install will fail; re-clone them or ` +
      `re-run \`mj dev workspace --force\` to regenerate without them`,
  };
}

/** Repos on disk that qualify as members but are not in the workspace resolve against their own installs. */
function checkCandidates(status: WorkspaceStatus): DoctorCheck {
  if (status.DetectedCandidates.length === 0) {
    return { Name: 'candidates', Severity: 'skip', Detail: 'no member-candidate repos detected at the parent' };
  }
  if (status.CandidatesNotInWorkspace.length === 0) {
    return {
      Name: 'candidates',
      Severity: 'pass',
      Detail: `all ${status.DetectedCandidates.length} detected repos are workspace members`,
    };
  }
  return {
    Name: 'candidates',
    Severity: 'warn',
    Detail:
      `detected on disk but not in the workspace: ${status.CandidatesNotInWorkspace.join(', ')} — they resolve ` +
      `against their own installs, not this workspace; re-run \`mj dev workspace --force\` to include them`,
  };
}

/**
 * A member carrying its OWN package store has forked resolution away from the
 * workspace. Note what does NOT count: a plain `node_modules` inside a member is
 * what a healthy parent install creates (symlinks into the parent store) — only a
 * member-root `.pnpm` store or npm's `.package-lock.json` marker proves a
 * standalone install, which is the distinction `status.ts` already encodes.
 *
 * Scope, stated in the PASS text rather than implied: this reads the member ROOT
 * only. A repo whose root tree was deleted but whose nested per-package trees
 * survive (the half-finished cleanup #3795 describes) passes here — enumerating
 * those is `--clean-members`' depth-independent walk, not a health check's job.
 */
function checkStandaloneInstalls(status: WorkspaceStatus): DoctorCheck {
  if (status.MembersWithStandaloneInstalls.length === 0) {
    return {
      Name: 'standalone installs',
      Severity: 'pass',
      Detail:
        'no member root carries its own package store (a member node_modules from the parent install is normal; ' +
        'nested per-package trees are not scanned — `dev workspace --clean-members` removes those)',
    };
  }
  return {
    Name: 'standalone installs',
    Severity: 'fail',
    Detail:
      `${status.MembersWithStandaloneInstalls.join(', ')} — each has its own package store, so its code resolves ` +
      `against that store instead of this workspace (split singletons, stale deps). ` +
      `Fix: re-run \`mj dev workspace --clean-members\`.`,
  };
}

/** Appends the unparsed-entry tally to a census detail, so dropped store entries are never silent. */
function withUnparsedNote(detail: string, census: StoreCensus): string {
  const count = census.UnparsedEntryCount;
  if (count === 0) return detail;
  const noun = count === 1 ? 'entry is' : 'entries are';
  return `${detail} (${count} store ${noun} not name@version — links and the store's own node_modules)`;
}

/** Exactly one version of each singleton package may exist in the parent's store. */
function checkOneCopyCensus(census: StoreCensus): DoctorCheck {
  const name = 'one-copy census';
  if (!census.StorePresent) {
    return { Name: name, Severity: 'skip', Detail: `no ${STORE_REL_PATH} at the parent — no pnpm package store to census` };
  }
  if (census.Packages.length === 0) {
    return { Name: name, Severity: 'skip', Detail: withUnparsedNote('none of the single-copy packages are installed here', census) };
  }
  const duplicated = census.Packages.filter((entry) => entry.Versions.length > 1);
  if (duplicated.length === 0) {
    const listed = census.Packages.map((entry) => `${entry.Package}@${entry.Versions[0]}`).join(', ');
    return { Name: name, Severity: 'pass', Detail: withUnparsedNote(`one copy each in the parent store: ${listed}`, census) };
  }
  const broken = duplicated.map((entry) => `${entry.Package} (${entry.Versions.join(', ')})`).join('; ');
  return {
    Name: name,
    Severity: 'fail',
    Detail:
      `more than one version in the parent store: ${broken} — these must be single-copy (Angular DI and MJ's ` +
      `Global Object Store key off module identity, so a second copy is a second, invisible runtime). ` +
      `Fix: re-run \`mj dev workspace --force\` to re-derive the pins, then \`pnpm install\` at the parent.`,
  };
}

/**
 * Runs every health check at a parent directory. `activePnpmVersion` comes from the
 * caller (a spawn — see `pnpm.ts`) and `dirSource` likewise, so this module reads
 * neither processes nor the environment. Read-only.
 */
export function CollectDoctorReport(
  parentDir: string,
  activePnpmVersion: string | null,
  dirSource: DirSource
): DoctorReport {
  if (!path.isAbsolute(parentDir)) {
    throw new Error(`CollectDoctorReport requires an absolute path, got: ${parentDir}`);
  }
  const status = CollectWorkspaceStatus(parentDir, activePnpmVersion, dirSource);
  const census = CollectSingletonCensus(parentDir);
  return {
    ParentDir: parentDir,
    DirSource: dirSource,
    Census: census,
    Checks: [
      checkParentShape(status),
      checkGeneratedFiles(status),
      checkInstallArtifacts(status),
      checkSentinel(status),
      checkPnpmVersion(status),
      checkMemberDirs(status),
      checkCandidates(status),
      checkStandaloneInstalls(status),
      checkOneCopyCensus(census),
    ],
  };
}

/** Severity tag printed at the head of each line. */
const SEVERITY_TAGS: Record<DoctorSeverity, string> = {
  pass: chalk.green('[PASS]'),
  warn: chalk.yellow('[WARN]'),
  fail: chalk.red('[FAIL]'),
  skip: chalk.dim('[SKIP]'),
};

/** True when any check failed — the command's exit-code decision. Pure. */
export function DoctorHasFailures(report: DoctorReport): boolean {
  return report.Checks.some((check) => check.Severity === 'fail');
}

/** Counts each severity and states the exit-code consequence plainly. Pure. */
function renderSummary(report: DoctorReport): string {
  const countOf = (severity: DoctorSeverity): number => report.Checks.filter((check) => check.Severity === severity).length;
  const failed = countOf('fail');
  const summary = `${countOf('pass')} passed, ${countOf('warn')} warned, ${failed} failed, ${countOf('skip')} skipped`;
  if (failed === 0) return chalk.green(`${summary} — no failures.`);
  return chalk.red(`${summary} — doctor exits non-zero.`);
}

/** Renders a DoctorReport as the terminal report. Pure. */
export function RenderDoctor(report: DoctorReport): string {
  const lines: string[] = [
    chalk.bold(`Workspace doctor: ${report.ParentDir}`),
    chalk.dim(`  resolved from: ${DescribeDirSource(report.DirSource)}`),
    '',
  ];
  for (const check of report.Checks) {
    lines.push(`${SEVERITY_TAGS[check.Severity]} ${check.Name}: ${check.Detail}`);
  }
  lines.push('');
  lines.push(renderSummary(report));
  return lines.join('\n');
}
