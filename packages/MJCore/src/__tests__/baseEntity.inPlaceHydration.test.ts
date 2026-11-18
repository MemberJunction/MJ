import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityField } from '../generic/entityInfo';
import { IEntityDataProvider, IMetadataProvider } from '../generic/interfaces';
import { Metadata } from '../generic/metadata';
import { UserInfo } from '../generic/securityInfo';
import {
    ADMIN_ROLE_ID,
    BuildLoadHintEntities,
    InMemoryISAStore,
    LoadHintTestEntity,
    LoadHintTestProvider,
    MakeLoadHintUser,
} from './mocks/ISALoadHintFixture';

/**
 * In-place hydration: `Hydrate()` (and `finalizeSave()`, which shares the path) reuse the
 * entity's pre-allocated `EntityField` instances instead of re-creating them, so a hydrate costs
 * 0 EntityField allocations and anything holding a field reference (a JSON binding closure, a
 * form control) keeps a live object. These tests pin that contract through the public surface:
 * field identity across re-hydration, correct values, and a clean (not dirty) state afterwards.
 */
describe('BaseEntity in-place hydration', () => {
    let provider: LoadHintTestProvider;
    let store: InMemoryISAStore;
    let user: UserInfo;
    let previousGlobalProvider: IMetadataProvider;
    let previousEntityProvider: IEntityDataProvider;

    beforeEach(() => {
        previousGlobalProvider = Metadata.Provider;
        previousEntityProvider = BaseEntity.Provider;
        store = new InMemoryISAStore();
        user = MakeLoadHintUser(ADMIN_ROLE_ID);
        provider = new LoadHintTestProvider(BuildLoadHintEntities(), store, user);
        Metadata.Provider = provider as object as IMetadataProvider;
        BaseEntity.Provider = provider.AsEntityDataProvider;
    });

    afterEach(() => {
        Metadata.Provider = previousGlobalProvider;
        BaseEntity.Provider = previousEntityProvider;
    });

    async function newProduct(): Promise<LoadHintTestEntity> {
        return provider.GetEntityObject<LoadHintTestEntity>('Products', user);
    }

    it('re-hydrating keeps the same EntityField instances and updates their values', async () => {
        const product = await newProduct();
        product.Hydrate({ ID: 'p1', Name: 'First', ProductTypeID: 't1' });
        const before: EntityField[] = [...product.Fields];
        expect(before.length).toBeGreaterThan(0);

        product.Hydrate({ ID: 'p1', Name: 'Second', ProductTypeID: 't2' });
        const after: EntityField[] = [...product.Fields];

        expect(after).toHaveLength(before.length);
        for (let i = 0; i < before.length; i++) {
            expect(after[i]).toBe(before[i]); // same object, not a fresh allocation
        }
        expect(product.Get('Name')).toBe('Second');
        expect(product.Get('ProductTypeID')).toBe('t2');
        expect(product.GetFieldByName('Name')).toBe(before.find(f => f.Name === 'Name'));
    });

    it('a re-hydrated record is clean: nothing dirty, old values reset to the hydrated values', async () => {
        const product = await newProduct();
        product.Hydrate({ ID: 'p1', Name: 'First', ProductTypeID: 't1' });
        product.Set('Name', 'Edited locally');
        expect(product.Dirty).toBe(true);

        product.Hydrate({ ID: 'p1', Name: 'Server copy', ProductTypeID: 't1' });
        expect(product.Dirty).toBe(false);
        const nameField = product.GetFieldByName('Name');
        expect(nameField.Value).toBe('Server copy');
        expect(nameField.OldValue).toBe('Server copy');
        expect(nameField.Dirty).toBe(false);
    });

    it('a column omitted from the hydrated row is cleared, not left holding the previous value', async () => {
        const product = await newProduct();
        product.Hydrate({ ID: 'p1', Name: 'First', ProductTypeID: 't1' });
        product.Hydrate({ ID: 'p1', Name: 'Second' });
        expect(product.Get('Name')).toBe('Second');
        expect(product.Get('ProductTypeID') == null).toBe(true);
    });

    it('GetAll reflects exactly the latest hydration', async () => {
        const product = await newProduct();
        product.Hydrate({ ID: 'p1', Name: 'First', ProductTypeID: 't1' });
        product.Hydrate({ ID: 'p9', Name: 'Ninth', ProductTypeID: 't9' });
        const all = product.GetAll();
        expect(all['ID']).toBe('p9');
        expect(all['Name']).toBe('Ninth');
        expect(all['ProductTypeID']).toBe('t9');
    });

    it('increments _finalizeGeneration on Hydrate() so an in-flight Finalize() from an earlier load cannot overwrite freshly hydrated fields', async () => {
        const product = await newProduct();
        product.Hydrate({ ID: 'p1', Name: 'First', ProductTypeID: 't1' });
        const genBefore = (product as unknown as { _finalizeGeneration: number })._finalizeGeneration;

        product.Hydrate({ ID: 'p2', Name: 'Second', ProductTypeID: 't2' });
        const genAfter = (product as unknown as { _finalizeGeneration: number })._finalizeGeneration;

        expect(genAfter).toBe(genBefore + 1);
    });

    it('LoadFromDataBatchAsISAParent delegates to an overridden LoadFromData on a custom entity subclass', async () => {
        let customHookCalled = false;
        class CustomProductEntity extends LoadHintTestEntity {
            public override async LoadFromData(
                data: Record<string, unknown>,
                replaceOldValues?: boolean
            ): Promise<boolean> {
                customHookCalled = true;
                return super.LoadFromData(data, replaceOldValues);
            }
        }

        const entityInfo = provider.Entities.find(e => e.Name === 'Products')!;
        const customEntity = new CustomProductEntity(entityInfo);
        await customEntity.LoadFromDataBatchAsISAParent(
            [{ entity: customEntity, data: { ID: 'p1', Name: 'Custom', ProductTypeID: 't1' } }],
            provider as object as IMetadataProvider,
            user
        );

        expect(customHookCalled).toBe(true);
        expect(customEntity.Get('Name')).toBe('Custom');
    });
});
