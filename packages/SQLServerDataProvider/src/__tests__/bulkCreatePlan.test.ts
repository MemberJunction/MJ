/**
 * The pure planning half of the SQL Server BulkCreate override. These decisions — which columns
 * ship, how nullability mirrors metadata, how values are coerced — are where a bulk insert
 * silently corrupts data or is rejected by the TDS layer, so they are pinned without a database.
 */
import { describe, it, expect } from 'vitest';
import { BuildBulkTablePlan, IsBulkPlan, SqlTypeForField, CoerceForBulk } from '../SQLServerBulkCreate';
import type { BaseEntity, EntityFieldInfo, EntityInfo } from '@memberjunction/core';
import sql from 'mssql';

function field(Name: string, Type: string, extra: Partial<EntityFieldInfo> = {}): EntityFieldInfo {
    return { Name, Type, Length: null, Precision: null, Scale: null, AllowsNull: true, AutoIncrement: false, IsVirtual: false, ...extra } as unknown as EntityFieldInfo;
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
        EntityInfo: info,
        IsSaved: saved,
        Get: (n: string) => values[n] ?? null,
        PrimaryKey: { ToConcatenatedString: () => String(values['ID'] ?? '') },
    } as unknown as BaseEntity;
}

describe('BuildBulkTablePlan — eligibility', () => {
    const info = entityInfo([field('ID', 'nvarchar', { AllowsNull: false }), field('Name', 'nvarchar')]);

    it('refuses an already-saved entity — BulkCreate is insert-only', () => {
        const plan = BuildBulkTablePlan([entity({ ID: 'a' }, info, true)], info);
        expect(IsBulkPlan(plan)).toBe(false);
        expect((plan as { Reason: string }).Reason).toBe('not-new');
    });

    it('refuses a missing client-side primary key — set-based inserts cannot report keys back', () => {
        const plan = BuildBulkTablePlan([entity({ Name: 'no id' }, info)], info);
        expect(IsBulkPlan(plan)).toBe(false);
        expect((plan as { Reason: string }).Reason).toBe('missing-primary-key');
    });

    it('refuses a mixed set — one bulk table cannot hold two entity types', () => {
        const other = { ...info, Name: 'Gadgets' } as EntityInfo;
        const mixed = [entity({ ID: 'a' }, info), entity({ ID: 'b' }, other)];
        const plan = BuildBulkTablePlan(mixed, info);
        expect(IsBulkPlan(plan)).toBe(false);
        expect((plan as { Reason: string }).Reason).toBe('mixed-entities');
    });
});

describe('BuildBulkTablePlan — column selection', () => {
    it('ships NOT NULL columns always, nullable-with-values, and omits nullable-unset (DB defaults apply)', () => {
        const info = entityInfo([
            field('ID', 'uniqueidentifier', { AllowsNull: false }),
            field('Name', 'nvarchar', { AllowsNull: false }),
            field('Notes', 'nvarchar'),           // nullable, one row carries it → ships
            field('Untouched', 'nvarchar'),       // nullable, nobody set it → omitted
        ]);
        const plan = BuildBulkTablePlan([
            entity({ ID: 'a', Name: 'one', Notes: 'hi' }, info),
            entity({ ID: 'b', Name: 'two' }, info),
        ], info);
        expect(IsBulkPlan(plan)).toBe(true);
        if (IsBulkPlan(plan)) {
            expect(plan.Columns.map(c => c.Name)).toEqual(['ID', 'Name', 'Notes']);
            expect(plan.Rows).toEqual([['a', 'one', 'hi'], ['b', 'two', null]]);
        }
    });

    it('never ships the audit columns, virtual fields, or auto-increment fields', () => {
        const info = entityInfo([
            field('ID', 'uniqueidentifier', { AllowsNull: false }),
            field('__mj_CreatedAt', 'datetimeoffset', { AllowsNull: false }),
            field('__mj_UpdatedAt', 'datetimeoffset', { AllowsNull: false }),
            field('Derived', 'nvarchar', { IsVirtual: true, AllowsNull: false }),
            field('Seq', 'int', { AutoIncrement: true, AllowsNull: false }),
        ]);
        const plan = BuildBulkTablePlan([entity({ ID: 'a' }, info)], info);
        expect(IsBulkPlan(plan)).toBe(true);
        if (IsBulkPlan(plan)) expect(plan.Columns.map(c => c.Name)).toEqual(['ID']);
    });

    it('mirrors nullability from metadata — the TDS layer rejects a mismatch, so this IS the contract', () => {
        const info = entityInfo([
            field('ID', 'uniqueidentifier', { AllowsNull: false }),
            field('Notes', 'nvarchar'),
        ]);
        const plan = BuildBulkTablePlan([entity({ ID: 'a', Notes: 'x' }, info)], info);
        if (IsBulkPlan(plan)) {
            expect(plan.Columns.find(c => c.Name === 'ID')?.Nullable).toBe(false);
            expect(plan.Columns.find(c => c.Name === 'Notes')?.Nullable).toBe(true);
        }
    });
});

describe('SqlTypeForField — MJ Length is BYTES for nvarchar', () => {
    it('halves nvarchar Length (bytes → characters) and caps at MAX', () => {
        const t = SqlTypeForField(field('X', 'nvarchar', { Length: 200 })) as { length?: number };
        expect(t.length).toBe(100);
        const max = SqlTypeForField(field('X', 'nvarchar', { Length: -1 })) as { length?: number };
        expect(max.length).toBe(sql.MAX);
    });
});

describe('CoerceForBulk', () => {
    const dt = field('D', 'datetimeoffset');
    const num = field('N', 'decimal', { Precision: 18, Scale: 4 });
    const bit = field('B', 'bit');
    const str = field('S', 'nvarchar');

    it('dates from strings; invalid dates become null rather than a TDS type error', () => {
        expect(CoerceForBulk('2026-08-24T00:00:00Z', dt)).toBeInstanceOf(Date);
        expect(CoerceForBulk('not a date', dt)).toBeNull();
    });

    it('numbers from strings; non-finite becomes null', () => {
        expect(CoerceForBulk('42.5', num)).toBe(42.5);
        expect(CoerceForBulk('NaN', num)).toBeNull();
    });

    it('bit from the usual truthy spellings', () => {
        expect(CoerceForBulk('true', bit)).toBe(true);
        expect(CoerceForBulk(0, bit)).toBe(false);
    });

    it('objects serialize to JSON for string columns — same shape the per-record path stores', () => {
        expect(CoerceForBulk({ a: 1 }, str)).toBe('{"a":1}');
    });

    it('null and undefined stay null', () => {
        expect(CoerceForBulk(null, str)).toBeNull();
        expect(CoerceForBulk(undefined, str)).toBeNull();
    });
});
