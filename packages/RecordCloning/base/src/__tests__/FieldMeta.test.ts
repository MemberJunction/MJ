import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { FieldMetaFromEntity } from '../FieldMeta';
import { IsRenameField } from '../CloneFieldMapper';

/**
 * #4536: IsUnique marks only a column that is a key on its own, so a column of a composite unique
 * key reaches the field mapper through the entity's key sets (IsInUniqueKey) instead.
 */
const ENTITY_ID = 'E1111111-1111-1111-1111-111111111111';

function field(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { ID: `f-${name}`, EntityID: ENTITY_ID, Name: name, Type: 'nvarchar', Sequence: 1, Status: 'Active', ...extra };
}

const entity = new EntityInfo({
    ID: ENTITY_ID,
    Name: 'Action Params',
    EntityFields: [
        field('ID', { IsPrimaryKey: true, IsUnique: true, Type: 'uniqueidentifier' }),
        field('ActionID', { Type: 'uniqueidentifier' }),
        field('Code'),
        field('Slug', { IsUnique: true }),
        field('Notes'),
    ],
    EntityUniqueKeys: [
        { ID: 'k1', EntityID: ENTITY_ID, Name: 'UQ_ActionParam_ActionID_Code', FieldNames: 'ActionID,Code', FilterDefinition: null },
        { ID: 'k2', EntityID: ENTITY_ID, Name: 'UQ_ActionParam_Slug', FieldNames: 'Slug', FilterDefinition: null },
    ],
});

describe('FieldMetaFromEntity unique-key membership', () => {
    const meta = new Map(FieldMetaFromEntity(entity).map((f) => [f.Name, f]));

    it('marks every column of a unique key, composite ones included', () => {
        expect(meta.get('ActionID')?.IsInUniqueKey).toBe(true);
        expect(meta.get('Code')?.IsInUniqueKey).toBe(true);
        expect(meta.get('Slug')?.IsInUniqueKey).toBe(true);
        expect(meta.get('Notes')?.IsInUniqueKey).toBe(false);
    });

    it('keeps IsUnique for columns that are unique on their own', () => {
        expect(meta.get('Code')?.IsUnique).toBeFalsy();
        expect(meta.get('Slug')?.IsUnique).toBe(true);
    });

    it('still renames an nvarchar column of a composite key, as before IsUnique was narrowed', () => {
        expect(IsRenameField(meta.get('Code')!)).toBe(true);
        expect(IsRenameField(meta.get('Slug')!)).toBe(true);
        expect(IsRenameField(meta.get('Notes')!)).toBe(false);
        // not an nvarchar, so never renamed
        expect(IsRenameField(meta.get('ActionID')!)).toBe(false);
    });
});
