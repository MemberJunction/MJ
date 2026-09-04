/**
 * BaseEntity.FieldIsDirty — the boolean form of GetFieldByName(name)?.Dirty.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { ALL_ENTITY_DATA, PRODUCT_ENTITY_ID } from './mocks/MockEntityData';

class MJTestEntity extends BaseEntity {}

let entities: EntityInfo[];
let productEntityInfo: EntityInfo;

beforeAll(() => {
    entities = ALL_ENTITY_DATA.map((d) => new EntityInfo(d));
    productEntityInfo = entities.find((e) => e.ID === PRODUCT_ENTITY_ID)!;

    const mockProvider = {
        Entities: entities,
        CurrentUser: { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] },
    } as unknown as ProviderBase;

    Metadata.Provider = mockProvider;
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

describe('BaseEntity.FieldIsDirty', () => {
    it('is false on a freshly constructed entity', () => {
        const entity = new MJTestEntity(productEntityInfo);
        expect(entity.FieldIsDirty('Name')).toBe(false);
        expect(entity.FieldIsDirty('Price')).toBe(false);
    });

    it('is true after the named field is edited', () => {
        const entity = loaded('Name', 'Original');
        entity.Set('Name', 'Starter');
        expect(entity.FieldIsDirty('Name')).toBe(true);
        expect(entity.FieldIsDirty('Price')).toBe(false);
    });

    it('is case-insensitive and trims whitespace, matching GetFieldByName', () => {
        const entity = loaded('Name', 'Original');
        entity.Set('Name', 'Starter');
        expect(entity.FieldIsDirty('name')).toBe(true);
        expect(entity.FieldIsDirty('NAME')).toBe(true);
        expect(entity.FieldIsDirty('  Name  ')).toBe(true);
    });

    it('returns false for a missing or blank field name without throwing', () => {
        const entity = new MJTestEntity(productEntityInfo);
        expect(entity.FieldIsDirty('NoSuchColumn')).toBe(false);
        expect(entity.FieldIsDirty('')).toBe(false);
        expect(entity.FieldIsDirty(null as unknown as string)).toBe(false);
    });

    it('ORs additional names: true if any listed field is dirty', () => {
        const entity = loaded('Price', 10);
        expect(entity.FieldIsDirty('Name', 'Price')).toBe(false);
        entity.Set('Price', 12.5);
        expect(entity.FieldIsDirty('Name', 'Price')).toBe(true);
        expect(entity.FieldIsDirty('Name')).toBe(false);
    });
});

/**
 * First write is a load (OldValue = Value, not dirty). Then the caller can edit.
 * Uses `Set` because this mock `Products` entity has no generated subclass —
 * production code uses typed accessors plus `FieldIsDirty('Name')`.
 */
function loaded(field: string, value: unknown): MJTestEntity {
    const entity = new MJTestEntity(productEntityInfo);
    entity.Set(field, value);
    entity.GetFieldByName(field)?.ResetOldValue();
    return entity;
}
