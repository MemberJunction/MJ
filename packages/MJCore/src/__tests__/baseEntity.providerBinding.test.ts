/**
 * Provider binding: a BaseEntity instance must keep the provider GetEntityObject
 * passed in. A 1-arg subclass that drops the ClassFactory argument used to
 * silently fall back to the process-wide host — mixed providers in one JSON
 * graph, child FK waits on an uncommitted parent.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import type { IEntityDataProvider } from '../generic/interfaces';
import { ALL_ENTITY_DATA, PRODUCT_ENTITY_ID } from './mocks/MockEntityData';

/** Mirrors MJActionEntityServer: constructor(Entity) { super(Entity); } */
class DropsProviderEntity extends BaseEntity {
    constructor(Entity: EntityInfo) {
        super(Entity);
    }
}

let productEntityInfo: EntityInfo;
const host = { id: 'host' } as unknown as IEntityDataProvider;
const graph = { id: 'graph' } as unknown as IEntityDataProvider;

beforeAll(() => {
    const entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));
    productEntityInfo = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
    Metadata.Provider = {
        Entities: entities,
        CurrentUser: { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] },
    } as unknown as ProviderBase;
    BaseEntity.Provider = host;
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

describe('BaseEntity provider binding', () => {
    it('keeps a constructor-passed provider on BoundProvider and ProviderToUse', () => {
        const entity = new BaseEntity(productEntityInfo, graph);
        expect(entity.BoundProvider).toBe(graph);
        expect(entity.ProviderToUse).toBe(graph);
        expect(entity.RunViewProviderToUse).toBe(graph);
    });

    it('falls back to the process-wide host when nothing is bound', () => {
        const entity = new BaseEntity(productEntityInfo);
        expect(entity.BoundProvider).toBeNull();
        expect(entity.ProviderToUse).toBe(host);
    });

    it('a 1-arg subclass drops the ClassFactory provider; BindProvider restores it', () => {
        // ClassFactory does `new SubClass(entityInfo, graph)` — extra args are ignored.
        const Ctor = DropsProviderEntity as unknown as new (
            e: EntityInfo,
            p?: IEntityDataProvider,
        ) => DropsProviderEntity;
        const dropped = new Ctor(productEntityInfo, graph);
        expect(dropped.BoundProvider).toBeNull();
        expect(dropped.ProviderToUse).toBe(host);

        dropped.BindProvider(graph);
        expect(dropped.BoundProvider).toBe(graph);
        expect(dropped.ProviderToUse).toBe(graph);
        expect(dropped.RunViewProviderToUse).toBe(graph);
    });
});
