/**
 * Config-writer tests against real host config shapes:
 * - #3301: the stock MJAPI header comment documents an example `module.exports = { ... }`, and a
 *   host may use `excludeSchemas_append`. Searches must skip comments and edits must stay inside
 *   their target array/object.
 * - #4547: appending to an array whose last element has a trailing comma must not leave a hole.
 * - #4548: an entityPackageName entry with a bare (unquoted) key must be recognized.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
}));

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import {
    AddServerDynamicPackages,
    AddExcludeSchema,
    RemoveExcludeSchema,
    AddEntityPackageMapping,
    RemoveServerDynamicPackages,
    ToggleServerDynamicPackages,
    CountArrayHoles,
} from '../install/config-manager.js';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

const REPO_ROOT = '/fake/repo';

/** The stock MJAPI config header, whose example `module.exports = { ... }` sits inside a comment. */
const STOCK_HEADER = [
    '/**',
    ' * MJAPI Server Configuration',
    ' *',
    ' * To override ANY default setting, simply add it to this file.',
    ' * For example:',
    ' *',
    ' * module.exports = {',
    ' *   telemetry: {',
    ' *     enabled: false,',
    " *     level: 'debug'",
    ' *   },',
    ' *   userHandling: {',
    ' *     autoCreateNewUsers: false,',
    " *     newUserRoles: ['Viewer']",
    ' *   }',
    ' * };',
    ' */',
].join('\n');

/** A host config with the stock header and an `excludeSchemas_append` key (whose comment names it). */
function stockHostConfig(): string {
    return [
        STOCK_HEADER,
        'module.exports = {',
        "  dbHost: 'localhost',",
        '  // excludeSchemas_append adds to the default excludeSchemas: [ ... ] list',
        '  excludeSchemas_append: [',
        "    'staging',",
        '  ],',
        '};',
        '',
    ].join('\n');
}

function setupConfigFile(content: string): void {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(content);
}

function writtenContent(): string {
    expect(mockedWriteFileSync).toHaveBeenCalled();
    return mockedWriteFileSync.mock.calls[0][1] as string;
}

/** Evaluates a config the way `require()` would and returns its exports. */
function evaluate(content: string): Record<string, unknown> {
    const mod: { exports: Record<string, unknown> } = { exports: {} };
    new Function('module', content)(mod);
    return mod.exports;
}

function schemaManifest(schemaName = '__mj_Acme') {
    return {
        name: 'acme-app',
        schema: { name: schemaName, entityPackage: '@acme/entities' },
        packages: { server: [{ name: '@acme/server', startupExport: 'LoadAcme' }] },
    } as Parameters<typeof AddEntityPackageMapping>[1];
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe('#3301 — the stock header comment is never taken for config', () => {
    it('writes dynamicPackages into the real module.exports, leaving the header comment unchanged', () => {
        setupConfigFile(stockHostConfig());
        const result = AddServerDynamicPackages(REPO_ROOT, schemaManifest());

        expect(result.Success).toBe(true);
        const content = writtenContent();
        expect(content.startsWith(STOCK_HEADER)).toBe(true);
        const exported = evaluate(content) as { dynamicPackages: { server: { PackageName: string }[] } };
        expect(exported.dynamicPackages.server.map((e) => e.PackageName)).toEqual(['@acme/server']);
    });

    it('writes entityPackageName into the real module.exports, leaving the header comment unchanged', () => {
        setupConfigFile(stockHostConfig());
        const result = AddEntityPackageMapping(REPO_ROOT, schemaManifest());

        expect(result.Success).toBe(true);
        const content = writtenContent();
        expect(content.startsWith(STOCK_HEADER)).toBe(true);
        expect(evaluate(content).entityPackageName).toEqual({ __mj_Acme: '@acme/entities' });
    });

    it('adds the schema to excludeSchemas_append and creates no excludeSchemas key', () => {
        setupConfigFile(stockHostConfig());
        const result = AddExcludeSchema(REPO_ROOT, '__mj_Acme');

        expect(result.Success).toBe(true);
        const content = writtenContent();
        expect(content.startsWith(STOCK_HEADER)).toBe(true);
        expect(content).toContain('// excludeSchemas_append adds to the default excludeSchemas: [ ... ] list');
        const exported = evaluate(content);
        expect(exported.excludeSchemas_append).toEqual(['staging', '__mj_Acme']);
        expect(exported.excludeSchemas).toBeUndefined();
    });

    it('treats a schema already listed in excludeSchemas_append as present', () => {
        setupConfigFile(stockHostConfig().replace("'staging',", "'staging',\n    '__mj_Acme',"));
        const result = AddExcludeSchema(REPO_ROOT, '__mj_Acme');

        expect(result.Success).toBe(true);
        expect(evaluate(writtenContent()).excludeSchemas_append).toEqual(['staging', '__mj_Acme']);
    });

    it('does not count a commented-out entry as present', () => {
        const config = [
            'module.exports = {',
            '  excludeSchemas: [',
            "    'sys',",
            "    // '__mj_Acme',",
            '  ],',
            '};',
        ].join('\n');
        setupConfigFile(config);
        AddExcludeSchema(REPO_ROOT, '__mj_Acme');
        expect(evaluate(writtenContent()).excludeSchemas).toEqual(['sys', '__mj_Acme']);
    });

    it('removes the schema from the exclusion array only, never from comments or other values', () => {
        const config = [
            '// __mj_Acme is excluded below',
            'module.exports = {',
            "  note: '__mj_Acme',",
            "  excludeSchemas_append: ['staging', '__mj_Acme'],",
            '};',
        ].join('\n');
        setupConfigFile(config);
        const result = RemoveExcludeSchema(REPO_ROOT, '__mj_Acme');

        expect(result.Success).toBe(true);
        const content = writtenContent();
        expect(content).toContain('// __mj_Acme is excluded below');
        const exported = evaluate(content);
        expect(exported.note).toBe('__mj_Acme');
        expect(exported.excludeSchemas_append).toEqual(['staging']);
    });

    it('remove and toggle leave a commented-out entry for the same app alone', () => {
        const config = [
            'module.exports = {',
            '  dynamicPackages: {',
            '    server: [',
            "      // { PackageName: '@acme/old', AppName: 'acme-app', Enabled: true },",
            "      { PackageName: '@acme/server', AppName: 'acme-app', Enabled: true },",
            '    ],',
            '    client: []',
            '  },',
            '};',
        ].join('\n');
        setupConfigFile(config);
        ToggleServerDynamicPackages(REPO_ROOT, 'acme-app', false);
        const toggled = writtenContent();
        expect(toggled).toContain("// { PackageName: '@acme/old', AppName: 'acme-app', Enabled: true },");
        expect(toggled).toContain("{ PackageName: '@acme/server', AppName: 'acme-app', Enabled: false }");

        vi.resetAllMocks();
        setupConfigFile(config);
        RemoveServerDynamicPackages(REPO_ROOT, 'acme-app');
        const removed = writtenContent();
        expect(removed).toContain("// { PackageName: '@acme/old', AppName: 'acme-app', Enabled: true },");
        expect(removed).not.toContain("{ PackageName: '@acme/server'");
    });
});

describe('#4547 — trailing comma on the last array element', () => {
    it('appends without leaving a hole', () => {
        const config = [
            'module.exports = {',
            '  excludeSchemas: [',
            "    'sys',",
            "    'skip_client',",
            '  ],',
            '};',
        ].join('\n');
        setupConfigFile(config);
        const result = AddExcludeSchema(REPO_ROOT, '__mj_Acme');

        expect(result.Success).toBe(true);
        const content = writtenContent();
        expect(CountArrayHoles(content)).toBe(0);
        expect(evaluate(content).excludeSchemas).toEqual(['sys', 'skip_client', '__mj_Acme']);
    });

    it('appends after a last element followed by a comment', () => {
        const config = [
            'module.exports = {',
            "  excludeSchemas: ['sys', // system schema",
            '  ],',
            '};',
        ].join('\n');
        setupConfigFile(config);
        AddExcludeSchema(REPO_ROOT, '__mj_Acme');
        expect(evaluate(writtenContent()).excludeSchemas).toEqual(['sys', '__mj_Acme']);
    });

    it('still writes to a host whose array already has a hole', () => {
        // The shape the old writer left behind: the edit adds no new hole, so it is allowed.
        const config = [
            'module.exports = {',
            "  excludeSchemas: ['sys',",
            ', "__mj_Old"],',
            '};',
        ].join('\n');
        setupConfigFile(config);
        const result = AddExcludeSchema(REPO_ROOT, '__mj_Acme');
        expect(result.Success).toBe(true);
        expect(evaluate(writtenContent()).excludeSchemas).toEqual(['sys', undefined, '__mj_Old', '__mj_Acme']);
    });
});

describe('CountArrayHoles', () => {
    it('counts leading and middle holes', () => {
        expect(CountArrayHoles("x = ['a', , 'b']; y = [, 1];")).toBe(2);
    });

    it('ignores a trailing comma, strings and comments', () => {
        expect(CountArrayHoles("x = ['a,,b', 'c',]; // [, ,]\n/* [a, , b] */")).toBe(0);
    });
});

describe('#4548 — entityPackageName keys in any quoting style', () => {
    it.each([
        ['bare', "__mj_Acme: '@acme/entities',"],
        ['single-quoted', "'__mj_Acme': '@acme/entities',"],
        ['double-quoted', '"__mj_Acme": "@acme/entities",'],
    ])('replaces an existing %s key instead of adding a second copy', (_style, entry) => {
        const config = [
            'module.exports = {',
            '  entityPackageName: {',
            `    ${entry}`,
            "    __mj_Other: '@other/entities',",
            '  },',
            '};',
        ].join('\n');
        setupConfigFile(config);
        const result = AddEntityPackageMapping(REPO_ROOT, schemaManifest());

        expect(result.Success).toBe(true);
        const content = writtenContent();
        expect(content.match(/__mj_Acme/g)).toHaveLength(1);
        expect(evaluate(content).entityPackageName).toEqual({ __mj_Acme: '@acme/entities', __mj_Other: '@other/entities' });
    });

    it('does not touch a bare key that only ends with the schema name', () => {
        const config = [
            'module.exports = {',
            '  entityPackageName: {',
            "    x__mj_Acme: '@x/entities',",
            '  },',
            '};',
        ].join('\n');
        setupConfigFile(config);
        AddEntityPackageMapping(REPO_ROOT, schemaManifest());
        expect(evaluate(writtenContent()).entityPackageName).toEqual({ __mj_Acme: '@acme/entities', x__mj_Acme: '@x/entities' });
    });
});
