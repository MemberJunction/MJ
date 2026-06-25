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
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import type { ManifestPackageEntry } from '../manifest/manifest-schema.js';

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
 * Validates a custom npm registry URL before it is interpolated into a shell command (B40).
 * Must be a well-formed http(s) URL and free of shell metacharacters / whitespace. This is
 * defense-in-depth — the value normally comes from a trusted manifest, but it ends up in an
 * `execSync` command string, so a malformed/hostile value must never reach the shell.
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

  // Only pass --registry for non-default registries. The standard npm registry
  // (https://registry.npmjs.org) is already the default, and passing it explicitly
  // overrides scoped registry + auth token settings in .npmrc, breaking private packages.
  const isCustomRegistry = registryUrl && !registryUrl.includes('registry.npmjs.org');

  // Defense-in-depth: the registry URL is interpolated into the execSync command string, so
  // validate it is a clean http(s) URL with no shell metacharacters before using it (B40).
  if (isCustomRegistry) {
    const validation = ValidateRegistryUrl(registryUrl!);
    if (!validation.Valid) {
      return { Success: false, Added: [], Removed: [], ErrorMessage: `Invalid custom registry URL: ${validation.Reason}` };
    }
  }

  try {
    let cmd: string;
    switch (pm) {
      case 'pnpm': {
        cmd = 'pnpm install';
        if (isCustomRegistry) cmd += ` --registry=${registryUrl}`;
        break;
      }
      case 'yarn': {
        cmd = 'yarn install';
        if (isCustomRegistry) cmd += ` --registry=${registryUrl}`;
        break;
      }
      default: {
        let flags = verbose ? '' : '--loglevel=warn';
        if (isCustomRegistry) flags += ` --registry=${registryUrl}`;
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
    case 'exact':
      return options.Version;
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
