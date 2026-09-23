import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import type { IEntityDataProvider } from '../generic/interfaces';
import { ALL_ENTITY_DATA, PRODUCT_ENTITY_ID } from './mocks/MockEntityData';

const MOCK_USER = { ID: 'u-1', Name: 'Test', Email: 'test@test.com', UserRoles: [] };

class TestProductEntity extends BaseEntity {
    protected override CheckPermissions(): boolean {
        return true;
    }
}

describe('BaseEntity.DeclareRelatedRecordsDynamic', () => {
    let productEntityInfo: EntityInfo;
    let mockProvider: IEntityDataProvider;

    beforeAll(() => {
        const entities = ALL_ENTITY_DATA.map((d) => new EntityInfo(d));
        productEntityInfo = entities.find((e) => e.ID === PRODUCT_ENTITY_ID)!;
        mockProvider = {
            CurrentUser: MOCK_USER,
            get SupportsEntityTransactions() {
                return true;
            },
            get IsInTransaction() {
                return false;
            },
            async GetEntityObject<T extends BaseEntity>(_entityName: string): Promise<T> {
                return new TestProductEntity(productEntityInfo, mockProvider) as unknown as T;
            },
            async Save(entity: BaseEntity): Promise<Record<string, unknown>> {
                return entity.GetAll();
            },
            async Delete(): Promise<boolean> {
                return true;
            },
            SetCachedRecordName(): void {},
            GetCachedRecordName(): string | undefined {
                return undefined;
            },
        } as unknown as IEntityDataProvider;

        Metadata.Provider = {
            Entities: entities,
            CurrentUser: MOCK_USER,
        } as unknown as ProviderBase;
    });

    afterAll(() => {
        Metadata.Provider = null as unknown as ProviderBase;
    });

    it('dynamically registers a collection companion per instance', () => {
        const entity1 = new TestProductEntity(productEntityInfo, mockProvider);
        const entity2 = new TestProductEntity(productEntityInfo, mockProvider);

        const col1 = entity1.DeclareRelatedRecordsDynamic({
            Name: 'DynamicItems',
            RelatedEntity: 'Products',
            RelatedEntityJoinField: 'Name',
        });

        expect(col1).toBeDefined();
        expect(entity1.GetCompanion('DynamicItems')).toBe(col1);

        // Instance-scoped: entity2 should not have DynamicItems
        expect(entity2.GetCompanion('DynamicItems')).toBeUndefined();
    });

    it('refuses duplicate collection names on the same instance', () => {
        const entity = new TestProductEntity(productEntityInfo, mockProvider);

        entity.DeclareRelatedRecordsDynamic({
            Name: 'DuplicateItems',
            RelatedEntity: 'Products',
            RelatedEntityJoinField: 'Name',
        });

        expect(() => {
            entity.DeclareRelatedRecordsDynamic({
                Name: 'DuplicateItems',
                RelatedEntity: 'Products',
                RelatedEntityJoinField: 'Name',
            });
        }).toThrow(/already registered/i);
    });

    it('contributes dynamically registered companion to save plan', async () => {
        const parent = new TestProductEntity(productEntityInfo, mockProvider);
        parent.NewRecord();
        parent.Set('ID', 'parent-1');
        parent.Set('Name', 'Parent Product');

        const collection = parent.DeclareRelatedRecordsDynamic<TestProductEntity>({
            Name: 'ChildProducts',
            RelatedEntity: 'Products',
            RelatedEntityJoinField: 'Name',
        });

        // Add a child
        const child = await collection.Create();
        child.Set('ID', 'child-1');
        child.Set('Price', 10);

        // Dirty should roll up through dynamically declared collection
        expect(parent.Dirty).toBe(true);

        const plan = parent.BuildSavePlan();
        expect(plan).toBeDefined();
        // The save plan includes the root and child nodes
        expect(plan.Nodes.length).toBe(2);
        expect(plan.Nodes.some((n) => n.Entity === child)).toBe(true);
    });
});
