/**
 * The planning half of the PostgreSQL BulkCreate override: multi-row INSERT construction, the
 * 60k bind-parameter chunking (a wide table gets fewer rows per statement, never a failure),
 * placeholder numbering, and the same eligibility contract as the SQL Server module.
 */
import { describe, it, expect } from 'vitest';
import { BuildPgBulkStatements, IsPgBulkStatements, CoerceForPg } from '../PostgreSQLBulkCreate.js';
import type { BaseEntity, EntityFieldInfo, EntityInfo } from '@memberjunction/core';

const quote = (n: string) => `"${n}"`;

function field(Name: string, Type: string, extra: Partial<EntityFieldInfo> = {}): EntityFieldInfo {
    return { Name, Type, AllowsNull: true, AutoIncrement: false, IsVirtual: false, ...extra } as unknown as EntityFieldInfo;
}

function entityInfo(fields: EntityFieldInfo[], pks: string[] = ['ID']): EntityInfo {
    return {
        Name: 'Widgets', SchemaName: 'mjc', BaseTable: 'Widget',
        Fields: fields,
        PrimaryKeys: fields.filter(f => pks.includes(f.Name)),
    } as unknown as EntityInfo;
}

function entity(values: Record<string, unknown>, info: EntityInfo, saved = false): BaseEntity {
    return {
        EntityInfo: info, IsSaved: saved,
        Get: (n: string) => values[n] ?? null,
    } as unknown as BaseEntity;
}

describe('BuildPgBulkStatements', () => {
    const info = entityInfo([
        field('ID', 'uuid', { AllowsNull: false }),
        field('Name', 'character varying', { AllowsNull: false }),
        field('Notes', 'text'),
    ]);

    it('builds one multi-row INSERT with sequential placeholders and quoted identifiers', () => {
        const plan = BuildPgBulkStatements([
            entity({ ID: 'a', Name: 'one', Notes: 'x' }, info),
            entity({ ID: 'b', Name: 'two' }, info),
        ], info, quote);
        expect(IsPgBulkStatements(plan)).toBe(true);
        if (IsPgBulkStatements(plan)) {
            expect(plan).toHaveLength(1);
            expect(plan[0].SQL).toBe('INSERT INTO "mjc"."Widget" ("ID", "Name", "Notes") VALUES ($1, $2, $3), ($4, $5, $6)');
            expect(plan[0].Values).toEqual(['a', 'one', 'x', 'b', 'two', null]);
            expect(plan[0].Rows).toBe(2);
        }
    });

    it('chunks under the bind-parameter budget — a wide table gets fewer rows per statement', () => {
        // 30,001 shipped columns per row would be absurd; simulate width via many rows instead:
        // 3 columns → 20,000 rows per statement; 20,001 rows must split into two statements.
        const rows = Array.from({ length: 20_001 }, (_, i) => entity({ ID: `id${i}`, Name: `n${i}`, Notes: 'x' }, info));
        const plan = BuildPgBulkStatements(rows, info, quote);
        expect(IsPgBulkStatements(plan)).toBe(true);
        if (IsPgBulkStatements(plan)) {
            expect(plan).toHaveLength(2);
            expect(plan[0].Rows).toBe(20_000);
            expect(plan[1].Rows).toBe(1);
            // Placeholder numbering restarts per statement — each statement binds its own values.
            expect(plan[1].SQL).toContain('($1, $2, $3)');
        }
    });

    it('refuses an already-saved entity and a missing primary key, naming the reason', () => {
        expect((BuildPgBulkStatements([entity({ ID: 'a' }, info, true)], info, quote) as { Reason: string }).Reason).toBe('not-new');
        expect((BuildPgBulkStatements([entity({ Name: 'x' }, info)], info, quote) as { Reason: string }).Reason).toBe('missing-primary-key');
    });

    it('omits nullable columns nobody set, so their DB defaults apply', () => {
        const plan = BuildPgBulkStatements([entity({ ID: 'a', Name: 'one' }, info)], info, quote);
        if (IsPgBulkStatements(plan)) {
            expect(plan[0].SQL).not.toContain('"Notes"');
        }
    });
});

describe('CoerceForPg', () => {
    it('timestamps from strings, invalid → null; booleans from spellings; objects → JSON', () => {
        const ts = field('T', 'timestamp with time zone');
        expect(CoerceForPg('2026-08-24T00:00:00Z', ts)).toBeInstanceOf(Date);
        expect(CoerceForPg('nope', ts)).toBeNull();
        expect(CoerceForPg('1', field('B', 'boolean'))).toBe(true);
        expect(CoerceForPg({ a: 1 }, field('J', 'jsonb'))).toBe('{"a":1}');
        expect(CoerceForPg(null, field('S', 'text'))).toBeNull();
    });
});
