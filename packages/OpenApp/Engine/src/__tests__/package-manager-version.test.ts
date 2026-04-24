/**
 * Tests for version strategy resolution in the package manager,
 * including the new 'exact' strategy for explicit version pins.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { AddAppPackages, type PackageManagerOptions, type VersionStrategy } from '../install/package-manager.js';
import type { ManifestPackageEntry } from '../manifest/manifest-schema.js';

// Mock fs so we can test package.json writes without hitting the filesystem
vi.mock('node:fs', () => ({
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
}));

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockExistsSync = vi.mocked(existsSync);

function buildOptions(overrides: Partial<PackageManagerOptions> = {}): PackageManagerOptions {
    return {
        RepoRoot: '/fake/root',
        ServerPackages: [{ name: '@acme/server-pkg', role: 'bootstrap', startupExport: 'LoadAcme' }],
        ClientPackages: [],
        SharedPackages: [],
        Version: '1.0.7',
        ServerPackagePath: 'apps/Server',
        ClientPackagePath: 'apps/Client',
        ...overrides,
    };
}

function setupMockPackageJson(): void {
    // Return a minimal package.json when read
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: {} }));
    // Pretend the path exists
    mockExistsSync.mockReturnValue(true);
}

describe('Version strategy resolution', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupMockPackageJson();
    });

    it('writes ^version for semver strategy', () => {
        const result = AddAppPackages(buildOptions({ VersionStrategy: 'semver' }));
        expect(result.Success).toBe(true);

        const writtenJson = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
        expect(writtenJson.dependencies['@acme/server-pkg']).toBe('^1.0.7');
    });

    it('writes exact version (no prefix) for exact strategy', () => {
        const result = AddAppPackages(buildOptions({ VersionStrategy: 'exact' }));
        expect(result.Success).toBe(true);

        const writtenJson = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
        expect(writtenJson.dependencies['@acme/server-pkg']).toBe('1.0.7');
    });

    it('writes ^version for auto strategy when not using pnpm catalog', () => {
        // No pnpm-lock.yaml exists, so auto falls back to semver
        mockExistsSync.mockImplementation((path) => {
            if (typeof path === 'string' && path.includes('pnpm-lock')) return false;
            if (typeof path === 'string' && path.includes('pnpm-workspace')) return false;
            return true;
        });

        const result = AddAppPackages(buildOptions({ VersionStrategy: 'auto' }));
        expect(result.Success).toBe(true);

        const writtenJson = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
        expect(writtenJson.dependencies['@acme/server-pkg']).toBe('^1.0.7');
    });

    it('writes catalog: for catalog strategy', () => {
        const result = AddAppPackages(buildOptions({ VersionStrategy: 'catalog' }));
        expect(result.Success).toBe(true);

        const writtenJson = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
        expect(writtenJson.dependencies['@acme/server-pkg']).toBe('catalog:');
    });

    it('writes workspace:* for workspace strategy', () => {
        const result = AddAppPackages(buildOptions({ VersionStrategy: 'workspace' }));
        expect(result.Success).toBe(true);

        const writtenJson = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
        expect(writtenJson.dependencies['@acme/server-pkg']).toBe('workspace:*');
    });
});

describe('Exact version pin integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupMockPackageJson();
    });

    it('pins shared packages to exact version when strategy is exact', () => {
        const opts = buildOptions({
            VersionStrategy: 'exact',
            ServerPackages: [],
            SharedPackages: [
                { name: '@acme/core', role: 'library' },
                { name: '@acme/entities', role: 'library' },
            ],
        });

        const result = AddAppPackages(opts);
        expect(result.Success).toBe(true);

        // Shared packages go to both server and client workspaces
        // Check the first write (server workspace)
        const writtenJson = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
        expect(writtenJson.dependencies['@acme/core']).toBe('1.0.7');
        expect(writtenJson.dependencies['@acme/entities']).toBe('1.0.7');
    });
});
