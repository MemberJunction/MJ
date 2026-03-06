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
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import type { ManifestPackageEntry } from '../manifest/manifest-schema.js';

/** Supported package managers. */
export type PackageManagerType = 'npm' | 'pnpm' | 'yarn';

/**
 * Strategy for writing dependency versions into package.json.
 * - 'semver': Standard `^version` range (works everywhere)
 * - 'catalog': pnpm `catalog:` protocol (requires pnpm-workspace.yaml catalog)
 * - 'workspace': pnpm/yarn `workspace:*` protocol (for local packages)
 * - 'auto': Detects from environment — uses 'catalog' if pnpm + catalog exists, else 'semver'
 */
export type VersionStrategy = 'semver' | 'catalog' | 'workspace' | 'auto';

const DEFAULT_SERVER_PATH = 'packages/MJAPI';
const DEFAULT_CLIENT_PATH = 'packages/MJExplorer';

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
  /** Shared packages (added to both server and client) */
  SharedPackages: ManifestPackageEntry[];
  /** Package version (used as the semver range for each package) */
  Version: string;
  /** Enable verbose output */
  Verbose?: boolean;
  /** Path to server workspace relative to RepoRoot (default: 'packages/MJAPI') */
  ServerPackagePath?: string;
  /** Path to client workspace relative to RepoRoot (default: 'packages/MJExplorer') */
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
}

/**
 * Adds app packages to the appropriate workspace package.json files.
 *
 * Distributes packages by role:
 * - Server packages -> server workspace(s)
 * - Client packages -> client workspace(s)
 * - Shared packages -> all workspaces
 *
 * @param options - Package manager configuration
 * @returns Operation result
 */
export function AddAppPackages(options: PackageManagerOptions): PackageOperationResult {
  const added: string[] = [];
  const versionStr = resolveVersionString(options);

  try {
    const targets = buildTargetList(options);
    const serverPkgs = [...options.ServerPackages, ...options.SharedPackages];
    const clientPkgs = [...options.ClientPackages, ...options.SharedPackages];

    for (const target of targets) {
      const pkgs = target.Role === 'server' ? serverPkgs : clientPkgs;
      if (pkgs.length > 0) {
        const pkgJsonPath = resolve(options.RepoRoot, target.Path, 'package.json');
        AddDependenciesToPackageJson(pkgJsonPath, pkgs, versionStr);
        added.push(...pkgs.map((p) => p.name));
      }
    }

    return { Success: true, Added: [...new Set(added)], Removed: [] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { Success: false, Added: added, Removed: [], ErrorMessage: message };
  }
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
    const serverPkgs = [...options.ServerPackages, ...options.SharedPackages];
    const clientPkgs = [...options.ClientPackages, ...options.SharedPackages];

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
export function detectPackageManager(repoRoot: string): PackageManagerType {
  if (existsSync(resolve(repoRoot, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(resolve(repoRoot, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/**
 * Checks if the pnpm-workspace.yaml has a catalog section.
 * Returns true if there's a `catalog:` or `catalogs:` key in the file.
 */
export function hasPnpmCatalog(repoRoot: string): boolean {
  const wsPath = resolve(repoRoot, 'pnpm-workspace.yaml');
  if (!existsSync(wsPath)) return false;
  try {
    const content = readFileSync(wsPath, 'utf-8');
    return /^catalogs?:/m.test(content);
  } catch {
    return false;
  }
}

/**
 * Runs package install from the monorepo root using the appropriate package manager.
 *
 * Registry configuration is resolved in this order:
 * 1. Explicit `registryUrl` parameter (passed from manifest)
 * 2. Scoped registry from .npmrc / .pnpmrc (automatic — package managers read these natively)
 * 3. Default registry for the package manager
 *
 * @param repoRoot - Absolute path to the monorepo root
 * @param verbose - Enable verbose output
 * @param registryUrl - Optional custom registry URL (overrides .npmrc/.pnpmrc for this run)
 * @param packageManager - Package manager to use (auto-detected if not provided)
 */
export function RunPackageInstall(repoRoot: string, verbose?: boolean, registryUrl?: string, packageManager?: PackageManagerType): PackageOperationResult {
  const pm = packageManager ?? detectPackageManager(repoRoot);

  try {
    let cmd: string;
    switch (pm) {
      case 'pnpm': {
        cmd = 'pnpm install';
        if (registryUrl) cmd += ` --registry=${registryUrl}`;
        break;
      }
      case 'yarn': {
        cmd = 'yarn install';
        if (registryUrl) cmd += ` --registry=${registryUrl}`;
        break;
      }
      default: {
        let flags = verbose ? '' : '--loglevel=warn';
        if (registryUrl) flags += ` --registry=${registryUrl}`;
        cmd = `npm install ${flags}`;
        break;
      }
    }

    // All package managers natively read .npmrc / .pnpmrc / .yarnrc.yml for
    // scoped registries, auth tokens, and other settings. We don't need to
    // parse these files — just ensure `cwd` is set correctly so they're found.
    execSync(cmd, {
      cwd: repoRoot,
      encoding: 'utf-8',
      timeout: 300000,
      stdio: verbose ? 'inherit' : 'pipe',
    });
    return { Success: true, Added: [], Removed: [] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { Success: false, Added: [], Removed: [], ErrorMessage: `${pm} install failed: ${message}` };
  }
}

/**
 * @deprecated Use {@link RunPackageInstall} instead.
 */
export function RunNpmInstall(repoRoot: string, verbose?: boolean, registryUrl?: string): PackageOperationResult {
  return RunPackageInstall(repoRoot, verbose, registryUrl, 'npm');
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
    { Path: options.ServerPackagePath ?? DEFAULT_SERVER_PATH, Role: 'server' },
    { Path: options.ClientPackagePath ?? DEFAULT_CLIENT_PATH, Role: 'client' },
  ];

  if (options.AdditionalTargets) {
    targets.push(...options.AdditionalTargets);
  }

  return targets;
}

/**
 * Resolves the version string to write into package.json based on the strategy.
 */
function resolveVersionString(options: PackageManagerOptions): string {
  const strategy = options.VersionStrategy ?? 'auto';

  switch (strategy) {
    case 'catalog':
      return 'catalog:';
    case 'workspace':
      return 'workspace:*';
    case 'auto': {
      const pm = options.PackageManager ?? detectPackageManager(options.RepoRoot);
      if (pm === 'pnpm' && hasPnpmCatalog(options.RepoRoot)) {
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
 * Adds dependencies to a specific package.json file.
 */
function AddDependenciesToPackageJson(pkgJsonPath: string, packages: ManifestPackageEntry[], versionStr: string): void {
  const content = readFileSync(pkgJsonPath, 'utf-8');
  const pkgJson = JSON.parse(content) as { dependencies?: Record<string, string> };

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
  const content = readFileSync(pkgJsonPath, 'utf-8');
  const pkgJson = JSON.parse(content) as { dependencies?: Record<string, string> };

  if (!pkgJson.dependencies) {
    return;
  }

  for (const pkg of packages) {
    delete pkgJson.dependencies[pkg.name];
  }

  writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8');
}
