import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TransformSimpleObjectToEntityObject } from '../generic/util';
import { BaseEntity } from '../generic/baseEntity';
import { BaseEngineRegistry } from '../generic/baseEngineRegistry';
import { EntityInfo } from '../generic/entityInfo';
import { IEntityDataProvider, IMetadataProvider } from '../generic/interfaces';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { UserInfo } from '../generic/securityInfo';
import {
    ADMIN_ROLE_ID,
    BuildLoadHintEntities,
    FakeProductTypeEngine,
    InMemoryISAStore,
    LoadHintTestEntity,
    LoadHintTestProvider,
    MakeLoadHintUser,
} from './mocks/ISALoadHintFixture';

/**
 * Lightweight mock entity that does NOT extend BaseEntity (which requires
 * full metadata infrastructure). Instead it duck-types the methods that
 * TransformSimpleObjectToEntityObject actually calls: LoadFromData.
 */
class MockEntity {
    private _data: Record<string, unknown> = {};

    get loadedData(): Record<string, unknown> {
        return this._data;
    }

    async LoadFromData(data: unknown): Promise<boolean> {
        this._data = data as Record<string, unknown>;
        return true;
    }
}

/**
 * Builds a mock IMetadataProvider whose GetEntityObject returns MockEntity instances.
 * Tracks calls so tests can assert entity name and user context.
 */
function createMockProvider() {
    const calls: Array<{ entityName: string; contextUser: UserInfo | undefined }> = [];

    const provider = {
        GetEntityObject: vi.fn(async <T>(entityName: string, contextUser?: UserInfo): Promise<T> => {
            calls.push({ entityName, contextUser });
            return new MockEntity() as unknown as T;
        }),
        calls,
    } as unknown as IMetadataProvider & { calls: typeof calls };

    return provider;
}

describe('TransformSimpleObjectToEntityObject', () => {
    let provider: ReturnType<typeof createMockProvider>;
    const mockUser = { ID: 'user-1' } as UserInfo;

    beforeEach(() => {
        provider = createMockProvider();
    });

    it('should convert plain objects to entity objects in parallel', async () => {
        const items = [
            { ID: 'a', Name: 'Alice' },
            { ID: 'b', Name: 'Bob' },
            { ID: 'c', Name: 'Charlie' },
        ];

        const result = await TransformSimpleObjectToEntityObject<BaseEntity>(
            provider, 'Test Entity', items, mockUser
        );

        expect(result).toHaveLength(3);
        for (let i = 0; i < items.length; i++) {
            const entity = result[i] as unknown as MockEntity;
            expect(entity.loadedData).toEqual(items[i]);
        }
    });

    it('should preserve order of items', async () => {
        const items = [
            { ID: '1', Seq: 'first' },
            { ID: '2', Seq: 'second' },
            { ID: '3', Seq: 'third' },
        ];

        const result = await TransformSimpleObjectToEntityObject<BaseEntity>(
            provider, 'Test Entity', items, mockUser
        );

        expect((result[0] as unknown as MockEntity).loadedData).toEqual(items[0]);
        expect((result[1] as unknown as MockEntity).loadedData).toEqual(items[1]);
        expect((result[2] as unknown as MockEntity).loadedData).toEqual(items[2]);
    });

    it('should pass correct entity name and contextUser to provider', async () => {
        const items = [{ ID: '1' }];

        await TransformSimpleObjectToEntityObject<BaseEntity>(
            provider, 'MJ: Conversation Details', items, mockUser
        );

        expect(provider.calls).toHaveLength(1);
        expect(provider.calls[0].entityName).toBe('MJ: Conversation Details');
        expect(provider.calls[0].contextUser).toBe(mockUser);
    });

    it('should work without contextUser', async () => {
        const items = [{ ID: '1' }];

        const result = await TransformSimpleObjectToEntityObject<BaseEntity>(
            provider, 'Test Entity', items
        );

        expect(result).toHaveLength(1);
        expect(provider.calls[0].contextUser).toBeUndefined();
    });

    it('should return empty array for empty input', async () => {
        const result = await TransformSimpleObjectToEntityObject<BaseEntity>(
            provider, 'Test Entity', [], mockUser
        );

        expect(result).toEqual([]);
        expect(provider.calls).toHaveLength(0);
    });

    it('should pass through items with a Save method (duck-typing)', async () => {
        // Object that quacks like a BaseEntity — has a Save function
        const duckTyped = {
            ID: 'duck',
            Name: 'Quack',
            Save: vi.fn(),
        };

        const items = [duckTyped as unknown as Record<string, unknown>];

        const result = await TransformSimpleObjectToEntityObject<BaseEntity>(
            provider, 'Test Entity', items, mockUser
        );

        expect(result).toHaveLength(1);
        // Should be the same object reference — not re-created
        expect(result[0]).toBe(duckTyped);
        // Provider should NOT be called — duck-typed item was passed through
        expect(provider.calls).toHaveLength(0);
    });

    it('should not pass through plain objects that lack Save', async () => {
        const plainObj = { ID: 'plain', Name: 'No Save method' };
        const items = [plainObj];

        const result = await TransformSimpleObjectToEntityObject<BaseEntity>(
            provider, 'Test Entity', items, mockUser
        );

        expect(result).toHaveLength(1);
        // Should NOT be the same object — should be a new MockEntity
        expect(result[0]).not.toBe(plainObj);
        expect(provider.calls).toHaveLength(1);
    });

    it('should handle mixed array of duck-typed and plain objects', async () => {
        const duckTyped = { ID: 'duck', Save: vi.fn() };
        const plain = { ID: 'plain', Name: 'needs conversion' };

        const items = [
            duckTyped as unknown as Record<string, unknown>,
            plain,
        ];

        const result = await TransformSimpleObjectToEntityObject<BaseEntity>(
            provider, 'Test Entity', items, mockUser
        );

        expect(result).toHaveLength(2);
        // First: passed through
        expect(result[0]).toBe(duckTyped);
        // Second: converted via provider
        expect(result[1]).not.toBe(plain);
        expect((result[1] as unknown as MockEntity).loadedData).toEqual(plain);
        // Provider called only once (for the plain object)
        expect(provider.calls).toHaveLength(1);
    });

    it('should handle large arrays efficiently via parallel execution', async () => {
        const items = Array.from({ length: 200 }, (_, i) => ({ ID: `id-${i}`, Index: i }));

        const start = performance.now();
        const result = await TransformSimpleObjectToEntityObject<BaseEntity>(
            provider, 'Test Entity', items, mockUser
        );
        const elapsed = performance.now() - start;

        expect(result).toHaveLength(200);
        expect(provider.calls).toHaveLength(200);
        // Parallel execution with in-memory mocks should be very fast
        expect(elapsed).toBeLessThan(1000);
    });

    it('should call GetEntityObject with same entity name for every item', async () => {
        const items = [{ ID: '1' }, { ID: '2' }, { ID: '3' }];

        await TransformSimpleObjectToEntityObject<BaseEntity>(
            provider, 'My Special Entity', items, mockUser
        );

        expect(provider.calls).toHaveLength(3);
        for (const call of provider.calls) {
            expect(call.entityName).toBe('My Special Entity');
            expect(call.contextUser).toBe(mockUser);
        }
    });
});

/**
 * The per-row path of `RunView({ ResultType: 'entity_object' })` on an IS-A parent. Each row's
 * `LoadFromData()` looks for the row's subtype: without a rule that answers on load, that is a probe
 * and a child load per row, so a view of 100 records with subtypes costs 1 + 200 round trips. With
 * a SubtypeSelector that sets UseForLoadedRecords, answered from a loaded engine, the child load
 * checks the answer and the probe is skipped: 1 + 100.
 */
describe('TransformSimpleObjectToEntityObject — IS-A parents on the entity-object RunView path', () => {
    const ROW_COUNT = 100;
    const MEETING_TYPE_ID = 'a1000000-0000-0000-0000-000000000001';
    const PUBLICATION_TYPE_ID = 'a1000000-0000-0000-0000-000000000002';
    const SELECTOR_PATH = 'ProductTypeID.ProductExtensionEntity';

    let store: InMemoryISAStore;
    let provider: LoadHintTestProvider;
    let user: UserInfo;
    let productsInfo: EntityInfo;
    let productIDs: string[];
    let typeEngine: FakeProductTypeEngine | null = null;

    /** Even rows are Meetings, odd rows Publications. */
    function expectedSubtype(index: number): string {
        return index % 2 === 0 ? 'Meetings' : 'Publications';
    }

    function productID(index: number): string {
        return `b1000000-0000-0000-0000-${String(index).padStart(12, '0')}`;
    }

    beforeEach(() => {
        store = new InMemoryISAStore();
        user = MakeLoadHintUser(ADMIN_ROLE_ID);
        provider = new LoadHintTestProvider(BuildLoadHintEntities(), store, user);
        Metadata.Provider = provider as unknown as ProviderBase;
        BaseEntity.Provider = provider.AsEntityDataProvider;
        productsInfo = provider.EntityByName('Products')!;

        store.Insert('Product Types', { ID: MEETING_TYPE_ID, Name: 'Meeting', ProductExtensionEntity: 'Meetings' });
        store.Insert('Product Types', { ID: PUBLICATION_TYPE_ID, Name: 'Publication', ProductExtensionEntity: 'Publications' });
        productIDs = [];
        for (let i = 0; i < ROW_COUNT; i++) {
            const id = productID(i);
            productIDs.push(id);
            const isMeeting = expectedSubtype(i) === 'Meetings';
            store.Insert('Products', { ID: id, Name: `Product ${i}`, ProductTypeID: isMeeting ? MEETING_TYPE_ID : PUBLICATION_TYPE_ID });
            if (isMeeting) {
                store.Insert('Meetings', { ID: id, Venue: `Room ${i}` });
            } else {
                store.Insert('Publications', { ID: id, ISBN: `isbn-${i}` });
            }
        }
    });

    afterEach(() => {
        if (typeEngine) {
            BaseEngineRegistry.Instance.UnregisterEngine(typeEngine);
            typeEngine = null;
        }
        BaseEntity.ClearSubtypeLookupCache();
        Metadata.Provider = null as unknown as ProviderBase;
        BaseEntity.Provider = null as unknown as IEntityDataProvider;
    });

    /** The rows a RunView of Products returns: its own view's columns only. */
    function viewRows(ids: string[] = productIDs): Record<string, unknown>[] {
        return ids.map(id => store.ViewRow(productsInfo, id)!);
    }

    function useSelector(useForLoadedRecords: boolean): void {
        productsInfo.SubtypeSelector = JSON.stringify(useForLoadedRecords
            ? { Path: SELECTOR_PATH, UseForLoadedRecords: true }
            : { Path: SELECTOR_PATH });
    }

    /**
     * Caches Product Types the way a BaseEngine does: an entity-object RunView of the type rows,
     * which holds all but the first in raw mode, without built fields.
     */
    async function cacheProductTypes(typeIDs: string[] = [MEETING_TYPE_ID, PUBLICATION_TYPE_ID]): Promise<LoadHintTestEntity[]> {
        const typeRows = typeIDs.map(id => store.ViewRow(provider.EntityByName('Product Types')!, id)!);
        const types = await TransformSimpleObjectToEntityObject<LoadHintTestEntity>(
            provider as unknown as IMetadataProvider, 'Product Types', typeRows, user
        );
        typeEngine = new FakeProductTypeEngine(types);
        BaseEngineRegistry.Instance.RegisterEngine(typeEngine);
        return types;
    }

    async function transformProducts(rows: Record<string, unknown>[] = viewRows()): Promise<BaseEntity[]> {
        return TransformSimpleObjectToEntityObject<BaseEntity>(provider as unknown as IMetadataProvider, 'Products', rows, user);
    }

    function expectEverySubtypeLinked(results: BaseEntity[]): void {
        expect(results).toHaveLength(ROW_COUNT);
        results.forEach((product, index) => {
            expect(product.ISAChild?.EntityInfo.Name).toBe(expectedSubtype(index));
        });
    }

    it('without a subtype rule: a probe and a child load for every row', async () => {
        const results = await transformProducts();

        expectEverySubtypeLinked(results);
        expect(provider.Count('FindISAChildEntity')).toBe(ROW_COUNT);
        expect(provider.Count('Load')).toBe(ROW_COUNT);
        expect(provider.RoundTrips).toHaveLength(2 * ROW_COUNT);
    });

    it('with a SubtypeSelector that does not set UseForLoadedRecords: a probe and a child load for every row, as without a rule', async () => {
        useSelector(false);
        await cacheProductTypes();

        const results = await transformProducts();

        expectEverySubtypeLinked(results);
        expect(provider.Count('FindISAChildEntity')).toBe(ROW_COUNT);
        expect(provider.RoundTrips).toHaveLength(2 * ROW_COUNT);
    });

    it('with a SubtypeSelector that sets UseForLoadedRecords, answered from a loaded engine: only the child load for every row', async () => {
        useSelector(true);
        await cacheProductTypes();

        const results = await transformProducts();

        expectEverySubtypeLinked(results);
        expect(provider.Count('FindISAChildEntity')).toBe(0);
        expect(provider.Count('Load', 'Meetings')).toBe(ROW_COUNT / 2);
        expect(provider.Count('Load', 'Publications')).toBe(ROW_COUNT / 2);
        expect(provider.RoundTrips).toHaveLength(ROW_COUNT);
    });

    it('typed rows that have no subtype row cost the probe as well, and log no errors', async () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const typedIDs = Array.from({ length: ROW_COUNT }, (_, i) => `b2000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
        for (const id of typedIDs) {
            store.Insert('Products', { ID: id, Name: `Typed ${id}`, ProductTypeID: MEETING_TYPE_ID }); // no Meetings row
        }
        useSelector(true);
        await cacheProductTypes();

        const results = await transformProducts(viewRows(typedIDs));

        expect(results.every(product => product.ISAChild === null)).toBe(true);
        expect(provider.Count('Load', 'Meetings')).toBe(ROW_COUNT);
        expect(provider.Count('FindISAChildEntity')).toBe(ROW_COUNT);
        expect(errors).not.toHaveBeenCalled();
    });

    it('reading the cached rows\' keys leaves the rows an engine holds in raw mode unhydrated', async () => {
        // Fifty types, alternating the two extensions; each product points at one of them.
        const typeIDs = Array.from({ length: 50 }, (_, i) => `a3000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
        typeIDs.forEach((id, i) => store.Insert('Product Types', { ID: id, Name: `Type ${i}`, ProductExtensionEntity: i % 2 === 0 ? 'Meetings' : 'Publications' }));
        productIDs.forEach((id, i) => store.Insert('Products', { ID: id, Name: `Product ${i}`, ProductTypeID: typeIDs[(2 * i + (i % 2)) % typeIDs.length] }));
        useSelector(true);
        const cachedTypes = await cacheProductTypes(typeIDs);
        const rawBefore = cachedTypes.filter(type => type.RawModeActive).length;

        const results = await transformProducts();

        expectEverySubtypeLinked(results);
        expect(provider.Count('FindISAChildEntity')).toBe(0);
        expect(rawBefore).toBe(typeIDs.length - 1);
        expect(cachedTypes.filter(type => type.RawModeActive).length).toBe(rawBefore);
    });
});
