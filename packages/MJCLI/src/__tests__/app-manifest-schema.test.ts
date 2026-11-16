/**
 * `mj migrate` without `--schema` takes the target schema from the Open App manifest it is pointed
 * at (#4771). Without that, an app's migrations were validated against the core schema's history
 * and every one was reported as unapplied.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FindAppManifestSchema } from '../lib/app-manifest-schema';

function manifest(schemaName?: string): string {
    return JSON.stringify({
        manifestVersion: 1,
        name: 'acme-orders',
        displayName: 'Acme Orders',
        description: 'Test manifest for the migrate schema lookup.',
        version: '1.0.0',
        license: 'MIT',
        publisher: { name: 'Acme' },
        repository: 'https://github.com/acme/orders',
        mjVersionRange: '>=6.0.0 <7.0.0',
        ...(schemaName ? { schema: { name: schemaName } } : {}),
    });
}

describe('FindAppManifestSchema', () => {
    let root: string;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'mj-migrate-schema-'));
    });

    afterEach(() => rmSync(root, { recursive: true, force: true }));

    it('finds the manifest above --dir and returns its schema', () => {
        writeFileSync(join(root, 'mj-app.json'), manifest('__acme_Orders'));
        mkdirSync(join(root, 'migrations', 'v1'), { recursive: true });

        const found = FindAppManifestSchema('migrations/v1', root);

        expect(found).toEqual({ ManifestPath: join(root, 'mj-app.json'), SchemaName: '__acme_Orders' });
    });

    it('accepts a filesystem: prefixed --dir', () => {
        writeFileSync(join(root, 'mj-app.json'), manifest('__acme_Orders'));
        mkdirSync(join(root, 'migrations'), { recursive: true });

        expect(FindAppManifestSchema('filesystem:./migrations', root)?.SchemaName).toBe('__acme_Orders');
    });

    it('finds the manifest in the current directory when --dir is not passed', () => {
        writeFileSync(join(root, 'mj-app.json'), manifest('__acme_Orders'));

        expect(FindAppManifestSchema(undefined, root)?.SchemaName).toBe('__acme_Orders');
    });

    it('does not walk above the repository root', () => {
        writeFileSync(join(root, 'mj-app.json'), manifest('__acme_Orders'));
        const repo = join(root, 'repo');
        mkdirSync(join(repo, '.git'), { recursive: true });
        mkdirSync(join(repo, 'migrations'), { recursive: true });

        expect(FindAppManifestSchema('migrations', repo)).toBeNull();
    });

    it('returns null when there is no manifest', () => {
        mkdirSync(join(root, 'migrations'), { recursive: true });
        mkdirSync(join(root, '.git'));

        expect(FindAppManifestSchema('migrations', root)).toBeNull();
    });

    it('returns no schema for an app that declares none', () => {
        writeFileSync(join(root, 'mj-app.json'), manifest());

        expect(FindAppManifestSchema(undefined, root)).toEqual({ ManifestPath: join(root, 'mj-app.json'), SchemaName: undefined });
    });

    it('throws, naming --schema, when the manifest does not validate', () => {
        writeFileSync(join(root, 'mj-app.json'), '{ "name": 1 }');

        expect(() => FindAppManifestSchema(undefined, root)).toThrow(/not a valid Open App manifest.*--schema/);
    });
});
