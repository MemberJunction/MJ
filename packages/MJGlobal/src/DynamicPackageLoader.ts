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
 * Result of attempting to dynamically load a single package.
 */
export interface DynamicLoadResult {
    /** The package that was loaded (or failed to load) */
    PackageName: string;

    /** Whether the package was loaded and its startup export called successfully */
    Success: boolean;

    /** Error message if the load failed */
    Error?: string;
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
     * Loads all enabled dynamic packages in order.
     * For each package:
     * 1. Skips if `Enabled` is false
     * 2. Dynamically imports the package via `await import()`
     * 3. Calls the named `StartupExport` function if it exists
     * 4. Records success or failure
     *
     * Errors are isolated per-package — a broken package does not crash the server.
     *
     * @param packages - Array of packages to load
     * @returns Array of results indicating success/failure for each package
     */
    static async LoadPackages(packages: DynamicPackageLoad[]): Promise<DynamicLoadResult[]> {
        const results: DynamicLoadResult[] = [];

        for (const pkg of packages.filter(p => p.Enabled)) {
            const result = await DynamicPackageLoader.LoadSinglePackage(pkg);
            results.push(result);
        }

        return results;
    }

    /**
     * Attempts to dynamically import a single package and call its startup export.
     */
    private static async LoadSinglePackage(pkg: DynamicPackageLoad): Promise<DynamicLoadResult> {
        try {
            const module: Record<string, unknown> = await import(pkg.PackageName) as Record<string, unknown>;

            if (pkg.StartupExport && typeof module[pkg.StartupExport] === 'function') {
                (module[pkg.StartupExport] as () => void)();
            }

            return { PackageName: pkg.PackageName, Success: true };
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