/**
 * Resolves an Open App lifecycle hook MODULE (`hooks.postInstallModule`,
 * `postUpgradeModule`, `preRemoveModule`) to the file to import.
 *
 * A hook module lives in one of the app's installed npm packages, so it has to be
 * resolved from where those packages actually are. Under npm's hoisted layout that
 * was the repo root. Under pnpm (the MJ monorepo since 2026-08) an app package is
 * installed beneath the workspace that declares it — `packages/MJAPI/node_modules/<pkg>`
 * — and a dependency OF that package, the usual home of a setup module
 * (`@askskip/core/setup` beneath `@askskip/server`), is visible only from inside the
 * package itself. Resolving from the repo root therefore failed every pnpm install
 * that carried a module hook.
 *
 * So resolution walks bases most specific first: each installed app package (by its
 * REAL path — pnpm installs a package as a symlink into its store, and its
 * dependencies sit beside the real directory, not the link), then the server and
 * client workspaces, then the repo root.
 *
 * @module install/hook-module-resolver
 */
import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ResolveClientPackagePath, ResolveServerPackagePath } from './workspace-paths.js';

/** Where the app's packages were installed: the consumer repo and its server / client workspaces. */
export interface HookResolutionLayout {
  /** Absolute path to the consumer monorepo root. */
  RepoRoot: string;
  /** Server workspace relative to RepoRoot (detected when absent — `packages/MJAPI` or `apps/MJAPI`). */
  ServerPackagePath?: string;
  /** Client workspace relative to RepoRoot (detected when absent — `packages/MJExplorer` or `apps/MJExplorer`). */
  ClientPackagePath?: string;
  /** The app's packages installed under the server workspace (manifest `packages.server` + `shared`). */
  ServerPackageNames: readonly string[];
  /** The app's packages installed under the client workspace (manifest `packages.client` + `shared`). */
  ClientPackageNames: readonly string[];
}

/**
 * The `package.json` files a hook module is resolved from, most specific first: each
 * installed app package, the server workspace, the client workspace, the repo root.
 * Only locations that exist are returned, deduplicated, so the error a failed
 * resolution reports names exactly what was tried. Pure apart from the existence checks.
 */
export function BuildHookResolutionBases(layout: HookResolutionLayout): string[] {
  const serverDir = join(layout.RepoRoot, ResolveServerPackagePath(layout.RepoRoot, layout.ServerPackagePath));
  const clientDir = join(layout.RepoRoot, ResolveClientPackagePath(layout.RepoRoot, layout.ClientPackagePath));
  const candidates = [
    ...layout.ServerPackageNames.map((name) => join(serverDir, 'node_modules', name, 'package.json')),
    ...layout.ClientPackageNames.map((name) => join(clientDir, 'node_modules', name, 'package.json')),
    join(serverDir, 'package.json'),
    join(clientDir, 'package.json'),
    join(layout.RepoRoot, 'package.json'),
  ];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate) || !existsSync(candidate)) return false;
    seen.add(candidate);
    return true;
  });
}

/** Either the absolute file the specifier resolved to, or the error naming every base tried. */
export type HookModuleResolution = { Resolved: string } | { Error: string };

/**
 * Resolves `specifier` (e.g. `@askskip/core/setup`) against the bases in order and
 * returns the first hit. Each base is resolved from its REAL path so a pnpm-linked
 * package sees the dependencies pnpm placed beside it in the store.
 */
export function ResolveHookModule(specifier: string, bases: readonly string[]): HookModuleResolution {
  const tried: string[] = [];
  for (const base of bases) {
    let real: string;
    try {
      real = realpathSync(base);
    } catch {
      continue; // vanished between the existence check and now — nothing to resolve from
    }
    tried.push(dirname(real));
    try {
      return { Resolved: createRequire(pathToFileURL(real).href).resolve(specifier) };
    } catch {
      // not visible from this base — try the next, more general one
    }
  }
  const where =
    tried.length === 0
      ? 'any location (no package.json exists at the app packages, the server/client workspaces, or the repo root)'
      : `any of: ${tried.join(', ')}`;
  return {
    Error:
      `Hook module '${specifier}' could not be resolved from ${where}. ` +
      `Ensure it is exported by one of the app's installed packages (or by a dependency of one).`,
  };
}
