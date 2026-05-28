/**
 * Tests for the transitive dependency graph builder.
 *
 * Validates full-graph topological sorting (leaf-first), cross-repo cycle
 * detection, diamond de-duplication, handling of already-installed dependencies,
 * version-conflict detection, and unresolvable-manifest errors. The manifest
 * fetcher is injected from an in-memory map so no network access is required.
 */
import { describe, it, expect } from 'vitest';
import {
    ResolveDependencyGraph,
} from '../dependency/dependency-graph-builder.js';
import type {
    FetchedManifest,
    ManifestFetcher,
    RootApp,
} from '../dependency/dependency-graph-builder.js';
import type { DependencyValue, InstalledAppMap } from '../dependency/dependency-resolver.js';

/** Builds a repo URL for a test app name. */
function repo(name: string): string {
    return `https://github.com/test/${name}`;
}

/** Builds an object-form dependency value (carries the repository so it's fetchable). */
function dep(name: string, range = '^1.0.0'): DependencyValue {
    return { version: range, repository: repo(name) };
}

/** Builds a dependency map from a list of app names. */
function deps(...names: string[]): Record<string, DependencyValue> {
    return Object.fromEntries(names.map((n) => [n, dep(n)]));
}

/**
 * Builds a fetcher backed by an in-memory map of app name -> its dependency
 * names. Any app reachable in the map resolves; anything else fails to fetch.
 */
function fetcherFrom(map: Record<string, string[]>): ManifestFetcher {
    return async (repoUrl: string) => {
        const name = repoUrl.replace('https://github.com/test/', '');
        const depNames = map[name];
        if (depNames === undefined) {
            return { Success: false, ErrorMessage: `not found: ${name}` };
        }
        const manifest: FetchedManifest = {
            name,
            repository: repoUrl,
            dependencies: deps(...depNames),
        };
        return { Success: true, Manifest: manifest };
    };
}

function rootApp(name: string, ...depNames: string[]): RootApp {
    return { AppName: name, Repository: repo(name), Dependencies: deps(...depNames) };
}

describe('ResolveDependencyGraph', () => {
    describe('No dependencies', () => {
        it('returns an empty install order', async () => {
            const result = await ResolveDependencyGraph(
                { AppName: 'root', Repository: repo('root'), Dependencies: {} },
                {},
                fetcherFrom({}),
            );
            expect(result.Success).toBe(true);
            expect(result.InstallOrder).toEqual([]);
        });
    });

    describe('Transitive chain (root -> a -> b -> c)', () => {
        it('orders dependencies leaf-first and excludes the root', async () => {
            const fetcher = fetcherFrom({ a: ['b'], b: ['c'], c: [] });
            const result = await ResolveDependencyGraph(rootApp('root', 'a'), {}, fetcher);

            expect(result.Success).toBe(true);
            const names = result.InstallOrder!.map((d) => d.AppName);
            expect(names).not.toContain('root'); // root is installed by the main flow, not as a dep
            expect(names).toEqual(['c', 'b', 'a']);
            expect(result.InstallOrder!.every((d) => !d.AlreadyInstalled)).toBe(true);
        });
    });

    describe('Diamond (root -> a,b ; a -> d ; b -> d)', () => {
        it('installs the shared dependency once, before its dependents', async () => {
            const fetcher = fetcherFrom({ a: ['d'], b: ['d'], d: [] });
            const result = await ResolveDependencyGraph(rootApp('root', 'a', 'b'), {}, fetcher);

            expect(result.Success).toBe(true);
            const names = result.InstallOrder!.map((d) => d.AppName);

            // d appears exactly once
            expect(names.filter((n) => n === 'd').length).toBe(1);
            // d before both a and b
            expect(names.indexOf('d')).toBeLessThan(names.indexOf('a'));
            expect(names.indexOf('d')).toBeLessThan(names.indexOf('b'));
        });
    });

    describe('Cross-repo cycle detection', () => {
        it('detects a transitive cycle a -> b -> a instead of recursing', async () => {
            const fetcher = fetcherFrom({ a: ['b'], b: ['a'] });
            const result = await ResolveDependencyGraph(rootApp('root', 'a'), {}, fetcher);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage?.toLowerCase()).toContain('circular');
        });

        it('detects a cycle that runs through the root', async () => {
            const fetcher = fetcherFrom({ a: ['root'], root: ['a'] });
            const result = await ResolveDependencyGraph(rootApp('root', 'a'), {}, fetcher);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage?.toLowerCase()).toContain('circular');
        });

        it('detects a self-dependency', async () => {
            const fetcher = fetcherFrom({ a: ['a'] });
            const result = await ResolveDependencyGraph(rootApp('root', 'a'), {}, fetcher);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage?.toLowerCase()).toContain('circular');
        });
    });

    describe('Already-installed dependencies', () => {
        it('marks installed deps and treats them as resolved leaves (no fetch needed)', async () => {
            // 'b' is installed; the fetcher does NOT know about 'b', proving we
            // don't require fetching an installed dependency's manifest.
            const fetcher = fetcherFrom({ a: ['b'] });
            const installed: InstalledAppMap = {
                b: { Version: '1.2.0', Repository: repo('b') },
            };
            const result = await ResolveDependencyGraph(rootApp('root', 'a'), installed, fetcher);

            expect(result.Success).toBe(true);
            const b = result.InstallOrder!.find((d) => d.AppName === 'b');
            const a = result.InstallOrder!.find((d) => d.AppName === 'a');
            expect(b!.AlreadyInstalled).toBe(true);
            expect(b!.InstalledVersion).toBe('1.2.0');
            expect(a!.AlreadyInstalled).toBe(false);
        });
    });

    describe('Version conflicts', () => {
        it('fails when an installed dependency does not satisfy the required range', async () => {
            const fetcher = fetcherFrom({});
            const root: RootApp = {
                AppName: 'root',
                Repository: repo('root'),
                Dependencies: { a: { version: '>=2.0.0 <3.0.0', repository: repo('a') } },
            };
            const installed: InstalledAppMap = {
                a: { Version: '1.5.0', Repository: repo('a') },
            };
            const result = await ResolveDependencyGraph(root, installed, fetcher);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not satisfy');
        });
    });

    describe('Unresolvable manifest', () => {
        it('fails when an uninstalled dependency manifest cannot be fetched', async () => {
            const fetcher = fetcherFrom({}); // knows nothing
            const result = await ResolveDependencyGraph(rootApp('root', 'missing'), {}, fetcher);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Failed to fetch manifest');
        });
    });
});
