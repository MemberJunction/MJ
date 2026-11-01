/**
 * Package management for MJ Open Apps.
 *
 * Adds/removes app packages to/from workspace package.json files and runs
 * the appropriate package manager install from the monorepo root.
 *
 * Provider-agnostic: supports npm, pnpm, and yarn with automatic detection.
 * Layout-agnostic: supports configurable workspace paths and multiple targets.
 * Version-agnostic: supports semver ranges, pnpm catalog:, and workspace:*.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { resolve, dirname, basename, join } from 'node:path';
import type { ManifestPackageEntry } from '../manifest/manifest-schema.js';
import { ResolveServerPackagePath, ResolveClientPackagePath } from './workspace-paths.js';

/** Supported package managers. */
export type PackageManagerType = 'npm' | 'pnpm' | 'yarn';

/**
 * Strategy for writing dependency versions into package.json.
 * - 'semver': Standard `^version` range (works everywhere)
 * - 'exact': Exact version pin with no range prefix (e.g., '1.0.7')
 * - 'catalog': pnpm `catalog:` protocol (requires pnpm-workspace.yaml catalog)
 * - 'workspace': pnpm/yarn `workspace:*` protocol (for local packages)
 * - 'auto': Detects from environment — uses 'catalog' if pnpm + catalog exists, else 'semver'
 */
export type VersionStrategy = 'semver' | 'exact' | 'catalog' | 'workspace' | 'auto';

/* Workspace-layout detection is shared with config-manager — see workspace-paths.ts (#3270). */

/**
 * A single workspace target for package operations.
 * Allows specifying multiple server/client targets for monorepos with several apps.
 */
export interface WorkspaceTarget {
  /** Path to workspace relative to RepoRoot */
  Path: string;
  /** Role: 'server' or 'client' — determines which manifest packages go here */
  Role: 'server' | 'client';
}

/**
 * Options for package operations.
 */
export interface PackageManagerOptions {
  /** Absolute path to the monorepo root */
  RepoRoot: string;
  /** Server packages to add/remove */
  ServerPackages: ManifestPackageEntry[];
  /** Client packages to add/remove */
  ClientPackages: ManifestPackageEntry[];
  /**
   * Shared packages — dependency DECLARATION is added to both server and client `package.json`,
   * deliberately not platform-routed. Declaring a dependency is not the same as bundling it: a
   * Node-only shared package may still need to be a declared client dependency for type-only
   * imports even though it must never be BUNDLED into the client. `dynamicPackages.client`
   * (see `GetClientPackagesFromManifest`) is what decides bundling, filtered by platform (#4428);
   * this list is not.
   */
  SharedPackages: ManifestPackageEntry[];
  /** Package version (used as the semver range for each package) */
  Version: string;
  /** Enable verbose output */
  Verbose?: boolean;
  /** Path to server workspace relative to RepoRoot (default: detected — 'packages/MJAPI' or 'apps/MJAPI') */
  ServerPackagePath?: string;
  /** Path to client workspace relative to RepoRoot (default: detected — 'packages/MJExplorer' or 'apps/MJExplorer') */
  ClientPackagePath?: string;
  /** Package manager to use (default: auto-detected from lockfile) */
  PackageManager?: PackageManagerType;
  /**
   * Version strategy for writing deps (default: 'auto').
   * 'auto' uses 'catalog' when pnpm + pnpm-workspace.yaml catalog section exists,
   * otherwise falls back to 'semver'.
   */
  VersionStrategy?: VersionStrategy;
  /**
   * Additional workspace targets beyond the default server/client pair.
   * Each target specifies a path and role. Packages are distributed by role.
   */
  AdditionalTargets?: WorkspaceTarget[];
  /**
   * Package names that must SURVIVE a removal because another installed app still declares
   * them (shared npm deps). Only honored by {@link RemoveAppPackages}: any package whose
   * name is in this list is skipped, so removing one app cannot strip a dependency a
   * surviving app needs to boot.
   */
  RetainPackages?: string[];
}

/**
 * Result of a package operation.
 */
export interface PackageOperationResult {
  /** Whether the operation succeeded */
  Success: boolean;
  /** Packages that were added */
  Added: string[];
  /** Packages that were removed */
  Removed: string[];
  /** Error message if the operation failed */
  ErrorMessage?: string;
  /** Where `install` actually ran (RunPackageInstall only). */
  InstallRoot?: string;
  /** Set when the install ran at an `mj dev workspace` parent instead of the repo itself (RunPackageInstall only). */
  DevWorkspaceParent?: string;
}

/**
 * Adds app packages to the appropriate workspace package.json files.
 *
 * Distributes packages by role:
 * - Server packages -> server workspace(s)
 * - Client packages -> client workspace(s)
 * - Shared packages -> all workspaces (dependency DECLARATION only — see `SharedPackages` on
 *   {@link PackageManagerOptions}; this is intentional, not a missed platform-routing call site)
 *
 * @param options - Package manager configuration
 * @returns Operation result
 */
export function AddAppPackages(options: PackageManagerOptions): PackageOperationResult {
  const added: string[] = [];
  const versionStr = resolveVersionString(options);
  // Original text of each package.json, taken before its first write, so a failure on a later
  // target puts the earlier ones back instead of leaving a half-written workspace (#3796).
  const snapshots = new Map<string, string>();

  try {
    const targets = buildTargetList(options);
    const serverPkgs = [...options.ServerPackages, ...options.SharedPackages];
    const clientPkgs = [...options.ClientPackages, ...options.SharedPackages];

    for (const target of targets) {
      const pkgs = target.Role === 'server' ? serverPkgs : clientPkgs;
      if (pkgs.length > 0) {
        const pkgJsonPath = resolve(options.RepoRoot, target.Path, 'package.json');
        SnapshotPackageJson(snapshots, pkgJsonPath);
        AddDependenciesToPackageJson(pkgJsonPath, pkgs, versionStr);
        added.push(...pkgs.map((p) => p.name));
      }
    }

    return { Success: true, Added: [...new Set(added)], Removed: [] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { Success: false, Added: [], Removed: [], ErrorMessage: `${message}${RestorePackageJsonSnapshots(snapshots)}` };
  }
}

/** Records a package.json's current text the first time it is about to be written. An unreadable file is left to the write to report. */
function SnapshotPackageJson(snapshots: Map<string, string>, pkgJsonPath: string): void {
  if (snapshots.has(pkgJsonPath)) return;
  try {
    snapshots.set(pkgJsonPath, readFileSync(pkgJsonPath, 'utf-8'));
  } catch {
    // nothing to restore — the parse in AddDependenciesToPackageJson throws the path-qualified error
  }
}

/**
 * Writes every snapshotted package.json back to its original text. Returns a sentence to append
 * to the failure message: which files were restored, or which could not be and need a hand edit.
 */
function RestorePackageJsonSnapshots(snapshots: Map<string, string>): string {
  if (snapshots.size === 0) return '';
  const unrestored: string[] = [];
  for (const [pkgJsonPath, original] of snapshots) {
    try {
      writeFileSync(pkgJsonPath, original, 'utf-8');
    } catch {
      unrestored.push(pkgJsonPath);
    }
  }
  if (unrestored.length === 0) return ` No package.json was changed (${snapshots.size} file(s) restored).`;
  return ` Could not restore ${unrestored.join(', ')}: remove the app's packages from its dependencies by hand.`;
}

/**
 * Removes app packages from the appropriate workspace package.json files.
 *
 * @param options - Package manager configuration
 * @returns Operation result
 */
export function RemoveAppPackages(options: PackageManagerOptions): PackageOperationResult {
  const removed: string[] = [];

  try {
    const targets = buildTargetList(options);
    // Never remove a package another installed app still declares — see RetainPackages.
    const retained = new Set(options.RetainPackages ?? []);
    const serverPkgs = [...options.ServerPackages, ...options.SharedPackages].filter((p) => !retained.has(p.name));
    const clientPkgs = [...options.ClientPackages, ...options.SharedPackages].filter((p) => !retained.has(p.name));

    for (const target of targets) {
      const pkgs = target.Role === 'server' ? serverPkgs : clientPkgs;
      if (pkgs.length > 0) {
        const pkgJsonPath = resolve(options.RepoRoot, target.Path, 'package.json');
        RemoveDependenciesFromPackageJson(pkgJsonPath, pkgs);
        removed.push(...pkgs.map((p) => p.name));
      }
    }

    return { Success: true, Added: [], Removed: [...new Set(removed)] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { Success: false, Added: [], Removed: removed, ErrorMessage: message };
  }
}

/**
 * Detects which package manager is in use by checking for lockfiles.
 */
export function DetectPackageManager(repoRoot: string): PackageManagerType {
  if (existsSync(resolve(repoRoot, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(resolve(repoRoot, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/** @deprecated Use {@link DetectPackageManager}. */
export function detectPackageManager(repoRoot: string): PackageManagerType {
  return DetectPackageManager(repoRoot);
}

/** The sentinel `mj dev workspace` writes at the parent directory that joins sibling repos into one pnpm workspace. */
export const DEV_WORKSPACE_SENTINEL = '.mj-dev-workspace.json';

/** Where a package install must run, and with what. */
export interface InstallRootResolution {
  /** Directory to run `install` in. */
  Root: string;
  PackageManager: PackageManagerType;
  /** Set when Root is an `mj dev workspace` parent the repo is a member of. */
  DevWorkspaceParent?: string;
}

/**
 * Decides where `install` runs. Normally the repo root, with its own package manager.
 *
 * When the repo is a MEMBER of an `mj dev workspace` — its parent directory carries the
 * generator's sentinel naming this directory, next to the parent's `pnpm-workspace.yaml` —
 * the install belongs to the parent: pnpm treats a member that has its own
 * `pnpm-workspace.yaml` as a root, so an in-place install silently creates a second,
 * standalone store beside the parent's links (split singletons, and the app's packages
 * resolved from the registry instead of the sibling checkout the workspace links). Field
 * `mj app install` inside the MJ member does exactly that.
 */
export function ResolveInstallRoot(repoRoot: string, packageManager?: PackageManagerType): InstallRootResolution {
  const parent = dirname(repoRoot);
  const sentinelPath = join(parent, DEV_WORKSPACE_SENTINEL);
  if (parent !== repoRoot && existsSync(sentinelPath) && existsSync(join(parent, 'pnpm-workspace.yaml'))) {
    try {
      const sentinel = JSON.parse(readFileSync(sentinelPath, 'utf-8')) as { generatedBy?: unknown; members?: unknown };
      if (sentinel.generatedBy === 'mj dev workspace' && Array.isArray(sentinel.members) && sentinel.members.includes(basename(repoRoot))) {
        return { Root: parent, PackageManager: 'pnpm', DevWorkspaceParent: parent };
      }
    } catch {
      // an unreadable sentinel is not a workspace claim — install in the repo itself
    }
  }
  return { Root: repoRoot, PackageManager: packageManager ?? DetectPackageManager(repoRoot) };
}

/**
 * Checks if the pnpm-workspace.yaml has a catalog section.
 * Returns true if there's a `catalog:` or `catalogs:` key in the file.
 */
export function HasPnpmCatalog(repoRoot: string): boolean {
  const wsPath = resolve(repoRoot, 'pnpm-workspace.yaml');
  if (!existsSync(wsPath)) return false;
  try {
    const content = readFileSync(wsPath, 'utf-8');
    return /^catalogs?:/m.test(content);
  } catch {
    return false;
  }
}

/** @deprecated Use {@link HasPnpmCatalog}. */
export function hasPnpmCatalog(repoRoot: string): boolean {
  return HasPnpmCatalog(repoRoot);
}

/**
 * Validates a custom npm registry URL before it is passed to the package manager (B40).
 * Must be a well-formed http(s) URL and free of shell metacharacters / whitespace. The install
 * itself now runs via `execFileSync` with an argv array (no shell), so this is defense-in-depth
 * — it still rejects a malformed URL / wrong protocol before it reaches the package manager.
 */
function ValidateRegistryUrl(url: string): { Valid: boolean; Reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { Valid: false, Reason: `'${url}' is not a valid URL` };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { Valid: false, Reason: `registry URL must use http(s), got '${parsed.protocol}'` };
  }
  // URL parsing tolerates some shell-significant characters in the path/query; reject them
  // explicitly since the value is interpolated into a command string.
  if (/[;&|`$(){}<>\s'"\\]/.test(url)) {
    return { Valid: false, Reason: 'registry URL contains illegal characters' };
  }
  return { Valid: true };
}

/**
 * True when `url` points at the public npm registry itself. Compares the parsed host — a
 * substring test would also accept `https://evil.example/registry.npmjs.org` and
 * `https://registry.npmjs.org.evil.example`. An unparseable URL is not the default, so it goes
 * on to {@link ValidateRegistryUrl}, which rejects it.
 */
export function IsDefaultNpmRegistry(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === 'registry.npmjs.org';
  } catch {
    return false;
  }
}

/** Default ceiling for one package install run by the app engine: 30 minutes. */
export const DEFAULT_PACKAGE_INSTALL_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Environment variable that overrides {@link DEFAULT_PACKAGE_INSTALL_TIMEOUT_MS}, in milliseconds.
 * A first install on a cold package store or a slow registry can legitimately take many minutes;
 * an app whose packages were not installed is left Disabled, so a ceiling that is too low turns a
 * slow-but-healthy install into a broken one.
 */
export const PACKAGE_INSTALL_TIMEOUT_ENV_VAR = 'MJ_APP_PACKAGE_INSTALL_TIMEOUT_MS';

/** Resolves the package-install timeout: the env override when it is a positive number, else the default. */
export function ResolvePackageInstallTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[PACKAGE_INSTALL_TIMEOUT_ENV_VAR];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PACKAGE_INSTALL_TIMEOUT_MS;
}

/** What one package install will run, worked out before anything is spawned. */
interface PackageInstallPlan {
  Target: ReturnType<typeof ResolveInstallRoot>;
  Bin: string;
  Argv: string[];
}

/**
 * Builds the install command: resolves where it runs and with which package manager, and
 * validates a custom registry. Returns an error message instead of a plan when the registry is bad.
 */
function BuildPackageInstallPlan(
  repoRoot: string,
  verbose: boolean | undefined,
  registryUrl: string | undefined,
  packageManager: PackageManagerType | undefined,
): PackageInstallPlan | { ErrorMessage: string } {
  const target = ResolveInstallRoot(repoRoot, packageManager);
  const pm = target.PackageManager;

  // Only pass --registry for non-default registries. The standard npm registry
  // (https://registry.npmjs.org) is already the default, and passing it explicitly
  // overrides scoped registry + auth token settings in .npmrc, breaking private packages.
  const isCustomRegistry = !!registryUrl && !IsDefaultNpmRegistry(registryUrl);

  // Defense-in-depth: validate the registry URL is a clean http(s) URL before using it. It is
  // passed as a literal argv element (no shell), but a malformed URL / wrong protocol is
  // still worth rejecting up front (B40).
  if (isCustomRegistry) {
    const validation = ValidateRegistryUrl(registryUrl!);
    if (!validation.Valid) {
      return { ErrorMessage: `Invalid custom registry URL: ${validation.Reason}` };
    }
  }

  // The argv is an ARRAY run with no shell, so the registry URL — and every other argument —
  // is a single literal element that a shell can never interpret (B40). On Windows the
  // package-manager binaries are `.cmd` shims, which only resolve when the name carries the extension.
  const argv: string[] = ['install'];
  if (pm === 'npm' && !verbose) argv.push('--loglevel=warn');
  if (isCustomRegistry) argv.push(`--registry=${registryUrl}`);
  // All package managers natively read .npmrc / .pnpmrc / .yarnrc.yml for scoped registries,
  // auth tokens, and other settings — running in the right `cwd` is all they need.
  return { Target: target, Bin: process.platform === 'win32' ? `${pm}.cmd` : pm, Argv: argv };
}

function InstallSucceeded(target: PackageInstallPlan['Target']): PackageOperationResult {
  return { Success: true, Added: [], Removed: [], InstallRoot: target.Root, DevWorkspaceParent: target.DevWorkspaceParent };
}

function InstallFailed(message: string, target?: PackageInstallPlan['Target']): PackageOperationResult {
  return { Success: false, Added: [], Removed: [], ErrorMessage: message, InstallRoot: target?.Root, DevWorkspaceParent: target?.DevWorkspaceParent };
}

/**
 * Runs package install from the monorepo root using the appropriate package manager —
 * or, when the repo is a member of an `mj dev workspace`, from that workspace's parent
 * with pnpm (see {@link ResolveInstallRoot}); the result says where it ran.
 *
 * Registry configuration is resolved in this order:
 * 1. Explicit `registryUrl` parameter (passed from manifest)
 * 2. Scoped registry from .npmrc / .pnpmrc (automatic — package managers read these natively)
 * 3. Default registry for the package manager
 *
 * Synchronous: it blocks the calling thread until the install finishes. Long-running hosts
 * (the install orchestrator, anything holding database connections) should use
 * {@link RunPackageInstallAsync}, which keeps the event loop free.
 *
 * @param repoRoot - Absolute path to the monorepo root
 * @param verbose - Enable verbose output
 * @param registryUrl - Optional custom registry URL (overrides .npmrc/.pnpmrc for this run)
 * @param packageManager - Package manager to use (auto-detected if not provided)
 */
export function RunPackageInstall(repoRoot: string, verbose?: boolean, registryUrl?: string, packageManager?: PackageManagerType): PackageOperationResult {
  const plan = BuildPackageInstallPlan(repoRoot, verbose, registryUrl, packageManager);
  if ('ErrorMessage' in plan) return InstallFailed(plan.ErrorMessage);
  try {
    execFileSync(plan.Bin, plan.Argv, {
      cwd: plan.Target.Root,
      encoding: 'utf-8',
      timeout: ResolvePackageInstallTimeoutMs(),
      stdio: verbose ? 'inherit' : 'pipe',
    });
    return InstallSucceeded(plan.Target);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return InstallFailed(`${plan.Target.PackageManager} install failed: ${message}`, plan.Target);
  }
}

/** How much of the installer's stderr to keep for the error message. */
const STDERR_TAIL_CHARS = 4000;

/**
 * Async form of {@link RunPackageInstall}: same command, same result, but the package manager
 * runs as a child process the event loop keeps servicing.
 *
 * The synchronous form froze the whole host for the length of the install — every timer,
 * socket and in-flight database request stalled with it. Inside `mj app install` a dependency
 * chain runs one install per app, and a first install on a cold store can take many minutes.
 *
 * @param timeoutMs - Ceiling for the run; defaults to {@link ResolvePackageInstallTimeoutMs}.
 */
export async function RunPackageInstallAsync(
  repoRoot: string,
  verbose?: boolean,
  registryUrl?: string,
  packageManager?: PackageManagerType,
  timeoutMs: number = ResolvePackageInstallTimeoutMs(),
): Promise<PackageOperationResult> {
  const plan = BuildPackageInstallPlan(repoRoot, verbose, registryUrl, packageManager);
  if ('ErrorMessage' in plan) return InstallFailed(plan.ErrorMessage);
  const outcome = await RunChildProcess(plan.Bin, plan.Argv, plan.Target.Root, verbose === true, timeoutMs);
  if (outcome.Kind === 'ok') return InstallSucceeded(plan.Target);
  const pm = plan.Target.PackageManager;
  if (outcome.Kind === 'spawn-error') return InstallFailed(`${pm} install could not start: ${outcome.Message}`, plan.Target);
  const detail = outcome.StderrTail ? `\n${outcome.StderrTail}` : '';
  switch (outcome.Kind) {
    case 'timeout':
      return InstallFailed(
        `${pm} install did not finish within ${Math.round(timeoutMs / 60000)} minute(s) and was stopped. ` +
          `Run '${pm} install' in ${plan.Target.Root} to finish it, or raise ${PACKAGE_INSTALL_TIMEOUT_ENV_VAR}.${detail}`,
        plan.Target,
      );
    default:
      return InstallFailed(`${pm} install failed (exit code ${outcome.ExitCode ?? 'unknown'}).${detail}`, plan.Target);
  }
}

type ChildProcessOutcome =
  | { Kind: 'ok'; Stdout: string }
  | { Kind: 'exit'; ExitCode: number | null; StderrTail: string; Stdout: string }
  | { Kind: 'timeout'; StderrTail: string }
  | { Kind: 'spawn-error'; Message: string };

/**
 * Spawns a command (no shell) and resolves when it exits, is stopped by the timeout, or fails
 * to start. Output streams to the console when verbose; stderr's tail is kept either way.
 * With `captureStdout`, stdout is collected (its tail) instead of streamed or discarded.
 */
function RunChildProcess(bin: string, argv: string[], cwd: string, verbose: boolean, timeoutMs: number, captureStdout = false): Promise<ChildProcessOutcome> {
  return new Promise((resolvePromise) => {
    let stderrTail = '';
    let stdoutTail = '';
    let timedOut = false;
    let settled = false;
    const finish = (outcome: ChildProcessOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(outcome);
    };
    const child = spawn(bin, argv, { cwd, stdio: ['ignore', captureStdout ? 'pipe' : verbose ? 'inherit' : 'ignore', 'pipe'] });
    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutTail = (stdoutTail + chunk.toString('utf-8')).slice(-STDERR_TAIL_CHARS);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (verbose) process.stderr.write(chunk);
      stderrTail = (stderrTail + chunk.toString('utf-8')).slice(-STDERR_TAIL_CHARS);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.on('error', (error: Error) => finish({ Kind: 'spawn-error', Message: error.message }));
    child.on('close', (code: number | null) => {
      if (timedOut) finish({ Kind: 'timeout', StderrTail: stderrTail.trim() });
      else if (code === 0) finish({ Kind: 'ok', Stdout: stdoutTail.trim() });
      else finish({ Kind: 'exit', ExitCode: code, StderrTail: stderrTail.trim(), Stdout: stdoutTail.trim() });
    });
  });
}

/**
 * @deprecated Use {@link RunPackageInstall} instead.
 */
export function RunNpmInstall(repoRoot: string, verbose?: boolean, registryUrl?: string): PackageOperationResult {
  return RunPackageInstall(repoRoot, verbose, registryUrl, 'npm');
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry preflight (#3796, #5517)
// ─────────────────────────────────────────────────────────────────────────────

/** Ceiling for one `npm view` registry check. */
export const PACKAGE_PREFLIGHT_TIMEOUT_MS = 60 * 1000;

/**
 * Outcome of checking one package against the registry:
 * - 'OK': the registry has a version matching the spec
 * - 'AuthFailed': the registry answered 401/403, or npm has no credentials for it
 * - 'NotPublished': 404 — the name or a matching version is not published, or this login cannot see it
 * - 'Unknown': the check itself could not complete (network, timeout, npm missing)
 */
export type PackagePreflightStatus = 'OK' | 'AuthFailed' | 'NotPublished' | 'Unknown';

/** One package's registry check. */
export interface PackagePreflightCheck {
  /** What was asked of the registry: `name@range`, or the bare name for the catalog strategy */
  Spec: string;
  Status: PackagePreflightStatus;
  /** npm's error output, when the check did not pass */
  Detail?: string;
}

/** Options for {@link PreflightAppPackages}. Same fields as an install, so the check asks for what will be written. */
export type PackagePreflightOptions = Pick<
  PackageManagerOptions,
  'RepoRoot' | 'ServerPackages' | 'ClientPackages' | 'SharedPackages' | 'Version' | 'PackageManager' | 'VersionStrategy'
> & {
  /** Custom registry from the manifest, passed to `npm view` as it is to the install */
  RegistryUrl?: string;
  /** Per-check ceiling (default {@link PACKAGE_PREFLIGHT_TIMEOUT_MS}) */
  TimeoutMs?: number;
};

/** Result of {@link PreflightAppPackages}. */
export interface PackagePreflightResult {
  /** False when any package failed auth or is not published — the caller must stop before changing anything */
  Success: boolean;
  Checks: PackagePreflightCheck[];
  /** Why the check did not run (workspace strategy, `mj dev workspace` member) */
  SkippedReason?: string;
  /** Checks that could not complete; they do not fail the preflight */
  Warnings: string[];
  ErrorMessage?: string;
}

/**
 * Checks every package an install or upgrade will write into package.json against the registry,
 * BEFORE anything changes: `npm view <name>@<range> version --json`, run as an argv array in the
 * repo root so `.npmrc` scoped registries and tokens apply exactly as they will for the install.
 *
 * An expired token or an unpublished package otherwise surfaces only after package.json, the
 * config files and (on upgrade) the schema have already moved (#3796, #5517).
 *
 * Skipped for the 'workspace' strategy (packages come from the workspace, not a registry) and when
 * the repo is a member of an `mj dev workspace` (the parent links sibling checkouts).
 */
export async function PreflightAppPackages(options: PackagePreflightOptions): Promise<PackagePreflightResult> {
  const skippedReason = PreflightSkipReason(options);
  if (skippedReason) return { Success: true, Checks: [], SkippedReason: skippedReason, Warnings: [] };

  const registryArgs = BuildPreflightRegistryArgs(options.RegistryUrl);
  if ('ErrorMessage' in registryArgs) return { Success: false, Checks: [], Warnings: [], ErrorMessage: registryArgs.ErrorMessage };

  const versionStr = resolveVersionString(options);
  const names = [...new Set([...options.ServerPackages, ...options.ClientPackages, ...options.SharedPackages].map((p) => p.name))];
  const specs = names.map((name) => (versionStr === 'catalog:' ? name : `${name}@${versionStr}`));
  const timeoutMs = options.TimeoutMs ?? PACKAGE_PREFLIGHT_TIMEOUT_MS;
  const checks = await Promise.all(specs.map((spec) => CheckPackageInRegistry(spec, options.RepoRoot, registryArgs.Args, timeoutMs)));
  return SummarizePreflight(checks);
}

/** Returns why the preflight does not apply, or undefined when it should run. */
function PreflightSkipReason(options: PackagePreflightOptions): string | undefined {
  if (options.VersionStrategy === 'workspace') return "the 'workspace' version strategy resolves packages from the workspace, not a registry";
  const root = ResolveInstallRoot(options.RepoRoot, options.PackageManager);
  if (root.DevWorkspaceParent) return `this repo is a member of the mj dev workspace at ${root.DevWorkspaceParent}, which links sibling checkouts`;
  return undefined;
}

/** `--registry` for a custom, valid registry; nothing for the default one (so .npmrc scopes still apply). */
function BuildPreflightRegistryArgs(registryUrl: string | undefined): { Args: string[] } | { ErrorMessage: string } {
  if (!registryUrl || IsDefaultNpmRegistry(registryUrl)) return { Args: [] };
  const validation = ValidateRegistryUrl(registryUrl);
  if (!validation.Valid) return { ErrorMessage: `Invalid custom registry URL: ${validation.Reason}` };
  return { Args: [`--registry=${registryUrl}`] };
}

/** Runs `npm view <spec> version --json` and classifies the outcome. */
async function CheckPackageInRegistry(spec: string, repoRoot: string, registryArgs: string[], timeoutMs: number): Promise<PackagePreflightCheck> {
  const bin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const outcome = await RunChildProcess(bin, ['view', spec, 'version', '--json', ...registryArgs], repoRoot, false, timeoutMs, true);
  switch (outcome.Kind) {
    case 'ok':
      // Older npm exits 0 with no output when no published version matches the range.
      return IsEmptyNpmViewOutput(outcome.Stdout) ? { Spec: spec, Status: 'NotPublished', Detail: 'no published version matches' } : { Spec: spec, Status: 'OK' };
    case 'exit':
      return { Spec: spec, Status: ClassifyNpmViewFailure(`${outcome.Stdout}\n${outcome.StderrTail}`), Detail: FirstNpmErrorLine(outcome.StderrTail, outcome.Stdout) };
    case 'timeout':
      return { Spec: spec, Status: 'Unknown', Detail: `npm view did not answer within ${Math.round(timeoutMs / 1000)}s` };
    default:
      return { Spec: spec, Status: 'Unknown', Detail: `npm could not start: ${outcome.Message}` };
  }
}

function IsEmptyNpmViewOutput(stdout: string): boolean {
  const text = stdout.trim();
  return text === '' || text === '[]' || text === '""';
}

/**
 * Classifies a failed `npm view` from its output. npm reports the HTTP status as an error code
 * (`E401`, `E403`, `E404`) both in its `--json` error object and on stderr; `ENEEDAUTH` means no
 * credentials are configured for the registry at all.
 */
export function ClassifyNpmViewFailure(output: string): PackagePreflightStatus {
  if (/\bE40[13]\b|\bENEEDAUTH\b/.test(output)) return 'AuthFailed';
  if (/\bE404\b/.test(output)) return 'NotPublished';
  return 'Unknown';
}

/** The `--json` error summary when present, else the first stderr line, for the message. */
function FirstNpmErrorLine(stderr: string, stdout: string): string | undefined {
  const summary = /"summary":\s*"((?:[^"\\]|\\.)*)"/.exec(stdout)?.[1];
  if (summary) return summary;
  return stderr.split('\n').map((line) => line.trim()).find((line) => line.length > 0);
}

/** Builds the overall result: auth failures first (they explain any 404s too), then unpublished packages. */
function SummarizePreflight(checks: PackagePreflightCheck[]): PackagePreflightResult {
  const warnings = checks
    .filter((c) => c.Status === 'Unknown')
    .map((c) => `Could not verify ${c.Spec} against the registry (${c.Detail ?? 'unknown error'}); continuing — the package install will report a real problem.`);
  const authFailed = checks.filter((c) => c.Status === 'AuthFailed');
  const notPublished = checks.filter((c) => c.Status === 'NotPublished');
  if (authFailed.length > 0) {
    return { Success: false, Checks: checks, Warnings: warnings, ErrorMessage: DescribeAuthFailure(authFailed) };
  }
  if (notPublished.length > 0) {
    return { Success: false, Checks: checks, Warnings: warnings, ErrorMessage: DescribeNotPublished(notPublished) };
  }
  return { Success: true, Checks: checks, Warnings: warnings };
}

function DescribeAuthFailure(checks: PackagePreflightCheck[]): string {
  const scopes = [...new Set(checks.map((c) => ScopeOf(c.Spec)).filter((s): s is string => s !== undefined))];
  const scopeHint = scopes.length > 0 ? ` (scope ${scopes.join(', ')})` : '';
  return (
    `npm authentication failed for ${checks.map((c) => c.Spec).join(', ')}${scopeHint}: ${checks[0].Detail ?? 'the registry refused the credentials'}. ` +
    `Run 'npm login' for the registry that serves these packages (an expired or missing token in .npmrc is the usual cause) and retry. Nothing has been changed.`
  );
}

function DescribeNotPublished(checks: PackagePreflightCheck[]): string {
  return (
    `These app packages are not published at the requested version, or this npm login cannot see them (the registry answers 404 for both): ` +
    `${checks.map((c) => `${c.Spec}${c.Detail ? ` (${c.Detail})` : ''}`).join('; ')}. ` +
    `Publish them, or check the npm login and registry settings in .npmrc, then retry. Nothing has been changed.`
  );
}

/** `@scope` of a scoped package spec, else undefined. */
function ScopeOf(spec: string): string | undefined {
  return spec.startsWith('@') ? spec.split('/')[0] : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the full list of workspace targets from options.
 * Combines the primary server/client paths with any additional targets.
 */
function buildTargetList(options: PackageManagerOptions): WorkspaceTarget[] {
  const targets: WorkspaceTarget[] = [
    { Path: ResolveServerPackagePath(options.RepoRoot, options.ServerPackagePath), Role: 'server' },
    { Path: ResolveClientPackagePath(options.RepoRoot, options.ClientPackagePath), Role: 'client' },
  ];

  if (options.AdditionalTargets) {
    targets.push(...options.AdditionalTargets);
  }

  return targets;
}

/**
 * Resolves the version string to write into package.json based on the strategy.
 */
function resolveVersionString(options: Pick<PackageManagerOptions, 'RepoRoot' | 'Version' | 'PackageManager' | 'VersionStrategy'>): string {
  const strategy = options.VersionStrategy ?? 'auto';

  switch (strategy) {
    case 'exact':
      return options.Version;
    case 'catalog':
      return 'catalog:';
    case 'workspace':
      return 'workspace:*';
    case 'auto': {
      const pm = options.PackageManager ?? DetectPackageManager(options.RepoRoot);
      if (pm === 'pnpm' && HasPnpmCatalog(options.RepoRoot)) {
        return 'catalog:';
      }
      return `^${options.Version}`;
    }
    case 'semver':
    default:
      return `^${options.Version}`;
  }
}

/**
 * Reads and parses a package.json, turning an opaque ENOENT / SyntaxError into a clear,
 * path-qualified error (B39). The raw `JSON.parse(readFileSync(...))` calls this replaced
 * surfaced "Unexpected token in JSON" with no indication of which file was malformed.
 */
function ParsePackageJson<T>(pkgJsonPath: string): T {
  let content: string;
  try {
    content = readFileSync(pkgJsonPath, 'utf-8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read package.json at ${pkgJsonPath}: ${message}`);
  }
  try {
    return JSON.parse(content) as T;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${pkgJsonPath}: ${message}`);
  }
}

/**
 * Adds dependencies to a specific package.json file.
 */
function AddDependenciesToPackageJson(pkgJsonPath: string, packages: ManifestPackageEntry[], versionStr: string): void {
  const pkgJson = ParsePackageJson<{ dependencies?: Record<string, string> }>(pkgJsonPath);

  if (!pkgJson.dependencies) {
    pkgJson.dependencies = {};
  }

  for (const pkg of packages) {
    pkgJson.dependencies[pkg.name] = versionStr;
  }

  writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8');
}

/**
 * Removes dependencies from a specific package.json file.
 */
function RemoveDependenciesFromPackageJson(pkgJsonPath: string, packages: ManifestPackageEntry[]): void {
  const pkgJson = ParsePackageJson<{ dependencies?: Record<string, string> }>(pkgJsonPath);

  if (!pkgJson.dependencies) {
    return;
  }

  for (const pkg of packages) {
    delete pkgJson.dependencies[pkg.name];
  }

  writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8');
}

/**
 * Bumps all dependencies matching a package prefix across every package.json in the workspace.
 * This ensures that consumer-added packages (not declared in the manifest) are also updated
 * during install/upgrade when an explicit version is requested.
 *
 * Preserves existing range prefixes: if a dependency is currently "^1.0.6", it becomes
 * "^1.0.7" (not "1.0.7"). Same for ~ and other semver range prefixes.
 *
 * @param repoRoot - Absolute path to the monorepo root
 * @param prefix - npm package prefix to match (e.g., '@bluecypress/bcsaas-')
 * @param bareVersion - The bare version number without range prefix (e.g., '1.0.7')
 * @returns Number of package.json files that were updated
 */
export function BumpPrefixedDependencies(repoRoot: string, prefix: string, bareVersion: string): number {
  const packageJsonFiles = findWorkspacePackageJsonFiles(repoRoot);
  let updatedCount = 0;

  for (const pkgJsonPath of packageJsonFiles) {
    const pkgJson = ParsePackageJson<{
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }>(pkgJsonPath);

    let fileChanged = false;

    for (const section of [pkgJson.dependencies, pkgJson.devDependencies]) {
      if (!section) continue;
      for (const depName of Object.keys(section)) {
        if (!depName.startsWith(prefix)) continue;

        const currentValue = section[depName];
        // Extract existing range prefix (^, ~, >=, etc.) and preserve it
        const rangePrefix = currentValue.match(/^([^\d]*)/)?.[1] ?? '';
        const newValue = `${rangePrefix}${bareVersion}`;

        if (currentValue !== newValue) {
          section[depName] = newValue;
          fileChanged = true;
        }
      }
    }

    if (fileChanged) {
      writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8');
      updatedCount++;
    }
  }

  return updatedCount;
}

/**
 * Finds all package.json files in a monorepo workspace, excluding node_modules and dist.
 */
function findWorkspacePackageJsonFiles(repoRoot: string): string[] {
  const results: string[] = [];
  const rootPkg = resolve(repoRoot, 'package.json');
  if (existsSync(rootPkg)) {
    results.push(rootPkg);
  }

  // Read workspace globs from root package.json
  try {
    const rootContent: { workspaces?: string[] | { packages?: string[] } } =
      JSON.parse(readFileSync(rootPkg, 'utf-8'));
    const globs = Array.isArray(rootContent.workspaces)
      ? rootContent.workspaces
      : rootContent.workspaces?.packages ?? [];

    for (const glob of globs) {
      // Support simple globs like "packages/*" and "apps/*"
      const baseDir = resolve(repoRoot, glob.replace(/\/?\*.*$/, ''));
      if (!existsSync(baseDir)) continue;

      const entries: string[] = readdirSync(baseDir);
      for (const entry of entries) {
        const pkgPath = resolve(baseDir, entry, 'package.json');
        if (existsSync(pkgPath)) {
          results.push(pkgPath);
        }
      }
    }
  } catch {
    // If we can't read workspaces, just return the root
  }

  return results;
}
