/**
 * Package management for MJ Open Apps.
 *
 * Adds/removes app packages to/from the correct workspace package.json
 * files and runs the appropriate package manager install from the monorepo root.
 *
 * Paths to the server (MJAPI) and client (MJExplorer) workspaces are configurable
 * via PackageManagerOptions to support different project layouts (e.g., MJ template
 * uses packages/MJAPI while MJC platform uses apps/MJAPI).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { ManifestPackageEntry } from '../manifest/manifest-schema.js';

/** Supported package managers. */
export type PackageManagerType = 'npm' | 'pnpm' | 'yarn';

const DEFAULT_SERVER_PATH = 'packages/MJAPI';
const DEFAULT_CLIENT_PATH = 'packages/MJExplorer';

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
 * Server packages -> packages/MJAPI/package.json
 * Client packages -> packages/MJExplorer/package.json
 * Shared packages -> both
 *
 * @param options - Package manager configuration
 * @returns Operation result
 */
export function AddAppPackages(options: PackageManagerOptions): PackageOperationResult {
  const added: string[] = [];
  const serverPath = options.ServerPackagePath ?? DEFAULT_SERVER_PATH;
  const clientPath = options.ClientPackagePath ?? DEFAULT_CLIENT_PATH;

  try {
    const serverPkgs = [...options.ServerPackages, ...options.SharedPackages];
    const clientPkgs = [...options.ClientPackages, ...options.SharedPackages];

    if (serverPkgs.length > 0) {
      const serverPkgJsonPath = resolve(options.RepoRoot, serverPath, 'package.json');
      AddDependenciesToPackageJson(serverPkgJsonPath, serverPkgs, options.Version);
      added.push(...serverPkgs.map((p) => p.name));
    }

    if (clientPkgs.length > 0) {
      const clientPkgJsonPath = resolve(options.RepoRoot, clientPath, 'package.json');
      AddDependenciesToPackageJson(clientPkgJsonPath, clientPkgs, options.Version);
      added.push(...clientPkgs.map((p) => p.name));
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
  const serverPath = options.ServerPackagePath ?? DEFAULT_SERVER_PATH;
  const clientPath = options.ClientPackagePath ?? DEFAULT_CLIENT_PATH;

  try {
    const serverPkgs = [...options.ServerPackages, ...options.SharedPackages];
    const clientPkgs = [...options.ClientPackages, ...options.SharedPackages];

    if (serverPkgs.length > 0) {
      const serverPkgJsonPath = resolve(options.RepoRoot, serverPath, 'package.json');
      RemoveDependenciesFromPackageJson(serverPkgJsonPath, serverPkgs);
      removed.push(...serverPkgs.map((p) => p.name));
    }

    if (clientPkgs.length > 0) {
      const clientPkgJsonPath = resolve(options.RepoRoot, clientPath, 'package.json');
      RemoveDependenciesFromPackageJson(clientPkgJsonPath, clientPkgs);
      removed.push(...clientPkgs.map((p) => p.name));
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
 * Runs package install from the monorepo root using the appropriate package manager.
 *
 * @param repoRoot - Absolute path to the monorepo root
 * @param verbose - Enable verbose output
 * @param registryUrl - Optional custom registry URL
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

/**
 * Adds dependencies to a specific package.json file.
 */
function AddDependenciesToPackageJson(pkgJsonPath: string, packages: ManifestPackageEntry[], version: string): void {
  const content = readFileSync(pkgJsonPath, 'utf-8');
  const pkgJson = JSON.parse(content) as { dependencies?: Record<string, string> };

  if (!pkgJson.dependencies) {
    pkgJson.dependencies = {};
  }

  for (const pkg of packages) {
    pkgJson.dependencies[pkg.name] = `^${version}`;
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
