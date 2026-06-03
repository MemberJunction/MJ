/**
 * Angular configuration manager for MJ Open Apps.
 *
 * Provides a class-based API for modifying an Angular project's `angular.json`
 * during Open App install/upgrade/remove. The class separates the file lifecycle
 * (load/save) from individual mutations, so multiple changes are batched into a
 * single read → mutate → write cycle.
 *
 * ## Current mutations
 *
 * - **Prebundle excludes** — Prevents Vite from prebundling Open App npm packages.
 *   Angular's Vite-based dev server prebundles third-party npm packages for
 *   performance. MJ packages (`@memberjunction/*`) are excluded so they're served
 *   as raw ES modules. When an Open App's packages (e.g., `@bluecypress/*`) are
 *   NOT excluded, Vite inlines MJ modules into prebundled chunks as transitive
 *   dependencies, creating duplicate module instances. Angular's `providedIn: 'root'`
 *   services use class identity as the DI token, so two module instances = two
 *   separate singletons — breaking services like WorkspaceStateManager.
 *
 * ## Adding future mutations
 *
 * To add a new angular.json manipulation (e.g., assets, styles, build options):
 * 1. Add a mutation method to {@link AngularConfigManager} (e.g., `AddAssets()`)
 * 2. Call it between `Load()` and `Save()` alongside existing mutations
 * 3. The method operates on `this.config` (the parsed JSON) — no file I/O needed
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { MJAppManifest } from '../manifest/manifest-schema.js';

/**
 * Result of an angular.json configuration operation.
 */
export interface AngularConfigResult {
  /** Whether the operation succeeded */
  Success: boolean;
  /** Error message if the operation failed */
  ErrorMessage?: string;
  /** Summary of changes made (empty if no changes) */
  Changes?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ANGULAR CONFIG MANAGER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manages modifications to an Angular project's `angular.json` file.
 *
 * Usage:
 * ```ts
 * const manager = new AngularConfigManager(repoRoot, clientPackagePath);
 * if (!manager.Load()) return; // angular.json not found — skip silently
 *
 * manager.AddPrebundleExcludes(manifest);
 * // future: manager.AddAssets(manifest);
 * // future: manager.AddBuildOptions(manifest);
 *
 * const result = manager.Save();
 * ```
 *
 * The class tracks whether any mutations actually changed the config. If nothing
 * changed, `Save()` is a no-op (no unnecessary file writes).
 */
export class AngularConfigManager {
  private angularJsonPath: string | undefined;
  private config: Record<string, unknown> | undefined;
  private dirty = false;
  private changes: string[] = [];

  constructor(
    private repoRoot: string,
    private clientPackagePath?: string,
  ) {}

  /**
   * Loads and parses angular.json from the client workspace.
   *
   * @returns `true` if the file was loaded successfully, `false` if angular.json
   *          doesn't exist (which is not an error — the project may not use Angular).
   * @throws If the file exists but can't be parsed as JSON.
   */
  Load(): boolean {
    const clientDir = resolve(this.repoRoot, this.clientPackagePath ?? 'packages/MJExplorer');
    const candidate = join(clientDir, 'angular.json');

    if (!existsSync(candidate)) {
      return false;
    }

    this.angularJsonPath = candidate;
    const content = readFileSync(candidate, 'utf-8');
    this.config = JSON.parse(content) as Record<string, unknown>;
    this.dirty = false;
    this.changes = [];
    return true;
  }

  /**
   * Writes the modified angular.json back to disk if any mutations were applied.
   * No-op if nothing changed.
   *
   * @returns Operation result with a summary of all changes made.
   */
  Save(): AngularConfigResult {
    if (!this.dirty || !this.angularJsonPath || !this.config) {
      return { Success: true, Changes: [] };
    }

    try {
      writeFileSync(this.angularJsonPath, JSON.stringify(this.config, null, 2) + '\n', 'utf-8');
      return { Success: true, Changes: [...this.changes] };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { Success: false, ErrorMessage: `Failed to write angular.json: ${message}` };
    }
  }

  // ───────────────────────────────────────────────────────────
  // MUTATION: Prebundle Excludes
  // ───────────────────────────────────────────────────────────

  /**
   * Adds the app's npm scope(s) to `serve.options.prebundle.exclude` for all
   * projects in angular.json. Idempotent: patterns already present are skipped.
   *
   * @returns Number of patterns added (0 if all already present).
   */
  AddPrebundleExcludes(manifest: MJAppManifest): number {
    const patterns = DerivePrebundleExcludePatterns(manifest);
    if (patterns.length === 0 || !this.config) return 0;

    let added = 0;
    for (const projectName of this.getProjectNames()) {
      const excludeArray = this.ensurePrebundleExcludeArray(projectName);
      for (const pattern of patterns) {
        if (!excludeArray.includes(pattern)) {
          excludeArray.push(pattern);
          added++;
        }
      }
    }

    if (added > 0) {
      this.dirty = true;
      this.changes.push(`Added ${added} prebundle exclude pattern(s): ${patterns.join(', ')}`);
    }
    return added;
  }

  /**
   * Removes the app's npm scope(s) from `serve.options.prebundle.exclude`.
   * Only removes patterns NOT used by any other installed app.
   *
   * @param manifest - The app being removed
   * @param otherInstalledManifests - Manifests of all OTHER installed apps
   * @returns Number of patterns removed.
   */
  RemovePrebundleExcludes(manifest: MJAppManifest, otherInstalledManifests: MJAppManifest[]): number {
    const patternsToRemove = DerivePrebundleExcludePatterns(manifest);
    if (patternsToRemove.length === 0 || !this.config) return 0;

    // Collect patterns still needed by other installed apps
    const patternsStillNeeded = new Set<string>();
    for (const other of otherInstalledManifests) {
      for (const pattern of DerivePrebundleExcludePatterns(other)) {
        patternsStillNeeded.add(pattern);
      }
    }

    const safeToRemove = new Set(patternsToRemove.filter(p => !patternsStillNeeded.has(p)));
    if (safeToRemove.size === 0) return 0;

    let removed = 0;
    for (const projectName of this.getProjectNames()) {
      const excludeArray = this.getPrebundleExcludeArray(projectName);
      if (!excludeArray) continue;

      const before = excludeArray.length;
      const filtered = excludeArray.filter(p => !safeToRemove.has(p));

      if (filtered.length < before) {
        this.setPrebundleExcludeArray(projectName, filtered);
        removed += before - filtered.length;
      }
    }

    if (removed > 0) {
      this.dirty = true;
      this.changes.push(`Removed ${removed} prebundle exclude pattern(s): ${[...safeToRemove].join(', ')}`);
    }
    return removed;
  }

  // ───────────────────────────────────────────────────────────
  // MUTATION: (Future) Assets
  // ───────────────────────────────────────────────────────────
  // AddAssets(manifest: MJAppManifest): number { ... }
  // RemoveAssets(manifest: MJAppManifest): number { ... }

  // ───────────────────────────────────────────────────────────
  // MUTATION: (Future) Styles
  // ───────────────────────────────────────────────────────────
  // AddStyles(manifest: MJAppManifest): number { ... }
  // RemoveStyles(manifest: MJAppManifest): number { ... }

  // ───────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ───────────────────────────────────────────────────────────

  /** Returns all project names defined in angular.json. */
  private getProjectNames(): string[] {
    const projects = (this.config as Record<string, Record<string, unknown>>)?.projects;
    return projects ? Object.keys(projects) : [];
  }

  /** Navigates to a deeply nested property, returning undefined if any segment is missing. */
  private getProjectPath(projectName: string, ...path: string[]): unknown {
    let current: unknown = (this.config as Record<string, Record<string, unknown>>)?.projects?.[projectName];
    for (const segment of path) {
      if (current == null || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }

  /** Gets the existing prebundle.exclude array for a project, or undefined. */
  private getPrebundleExcludeArray(projectName: string): string[] | undefined {
    const arr = this.getProjectPath(projectName, 'architect', 'serve', 'options', 'prebundle', 'exclude');
    return Array.isArray(arr) ? arr : undefined;
  }

  /** Ensures serve.options.prebundle.exclude exists and returns the array. */
  private ensurePrebundleExcludeArray(projectName: string): string[] {
    const projects = (this.config as Record<string, Record<string, unknown>>).projects;
    const project = projects[projectName] as Record<string, unknown>;
    if (!project) return [];

    const architect = (project.architect ?? (project.architect = {})) as Record<string, unknown>;
    const serve = (architect.serve ?? (architect.serve = {})) as Record<string, unknown>;
    const options = (serve.options ?? (serve.options = {})) as Record<string, unknown>;
    const prebundle = (options.prebundle ?? (options.prebundle = {})) as Record<string, unknown>;

    if (!Array.isArray(prebundle.exclude)) {
      prebundle.exclude = [];
    }
    return prebundle.exclude as string[];
  }

  /** Replaces the prebundle.exclude array for a project. */
  private setPrebundleExcludeArray(projectName: string, arr: string[]): void {
    const exclude = this.getProjectPath(projectName, 'architect', 'serve', 'options', 'prebundle');
    if (exclude && typeof exclude === 'object') {
      (exclude as Record<string, unknown>).exclude = arr;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STANDALONE HELPERS (used by both the class and the orchestrator)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derives the Vite prebundle exclude patterns for an app's packages.
 *
 * Strategy:
 * 1. If `packages.prefix` is set (e.g., `@bluecypress/bcsaas-`), extract the
 *    npm scope (`@bluecypress/*`). This covers ALL packages under that scope,
 *    including ones the consumer adds beyond what the manifest declares.
 * 2. Otherwise, collect distinct scopes from all declared client/shared packages
 *    and return `@scope/*` patterns for each.
 * 3. Unscoped packages are returned as-is (rare but possible).
 *
 * @returns Array of glob patterns suitable for Vite's prebundle.exclude
 */
export function DerivePrebundleExcludePatterns(manifest: MJAppManifest): string[] {
  // Strategy 1: Use prefix to derive scope
  if (manifest.packages?.prefix) {
    const scope = extractScope(manifest.packages.prefix);
    if (scope) {
      return [`${scope}/*`];
    }
  }

  // Strategy 2: Collect distinct scopes from client + shared packages
  const clientPkgs = manifest.packages?.client ?? [];
  const sharedPkgs = manifest.packages?.shared ?? [];
  const allPkgs = [...clientPkgs, ...sharedPkgs];

  if (allPkgs.length === 0) {
    return [];
  }

  const scopes = new Set<string>();
  const unscopedPackages: string[] = [];

  for (const pkg of allPkgs) {
    const scope = extractScope(pkg.name);
    if (scope) {
      scopes.add(`${scope}/*`);
    } else {
      unscopedPackages.push(pkg.name);
    }
  }

  return [...scopes, ...unscopedPackages];
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts the npm scope from a package name or prefix.
 * e.g., '@bluecypress/bcsaas-ng-core' → '@bluecypress'
 * e.g., '@bluecypress/bcsaas-' → '@bluecypress'
 */
function extractScope(nameOrPrefix: string): string | undefined {
  if (!nameOrPrefix.startsWith('@')) {
    return undefined;
  }
  const slashIndex = nameOrPrefix.indexOf('/');
  if (slashIndex === -1) {
    return nameOrPrefix;
  }
  return nameOrPrefix.slice(0, slashIndex);
}
