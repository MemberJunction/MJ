/**
 * Regression tests for the mj.config.cjs injection fix (PR 3, tasks.md Problem 3).
 *
 * mj.config.cjs is EXECUTED (`require`d) by every mj migrate / codegen / build step, so any
 * manifest value spliced into it as a raw single-quoted string was an RCE vector: a package
 * name containing `'` and `;` could terminate the literal and append arbitrary statements.
 *
 * Two independent layers are pinned here:
 *   1. The config writer JSON.stringify-escapes every manifest-sourced value, so a hostile
 *      value survives ONLY as an inert string literal — the written config still parses, and
 *      evaluating it yields the hostile bytes as DATA, with no side effects.
 *   2. The manifest schema rejects hostile package names / startupExports / entityPackage
 *      up front (defence in depth — the config writer is not the only consumer).
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
} from '../install/config-manager.js';
import { mjAppManifestSchema } from '../manifest/manifest-schema.js';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

const REPO_ROOT = '/fake/repo';

/**
 * A value that, if spliced between single quotes unescaped, terminates the literal and
 * injects a statement. The `INJECTED` marker doubles as the execution-detection flag.
 */
const HOSTILE = "x'; globalThis.__INJECTED__ = true; //";

function setupConfigFile(content: string): void {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(content);
}

function writtenContent(): string {
    expect(mockedWriteFileSync).toHaveBeenCalled();
    const calls = mockedWriteFileSync.mock.calls;
    return calls[calls.length - 1][1] as string;
}

/**
 * Executes the written config the way Node's `require` would and returns module.exports.
 * If an injection succeeded, this either throws (malformed JS) or sets the INJECTED flag.
 */
function evalConfig(content: string): Record<string, unknown> {
    const module = { exports: {} as Record<string, unknown> };
    // eslint-disable-next-line no-new-func -- deliberate: prove the emitted config is inert
    new Function('module', 'exports', content)(module, module.exports);
    return module.exports;
}

const BASE_CONFIG = 'module.exports = {\n  dbHost: "localhost",\n};\n';

beforeEach(() => {
    vi.resetAllMocks();
    delete (globalThis as Record<string, unknown>).__INJECTED__;
});

describe('config writer — hostile values stay inert string literals (RCE regression)', () => {
    it('dynamicPackages entry: hostile PackageName/StartupExport/AppName cannot escape their literals', () => {
        setupConfigFile(BASE_CONFIG);
        const manifest = {
            name: HOSTILE,
            packages: { server: [{ name: HOSTILE, startupExport: HOSTILE }] },
        } as unknown as Parameters<typeof AddServerDynamicPackages>[1];

        const result = AddServerDynamicPackages(REPO_ROOT, manifest);
        expect(result.Success).toBe(true);

        const cfg = evalConfig(writtenContent()) as {
            dynamicPackages: { server: Array<{ PackageName: string; StartupExport: string; AppName: string }> };
        };
        expect((globalThis as Record<string, unknown>).__INJECTED__).toBeUndefined();
        expect(cfg.dynamicPackages.server[0].PackageName).toBe(HOSTILE);
        expect(cfg.dynamicPackages.server[0].StartupExport).toBe(HOSTILE);
        expect(cfg.dynamicPackages.server[0].AppName).toBe(HOSTILE);
    });

    it('excludeSchemas entry: hostile schema name cannot escape its literal', () => {
        setupConfigFile(BASE_CONFIG);
        const result = AddExcludeSchema(REPO_ROOT, HOSTILE);
        expect(result.Success).toBe(true);

        const cfg = evalConfig(writtenContent()) as { excludeSchemas: string[] };
        expect((globalThis as Record<string, unknown>).__INJECTED__).toBeUndefined();
        expect(cfg.excludeSchemas).toEqual([HOSTILE]);
    });

    it('entityPackageName entry: hostile schema + package cannot escape their literals', () => {
        setupConfigFile(BASE_CONFIG);
        const manifest = {
            name: 'acme-app',
            schema: { name: HOSTILE, entityPackage: HOSTILE },
        } as unknown as Parameters<typeof AddEntityPackageMapping>[1];

        const result = AddEntityPackageMapping(REPO_ROOT, manifest);
        expect(result.Success).toBe(true);

        const cfg = evalConfig(writtenContent()) as { entityPackageName: Record<string, string> };
        expect((globalThis as Record<string, unknown>).__INJECTED__).toBeUndefined();
        expect(cfg.entityPackageName[HOSTILE]).toBe(HOSTILE);
    });

    it('round-trip: a JSON.stringify-written (double-quoted) excludeSchemas entry is removable', () => {
        setupConfigFile(BASE_CONFIG);
        expect(AddExcludeSchema(REPO_ROOT, 'my_schema').Success).toBe(true);
        const afterAdd = writtenContent();
        expect(afterAdd).toContain('"my_schema"'); // written double-quoted by JSON.stringify

        setupConfigFile(afterAdd);
        expect(RemoveExcludeSchema(REPO_ROOT, 'my_schema').Success).toBe(true);
        const cfg = evalConfig(writtenContent()) as { excludeSchemas: string[] };
        expect(cfg.excludeSchemas).toEqual([]);
    });
});

describe('manifest schema — hostile identifiers rejected up front (defence in depth)', () => {
    const base = {
        manifestVersion: 1,
        name: 'test-app',
        displayName: 'Test App',
        description: 'A test app with at least ten characters.',
        version: '1.0.0',
        publisher: { name: 'Test Publisher' },
        repository: 'https://github.com/test/test-app',
        mjVersionRange: '>=4.0.0',
    };

    it('rejects a package name containing quotes/semicolons', () => {
        const result = mjAppManifestSchema.safeParse({
            ...base,
            packages: { server: [{ name: HOSTILE, role: 'actions', startupExport: 'load' }] },
        });
        expect(result.success).toBe(false);
    });

    it('rejects a startupExport that is not a bare JS identifier', () => {
        const result = mjAppManifestSchema.safeParse({
            ...base,
            packages: { server: [{ name: '@acme/server', role: 'actions', startupExport: 'load(); attack' }] },
        });
        expect(result.success).toBe(false);
    });

    it('rejects a schema.entityPackage that is not a valid npm name', () => {
        const result = mjAppManifestSchema.safeParse({
            ...base,
            schema: { name: 'acme_schema', entityPackage: HOSTILE },
        });
        expect(result.success).toBe(false);
    });

    it('still accepts valid scoped npm names and identifiers', () => {
        const result = mjAppManifestSchema.safeParse({
            ...base,
            schema: { name: 'acme_schema', entityPackage: '@acme/acme-entities' },
            packages: {
                server: [{ name: '@acme/server-pkg.node', role: 'actions', startupExport: '_load$2' }],
                shared: [{ name: 'plain-pkg', role: 'library' }],
            },
        });
        expect(result.success).toBe(true);
    });
});
