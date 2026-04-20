/**
 * Tests for entityPackageName mapping functions in config-manager.
 *
 * Covers AddEntityPackageMapping, RemoveEntityPackageMapping, and the
 * internal helpers (EnsureEntityPackageNameSection, ResolveEntityPackageFromManifest,
 * AddEntityPackageEntry, RemoveEntityPackageEntry) via their observable effects
 * on the config file content.
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
import { AddEntityPackageMapping, RemoveEntityPackageMapping } from '../install/config-manager.js';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

// ── Helpers ──────────────────────────────────────────────────────────────

const REPO_ROOT = '/fake/repo';
const CONFIG_PATH = resolve(REPO_ROOT, 'mj.config.cjs');

/** Bare-bones config file with no entityPackageName. */
function baseConfig(): string {
    return [
        'module.exports = {',
        '  dbHost: "localhost",',
        '};',
    ].join('\n');
}

/** Config file that already has entityPackageName as a string. */
function configWithStringEntityPkg(value = '@memberjunction/core-entities'): string {
    return [
        'module.exports = {',
        '  dbHost: "localhost",',
        `  entityPackageName: '${value}',`,
        '};',
    ].join('\n');
}

/** Config file that already has entityPackageName as a Record. */
function configWithRecordEntityPkg(entries: Record<string, string> = {}): string {
    const entryLines = Object.entries(entries)
        .map(([k, v]) => `    '${k}': '${v}',`)
        .join('\n');
    const inner = entryLines ? `\n${entryLines}\n  ` : '';
    return [
        'module.exports = {',
        '  dbHost: "localhost",',
        `  entityPackageName: {${inner}},`,
        '};',
    ].join('\n');
}

interface ManifestOpts {
    name?: string;
    schemaName?: string | null;
    entityPackage?: string;
    sharedPackages?: Array<{ name: string; role: string }>;
}

/**
 * Creates a minimal manifest-like object with only the fields
 * that config-manager touches: name, schema, packages.
 */
function makeManifest(opts: ManifestOpts = {}) {
    const {
        name = 'test-app',
        schemaName = 'test_schema',
        entityPackage,
        sharedPackages = [],
    } = opts;

    const manifest: Record<string, unknown> = { name };

    if (schemaName !== null) {
        const schema: Record<string, unknown> = { name: schemaName };
        if (entityPackage) {
            schema.entityPackage = entityPackage;
        }
        manifest.schema = schema;
    }

    manifest.packages = {
        shared: sharedPackages,
    };

    // The function expects MJAppManifest but only reads a few fields.
    // Cast to satisfy the type without constructing a full manifest.
    return manifest as Parameters<typeof AddEntityPackageMapping>[1];
}

/** Sets up mocks so the config file exists and has the given content. */
function setupConfigFile(content: string): void {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(content);
}

/** Returns the content string that was written via writeFileSync. */
function writtenContent(): string {
    expect(mockedWriteFileSync).toHaveBeenCalled();
    return mockedWriteFileSync.mock.calls[0][1] as string;
}

// ── Tests ────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.resetAllMocks();
});

describe('AddEntityPackageMapping', () => {
    it('should add mapping when app has schema + entities package', () => {
        setupConfigFile(baseConfig());

        const manifest = makeManifest({
            schemaName: 'acme',
            sharedPackages: [
                { name: '@acme/core-entities', role: 'library' },
            ],
        });

        const result = AddEntityPackageMapping(REPO_ROOT, manifest);

        expect(result.Success).toBe(true);
        const content = writtenContent();
        expect(content).toContain("'acme': '@acme/core-entities'");
        expect(content).toContain('entityPackageName');
    });

    it('should use explicit schema.entityPackage over auto-detect', () => {
        setupConfigFile(baseConfig());

        const manifest = makeManifest({
            schemaName: 'acme',
            entityPackage: '@acme/custom-entities-pkg',
            sharedPackages: [
                { name: '@acme/core-entities', role: 'library' },
            ],
        });

        const result = AddEntityPackageMapping(REPO_ROOT, manifest);

        expect(result.Success).toBe(true);
        const content = writtenContent();
        expect(content).toContain("'acme': '@acme/custom-entities-pkg'");
        expect(content).not.toContain('@acme/core-entities');
    });

    it('should return success no-op when app has no schema', () => {
        setupConfigFile(baseConfig());

        const manifest = makeManifest({ schemaName: null });

        const result = AddEntityPackageMapping(REPO_ROOT, manifest);

        expect(result.Success).toBe(true);
        expect(mockedWriteFileSync).not.toHaveBeenCalled();
    });

    it('should return success no-op when no entities package found in shared', () => {
        setupConfigFile(baseConfig());

        const manifest = makeManifest({
            schemaName: 'acme',
            sharedPackages: [
                { name: '@acme/utils', role: 'library' },
            ],
        });

        const result = AddEntityPackageMapping(REPO_ROOT, manifest);

        expect(result.Success).toBe(true);
        expect(mockedWriteFileSync).not.toHaveBeenCalled();
    });

    it('should fail when config file does not exist', () => {
        mockedExistsSync.mockReturnValue(false);

        const manifest = makeManifest({
            schemaName: 'acme',
            sharedPackages: [
                { name: '@acme/core-entities', role: 'library' },
            ],
        });

        const result = AddEntityPackageMapping(REPO_ROOT, manifest);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('No MJ config file found');
    });

    it('should handle multiple apps installed sequentially', () => {
        // Install first app
        setupConfigFile(baseConfig());
        const manifest1 = makeManifest({
            name: 'app-one',
            schemaName: 'alpha',
            sharedPackages: [
                { name: '@alpha/core-entities', role: 'library' },
            ],
        });

        const result1 = AddEntityPackageMapping(REPO_ROOT, manifest1);
        expect(result1.Success).toBe(true);
        const afterFirst = writtenContent();

        // Install second app — use the content from first write
        vi.resetAllMocks();
        setupConfigFile(afterFirst);
        const manifest2 = makeManifest({
            name: 'app-two',
            schemaName: 'beta',
            sharedPackages: [
                { name: '@beta/entities-lib', role: 'library' },
            ],
        });

        const result2 = AddEntityPackageMapping(REPO_ROOT, manifest2);
        expect(result2.Success).toBe(true);
        const afterSecond = writtenContent();

        expect(afterSecond).toContain("'alpha': '@alpha/core-entities'");
        expect(afterSecond).toContain("'beta': '@beta/entities-lib'");
    });

    it('should replace existing mapping when installing same app again (no duplicates)', () => {
        const initialConfig = configWithRecordEntityPkg({
            acme: '@acme/old-entities',
        });
        setupConfigFile(initialConfig);

        const manifest = makeManifest({
            schemaName: 'acme',
            sharedPackages: [
                { name: '@acme/new-entities', role: 'library' },
            ],
        });

        const result = AddEntityPackageMapping(REPO_ROOT, manifest);

        expect(result.Success).toBe(true);
        const content = writtenContent();
        expect(content).toContain("'acme': '@acme/new-entities'");
        expect(content).not.toContain('@acme/old-entities');

        // Verify there's exactly one occurrence of the schema key
        const matches = content.match(/'acme'/g);
        expect(matches).toHaveLength(1);
    });
});

describe('RemoveEntityPackageMapping', () => {
    it('should remove an existing mapping', () => {
        const initialConfig = configWithRecordEntityPkg({
            acme: '@acme/core-entities',
            beta: '@beta/entities',
        });
        setupConfigFile(initialConfig);

        const result = RemoveEntityPackageMapping(REPO_ROOT, 'acme');

        expect(result.Success).toBe(true);
        const content = writtenContent();
        expect(content).not.toContain("'acme'");
        expect(content).toContain("'beta': '@beta/entities'");
    });

    it('should succeed as no-op when schema does not exist in config', () => {
        const initialConfig = configWithRecordEntityPkg({
            beta: '@beta/entities',
        });
        setupConfigFile(initialConfig);

        const result = RemoveEntityPackageMapping(REPO_ROOT, 'nonexistent');

        expect(result.Success).toBe(true);
        const content = writtenContent();
        expect(content).toContain("'beta': '@beta/entities'");
    });

    it('should succeed as no-op when schemaName is empty string', () => {
        setupConfigFile(baseConfig());

        const result = RemoveEntityPackageMapping(REPO_ROOT, '');

        expect(result.Success).toBe(true);
        expect(mockedWriteFileSync).not.toHaveBeenCalled();
    });

    it('should fail when config file does not exist', () => {
        mockedExistsSync.mockReturnValue(false);

        const result = RemoveEntityPackageMapping(REPO_ROOT, 'acme');

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('No MJ config file found');
    });
});

describe('EnsureEntityPackageNameSection (via AddEntityPackageMapping)', () => {
    it('should create entityPackageName section when config has none', () => {
        setupConfigFile(baseConfig());

        const manifest = makeManifest({
            schemaName: 'acme',
            sharedPackages: [
                { name: '@acme/core-entities', role: 'library' },
            ],
        });

        AddEntityPackageMapping(REPO_ROOT, manifest);

        const content = writtenContent();
        expect(content).toContain('entityPackageName: {');
        expect(content).toContain("'acme': '@acme/core-entities'");
    });

    it('should convert string entityPackageName to Record with comment', () => {
        setupConfigFile(configWithStringEntityPkg('@memberjunction/core-entities'));

        const manifest = makeManifest({
            schemaName: 'acme',
            sharedPackages: [
                { name: '@acme/core-entities', role: 'library' },
            ],
        });

        AddEntityPackageMapping(REPO_ROOT, manifest);

        const content = writtenContent();
        // Should be converted to Record
        expect(content).toContain('entityPackageName: {');
        // Should contain the preservation comment with old value
        expect(content).toContain("Converted from string value '@memberjunction/core-entities'");
        // Should have the new entry
        expect(content).toContain("'acme': '@acme/core-entities'");
    });

    it('should leave existing Record entityPackageName alone', () => {
        const initialConfig = configWithRecordEntityPkg({
            existing: '@existing/entities',
        });
        setupConfigFile(initialConfig);

        const manifest = makeManifest({
            schemaName: 'acme',
            sharedPackages: [
                { name: '@acme/core-entities', role: 'library' },
            ],
        });

        AddEntityPackageMapping(REPO_ROOT, manifest);

        const content = writtenContent();
        // Existing entry preserved
        expect(content).toContain("'existing': '@existing/entities'");
        // New entry added
        expect(content).toContain("'acme': '@acme/core-entities'");
        // No conversion comment
        expect(content).not.toContain('Converted from string value');
    });
});

describe('ResolveEntityPackageFromManifest (via AddEntityPackageMapping)', () => {
    it('should prefer explicit schema.entityPackage over auto-detect', () => {
        setupConfigFile(baseConfig());

        const manifest = makeManifest({
            schemaName: 'acme',
            entityPackage: '@acme/explicit-entities',
            sharedPackages: [
                { name: '@acme/core-entities', role: 'library' },
            ],
        });

        AddEntityPackageMapping(REPO_ROOT, manifest);

        const content = writtenContent();
        expect(content).toContain("'acme': '@acme/explicit-entities'");
        expect(content).not.toContain('@acme/core-entities');
    });

    it('should auto-detect library-role package with "entities" in name', () => {
        setupConfigFile(baseConfig());

        const manifest = makeManifest({
            schemaName: 'acme',
            sharedPackages: [
                { name: '@acme/utils', role: 'library' },
                { name: '@acme/acme-entities', role: 'library' },
            ],
        });

        AddEntityPackageMapping(REPO_ROOT, manifest);

        const content = writtenContent();
        expect(content).toContain("'acme': '@acme/acme-entities'");
    });

    it('should pick first library package with "entities" when multiple match', () => {
        setupConfigFile(baseConfig());

        const manifest = makeManifest({
            schemaName: 'acme',
            sharedPackages: [
                { name: '@acme/core-entities', role: 'library' },
                { name: '@acme/extra-entities', role: 'library' },
            ],
        });

        AddEntityPackageMapping(REPO_ROOT, manifest);

        const content = writtenContent();
        expect(content).toContain("'acme': '@acme/core-entities'");
        expect(content).not.toContain('@acme/extra-entities');
    });

    it('should not match non-library role packages even if name contains "entities"', () => {
        setupConfigFile(baseConfig());

        const manifest = makeManifest({
            schemaName: 'acme',
            sharedPackages: [
                { name: '@acme/entities-actions', role: 'actions' },
            ],
        });

        const result = AddEntityPackageMapping(REPO_ROOT, manifest);

        // No library-role entities package found — no-op
        expect(result.Success).toBe(true);
        expect(mockedWriteFileSync).not.toHaveBeenCalled();
    });

    it('should match "entities" case-insensitively in package name', () => {
        setupConfigFile(baseConfig());

        const manifest = makeManifest({
            schemaName: 'acme',
            sharedPackages: [
                { name: '@acme/Core-Entities', role: 'library' },
            ],
        });

        AddEntityPackageMapping(REPO_ROOT, manifest);

        const content = writtenContent();
        expect(content).toContain("'acme': '@acme/Core-Entities'");
    });
});
