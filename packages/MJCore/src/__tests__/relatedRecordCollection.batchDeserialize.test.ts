/**
 * Unit tests for batched `RelatedRecordCollection.Deserialize(..., 'request')` preloading.
 *
 * Verifies:
 *   1. Rehydrating 2+ existing items and 2+ removals batches PK reads via `RunView`
 *      (`ResultType: 'simple'`, `BypassCache: true`, `SkipTotalRowCount: true`) instead of issuing
 *      N sequential `InnerLoad` calls, hydrating via `HydrateFromRow` and preserving wire order.
 *   2. Composite primary keys batch cleanly and match rows across both keys.
 *   3. Missing existing item row still throws; missing removal row is tolerated and skipped.
 *   4. Falls back to individual `InnerLoad` when `RunView` is unavailable or when a subclass overrides `InnerLoad`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { CompositeKey } from '../generic/compositeKey';
import { EntityInfo } from '../generic/entityInfo';
import type { IEntityDataProvider, IMetadataProvider, RunViewParams } from '../generic/interfaces';
import { Metadata } from '../generic/metadata';
import type { ProviderBase } from '../generic/providerBase';
import { RelatedRecordCollection } from '../generic/relatedRecordCollection';
import { UserInfo } from '../generic/securityInfo';

const MOCK_USER = new UserInfo(null, {
    ID: 'u-1',
    Name: 'Tester',
    Email: 't@example.com',
    Type: 'Owner',
    UserRoles: [{ UserID: 'u-1', RoleID: 'r-admin', RoleName: 'Admin' }],
});

const ALLOW_ALL_PERM = [{ RoleID: 'r-admin', CanRead: true, CanCreate: true, CanUpdate: true, CanDelete: true, Type: 'Allow' }];

const PARENT_ENTITY_ID = 'ent-parent';
const CHILD_ENTITY_ID = 'ent-child';
const COMPOSITE_ENTITY_ID = 'ent-composite';

const ENTITIES = [
    new EntityInfo({
        ID: PARENT_ENTITY_ID,
        Name: 'Orders',
        BaseTable: 'Order',
        BaseView: 'vwOrders',
        SchemaName: 'dbo',
        IncludeInAPI: true,
        Permissions: ALLOW_ALL_PERM,
        Fields: [
            { ID: 'f-o-id', EntityID: PARENT_ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Orders', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowUpdateAPI: false, IsVirtual: false },
        ],
    }),
    new EntityInfo({
        ID: CHILD_ENTITY_ID,
        Name: 'OrderLines',
        BaseTable: 'OrderLine',
        BaseView: 'vwOrderLines',
        SchemaName: 'dbo',
        IncludeInAPI: true,
        Permissions: ALLOW_ALL_PERM,
        Fields: [
            { ID: 'f-ol-id', EntityID: CHILD_ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'OrderLines', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowUpdateAPI: false, IsVirtual: false },
            { ID: 'f-ol-oid', EntityID: CHILD_ENTITY_ID, Sequence: 2, Name: 'OrderID', Entity: 'OrderLines', Type: 'uniqueidentifier', IsPrimaryKey: false, AllowUpdateAPI: true, IsVirtual: false },
            { ID: 'f-ol-sku', EntityID: CHILD_ENTITY_ID, Sequence: 3, Name: 'SKU', Entity: 'OrderLines', Type: 'nvarchar', IsPrimaryKey: false, AllowUpdateAPI: true, IsVirtual: false },
        ],
    }),
    new EntityInfo({
        ID: COMPOSITE_ENTITY_ID,
        Name: 'OrderLineTags',
        BaseTable: 'OrderLineTag',
        BaseView: 'vwOrderLineTags',
        SchemaName: 'dbo',
        IncludeInAPI: true,
        Permissions: ALLOW_ALL_PERM,
        Fields: [
            { ID: 'f-olt-oid', EntityID: COMPOSITE_ENTITY_ID, Sequence: 1, Name: 'OrderID', Entity: 'OrderLineTags', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowUpdateAPI: false, IsVirtual: false },
            { ID: 'f-olt-tag', EntityID: COMPOSITE_ENTITY_ID, Sequence: 2, Name: 'TagID', Entity: 'OrderLineTags', Type: 'int', IsPrimaryKey: true, AllowUpdateAPI: false, IsVirtual: false },
            { ID: 'f-olt-note', EntityID: COMPOSITE_ENTITY_ID, Sequence: 3, Name: 'Note', Entity: 'OrderLineTags', Type: 'nvarchar', IsPrimaryKey: false, AllowUpdateAPI: true, IsVirtual: false },
        ],
    }),
];

class TestChildEntity extends BaseEntity {
    public InnerLoadCalls = 0;

    public override async InnerLoad(compositeKey: CompositeKey): Promise<boolean> {
        this.InnerLoadCalls++;
        const idVal = compositeKey.GetValueByFieldName('ID');
        this.Hydrate({ ID: idVal, OrderID: 'ord-1', SKU: `FALLBACK-${String(idVal)}` });
        return true;
    }
}

class CustomInnerLoadChildEntity extends BaseEntity {
    public InnerLoadCalls = 0;

    public override async InnerLoad(compositeKey: CompositeKey): Promise<boolean> {
        this.InnerLoadCalls++;
        const idVal = compositeKey.GetValueByFieldName('ID');
        this.Hydrate({ ID: idVal, OrderID: 'ord-1', SKU: `CUSTOM-${String(idVal)}` });
        return true;
    }
}

class StandardChildEntity extends BaseEntity {}

function makeProvider(options: {
    rowsByEntity?: Record<string, Array<Record<string, unknown>>>;
    useCustomInnerLoad?: boolean;
    omitRunView?: boolean;
} = {}) {
    const runViewCalls: RunViewParams[] = [];
    const createdChildren: BaseEntity[] = [];

    const provider = {
        Entities: ENTITIES,
        CurrentUser: MOCK_USER,
        GetEntityObject: async (entityName: string, _user?: UserInfo): Promise<BaseEntity> => {
            const info = ENTITIES.find(e => e.Name === entityName)!;
            const child = options.useCustomInnerLoad
                ? new CustomInnerLoadChildEntity(info, provider as unknown as IEntityDataProvider)
                : new StandardChildEntity(info, provider as unknown as IEntityDataProvider);
            if (options.omitRunView) {
                vi.spyOn(child, 'InnerLoad').mockImplementation(async (compositeKey: CompositeKey) => {
                    const idVal = compositeKey.GetValueByFieldName('ID');
                    child.Hydrate({ ID: idVal, OrderID: 'ord-1', SKU: `INNERLOAD-${String(idVal)}` });
                    return true;
                });
            }
            createdChildren.push(child);
            return child;
        },
        ...(options.omitRunView
            ? {}
            : {
                RunView: async (params: RunViewParams) => {
                    runViewCalls.push(params);
                    const rows = options.rowsByEntity?.[params.EntityName ?? ''] ?? [];
                    return { Success: true, Results: rows, TotalRowCount: rows.length };
                },
            }),
    };

    return { provider, runViewCalls, createdChildren };
}

function makeOwner(provider: unknown): BaseEntity {
    const ownerInfo = ENTITIES[0];
    return {
        EntityInfo: ownerInfo,
        ProviderToUse: provider,
        FirstPrimaryKey: { Value: 'ord-1' },
        PrimaryKey: CompositeKey.FromObject({ ID: 'ord-1' }),
        IsSaved: true,
        ContextCurrentUser: MOCK_USER,
    } as unknown as BaseEntity;
}

describe('RelatedRecordCollection.Deserialize("request") batched preload', () => {
    beforeAll(() => {
        Metadata.Provider = { Entities: ENTITIES, CurrentUser: MOCK_USER } as unknown as ProviderBase;
    });

    afterAll(() => {
        Metadata.Provider = null as unknown as ProviderBase;
    });

    it('batches 2+ existing items and 2+ removals via RunView simple instead of N sequential InnerLoad calls', async () => {
        const innerLoadSpy = vi.spyOn(BaseEntity.prototype, 'InnerLoad');
        try {
            const { provider, runViewCalls } = makeProvider({
                rowsByEntity: {
                    OrderLines: [
                        { ID: 'l-2', OrderID: 'ord-1', SKU: 'OLD-B' },
                        { ID: 'l-1', OrderID: 'ord-1', SKU: 'OLD-A' },
                        { ID: 'r-1', OrderID: 'ord-1', SKU: 'DEL-1' },
                        { ID: 'r-2', OrderID: 'ord-1', SKU: 'DEL-2' },
                    ],
                },
            });

            const owner = makeOwner(provider as unknown as IMetadataProvider);
            const collection = new RelatedRecordCollection(owner, {
                Name: 'OrderLines',
                RelatedEntity: 'OrderLines',
                RelatedEntityJoinField: 'OrderID',
            });

            await collection.Deserialize(
                {
                    Items: [
                        { IsNew: false, Fields: { ID: 'l-1', SKU: 'NEW-A' } },
                        { IsNew: false, Fields: { ID: 'l-2', SKU: 'NEW-B' } },
                    ],
                    Removed: [
                        { ID: 'r-1' },
                        { ID: 'r-2' },
                    ],
                },
                'request',
            );

            expect(runViewCalls).toHaveLength(2); // 1 batch for Items, 1 batch for Removed
            for (const call of runViewCalls) {
                expect(call.ResultType).toBe('simple');
                expect(call.BypassCache).toBe(true);
                expect(call.SkipTotalRowCount).toBe(true);
            }
            expect(collection.Count).toBe(2);
            expect(collection.Items[0].Get('ID')).toBe('l-1');
            expect(collection.Items[0].Get('SKU')).toBe('NEW-A');
            expect(collection.Items[0].IsSaved).toBe(true);
            expect(collection.Items[0].Dirty).toBe(true);
            expect(collection.Items[1].Get('SKU')).toBe('NEW-B');
            expect(collection.Removed).toHaveLength(2);
            expect(innerLoadSpy).not.toHaveBeenCalled();
        } finally {
            innerLoadSpy.mockRestore();
        }
    });

    it('supports composite primary keys cleanly across batched preload and wire hydration', async () => {
        const { provider, runViewCalls } = makeProvider({
            rowsByEntity: {
                OrderLineTags: [
                    { OrderID: 'ord-1', TagID: 10, Note: 'before-10' },
                    { OrderID: 'ord-1', TagID: 20, Note: 'before-20' },
                ],
            },
        });
        const owner = makeOwner(provider);
        const collection = new RelatedRecordCollection(owner, {
            Name: 'OrderLineTags',
            RelatedEntity: 'OrderLineTags',
            RelatedEntityJoinField: 'OrderID',
        });

        await collection.Deserialize(
            {
                Items: [
                    {
                        IsNew: false,
                        Fields: { OrderID: 'ord-1', TagID: 10, Note: 'after-10' },
                    },
                    {
                        IsNew: false,
                        Fields: { OrderID: 'ord-1', TagID: 20, Note: 'after-20' },
                    },
                ],
                Removed: [],
            },
            'request',
        );

        expect(runViewCalls).toHaveLength(1);
        expect(runViewCalls[0].ExtraFilter).toContain('AND');
        expect(runViewCalls[0].ExtraFilter).toContain('[TagID]=10');
        expect(runViewCalls[0].ExtraFilter).toContain('[TagID]=20');
        expect(collection.Items[0].Get('Note')).toBe('after-10');
        expect(collection.Items[1].Get('Note')).toBe('after-20');
    });

    it('throws when an existing item row is missing from batched results and tolerates missing removals', async () => {
        const { provider } = makeProvider({
            rowsByEntity: {
                OrderLines: [
                    { ID: 'l-1', OrderID: 'ord-1', SKU: 'A' },
                    { ID: 'r-1', OrderID: 'ord-1', SKU: 'R1' },
                ],
            },
        });
        const owner = makeOwner(provider);

        const colMissingItem = new RelatedRecordCollection(owner, {
            Name: 'OrderLines',
            RelatedEntity: 'OrderLines',
            RelatedEntityJoinField: 'OrderID',
        });
        await expect(
            colMissingItem.Deserialize(
                {
                    Items: [
                        { IsNew: false, Fields: { ID: 'l-1' } },
                        { IsNew: false, Fields: { ID: 'l-missing' } },
                    ],
                    Removed: [],
                },
                'request',
            ),
        ).rejects.toThrow(/cannot load existing/i);

        const colMissingRemoval = new RelatedRecordCollection(owner, {
            Name: 'OrderLines',
            RelatedEntity: 'OrderLines',
            RelatedEntityJoinField: 'OrderID',
        });
        await colMissingRemoval.Deserialize(
            {
                Items: [],
                Removed: [
                    { ID: 'r-1' },
                    { ID: 'r-missing' },
                ],
            },
            'request',
        );
        expect(colMissingRemoval.Removed).toHaveLength(1);
        expect(colMissingRemoval.Removed[0].Get('ID')).toBe('r-1');
    });

    it('falls back to sequential InnerLoad when RunView is absent or a subclass overrides InnerLoad', async () => {
        const noRv = makeProvider({ omitRunView: true });
        const col1 = new RelatedRecordCollection(makeOwner(noRv.provider), {
            Name: 'OrderLines',
            RelatedEntity: 'OrderLines',
            RelatedEntityJoinField: 'OrderID',
        });
        await col1.Deserialize(
            {
                Items: [
                    { IsNew: false, Fields: { ID: 'x-1' } },
                    { IsNew: false, Fields: { ID: 'x-2' } },
                ],
                Removed: [],
            },
            'request',
        );
        expect(noRv.createdChildren).toHaveLength(2);
        expect(noRv.createdChildren[0].InnerLoad).toHaveBeenCalledTimes(1);
        expect(noRv.createdChildren[1].InnerLoad).toHaveBeenCalledTimes(1);

        const customLoadProvider = {
            Entities: ENTITIES,
            CurrentUser: MOCK_USER,
            GetEntityObject: async () => new CustomInnerLoadChildEntity(ENTITIES[1], customLoadProvider as unknown as IEntityDataProvider),
            RunView: vi.fn(async () => ({ Success: true, Results: [] })),
        };
        const col2 = new RelatedRecordCollection(makeOwner(customLoadProvider), {
            Name: 'OrderLines',
            RelatedEntity: 'OrderLines',
            RelatedEntityJoinField: 'OrderID',
        });
        await col2.Deserialize(
            {
                Items: [
                    { IsNew: false, Fields: { ID: 'c-1' } },
                    { IsNew: false, Fields: { ID: 'c-2' } },
                ],
                Removed: [],
            },
            'request',
        );
        expect(customLoadProvider.RunView).not.toHaveBeenCalled();
        expect(col2.Items[0].Get('SKU')).toBe('CUSTOM-c-1');
        expect(col2.Items[1].Get('SKU')).toBe('CUSTOM-c-2');
    });

    it('keeps TestChildEntity fallback compatibility intact for single-item loads', async () => {
        const provider = {
            Entities: ENTITIES,
            CurrentUser: MOCK_USER,
            GetEntityObject: async () => new TestChildEntity(ENTITIES[1], provider as unknown as IEntityDataProvider),
        };
        const col = new RelatedRecordCollection(makeOwner(provider), {
            Name: 'OrderLines',
            RelatedEntity: 'OrderLines',
            RelatedEntityJoinField: 'OrderID',
        });
        await col.Deserialize(
            {
                Items: [{ IsNew: false, Fields: { ID: 'single-1' } }],
                Removed: [],
            },
            'request',
        );
        expect(col.Count).toBe(1);
        expect(col.Items[0].Get('SKU')).toBe('FALLBACK-single-1');
    });
});
