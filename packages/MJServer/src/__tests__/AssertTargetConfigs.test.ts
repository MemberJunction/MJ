/**
 * An apply whose selected objects all drop out of buildTargetConfigs must fail, not run RSU on
 * nothing (PropFuel, 2026-10-29). A selection that produces even one table must still apply.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TargetTableConfig } from '@memberjunction/integration-schema-builder';
import { AssertTargetConfigs, NewTargetConfigDrops, SampleNames } from '../integration/TargetConfigGuard.js';

const selected = [{ SourceObjectName: 'clicks' }, { SourceObjectName: 'sends' }, { SourceObjectName: 'opens' }];
const oneTable = [{ SchemaName: 'propfuel', TableName: 'clicks' } as TargetTableConfig];

describe('AssertTargetConfigs', () => {
    it('refuses a selection none of whose objects produced a table, naming what was asked for', () => {
        expect(() => AssertTargetConfigs(selected, [], 'PropFuel')).toThrow(
            /NO_TARGET_TABLES: none of the 3 selected object\(s\) for PropFuel produced a target table \(clicks, sends, opens\)/
        );
    });

    it('names why each object was dropped, so a caller does not need the server log', () => {
        const drops = NewTargetConfigDrops();
        drops.NotInSchema.push('clicks', 'sends');
        drops.NoPrimaryKey.push('opens');
        expect(() => AssertTargetConfigs(selected, [], 'PropFuel', drops)).toThrow(
            'Dropped as not in the source schema: clicks, sends; no primary key: opens.'
        );
    });

    it('says nothing was applied by default, and what was already committed when the caller says so', () => {
        expect(() => AssertTargetConfigs(selected, [], 'PropFuel')).toThrow('Nothing was applied.');
        expect(() => AssertTargetConfigs(selected, [], 'PropFuel', undefined, 'The catalog had already been saved.'))
            .toThrow(/The catalog had already been saved\. Re-run discovery/);
    });

    it('caps the names it lists, so a large selection cannot make a multi-KB error', () => {
        const many = Array.from({ length: 168 }, (_v, i) => ({ SourceObjectName: `obj${i}` }));
        expect(() => AssertTargetConfigs(many, [], 'NetForum')).toThrow('(obj0, obj1, obj2, obj3, obj4 and 163 more)');
        expect(SampleNames(['a', 'b'])).toBe('a, b');
    });

    it('lets a selection through when at least one object produced a table', () => {
        expect(() => AssertTargetConfigs(selected, oneTable, 'PropFuel')).not.toThrow();
    });

    it('lets an empty selection through — there was nothing to refuse', () => {
        expect(() => AssertTargetConfigs([], [], 'PropFuel')).not.toThrow();
    });
});

/**
 * Read from source: the call sites are resolver mutations that need a provider, a connector and an
 * RSU pipeline to run.
 */
describe('the guard\'s callers', () => {
    const SRC = readFileSync(join(__dirname, '..', 'resolvers', 'IntegrationDiscoveryResolver.ts'), 'utf-8');

    it('IntegrationApplySchema filters on names whose casing resolveObjectInputs has corrected', () => {
        // A filter built from the raw input is case-sensitive: `Clicks` for a stored `clicks` selected
        // nothing, and the guard then told the caller to re-run discovery, which cannot fix casing.
        const start = SRC.indexOf('async IntegrationApplySchema(');
        const body = SRC.slice(start, SRC.indexOf('AssertTargetConfigs(', start));
        const resolve = body.indexOf('await this.resolveObjectInputs(objects, sourceSchema, user);');
        const names = body.indexOf('const resolvedNames = new Set(objects.map(o => o.SourceObjectName));');
        expect(resolve).toBeGreaterThan(-1);
        expect(names).toBeGreaterThan(resolve);
        expect(body).toMatch(/sourceSchema\.Objects\.filter\(o => resolvedNames\.has\(o\.ExternalName\)\)/);
    });

    it('every call passes the drop reasons, and schema evolution says what it had already committed', () => {
        const calls = [...SRC.matchAll(/AssertTargetConfigs\(objects, targetConfigs, companyIntegration\.Integration, drops([\s\S]*?)\);/g)];
        expect(calls).toHaveLength(3);
        expect(calls.filter(c => /already been saved/.test(c[1]))).toHaveLength(1);
    });
});
