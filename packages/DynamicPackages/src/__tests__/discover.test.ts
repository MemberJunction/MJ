import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    DiscoverAppManifestPackages,
    DiscoverGeneratedPackages,
    FindWorkspacePackageDir,
    ReadDynamicPackagesConfig,
} from '../discover';

describe('ReadDynamicPackagesConfig', () => {
    it('returns an empty section for a missing or malformed dynamicPackages key', () => {
        expect(ReadDynamicPackagesConfig(undefined)).toEqual({});
        expect(ReadDynamicPackagesConfig({ dynamicPackages: 'nope' })).toEqual({});
        expect(ReadDynamicPackagesConfig({ dynamicPackages: [] })).toEqual({});
    });

    it('normalizes entries, dropping ones without a PackageName and blank scoping strings', () => {
        const section = ReadDynamicPackagesConfig({
            dynamicPackages: {
                server: [
                    { PackageName: ' @a/server ', StartupExport: ' Load ', AppName: 'a', Enabled: false, Processes: ['cli', ''], ExcludeProcesses: [] },
                    { StartupExport: 'NoName' },
                    null,
                    { PackageName: '@b/server' },
                ],
                policy: { 'cli:migrate': 'none', bogus: 42 },
            },
        });
        expect(section.server).toEqual([
            { PackageName: '@a/server', StartupExport: 'Load', AppName: 'a', Enabled: false, Processes: ['cli'], ExcludeProcesses: undefined },
            { PackageName: '@b/server', StartupExport: undefined, AppName: undefined, Enabled: true, Processes: undefined, ExcludeProcesses: undefined },
        ]);
        expect(section.client).toBeUndefined();
        expect(section.policy).toEqual({ 'cli:migrate': 'none' });
    });
});

describe('DiscoverGeneratedPackages', () => {
    const config = {
        codeGeneration: {
            packages: {
                entities: { name: '@host/entities' },
                actions: { name: '@host/actions' },
                angularForms: { name: '@host/forms' },
                graphqlResolvers: { name: '@host/resolvers' },
            },
        },
    };

    it('picks the server-tier package types only (never the Angular forms library)', () => {
        expect(DiscoverGeneratedPackages(config, 'server').map((d) => d.Entry.PackageName)).toEqual([
            '@host/entities',
            '@host/actions',
            '@host/resolvers',
        ]);
    });

    it('picks the client-tier package types only (never the GraphQL resolvers)', () => {
        expect(DiscoverGeneratedPackages(config, 'client').map((d) => d.Entry.PackageName)).toEqual([
            '@host/entities',
            '@host/actions',
            '@host/forms',
        ]);
    });

    it('returns nothing when codeGeneration.packages is absent', () => {
        expect(DiscoverGeneratedPackages({}, 'server')).toEqual([]);
        expect(DiscoverGeneratedPackages(null, 'server')).toEqual([]);
    });
});

describe('DiscoverAppManifestPackages / FindWorkspacePackageDir', () => {
    let repoDir: string;

    beforeAll(() => {
        repoDir = mkdtempSync(path.join(tmpdir(), 'dp-manifest-'));
        writeFileSync(
            path.join(repoDir, 'mj-app.json'),
            JSON.stringify({
                name: 'acme-crm',
                packages: {
                    server: [{ name: '@acme/crm-server', role: 'bootstrap', startupExport: 'LoadAcmeCrmServer' }],
                    client: [{ name: '@acme/crm-ng', role: 'bootstrap', startupExport: 'LoadAcmeCrmClient' }],
                    shared: [{ name: '@acme/crm-entities', role: 'library' }],
                },
                code: { sourceDirectory: 'src-packages' },
            })
        );
        const pkgDir = path.join(repoDir, 'src-packages', 'Server');
        mkdirSync(pkgDir, { recursive: true });
        writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: '@acme/crm-server', version: '1.0.0' }));
    });

    afterAll(() => {
        rmSync(repoDir, { recursive: true, force: true });
    });

    it('returns null when there is no manifest', () => {
        expect(DiscoverAppManifestPackages(tmpdir(), 'server')).toBeNull();
    });

    it('lists shared libraries first, then the requested tier, carrying startupExport and app name', () => {
        const found = DiscoverAppManifestPackages(repoDir, 'server');
        expect(found?.AppName).toBe('acme-crm');
        expect(found?.SourceDirectory).toBe('src-packages');
        expect(found?.Entries.map((e) => e.Entry)).toEqual([
            { PackageName: '@acme/crm-entities', StartupExport: undefined, AppName: 'acme-crm', Enabled: true },
            { PackageName: '@acme/crm-server', StartupExport: 'LoadAcmeCrmServer', AppName: 'acme-crm', Enabled: true },
        ]);
        expect(found?.Entries.every((e) => e.Source === 'manifest' && e.WorkspaceHome?.RepoDir === repoDir)).toBe(true);
    });

    it('lists the client tier when asked', () => {
        const found = DiscoverAppManifestPackages(repoDir, 'client');
        expect(found?.Entries.map((e) => e.Entry.PackageName)).toEqual(['@acme/crm-entities', '@acme/crm-ng']);
    });

    it('throws on a manifest that exists but is not JSON (an operator must see that)', () => {
        const brokenDir = mkdtempSync(path.join(tmpdir(), 'dp-broken-'));
        try {
            writeFileSync(path.join(brokenDir, 'mj-app.json'), '{ not json');
            expect(() => DiscoverAppManifestPackages(brokenDir, 'server')).toThrow(/Could not parse/);
        } finally {
            rmSync(brokenDir, { recursive: true, force: true });
        }
    });

    it('finds a workspace member by package name under the source directory', () => {
        expect(FindWorkspacePackageDir(repoDir, 'src-packages', '@acme/crm-server')).toBe(path.join(repoDir, 'src-packages', 'Server'));
        expect(FindWorkspacePackageDir(repoDir, 'src-packages', '@acme/nope')).toBeNull();
        expect(FindWorkspacePackageDir(repoDir, 'missing-dir', '@acme/crm-server')).toBeNull();
    });
});
