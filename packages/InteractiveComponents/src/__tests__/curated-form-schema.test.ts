import { describe, it, expect } from 'vitest';
import { buildCuratedFormSchema, curateFromEntityInfo } from '../forms/curated-form-schema';
import type { EntityInfo, EntityFieldInfo, IMetadataProvider } from '@memberjunction/core';

/**
 * The curated schema is consumed by the Form Builder agent's prompt context
 * and by Component Studio's right-rail inspector / fixture preview. The
 * shape contract is asserted here so refactors don't silently change what
 * either consumer sees.
 */

/** Build a minimal stub `EntityFieldInfo` — only the fields the curator reads. */
function mkField(overrides: Partial<EntityFieldInfo & { Name: string }>): EntityFieldInfo {
    return {
        Name: 'Field',
        DisplayName: undefined,
        Description: undefined,
        Type: 'nvarchar',
        TSType: 'string',
        Sequence: 0,
        DefaultInView: true,
        AllowsNull: true,
        IsPrimaryKey: false,
        IsVirtual: false,
        IsComputed: false,
        MaxLength: 0,
        DefaultValue: null,
        RelatedEntity: null,
        RelatedEntityFieldName: null,
        ValueListType: 'None',
        EntityFieldValues: [],
        ...overrides,
    } as unknown as EntityFieldInfo;
}

function mkEntity(name: string, fields: EntityFieldInfo[], extras: Partial<EntityInfo> = {}): EntityInfo {
    return {
        Name: name,
        DisplayName: name,
        Description: undefined,
        Fields: fields,
        NameField: fields.find(f => f.Name === 'Name') ?? null,
        ...extras,
    } as unknown as EntityInfo;
}

function mkProvider(entities: EntityInfo[]): IMetadataProvider {
    return {
        Entities: entities,
        EntityByName(name: string) {
            return entities.find(e => e.Name.toLowerCase() === name.toLowerCase());
        },
    } as unknown as IMetadataProvider;
}

describe('buildCuratedFormSchema', () => {
    it('returns null when entity is unknown to provider', () => {
        const provider = mkProvider([]);
        expect(buildCuratedFormSchema('Missing', provider)).toBeNull();
    });

    it('strips __mj_* audit fields', () => {
        const entity = mkEntity('Demo', [
            mkField({ Name: 'Name', Sequence: 1 }),
            mkField({ Name: '__mj_CreatedAt', Sequence: 2, TSType: 'Date' as never }),
            mkField({ Name: '__mj_UpdatedAt', Sequence: 3, TSType: 'Date' as never }),
        ]);
        const schema = curateFromEntityInfo(entity, mkProvider([entity]));
        expect(schema.fields.map(f => f.name)).toEqual(['Name']);
    });

    it('strips virtual / computed fields', () => {
        const entity = mkEntity('Demo', [
            mkField({ Name: 'Name', Sequence: 1 }),
            mkField({ Name: 'ViewOnly', Sequence: 2, IsVirtual: true }),
            mkField({ Name: 'Computed', Sequence: 3, IsVirtual: true, IsComputed: true }),
        ]);
        const schema = curateFromEntityInfo(entity, mkProvider([entity]));
        expect(schema.fields.map(f => f.name)).toEqual(['Name']);
    });

    it('preserves primary keys but flags them isPrimaryKey', () => {
        const entity = mkEntity('Demo', [
            mkField({ Name: 'ID', Sequence: 0, IsPrimaryKey: true, AllowsNull: false }),
            mkField({ Name: 'Name', Sequence: 1, AllowsNull: false }),
        ]);
        const schema = curateFromEntityInfo(entity, mkProvider([entity]));
        const id = schema.fields.find(f => f.name === 'ID')!;
        expect(id.isPrimaryKey).toBe(true);
        // PKs aren't user-required because the DB assigns them.
        expect(id.required).toBe(false);
    });

    it('marks AllowsNull=false fields without defaults as required', () => {
        const entity = mkEntity('Demo', [
            mkField({ Name: 'Name', AllowsNull: false, DefaultValue: null }),
            mkField({ Name: 'Optional', AllowsNull: true }),
            mkField({ Name: 'Defaulted', AllowsNull: false, DefaultValue: "''" }),
        ]);
        const schema = curateFromEntityInfo(entity, mkProvider([entity]));
        const byName = (n: string) => schema.fields.find(f => f.name === n)!;
        expect(byName('Name').required).toBe(true);
        expect(byName('Optional').required).toBe(false);
        expect(byName('Defaulted').required).toBe(false);
    });

    it('promotes value-list fields to enum with allowedValues', () => {
        const entity = mkEntity('Demo', [
            mkField({
                Name: 'Status',
                Type: 'nvarchar',
                ValueListType: 'List',
                EntityFieldValues: [
                    { Value: 'Active' }, { Value: 'Inactive' }, { Value: 'Pending' },
                ] as unknown as EntityFieldInfo['EntityFieldValues'],
            }),
        ]);
        const schema = curateFromEntityInfo(entity, mkProvider([entity]));
        const status = schema.fields[0];
        expect(status.type).toBe('enum');
        expect(status.allowedValues).toEqual(['Active', 'Inactive', 'Pending']);
    });

    it('resolves foreign keys to {entity, displayField}', () => {
        const accountEntity = mkEntity('Accounts', [
            mkField({ Name: 'ID', IsPrimaryKey: true }),
            mkField({ Name: 'Name' }),
        ]);
        const customerEntity = mkEntity('Customers', [
            mkField({ Name: 'ID', IsPrimaryKey: true }),
            mkField({
                Name: 'AccountID',
                Type: 'uniqueidentifier',
                RelatedEntity: 'Accounts',
            }),
        ]);
        const schema = curateFromEntityInfo(
            customerEntity, mkProvider([accountEntity, customerEntity]),
        );
        const fk = schema.fields.find(f => f.name === 'AccountID')!;
        expect(fk.type).toBe('foreign-key');
        expect(fk.references).toEqual({ entity: 'Accounts', displayField: 'Name' });
    });

    it('FK trumps value-list and raw type', () => {
        // A uniqueidentifier-typed FK column with no explicit ValueListType
        // would otherwise look like a plain string. The curator must check
        // RelatedEntity first.
        const entity = mkEntity('Demo', [
            mkField({
                Name: 'OwnerID',
                Type: 'uniqueidentifier',
                TSType: 'string',
                ValueListType: 'List',
                EntityFieldValues: [{ Value: 'X' }] as unknown as EntityFieldInfo['EntityFieldValues'],
                RelatedEntity: 'Users',
            }),
        ]);
        const target = mkEntity('Users', [mkField({ Name: 'Name' })]);
        const schema = curateFromEntityInfo(entity, mkProvider([entity, target]));
        expect(schema.fields[0].type).toBe('foreign-key');
    });

    it('maps TSType to normalised type buckets', () => {
        const entity = mkEntity('Demo', [
            mkField({ Name: 'S', TSType: 'string' }),
            mkField({ Name: 'N', TSType: 'number' as never }),
            mkField({ Name: 'B', TSType: 'boolean' as never }),
            mkField({ Name: 'D', TSType: 'Date' as never }),
        ]);
        const schema = curateFromEntityInfo(entity, mkProvider([entity]));
        const t = (n: string) => schema.fields.find(f => f.name === n)!.type;
        expect(t('S')).toBe('string');
        expect(t('N')).toBe('number');
        expect(t('B')).toBe('boolean');
        expect(t('D')).toBe('datetime');
    });

    it('sorts fields by Sequence', () => {
        const entity = mkEntity('Demo', [
            mkField({ Name: 'Third', Sequence: 30 }),
            mkField({ Name: 'First', Sequence: 10 }),
            mkField({ Name: 'Second', Sequence: 20 }),
        ]);
        const schema = curateFromEntityInfo(entity, mkProvider([entity]));
        expect(schema.fields.map(f => f.name)).toEqual(['First', 'Second', 'Third']);
    });

    it('surfaces nameField + displayName + description on the entity', () => {
        const entity = mkEntity('Customers', [
            mkField({ Name: 'ID', IsPrimaryKey: true }),
            mkField({ Name: 'Name' }),
        ], { DisplayName: 'Customer', Description: 'A buyer.' } as unknown as Partial<EntityInfo>);
        const schema = curateFromEntityInfo(entity, mkProvider([entity]));
        expect(schema.entityName).toBe('Customers');
        expect(schema.displayName).toBe('Customer');
        expect(schema.description).toBe('A buyer.');
        expect(schema.nameField).toBe('Name');
    });

    it('captures maxLength for string fields', () => {
        const entity = mkEntity('Demo', [
            mkField({ Name: 'Short', TSType: 'string', MaxLength: 50 }),
            mkField({ Name: 'Long', TSType: 'string', MaxLength: 0 }),
        ]);
        const schema = curateFromEntityInfo(entity, mkProvider([entity]));
        expect(schema.fields.find(f => f.name === 'Short')!.maxLength).toBe(50);
        expect(schema.fields.find(f => f.name === 'Long')!.maxLength).toBeUndefined();
    });
});
