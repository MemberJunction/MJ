/**
 * Unit tests for the credential-free tiers' PARENT-SIDE logic — the parts that
 * run without spawning a `tsx` child:
 *   - fixture loading + `$file` body resolution (`loadFixtures`),
 *   - T7 OpenAPI request validation (pure file parsing, no child),
 *   - T5/T6 fail-fast on missing fixtures.
 *
 * Each test builds a SYNTHETIC connector layout in a fresh temp dir set as the
 * registry root via `MJ_CONNECTORS_REGISTRY`, so no real registry connector is
 * touched. The child-spawning halves of T2/T3/T5/T6 are exercised by the
 * integration verification run documented in the PR report, not here (they need
 * the real connectors package + `tsx`).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

let root: string;

/**
 * Point the shared registry root at a fresh temp dir BEFORE importing the tier
 * modules — `REGISTRY_ROOT` in `childRunner.ts` is resolved at module-eval time
 * from `MJ_CONNECTORS_REGISTRY`, so we set it, then dynamically import per test.
 */
beforeEach(() => {
    root = mkdtempSync(resolve(tmpdir(), 'mj-tiers-'));
    process.env.MJ_CONNECTORS_REGISTRY = root;
    vi.resetModules();
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.MJ_CONNECTORS_REGISTRY;
});

/** Write a connector's integration-metadata file under the temp registry. */
function writeMetadata(connector: string, content: unknown): void {
    const dir = resolve(root, connector, 'metadata/integrations');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `.${connector}.json`), JSON.stringify(content), 'utf-8');
}

/** Write an OpenAPI spec into a connector's source-cache. */
function writeSpec(connector: string, fileName: string, spec: unknown): void {
    const dir = resolve(root, connector, 'source-cache');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, fileName), JSON.stringify(spec), 'utf-8');
}

/** Write a fixtures manifest (and optional sibling body files) for a connector. */
function writeFixtures(connector: string, manifest: unknown, files: Record<string, string> = {}): void {
    const dir = resolve(root, connector, 'fixtures');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'fixtures.json'), JSON.stringify(manifest), 'utf-8');
    for (const [name, body] of Object.entries(files)) writeFileSync(resolve(dir, name), body, 'utf-8');
}

describe('loadFixtures', () => {
    it('returns Manifest: null when no fixtures dir exists', async () => {
        const { loadFixtures } = await import('../tiers/fixtures.js');
        const r = loadFixtures('acme');
        expect(r.Manifest).toBeNull();
        expect(r.FixturesDir).toContain('acme');
    });

    it('loads an http manifest and defaults ConfigUrlKey to BaseURL', async () => {
        writeFixtures('acme', { Transport: 'http', Routes: [{ Path: '/x', Body: [{ id: 1 }] }] });
        const { loadFixtures } = await import('../tiers/fixtures.js');
        const r = loadFixtures('acme');
        expect(r.Manifest?.Transport).toBe('http');
        expect(r.Manifest?.ConfigUrlKey).toBe('BaseURL');
        expect(r.Manifest?.Routes?.[0].Path).toBe('/x');
    });

    it('loads a file manifest and defaults ConfigUrlKey to storagePath', async () => {
        writeFixtures('acme', { Transport: 'file', FileContent: 'a,b\n1,2\n' });
        const { loadFixtures } = await import('../tiers/fixtures.js');
        const r = loadFixtures('acme');
        expect(r.Manifest?.Transport).toBe('file');
        expect(r.Manifest?.ConfigUrlKey).toBe('storagePath');
        expect(r.Manifest?.FileContent).toContain('1,2');
    });

    it('resolves a {$file} route body from a sibling file', async () => {
        writeFixtures(
            'acme',
            { Transport: 'http', Routes: [{ Path: '/x', Body: { $file: 'x.json' } }] },
            { 'x.json': JSON.stringify([{ id: 'from-file' }]) },
        );
        const { loadFixtures } = await import('../tiers/fixtures.js');
        const r = loadFixtures('acme');
        expect(r.Manifest?.Routes?.[0].Body).toEqual([{ id: 'from-file' }]);
        expect(r.Warnings).toHaveLength(0);
    });

    it('warns (not throws) when a {$file} body is missing', async () => {
        writeFixtures('acme', { Transport: 'http', Routes: [{ Path: '/x', Body: { $file: 'missing.json' } }] });
        const { loadFixtures } = await import('../tiers/fixtures.js');
        const r = loadFixtures('acme');
        expect(r.Warnings.length).toBeGreaterThan(0);
        expect(r.Manifest?.Routes?.[0].Body).toBeNull();
    });
});

describe('T7_OpenAPIValidation', () => {
    const identity = { ClassName: 'AcmeConnector', SourcePath: '/nonexistent/AcmeConnector.ts' };

    it('Skips with no-openapi-spec when no spec is present', async () => {
        writeMetadata('acme', { relatedEntities: { 'MJ: Integration Objects': [{ fields: { Name: 'Contact', APIPath: '/contacts' } }] } });
        const { runT7OpenApi } = await import('../tiers/t7OpenApi.js');
        const r = runT7OpenApi('acme', identity);
        expect(r.Status).toBe('Skipped');
        expect(r.Errors).toContain('no-openapi-spec');
    });

    it('Skips with no-api-paths when a spec exists but the connector declares no paths', async () => {
        writeSpec('acme', 'acme.openapi.json', { paths: { '/contacts': { get: {} } } });
        writeMetadata('acme', { relatedEntities: { 'MJ: Integration Objects': [{ fields: { Name: 'Contact' } }] } });
        const { runT7OpenApi } = await import('../tiers/t7OpenApi.js');
        const r = runT7OpenApi('acme', identity);
        expect(r.Status).toBe('Skipped');
        expect(r.Errors).toContain('no-api-paths');
    });

    it('Passes when every declared path matches a spec route + method', async () => {
        writeSpec('acme', 'acme.openapi.json', {
            paths: {
                '/contacts': { get: {}, post: {} },
                '/contacts/{id}': { get: {}, patch: {}, delete: {} },
            },
        });
        writeMetadata('acme', {
            relatedEntities: {
                'MJ: Integration Objects': [
                    { fields: { Name: 'Contact', APIPath: '/contacts', CreateAPIPath: '/contacts', UpdateAPIPath: '/contacts/{id}', DeleteAPIPath: '/contacts/{id}' } },
                ],
            },
        });
        const { runT7OpenApi } = await import('../tiers/t7OpenApi.js');
        const r = runT7OpenApi('acme', identity);
        expect(r.Status).toBe('Pass');
        expect(r.Errors).toHaveLength(0);
    });

    it('Fails when a declared path matches no spec route', async () => {
        writeSpec('acme', 'acme.openapi.json', { paths: { '/contacts': { get: {} } } });
        writeMetadata('acme', { relatedEntities: { 'MJ: Integration Objects': [{ fields: { Name: 'Widget', APIPath: '/widgets' } }] } });
        const { runT7OpenApi } = await import('../tiers/t7OpenApi.js');
        const r = runT7OpenApi('acme', identity);
        expect(r.Status).toBe('Fail');
        expect(r.Errors.join(' ')).toContain('/widgets');
    });

    it('Fails when the spec route exists but does not support the needed method', async () => {
        writeSpec('acme', 'acme.openapi.json', { paths: { '/contacts': { get: {} } } });
        writeMetadata('acme', { relatedEntities: { 'MJ: Integration Objects': [{ fields: { Name: 'Contact', APIPath: '/contacts', CreateAPIPath: '/contacts' } }] } });
        const { runT7OpenApi } = await import('../tiers/t7OpenApi.js');
        const r = runT7OpenApi('acme', identity);
        expect(r.Status).toBe('Fail');
        expect(r.Errors.join(' ')).toContain('does not support method POST');
    });

    it('matches a declared path against a templated spec route', async () => {
        writeSpec('acme', 'acme.openapi.json', { paths: { '/crm/v3/objects/{objectType}': { get: {} } } });
        writeMetadata('acme', { relatedEntities: { 'MJ: Integration Objects': [{ fields: { Name: 'Contact', APIPath: '/crm/v3/objects/contacts' } }] } });
        const { runT7OpenApi } = await import('../tiers/t7OpenApi.js');
        const r = runT7OpenApi('acme', identity);
        expect(r.Status).toBe('Pass');
    });
});

describe('T5/T6 fail-fast on missing fixtures', () => {
    const identity = { ClassName: 'AcmeConnector', SourcePath: '/nonexistent/AcmeConnector.ts' };

    it('T5 Skips (non-blocking) with no-fixtures when no fixtures exist — surfaced as a visible warning, never a silent pass', async () => {
        const { runT5MockHttp } = await import('../tiers/t5MockHttp.js');
        const r = runT5MockHttp('acme', identity);
        expect(r.Status).toBe('Skipped');
        expect(r.Errors.join(' ')).toContain('no-fixtures');
        expect(r.Details?.reason).toBe('no-fixtures');
    });

    it('T6 Skips (non-blocking) with no-fixtures when no fixtures exist — surfaced as a visible warning, never a silent pass', async () => {
        const { runT6Sqlite } = await import('../tiers/t6Sqlite.js');
        const r = runT6Sqlite('acme', identity);
        expect(r.Status).toBe('Skipped');
        expect(r.Errors.join(' ')).toContain('no-fixtures');
        expect(r.Details?.reason).toBe('no-fixtures');
    });
});
