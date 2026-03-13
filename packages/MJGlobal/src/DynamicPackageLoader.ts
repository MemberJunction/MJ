/**
 * Dynamic Package Loading
 *
 * Provides runtime dynamic import capabilities for MJ Open App packages.
 * Used by MJAPI startup to load server-side app bootstrap packages that
 * register their classes with the ClassFactory via @RegisterClass decorators.
 */

/**
 * Describes a package to be dynamically imported at runtime.
 * Typically read from the `dynamicPackages.server` section of mj.config.cjs.
 */
export interface DynamicPackageLoad {
    /** npm package name to dynamically import */
    PackageName: string;

    /** Named export to call after import (e.g., 'LoadAcmeCRMServer') */
    StartupExport: string;

    /** Open App name this package belongs to (for tracking) */
    AppName: string;

    /** Whether this package should be loaded. Allows disabling without removing. */
    Enabled: boolean;
}

/**
 * Configuration returned by a startup function to declaratively register
 * middleware, hooks, and plugins with the server startup pipeline.
 *
 * This type is intentionally a loose `Record<string, unknown>` because
 * `@memberjunction/global` has no dependency on Express or Apollo types.
 * The consuming layer (`@memberjunction/server-bootstrap`) casts this to
 * `Partial<ServerExtensibilityOptions>` when merging into server options.
 *
 * Expected keys (typed by the consumer):
 * - `ExpressMiddlewareBefore` — Express middleware before auth
 * - `ExpressMiddlewarePostAuth` — Express middleware after auth
 * - `ExpressMiddlewareAfter` — Express middleware after routes
 * - `PreRunViewHooks` — Provider-level pre-RunView hooks
 * - `PostRunViewHooks` — Provider-level post-RunView hooks
 * - `PreSaveHooks` — Provider-level pre-Save hooks
 * - `ApolloPlugins` — Apollo Server plugins
 */
export type DynamicPackageResult = Record<string, unknown>;

/**
 * Result of attempting to dynamically load a single package.
 */
export interface DynamicLoadResult {
    /** The package that was loaded (or failed to load) */
    PackageName: string;

    /** Whether the package was loaded and its startup export called successfully */
    Success: boolean;

    /** Error message if the load failed */
    Error?: string;

    /** Configuration returned by the startup function, if any */
    Result?: DynamicPackageResult;
}

/**
 * Utility class for dynamically loading npm packages at runtime.
 *
 * Used during MJAPI startup to load Open App server-side bootstrap packages.
 * Each package is loaded in isolation — a failure in one package does not
 * prevent others from loading.
 */
export class DynamicPackageLoader {
    /**
     * Loads all enabled dynamic packages in parallel for better performance.
     * For each package:
     * 1. Skips if `Enabled` is false
     * 2. Dynamically imports the package via `await import()`
     * 3. Calls the named `StartupExport` function if it exists
     * 4. Records success or failure (including any returned configuration)
     *
     * Errors are isolated per-package — a broken package does not crash the server.
     * All enabled packages are loaded concurrently using Promise.all().
     *
     * @param packages - Array of packages to load
     * @returns Array of results indicating success/failure for each package
     */
    static async LoadPackages(packages: DynamicPackageLoad[]): Promise<DynamicLoadResult[]> {
        const enabledPackages = packages.filter(p => p.Enabled);
        return Promise.all(enabledPackages.map(pkg => DynamicPackageLoader.LoadSinglePackage(pkg)));
    }

    /**
     * Attempts to dynamically import a single package and call its startup export.
     * If the startup function returns a value, it is captured as `Result` on the
     * load result. This allows Open Apps to declaratively return middleware, hooks,
     * and plugins that get merged into the server options.
     */
    private static async LoadSinglePackage(pkg: DynamicPackageLoad): Promise<DynamicLoadResult> {
        try {
            const module: Record<string, unknown> = await import(pkg.PackageName) as Record<string, unknown>;

            let result: DynamicPackageResult | undefined;

            if (pkg.StartupExport && typeof module[pkg.StartupExport] === 'function') {
                const startupFn = module[pkg.StartupExport] as () => DynamicPackageResult | void | Promise<DynamicPackageResult | void>;
                const returnValue = await Promise.resolve(startupFn());
                if (returnValue && typeof returnValue === 'object') {
                    result = returnValue;
                }
            }

            return { PackageName: pkg.PackageName, Success: true, Result: result };
        }
        catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Failed to load dynamic package ${pkg.PackageName}: ${errorMessage}`);

            return {
                PackageName: pkg.PackageName,
                Success: false,
                Error: errorMessage
            };
        }
    }
}
