/**
 * Server-side callers (the archive-seed job) must run the exact "find and add new tables"
 * path without a GraphQL round trip, so the apply-all-batch body lives in a public
 * `ApplyAllBatchCore` and the mutation only resolves user + provider and delegates.
 * This pins that shape in the source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '..', 'resolvers', 'IntegrationDiscoveryResolver.ts'), 'utf8');

describe('IntegrationDiscoveryResolver apply-all-batch core', () => {
    it('declares ApplyAllBatchCore as a public async method', () => {
        expect(source).toMatch(/public async ApplyAllBatchCore\(/);
    });

    it('has the IntegrationApplyAllBatch mutation delegate to ApplyAllBatchCore', () => {
        const start = source.indexOf('async IntegrationApplyAllBatch(');
        expect(start).toBeGreaterThan(-1);
        const end = source.indexOf('public async ApplyAllBatchCore(', start);
        expect(end).toBeGreaterThan(start);
        expect(source.slice(start, end)).toContain('this.ApplyAllBatchCore(');
    });

    it.each([
        'ApplyAllBatchInput',
        'ApplyAllBatchConnectorInput',
        'SourceObjectInput',
        'ApplyAllBatchOutput',
    ])('exports %s', (name) => {
        expect(source).toContain(`export class ${name}`);
    });
});
