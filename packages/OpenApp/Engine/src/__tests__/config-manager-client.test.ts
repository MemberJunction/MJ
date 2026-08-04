/**
 * Tests for the dynamicPackages.client functions in config-manager
 * (AddClientDynamicPackages + the array-agnostic remove sweep). Client entries are
 * side-effect imports — `mj codegen manifest --open-app-client-bootstrap` turns each
 * into an `import '<pkg>';` line in MJExplorer's manifest — so they carry NO
 * StartupExport, and the client array is created/normalized alongside the server one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
}));

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { AddClientDynamicPackages, RemoveServerDynamicPackages } from '../install/config-manager.js';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

const REPO_ROOT = '/fake/repo';

function setupConfigFile(content: string): void {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(content);
}

function writtenContent(): string {
    expect(mockedWriteFileSync).toHaveBeenCalled();
    return mockedWriteFileSync.mock.calls[0][1] as string;
}

function makeClientManifest(appName: string, pkgName: string) {
    return {
        name: appName,
        packages: { client: [{ name: pkgName }] },
    } as Parameters<typeof AddClientDynamicPackages>[1];
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe('AddClientDynamicPackages — creates section + lands entry without StartupExport', () => {
    it('creates dynamicPackages with both arrays and adds the client entry (no StartupExport)', () => {
        const config = ['module.exports = {', '  dbHost: "localhost",', '};'].join('\n');
        setupConfigFile(config);

        const result = AddClientDynamicPackages(REPO_ROOT, makeClientManifest('acme-app', '@acme/client-ng'));

        expect(result.Success).toBe(true);
        const content = writtenContent();
        expect(content).toMatch(/dynamicPackages\s*:\s*\{/);
        expect(content).toMatch(/client:[\s\S]*@acme\/client-ng/);
        // Client entries are side-effect imports — never a StartupExport.
        expect(content).not.toContain('StartupExport');
    });
});

describe('AddClientDynamicPackages — injects a client array into a server-only section', () => {
    it('adds client: [] alongside an existing server array, then lands the entry', () => {
        const config = [
            'module.exports = {',
            '  dynamicPackages: {',
            '    server: []',
            '  },',
            '};',
        ].join('\n');
        setupConfigFile(config);

        const result = AddClientDynamicPackages(REPO_ROOT, makeClientManifest('acme-app', '@acme/client-ng'));

        expect(result.Success).toBe(true);
        const content = writtenContent();
        expect(content).toMatch(/server\s*:\s*\[\s*\]/); // server array untouched
        expect(content).toMatch(/client:[\s\S]*@acme\/client-ng/); // client array injected + entry landed
    });
});

describe('RemoveServerDynamicPackages — array-agnostic sweep also clears client entries', () => {
    it('removes an app\'s client entry and collapses the empty client array to []', () => {
        const config = [
            'module.exports = {',
            '  dynamicPackages: {',
            '    server: [],',
            '    client: [',
            '      {',
            "        PackageName: '@acme/client-ng',",
            "        AppName: 'acme-app',",
            '        Enabled: true',
            '      },',
            '    ]',
            '  },',
            '};',
        ].join('\n');
        setupConfigFile(config);

        const result = RemoveServerDynamicPackages(REPO_ROOT, 'acme-app');

        expect(result.Success).toBe(true);
        const content = writtenContent();
        expect(content).not.toContain('@acme/client-ng');
        expect(content).toContain('client: []');
    });
});

describe('AddClientDynamicPackages — dedupes a re-add of the same package', () => {
    it('does not add a second entry for the same PackageName + AppName', () => {
        const config = [
            'module.exports = {',
            '  dynamicPackages: {',
            '    server: [],',
            '    client: [',
            '      {',
            "        PackageName: '@acme/client-ng',",
            "        AppName: 'acme-app',",
            '        Enabled: true',
            '      },',
            '    ]',
            '  },',
            '};',
        ].join('\n');
        setupConfigFile(config);

        const result = AddClientDynamicPackages(REPO_ROOT, makeClientManifest('acme-app', '@acme/client-ng'));

        expect(result.Success).toBe(true);
        const content = writtenContent();
        // Exactly one occurrence — the existing entry, not a duplicate.
        expect(content.match(/@acme\/client-ng/g)?.length).toBe(1);
    });
});
