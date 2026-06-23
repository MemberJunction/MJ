/**
 * Tests for the dynamicPackages.server functions in config-manager
 * (AddServerDynamicPackages / RemoveServerDynamicPackages). These had zero
 * coverage; the cases below pin the B6 (false-match) and B7 (quote-style) fixes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
}));

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { AddServerDynamicPackages, RemoveServerDynamicPackages } from '../install/config-manager.js';

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

function makeServerManifest(appName: string, pkgName: string) {
    return {
        name: appName,
        packages: { server: [{ name: pkgName, startupExport: 'load' }] },
    } as Parameters<typeof AddServerDynamicPackages>[1];
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe('AddServerDynamicPackages — B6 regression (precise key detection)', () => {
    it('creates the dynamicPackages section even when a comment mentions the word', () => {
        const config = [
            'module.exports = {',
            '  dbHost: "localhost",',
            '  // NOTE: we do not use dynamicPackages here yet',
            '};',
        ].join('\n');
        setupConfigFile(config);

        const result = AddServerDynamicPackages(REPO_ROOT, makeServerManifest('acme-app', '@acme/server'));

        expect(result.Success).toBe(true);
        const content = writtenContent();
        // Pre-fix: includes('dynamicPackages') matched the comment, so the section
        // was never created and the entry was silently dropped. Post-fix: the real
        // `dynamicPackages:` section is created and the entry lands.
        expect(content).toMatch(/dynamicPackages\s*:\s*\{/);
        expect(content).toContain('@acme/server');
    });
});

describe('AddServerDynamicPackages — B10 (fail loudly, not silently)', () => {
    it('returns Success:false (no silent write) when there is no module.exports object literal to anchor to', () => {
        // No `module.exports = { ... }` anywhere → the section can't be placed. (An empty
        // `module.exports = {}` IS now a valid anchor — see the B4 block — so use a config
        // with no exports object at all.)
        setupConfigFile('const config = { dbHost: "localhost" };');
        const result = AddServerDynamicPackages(REPO_ROOT, makeServerManifest('acme-app', '@acme/server'));
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toBeDefined();
        // Pre-fix this returned the unchanged content + Success:true; now it must not
        // silently write a config that's missing the entry.
        expect(mockedWriteFileSync).not.toHaveBeenCalled();
    });
});

describe('AddServerDynamicPackages — B8 (anchor to dynamicPackages, not an unrelated server array)', () => {
    it('adds the entry to dynamicPackages.server, not an earlier unrelated `server: [ ]`', () => {
        const config = [
            'module.exports = {',
            "  someOtherThing: { server: ['a', 'b'] },",
            '  dynamicPackages: {',
            '    server: []',
            '  },',
            '};',
        ].join('\n');
        setupConfigFile(config);

        const result = AddServerDynamicPackages(REPO_ROOT, makeServerManifest('acme-app', '@acme/server'));

        expect(result.Success).toBe(true);
        const content = writtenContent();
        expect(content).toContain("someOtherThing: { server: ['a', 'b'] }"); // unrelated array untouched
        expect(content).toMatch(/dynamicPackages:[\s\S]*@acme\/server/); // entry landed in the right array
    });
});

describe('RemoveServerDynamicPackages — B7 regression (both quote styles)', () => {
    it('removes a double-quoted server entry', () => {
        const config = [
            'module.exports = {',
            '  dbHost: "localhost",',
            '  dynamicPackages: {',
            '    server: [',
            '      {',
            '        PackageName: "@acme/server",',
            '        StartupExport: "load",',
            '        AppName: "acme-app",',
            '        Enabled: true',
            '      },',
            '    ],',
            '  },',
            '};',
        ].join('\n');
        setupConfigFile(config);

        const result = RemoveServerDynamicPackages(REPO_ROOT, 'acme-app');

        expect(result.Success).toBe(true);
        const content = writtenContent();
        // Pre-fix: the single-quote-only regex never matched a double-quoted entry,
        // so remove was a silent no-op. Post-fix: the entry is actually removed.
        expect(content).not.toContain('@acme/server');
    });
});

describe('AddServerDynamicPackages — B4 (anchor insert to module.exports, not the last "};")', () => {
    it('inserts the section INSIDE module.exports even when trailing code has its own "};"', () => {
        const config = [
            'module.exports = {',
            '  dbHost: "localhost",',
            '};',
            '',
            'function helper() {',
            '  return 1;',
            '};',
        ].join('\n');
        setupConfigFile(config);

        const result = AddServerDynamicPackages(REPO_ROOT, makeServerManifest('acme-app', '@acme/server'));

        expect(result.Success).toBe(true);
        const content = writtenContent();
        // Pre-fix used lastIndexOf('};'), landing the section INSIDE function helper().
        // Post-fix anchors to the module.exports object literal: the section precedes the helper.
        expect(content.indexOf('@acme/server')).toBeLessThan(content.indexOf('function helper'));
        expect(content).toContain('function helper'); // trailing code untouched
    });

    it('fails loudly when module.exports is not a direct object literal (module.exports = cfg;)', () => {
        const config = ['const cfg = { dbHost: "localhost" };', 'module.exports = cfg;'].join('\n');
        setupConfigFile(config);

        const result = AddServerDynamicPackages(REPO_ROOT, makeServerManifest('acme-app', '@acme/server'));

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toBeDefined();
        expect(mockedWriteFileSync).not.toHaveBeenCalled();
    });
});

describe('AddServerDynamicPackages — B11 (FindMatchingBracket ignores brackets in strings)', () => {
    it('inserts after the real array close even when an entry value contains a "]"', () => {
        const config = [
            'module.exports = {',
            '  dynamicPackages: {',
            '    server: [',
            '      {',
            "        PackageName: '@x/srv',",
            "        StartupExport: 'load',",
            "        AppName: 'note] this has a bracket',",
            '        Enabled: true',
            '      },',
            '    ]',
            '  },',
            '};',
        ].join('\n');
        setupConfigFile(config);

        const result = AddServerDynamicPackages(REPO_ROOT, makeServerManifest('acme-app', '@acme/server'));

        expect(result.Success).toBe(true);
        const content = writtenContent();
        // The brace-bearing string is intact, and the new entry lands AFTER it (at the array's
        // real close). Pre-fix, the "]" inside the string mis-matched the bracket and the new
        // entry was spliced in the wrong place.
        expect(content).toContain("AppName: 'note] this has a bracket'");
        expect(content).toContain('@acme/server');
        expect(content.indexOf('@acme/server')).toBeGreaterThan(content.indexOf('note] this has a bracket'));
    });
});

describe('RemoveServerDynamicPackages — B12 (collapse a now-empty server array to [])', () => {
    it('leaves server: [] (not "[\\n    ]") after the last entry is removed', () => {
        const config = [
            'module.exports = {',
            '  dynamicPackages: {',
            '    server: [',
            '      {',
            "        PackageName: '@acme/server',",
            "        StartupExport: 'load',",
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
        expect(content).not.toContain('@acme/server');
        // Byte-idempotent with a never-populated config.
        expect(content).toContain('server: []');
    });
});
