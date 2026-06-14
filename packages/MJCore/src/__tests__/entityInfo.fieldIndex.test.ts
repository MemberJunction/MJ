/**
 * Hot-path performance tests for EntityInfo / EntityFieldInfo (Wave 1).
 *
 * Covers:
 *  - EntityInfo.FieldByName O(1) case-insensitive lookup index (#1)
 *  - EntityFieldInfo.TSType memoization (#2)
 *  - Memoized immutable derived arrays: PrimaryKeys / UniqueKeys / ForeignKeys /
 *    EncryptedFields / DatetimeFields / FirstPrimaryKey / NameField (#4, #8)
 *
 * These verify both CORRECTNESS (parity with the old `.find()`/`.filter()` behavior)
 * and the MEMOIZATION contract (referential stability + no recompute after first access),
 * since `_Fields` is set once in the constructor and never reassigned.
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo, EntityFieldInfo, EntityFieldTSType } from '../generic/entityInfo';

function makeEntity(): EntityInfo {
    return new EntityInfo({
        ID: 'ent-001',
        Name: 'Widgets',
        SchemaName: 'app',
        BaseTable: 'Widget',
        EntityFields: [
            { ID: 'f1', EntityID: 'ent-001', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, IsUnique: true, Sequence: 1, Status: 'Active' },
            { ID: 'f2', EntityID: 'ent-001', Name: 'Name', Type: 'nvarchar', IsNameField: true, Sequence: 2, Status: 'Active' },
            { ID: 'f3', EntityID: 'ent-001', Name: 'Count', Type: 'int', Sequence: 3, Status: 'Active' },
            { ID: 'f4', EntityID: 'ent-001', Name: 'IsActive', Type: 'bit', Sequence: 4, Status: 'Active' },
            { ID: 'f5', EntityID: 'ent-001', Name: 'CreatedAt', Type: 'datetimeoffset', Sequence: 5, Status: 'Active' },
            { ID: 'f6', EntityID: 'ent-001', Name: 'OwnerID', Type: 'uniqueidentifier', RelatedEntityID: 'ent-user', Sequence: 6, Status: 'Active' },
            { ID: 'f7', EntityID: 'ent-001', Name: 'Secret', Type: 'nvarchar', Encrypt: true, Sequence: 7, Status: 'Active' },
        ],
    });
}

describe('EntityInfo.FieldByName (#1 field index)', () => {
    it('returns the field for an exact name match', () => {
        const e = makeEntity();
        expect(e.FieldByName('Count')?.Name).toBe('Count');
    });

    it('is case-insensitive and whitespace-trimming', () => {
        const e = makeEntity();
        expect(e.FieldByName('count')?.Name).toBe('Count');
        expect(e.FieldByName('  COUNT  ')?.Name).toBe('Count');
        expect(e.FieldByName('iSaCtIvE')?.Name).toBe('IsActive');
    });

    it('returns undefined for unknown / null names', () => {
        const e = makeEntity();
        expect(e.FieldByName('Nope')).toBeUndefined();
        // @ts-expect-error intentionally passing null to exercise the guard
        expect(e.FieldByName(null)).toBeUndefined();
    });

    it('matches the legacy Fields.find behavior for every field', () => {
        const e = makeEntity();
        for (const f of e.Fields) {
            expect(e.FieldByName(f.Name)).toBe(e.Fields.find(x => x.Name === f.Name));
        }
    });

    it('returns the same EntityFieldInfo instance across calls (cached index)', () => {
        const e = makeEntity();
        expect(e.FieldByName('Name')).toBe(e.FieldByName('name'));
    });
});

describe('EntityFieldInfo.TSType memoization (#2)', () => {
    it('classifies representative SQL types correctly', () => {
        const e = makeEntity();
        expect(e.FieldByName('Count')!.TSType).toBe(EntityFieldTSType.Number);
        expect(e.FieldByName('IsActive')!.TSType).toBe(EntityFieldTSType.Boolean);
        expect(e.FieldByName('CreatedAt')!.TSType).toBe(EntityFieldTSType.Date);
        expect(e.FieldByName('Name')!.TSType).toBe(EntityFieldTSType.String);
    });

    it('memoizes — the value does not recompute even if Type is later mutated', () => {
        const field = new EntityFieldInfo({ ID: 'x', EntityID: 'e', Name: 'N', Type: 'int', Sequence: 1, Status: 'Active' });
        expect(field.TSType).toBe(EntityFieldTSType.Number);
        // Type is immutable post-load in real usage; mutating here proves the result is cached.
        (field as unknown as { Type: string }).Type = 'nvarchar';
        expect(field.TSType).toBe(EntityFieldTSType.Number);
    });
});

describe('EntityInfo derived-array memoization (#4, #8)', () => {
    it('PrimaryKeys: correct contents + referential stability', () => {
        const e = makeEntity();
        expect(e.PrimaryKeys.map(f => f.Name)).toEqual(['ID']);
        expect(e.PrimaryKeys).toBe(e.PrimaryKeys);
    });

    it('FirstPrimaryKey is the first PK and is stable', () => {
        const e = makeEntity();
        expect(e.FirstPrimaryKey.Name).toBe('ID');
        expect(e.FirstPrimaryKey).toBe(e.FirstPrimaryKey);
    });

    it('UniqueKeys / ForeignKeys / EncryptedFields / DatetimeFields are correct + stable', () => {
        const e = makeEntity();
        expect(e.UniqueKeys.map(f => f.Name)).toEqual(['ID']);
        expect(e.ForeignKeys.map(f => f.Name)).toEqual(['OwnerID']);
        expect(e.EncryptedFields.map(f => f.Name)).toEqual(['Secret']);
        expect(e.DatetimeFields.map(f => f.Name)).toEqual(['CreatedAt']);

        expect(e.UniqueKeys).toBe(e.UniqueKeys);
        expect(e.ForeignKeys).toBe(e.ForeignKeys);
        expect(e.EncryptedFields).toBe(e.EncryptedFields);
        expect(e.DatetimeFields).toBe(e.DatetimeFields);
    });

    it('DatetimeFields is empty (and stable) when the entity has no date fields', () => {
        const e = new EntityInfo({
            ID: 'e2', Name: 'NoDates', SchemaName: 'app', BaseTable: 'NoDates',
            EntityFields: [{ ID: 'a', EntityID: 'e2', Name: 'Label', Type: 'nvarchar', Sequence: 1, Status: 'Active' }],
        });
        expect(e.DatetimeFields).toEqual([]);
        expect(e.DatetimeFields).toBe(e.DatetimeFields);
    });

    it('NameField resolves to the IsNameField field and is cached', () => {
        const e = makeEntity();
        expect(e.NameField?.Name).toBe('Name');
        expect(e.NameField).toBe(e.NameField);
    });

    it('NameField falls back to a literal "Name" field via the index when none flagged', () => {
        const e = new EntityInfo({
            ID: 'e3', Name: 'NoFlag', SchemaName: 'app', BaseTable: 'NoFlag',
            EntityFields: [
                { ID: 'a', EntityID: 'e3', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1, Status: 'Active' },
                { ID: 'b', EntityID: 'e3', Name: 'Name', Type: 'nvarchar', Sequence: 2, Status: 'Active' },
            ],
        });
        expect(e.NameField?.Name).toBe('Name');
    });
});
