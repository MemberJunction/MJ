/**
 * Tests for the MJ Open App dependency resolver.
 *
 * Validates topological sorting, circular dependency detection,
 * and handling of already-installed dependencies.
 */
import { describe, it, expect } from 'vitest';
import {
    ResolveDependencies,
} from '../dependency/dependency-resolver.js';
import type {
    DependencyNode,
    InstalledAppMap,
} from '../dependency/dependency-resolver.js';

function node(appName: string, deps: Record<string, string> = {}): DependencyNode {
    return {
        AppName: appName,
        Repository: `https://github.com/test/${appName}`,
        Dependencies: deps,
    };
}

describe('ResolveDependencies', () => {
    describe('No Dependencies', () => {
        it('should succeed with no dependencies', () => {
            const root = node('my-app');
            const result = ResolveDependencies(root, {});

            expect(result.Success).toBe(true);
            expect(result.InstallOrder).toBeDefined();
            expect(result.InstallOrder!.length).toBe(0);
        });
    });

    describe('Single Dependency', () => {
        it('should resolve a single dependency', () => {
            const root = node('my-app', { 'dep-a': '^1.0.0' });
            const result = ResolveDependencies(root, {});

            expect(result.Success).toBe(true);
            expect(result.InstallOrder!.length).toBe(1);
            expect(result.InstallOrder![0].AppName).toBe('dep-a');
            expect(result.InstallOrder![0].VersionRange).toBe('^1.0.0');
            expect(result.InstallOrder![0].AlreadyInstalled).toBe(false);
        });
    });

    describe('Linear Chain (A -> B -> C)', () => {
        it('should resolve multiple flat dependencies', () => {
            const root = node('app-a', { 'dep-b': '^1.0.0', 'dep-c': '^1.0.0' });
            const result = ResolveDependencies(root, {});

            expect(result.Success).toBe(true);
            expect(result.InstallOrder!.length).toBe(2);

            const names = result.InstallOrder!.map(d => d.AppName);
            expect(names).toContain('dep-b');
            expect(names).toContain('dep-c');
        });
    });

    describe('Already Installed Dependencies', () => {
        it('should mark already-installed dependencies correctly', () => {
            const root = node('my-app', { 'dep-a': '^1.0.0', 'dep-b': '^2.0.0' });
            const installed: InstalledAppMap = {
                'dep-a': { Version: '1.2.0', Repository: 'https://github.com/test/dep-a' },
            };
            const result = ResolveDependencies(root, installed);

            expect(result.Success).toBe(true);

            const depA = result.InstallOrder!.find(d => d.AppName === 'dep-a');
            const depB = result.InstallOrder!.find(d => d.AppName === 'dep-b');

            expect(depA).toBeDefined();
            expect(depA!.AlreadyInstalled).toBe(true);
            expect(depA!.InstalledVersion).toBe('1.2.0');
            expect(depA!.Repository).toBe('https://github.com/test/dep-a');

            expect(depB).toBeDefined();
            expect(depB!.AlreadyInstalled).toBe(false);
        });
    });

    describe('All Dependencies Already Installed', () => {
        it('should succeed when all deps are installed', () => {
            const root = node('my-app', { 'dep-a': '^1.0.0' });
            const installed: InstalledAppMap = {
                'dep-a': { Version: '1.5.0', Repository: 'https://github.com/test/dep-a' },
            };
            const result = ResolveDependencies(root, installed);

            expect(result.Success).toBe(true);
            expect(result.InstallOrder!.length).toBe(1);
            expect(result.InstallOrder![0].AlreadyInstalled).toBe(true);
        });
    });

    describe('Circular Dependency Detection', () => {
        it('should detect self-dependency as circular', () => {
            const root = node('self-dep', { 'self-dep': '^1.0.0' });
            const result = ResolveDependencies(root, {});

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toBeDefined();
            expect(result.ErrorMessage!.toLowerCase()).toContain('circular');
        });
    });

    describe('Multiple Dependencies', () => {
        it('should resolve multiple dependencies', () => {
            const root = node('my-app', {
                'dep-a': '^1.0.0',
                'dep-b': '>=2.0.0',
                'dep-c': '~3.0.0',
            });
            const result = ResolveDependencies(root, {});

            expect(result.Success).toBe(true);
            expect(result.InstallOrder!.length).toBe(3);

            const names = result.InstallOrder!.map(d => d.AppName);
            expect(names).toContain('dep-a');
            expect(names).toContain('dep-b');
            expect(names).toContain('dep-c');
        });
    });

    describe('Empty Dependencies Map', () => {
        it('should succeed with an empty deps map', () => {
            const root = node('my-app', {});
            const result = ResolveDependencies(root, {});

            expect(result.Success).toBe(true);
            expect(result.InstallOrder!.length).toBe(0);
        });
    });

    describe('Mixed Dependencies (some installed, some not)', () => {
        it('should correctly identify installed vs not-installed deps', () => {
            const root = node('my-app', {
                'lib-a': '^1.0.0',
                'lib-b': '^2.0.0',
                'lib-c': '^3.0.0',
            });
            const installed: InstalledAppMap = {
                'lib-a': { Version: '1.0.0', Repository: 'https://github.com/test/lib-a' },
                'lib-c': { Version: '3.1.0', Repository: 'https://github.com/test/lib-c' },
            };
            const result = ResolveDependencies(root, installed);

            expect(result.Success).toBe(true);

            const libA = result.InstallOrder!.find(d => d.AppName === 'lib-a');
            const libB = result.InstallOrder!.find(d => d.AppName === 'lib-b');
            const libC = result.InstallOrder!.find(d => d.AppName === 'lib-c');

            expect(libA!.AlreadyInstalled).toBe(true);
            expect(libB!.AlreadyInstalled).toBe(false);
            expect(libC!.AlreadyInstalled).toBe(true);
        });
    });
});
