/**
 * Deepened coverage for EntityInfo / EntityFieldInfo (Wave 1 blast radius).
 *
 * Companion to entityInfo.fieldIndex.test.ts (read that for the makeEntity / EntityInfo
 * construction style). This file drives EVERY distinct SQL-type branch through
 * EntityFieldInfo.TSType, exercises FieldByName whitespace/case/miss edge cases, and covers
 * each derived getter (PrimaryKeys / UniqueKeys / ForeignKeys / EncryptedFields / DatetimeFields /
 * NameField / FirstPrimaryKey) for the awkward entity shapes: composite PK, no PK, multiple
 * IsNameField, no IsNameField (literal "Name" fallback), no name field at all, and zero fields.
 *
 * The TSType mappings asserted here were captured empirically against the live
 * TypeScriptTypeFromSQLType classifier (delegated to @memberjunction/sql-dialect), so a regression
 * in that classifier — or in the memoization — fails this suite.
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo, EntityFieldInfo, EntityFieldTSType } from '../generic/entityInfo';

function field(name: string, type: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { ID: name, EntityID: 'e', Name: name, Type: type, Sequence: 1, Status: 'Active', ...extra };
}

function makeField(type: string): EntityFieldInfo {
    return new EntityFieldInfo(field('N', type));
}

describe('EntityFieldInfo.TSType — every distinct SQL-type branch', () => {
    const numberTypes = ['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'money', 'smallmoney', 'float', 'real'];
    const booleanTypes = ['bit'];
    const dateTypes = ['date', 'datetime', 'datetime2', 'smalldatetime', 'datetimeoffset', 'time', 'timestamp'];
    // uniqueidentifier + char/varchar family + binary family all classify as String
    const stringTypes = ['uniqueidentifier', 'nvarchar', 'varchar', 'char', 'nchar', 'text', 'ntext', 'binary', 'varbinary', 'image'];

    it.each(numberTypes)('maps %s -> Number', (t) => {
        expect(makeField(t).TSType).toBe(EntityFieldTSType.Number);
    });

    it.each(booleanTypes)('maps %s -> Boolean', (t) => {
        expect(makeField(t).TSType).toBe(EntityFieldTSType.Boolean);
    });

    it.each(dateTypes)('maps %s -> Date', (t) => {
        expect(makeField(t).TSType).toBe(EntityFieldTSType.Date);
    });

    it.each(stringTypes)('maps %s -> String', (t) => {
        expect(makeField(t).TSType).toBe(EntityFieldTSType.String);
    });

    it('falls back to Number for unrecognized / non-classified types (xml/json/sql_variant)', () => {
        // These aren't in the string/date/boolean lists, so the classifier defaults to number.
        expect(makeField('xml').TSType).toBe(EntityFieldTSType.Number);
        expect(makeField('json').TSType).toBe(EntityFieldTSType.Number);
        expect(makeField('sql_variant').TSType).toBe(EntityFieldTSType.Number);
    });

    it('memoizes: the classified value does not recompute after the Type is mutated', () => {
        const f = makeField('datetime2');
        expect(f.TSType).toBe(EntityFieldTSType.Date);
        // Type is immutable post-load in real usage; mutating proves the result is cached.
        (f as unknown as { Type: string }).Type = 'int';
        expect(f.TSType).toBe(EntityFieldTSType.Date);
    });

    it('memoizes on first read so repeated reads are reference-stable for object-typed results', () => {
        // TSType is a string union (primitive), so identity comparison is value-equality; this test
        // documents that repeated reads are consistent and cheap after the first computation.
        const f = makeField('bit');
        const a = f.TSType;
        const b = f.TSType;
        expect(a).toBe(b);
        expect(a).toBe(EntityFieldTSType.Boolean);
    });
});

describe('EntityFieldInfo.IsUniqueIdentifier — SQL Server + PostgreSQL type names', () => {
    it('is true for SQL Server uniqueidentifier', () => {
        expect(makeField('uniqueidentifier').IsUniqueIdentifier).toBe(true);
    });

    it('is true for PostgreSQL uuid (the regression this guards)', () => {
        // On PG the metadata Type is reported as `uuid`; a uniqueidentifier-only
        // check would miss every UUID PK and break NewRecord() UUID generation.
        expect(makeField('uuid').IsUniqueIdentifier).toBe(true);
    });

    it('is case- and whitespace-insensitive', () => {
        expect(makeField('  UUID ').IsUniqueIdentifier).toBe(true);
        expect(makeField('UNIQUEIDENTIFIER').IsUniqueIdentifier).toBe(true);
    });

    it('is false for non-GUID types', () => {
        expect(makeField('nvarchar').IsUniqueIdentifier).toBe(false);
        expect(makeField('int').IsUniqueIdentifier).toBe(false);
        expect(makeField('varchar').IsUniqueIdentifier).toBe(false);
    });
});

describe('EntityInfo.FieldByName — lookup edge cases', () => {
    function entity(): EntityInfo {
        return new EntityInfo({
            ID: 'e', Name: 'E', SchemaName: 'app', BaseTable: 'E',
            EntityFields: [
                field('ID', 'uniqueidentifier', { IsPrimaryKey: true }),
                field('Mixed Case Field', 'nvarchar'),
                field('Count', 'int'),
            ],
        });
    }

    it('returns undefined for a name that does not exist', () => {
        expect(entity().FieldByName('Nope')).toBeUndefined();
    });

    it('handles leading/trailing whitespace by trimming', () => {
        expect(entity().FieldByName('   Count   ')?.Name).toBe('Count');
    });

    it('is case-insensitive including names that contain spaces', () => {
        expect(entity().FieldByName('mixed case field')?.Name).toBe('Mixed Case Field');
        expect(entity().FieldByName('  MIXED CASE FIELD  ')?.Name).toBe('Mixed Case Field');
    });

    it('returns undefined for empty / whitespace-only / null inputs', () => {
        const e = entity();
        expect(e.FieldByName('')).toBeUndefined();
        expect(e.FieldByName('    ')).toBeUndefined();
        // @ts-expect-error intentionally passing null to exercise the guard
        expect(e.FieldByName(null)).toBeUndefined();
        // @ts-expect-error intentionally passing undefined to exercise the guard
        expect(e.FieldByName(undefined)).toBeUndefined();
    });

    it('returns the identical EntityFieldInfo instance across differently-cased lookups', () => {
        const e = entity();
        expect(e.FieldByName('count')).toBe(e.FieldByName('COUNT'));
    });
});

describe('EntityInfo derived getters — awkward entity shapes', () => {
    it('composite PK: PrimaryKeys returns both PKs in order; FirstPrimaryKey is the first', () => {
        const e = new EntityInfo({
            ID: 'e', Name: 'Junction', SchemaName: 'app', BaseTable: 'Junction',
            EntityFields: [
                field('TenantID', 'uniqueidentifier', { IsPrimaryKey: true, IsUnique: true, Sequence: 1 }),
                field('RecordID', 'uniqueidentifier', { IsPrimaryKey: true, IsUnique: true, Sequence: 2 }),
                field('Label', 'nvarchar', { Sequence: 3 }),
            ],
        });
        expect(e.PrimaryKeys.map(f => f.Name)).toEqual(['TenantID', 'RecordID']);
        expect(e.FirstPrimaryKey.Name).toBe('TenantID');
        expect(e.PrimaryKeys).toBe(e.PrimaryKeys); // memoized, stable reference
    });

    it('no PK: PrimaryKeys is empty (stable) and FirstPrimaryKey is undefined', () => {
        const e = new EntityInfo({
            ID: 'e', Name: 'PkLess', SchemaName: 'app', BaseTable: 'PkLess',
            EntityFields: [
                field('Label', 'nvarchar', { Sequence: 1 }),
                field('Value', 'int', { Sequence: 2 }),
            ],
        });
        expect(e.PrimaryKeys).toEqual([]);
        expect(e.PrimaryKeys).toBe(e.PrimaryKeys);
        // find() returns undefined when there is no PK field — the getter is typed EntityFieldInfo
        // but at runtime exposes the underlying undefined for a PK-less entity.
        expect(e.FirstPrimaryKey as EntityFieldInfo | undefined).toBeUndefined();
    });

    it('multiple IsNameField with a literal "Name" present: prefers the literal "Name"', () => {
        const e = new EntityInfo({
            ID: 'e', Name: 'MultiName', SchemaName: 'app', BaseTable: 'MultiName',
            EntityFields: [
                field('DisplayName', 'nvarchar', { IsNameField: true, Sequence: 1 }),
                field('Name', 'nvarchar', { IsNameField: true, Sequence: 2 }),
            ],
        });
        expect(e.NameField?.Name).toBe('Name');
        expect(e.NameField).toBe(e.NameField); // cached
    });

    it('multiple IsNameField WITHOUT a literal "Name": returns the first IsNameField by order', () => {
        const e = new EntityInfo({
            ID: 'e', Name: 'MultiNoName', SchemaName: 'app', BaseTable: 'MultiNoName',
            EntityFields: [
                field('DisplayName', 'nvarchar', { IsNameField: true, Sequence: 1 }),
                field('Title', 'nvarchar', { IsNameField: true, Sequence: 2 }),
            ],
        });
        expect(e.NameField?.Name).toBe('DisplayName');
    });

    it('no IsNameField but a literal "Name" field exists: falls back to "Name"', () => {
        const e = new EntityInfo({
            ID: 'e', Name: 'LiteralName', SchemaName: 'app', BaseTable: 'LiteralName',
            EntityFields: [
                field('ID', 'uniqueidentifier', { IsPrimaryKey: true, Sequence: 1 }),
                field('Name', 'nvarchar', { Sequence: 2 }),
            ],
        });
        expect(e.NameField?.Name).toBe('Name');
    });

    it('no IsNameField and no field literally named "Name": NameField is null', () => {
        const e = new EntityInfo({
            ID: 'e', Name: 'NoName', SchemaName: 'app', BaseTable: 'NoName',
            EntityFields: [
                field('ID', 'uniqueidentifier', { IsPrimaryKey: true, Sequence: 1 }),
                field('Label', 'nvarchar', { Sequence: 2 }),
            ],
        });
        expect(e.NameField).toBeNull();
    });

    it('zero fields: every derived array is empty and stable; NameField is null', () => {
        const e = new EntityInfo({
            ID: 'e', Name: 'Empty', SchemaName: 'app', BaseTable: 'Empty',
            EntityFields: [],
        });
        expect(e.PrimaryKeys).toEqual([]);
        expect(e.UniqueKeys).toEqual([]);
        expect(e.ForeignKeys).toEqual([]);
        expect(e.EncryptedFields).toEqual([]);
        expect(e.DatetimeFields).toEqual([]);
        expect(e.NameField).toBeNull();
        expect(e.PrimaryKeys).toBe(e.PrimaryKeys);
        expect(e.DatetimeFields).toBe(e.DatetimeFields);
        expect(e.FirstPrimaryKey as EntityFieldInfo | undefined).toBeUndefined();
    });

    it('UniqueKeys / ForeignKeys / EncryptedFields / DatetimeFields each select the right fields', () => {
        const e = new EntityInfo({
            ID: 'e', Name: 'Mixed', SchemaName: 'app', BaseTable: 'Mixed',
            EntityFields: [
                field('ID', 'uniqueidentifier', { IsPrimaryKey: true, IsUnique: true, Sequence: 1 }),
                field('AltKey', 'nvarchar', { IsUnique: true, Sequence: 2 }),
                field('OwnerID', 'uniqueidentifier', { RelatedEntityID: 'other', Sequence: 3 }),
                field('Secret', 'nvarchar', { Encrypt: true, Sequence: 4 }),
                field('CreatedAt', 'datetimeoffset', { Sequence: 5 }),
                field('UpdatedOn', 'datetime', { Sequence: 6 }),
                field('Plain', 'nvarchar', { Sequence: 7 }),
            ],
        });
        expect(e.UniqueKeys.map(f => f.Name)).toEqual(['ID', 'AltKey']);
        expect(e.ForeignKeys.map(f => f.Name)).toEqual(['OwnerID']);
        expect(e.EncryptedFields.map(f => f.Name)).toEqual(['Secret']);
        // DatetimeFields keys off TSType === Date — both date-typed columns qualify.
        expect(e.DatetimeFields.map(f => f.Name).sort()).toEqual(['CreatedAt', 'UpdatedOn']);
    });
});
