/**
 * Tests for the dynamicPackages / entityPackageName section INSERTION path in config-manager,
 * focused on issue #2975: appending a new top-level section to mj.config.cjs must comma-terminate
 * the preceding property, or the file becomes invalid JS and every later `require()` of it
 * (mj migrate / codegen / build) throws `SyntaxError: Unexpected identifier`.
 *
 * Validity is asserted by compiling the written content with `new Function(src)` — construction
 * throws SyntaxError on malformed JS without executing it (so `process.env` / `require` references
 * are harmless).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'node:path';

// ── Mock node:fs before importing the module under test ──────────────────
vi.mock('node:fs', () => ({
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
}));

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import {
    AddServerDynamicPackages,
    AddEntityPackageMapping,
    RemoveServerDynamicPackages,
} from '../install/config-manager.js';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

const REPO_ROOT = '/fake/repo';
const CONFIG_PATH = resolve(REPO_ROOT, 'mj.config.cjs');

// ── Helpers ──────────────────────────────────────────────────────────────

/** Sets up mocks so the config file exists and has the given content. */
function setupConfigFile(content: string): void {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(content);
}

/** Returns the most-recent content string written via writeFileSync. */
function writtenContent(): string {
    expect(mockedWriteFileSync).toHaveBeenCalled();
    const calls = mockedWriteFileSync.mock.calls;
    return calls[calls.length - 1][1] as string;
}

/**
 * Asserts that `src` is syntactically-valid JavaScript by compiling it. `new Function` throws
 * a SyntaxError on malformed input at *construction* time without running the body — so the
 * `module` / `process` / `require` references in a real mj.config.cjs never execute.
 */
function assertValidConfig(src: string): void {
    // eslint-disable-next-line no-new-func
    expect(() => new Function(src)).not.toThrow();
}

/**
 * The exact #2975 template: the last top-level property is a brace-terminated block with NO
 * trailing comma (the normal shape of a hand-written mj.config.cjs). Pre-fix, inserting a new
 * section after `openApps` produced `}\n  dynamicPackages: {…}` — invalid JS.
 */
function issueTemplateConfig(): string {
    return [
        'module.exports = {',
        '  openApps: {',
        "    serverPackagePath: 'apps/MJAPI',",
        "    clientPackagePath: 'apps/MJExplorer',",
        '    github: { token: process.env.GITHUB_TOKEN }',
        '  }',
        '};',
        '',
    ].join('\n');
}

/** Minimal manifest with a server bootstrap package (mirrors bizapps-common's common-server). */
function makeServerManifest(name = 'mj-bizapps-common') {
    const manifest: Record<string, unknown> = {
        name,
        packages: {
            server: [
                { name: '@mj-biz-apps/common-server', role: 'bootstrap', startupExport: 'LoadBizAppsCommonServer' },
            ],
        },
    };
    return manifest as Parameters<typeof AddServerDynamicPackages>[1];
}

/** Minimal manifest with a schema + entities library (drives the entityPackageName insert). */
function makeSchemaManifest(name = 'mj-bizapps-common', schemaName = '__mj_BizAppsCommon') {
    const manifest: Record<string, unknown> = {
        name,
        schema: { name: schemaName },
        packages: {
            shared: [{ name: '@mj-biz-apps/common-entities', role: 'library' }],
        },
    };
    return manifest as Parameters<typeof AddEntityPackageMapping>[1];
}

// ── Tests ────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.resetAllMocks();
});

describe('AddServerDynamicPackages — comma safety (#2975)', () => {
    it('comma-terminates a brace-terminated last property before inserting dynamicPackages', () => {
        setupConfigFile(issueTemplateConfig());

        const result = AddServerDynamicPackages(REPO_ROOT, makeServerManifest());

        expect(result.Success).toBe(true);
        const written = writtenContent();
        assertValidConfig(written); // pre-fix this was invalid JS
        // openApps block is now comma-separated from the new section
        expect(written).toMatch(/},\s*dynamicPackages\s*:/);
        expect(written).toContain('dynamicPackages');
        expect(written).toContain('@mj-biz-apps/common-server');
        // the config file at CONFIG_PATH was the one written
        expect(mockedWriteFileSync).toHaveBeenCalledWith(CONFIG_PATH, expect.any(String), 'utf-8');
    });

    it('inserts a comma after a string-valued last property without being fooled by // in the value', () => {
        setupConfigFile(
            ['module.exports = {', "  baseUrl: 'https://api.example.com'", '};', ''].join('\n'),
        );

        const result = AddServerDynamicPackages(REPO_ROOT, makeServerManifest());

        expect(result.Success).toBe(true);
        const written = writtenContent();
        assertValidConfig(written);
        // the closing quote got the comma; the `//` inside the URL was not treated as a comment
        expect(written).toMatch(/'https:\/\/api\.example\.com',/);
        expect(written).toContain('dynamicPackages');
    });

    it('is a no-op separator when the last property already ends with a comma', () => {
        setupConfigFile(
            ['module.exports = {', "  coreSchema: '__mj',", '};', ''].join('\n'),
        );

        const result = AddServerDynamicPackages(REPO_ROOT, makeServerManifest());

        expect(result.Success).toBe(true);
        const written = writtenContent();
        assertValidConfig(written);
        // no doubled comma introduced
        expect(written).not.toMatch(/,\s*,/);
    });

    it('handles an empty module.exports object', () => {
        setupConfigFile('module.exports = {};\n');

        const result = AddServerDynamicPackages(REPO_ROOT, makeServerManifest());

        expect(result.Success).toBe(true);
        const written = writtenContent();
        assertValidConfig(written);
        expect(written).toContain('dynamicPackages');
    });
});

describe('AddEntityPackageMapping — comma safety (#2975)', () => {
    it('comma-terminates a brace-terminated last property before inserting entityPackageName', () => {
        setupConfigFile(issueTemplateConfig());

        const result = AddEntityPackageMapping(REPO_ROOT, makeSchemaManifest());

        expect(result.Success).toBe(true);
        const written = writtenContent();
        assertValidConfig(written);
        expect(written).toMatch(/},\s*entityPackageName\s*:/);
        expect(written).toContain("'__mj_BizAppsCommon': '@mj-biz-apps/common-entities'");
    });
});

describe('Full install config write (bizapps-common shape) stays valid JS', () => {
    it('writes dynamicPackages then entityPackageName sequentially without corrupting the file', () => {
        // Step 1: AddServerDynamicPackages (as HandleServerConfig does first)
        setupConfigFile(issueTemplateConfig());
        const r1 = AddServerDynamicPackages(REPO_ROOT, makeServerManifest());
        expect(r1.Success).toBe(true);
        const afterServer = writtenContent();
        assertValidConfig(afterServer);

        // Step 2: AddEntityPackageMapping reads the file produced by step 1
        vi.resetAllMocks();
        setupConfigFile(afterServer);
        const r2 = AddEntityPackageMapping(REPO_ROOT, makeSchemaManifest());
        expect(r2.Success).toBe(true);
        const afterEntity = writtenContent();

        assertValidConfig(afterEntity);
        expect(afterEntity).toContain('dynamicPackages');
        expect(afterEntity).toContain('entityPackageName');
        expect(afterEntity).toContain('@mj-biz-apps/common-server');
        expect(afterEntity).toContain("'__mj_BizAppsCommon': '@mj-biz-apps/common-entities'");
    });
});

describe('Remove round-trip leaves valid JS', () => {
    it('add then remove server dynamic packages keeps mj.config.cjs parseable', () => {
        // add
        setupConfigFile(issueTemplateConfig());
        AddServerDynamicPackages(REPO_ROOT, makeServerManifest());
        const afterAdd = writtenContent();
        assertValidConfig(afterAdd);

        // remove
        vi.resetAllMocks();
        setupConfigFile(afterAdd);
        const result = RemoveServerDynamicPackages(REPO_ROOT, 'mj-bizapps-common');
        expect(result.Success).toBe(true);
        const afterRemove = writtenContent();

        assertValidConfig(afterRemove);
        expect(afterRemove).not.toContain('@mj-biz-apps/common-server');
    });
});

describe('Parse guard (#2975 safety net) — never silently writes a broken config', () => {
    it('refuses to write and reports failure when string surgery would corrupt the config', () => {
        // A regex literal containing `}` defeats the brace scanner (a limitation shared with the
        // existing FindMatchingBracket): the insert lands mid-token and the result is invalid JS.
        // The guard catches it, so the file is left UNTOUCHED rather than silently corrupted —
        // turning any string-surgery brittleness into a loud, safe failure.
        const exotic = [
            'module.exports = {',
            '  weird: /}/,',
            '  openApps: { token: process.env.X }',
            '};',
            '',
        ].join('\n');
        setupConfigFile(exotic);

        const result = AddServerDynamicPackages(REPO_ROOT, makeServerManifest());

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/invalid JavaScript|left unchanged/);
        expect(mockedWriteFileSync).not.toHaveBeenCalled(); // file untouched on a bad edit
    });

    it('writes exactly once when the resulting config is valid', () => {
        setupConfigFile(issueTemplateConfig());
        const result = AddServerDynamicPackages(REPO_ROOT, makeServerManifest());
        expect(result.Success).toBe(true);
        expect(mockedWriteFileSync).toHaveBeenCalledTimes(1);
    });
});
