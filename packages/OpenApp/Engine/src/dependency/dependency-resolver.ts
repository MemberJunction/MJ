/**
 * Dependency resolution for MJ Open Apps.
 *
 * Performs topological sorting of app dependencies to determine correct
 * install order, and detects circular dependency chains.
 */
import type { ResolvedDependency } from '../types/open-app-types.js';
import { CheckDependencyVersionCompatibility } from './version-checker.js';

/**
 * Dependency value: either a plain semver range string or an object with version and repository.
 */
export type DependencyValue = string | { version: string; repository: string };

/**
 * A node in the dependency graph, representing one app and its requirements.
 */
export interface DependencyNode {
    /** App name (from manifest) */
    AppName: string;
    /** GitHub repository URL */
    Repository: string;
    /** Dependencies: map of app name -> semver range or { version, repository } */
    Dependencies: Record<string, DependencyValue>;
}

/**
 * Result of dependency resolution.
 */
export interface DependencyResolutionResult {
    /** Whether resolution succeeded */
    Success: boolean;
    /** Ordered list of dependencies to install (leaf-first) */
    InstallOrder?: ResolvedDependency[];
    /** Error message if resolution failed */
    ErrorMessage?: string;
}

/**
 * Map of already-installed apps keyed by app name.
 */
export interface InstalledAppMap {
    [appName: string]: {
        Version: string;
        Repository: string;
    };
}

/**
 * Resolves the install order for an app and its transitive dependencies.
 *
 * Uses topological sort (depth-first) to produce an ordered list where
 * each app appears after all of its dependencies. Detects circular
 * dependency chains and returns an error if found.
 *
 * @param rootNode - The app being installed and its dependency declarations
 * @param installedApps - Map of apps already installed in the MJ instance
 * @returns Ordered install plan or error details
 */
export function ResolveDependencies(
    rootNode: DependencyNode,
    installedApps: InstalledAppMap
): DependencyResolutionResult {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const order: ResolvedDependency[] = [];

    const cycleError = VisitNode(rootNode.AppName, rootNode.Dependencies, visited, inStack, order, installedApps);

    if (cycleError) {
        return { Success: false, ErrorMessage: cycleError };
    }

    return { Success: true, InstallOrder: order };
}

/**
 * Extracts version range and optional repository from a dependency value.
 */
function ParseDependencyValue(value: DependencyValue): { versionRange: string; repository?: string } {
    if (typeof value === 'string') {
        return { versionRange: value };
    }
    return { versionRange: value.version, repository: value.repository };
}

/**
 * Recursive depth-first visitor for topological sort.
 *
 * @returns Error message string if a cycle is detected, undefined otherwise
 */
function VisitNode(
    appName: string,
    dependencies: Record<string, DependencyValue>,
    visited: Set<string>,
    inStack: Set<string>,
    order: ResolvedDependency[],
    installedApps: InstalledAppMap
): string | undefined {
    if (visited.has(appName)) {
        return undefined;
    }

    if (inStack.has(appName)) {
        const chain = [...inStack, appName].join(' -> ');
        return `Circular dependency detected: ${chain}`;
    }

    inStack.add(appName);

    for (const [depName, depValue] of Object.entries(dependencies)) {
        const depError = VisitDependency(depName, depValue, visited, inStack, order, installedApps);
        if (depError) {
            return depError;
        }
    }

    inStack.delete(appName);
    visited.add(appName);

    return undefined;
}

/**
 * Processes a single dependency entry, adding it to the install order
 * if it is not already installed.
 *
 * @returns Error message string if a cycle is detected, undefined otherwise
 */
function VisitDependency(
    depName: string,
    depValue: DependencyValue,
    visited: Set<string>,
    inStack: Set<string>,
    order: ResolvedDependency[],
    installedApps: InstalledAppMap
): string | undefined {
    const { versionRange, repository: manifestRepo } = ParseDependencyValue(depValue);
    const installed = installedApps[depName];
    const alreadyInstalled = installed !== undefined;

    // Validate version compatibility for already-installed dependencies
    if (alreadyInstalled && installed.Version) {
        const compatCheck = CheckDependencyVersionCompatibility(installed.Version, versionRange);
        if (!compatCheck.Compatible) {
            return `Dependency '${depName}' is installed (v${installed.Version}) but does not satisfy required range '${versionRange}': ${compatCheck.Message}`;
        }
    }

    const resolved: ResolvedDependency = {
        AppName: depName,
        VersionRange: versionRange,
        Repository: installed?.Repository ?? manifestRepo ?? '',
        AlreadyInstalled: alreadyInstalled,
        InstalledVersion: installed?.Version
    };

    // Even if installed, still visit for cycle detection with empty deps
    // (we don't have the full dependency tree for already-installed apps)
    const depError = VisitNode(depName, {}, visited, inStack, order, installedApps);
    if (depError) {
        return depError;
    }

    // Only add to order if not already in the list
    if (!order.some(entry => entry.AppName === depName)) {
        order.push(resolved);
    }

    return undefined;
}
