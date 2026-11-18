/**
 * Regression guard for BaseEntity lazy EntityField hydration (`_raw` fast path).
 *
 * Ensures that:
 * 1. `LoadFromData()` (including after `GetEntityObject()` / `NewRecord()` and across 500-row
 *    `TransformSimpleObjectToEntityObject` batches) keeps `_fieldsHydrated === false`.
 * 2. Pure read operations (`Get()`, `GetAll()`, `Dirty`, `FieldIsDirty()`) keep
 *    `_fieldsHydrated === false` without allocating `EntityField` instances.
 * 3. Partial rows loaded via `LoadFromData()` omit non-loaded keys in `GetAll()` while
 *    staying unhydrated, and when `.Fields` / `GetFieldByName()` is eventually accessed,
 *    omitted non-PK fields have `NotLoaded === true` while present fields have `NotLoaded === false`.
 * 4. Mutating via `Set()` promotes `_raw` into `EntityField` instances (`_fieldsHydrated === true`)
 *    and tracks dirty state accurately.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { TransformSimpleObjectToEntityObject } from '../generic/util';
import type { IEntityDataProvider, IMetadataProvider } from '../generic/interfaces';
import type { UserInfo } from '../generic/securityInfo';

const LAZY_ENTITY_ID = 'entity-lazy-hydration-001';

function makeFieldDef(
    id: string,
    name: string,
    type: string,
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        ID: id,
        EntityID: LAZY_ENTITY_ID,
        Name: name,
        Type: type,
        IsPrimaryKey: false,
        IsSoftPrimaryKey: false,
        IsSoftForeignKey: false,
        AllowsNull: true,
        AutoIncrement: false,
        IsVirtual: false,
        IsNameField: false,
        AllowUpdateAPI: true,
        ValueListType: 'None',
        Sequence: 1,
        Status: 'Active',
        Entity: 'LazyWidgets',
        EntityFieldValues: [],
        ...overrides,
    };
}

const LAZY_ENTITY_DATA = {
    ID: LAZY_ENTITY_ID,
    Name: 'LazyWidgets',
    BaseTable: 'LazyWidget',
    BaseView: 'vwLazyWidgets',
    SchemaName: 'dbo',
    VirtualEntity: false,
    AllowCreateAPI: true,
    AllowUpdateAPI: true,
    AllowDeleteAPI: true,
    IncludeInAPI: true,
    Status: 'Active',
    EntityFields: [
        makeFieldDef('f-lw-id', 'ID', 'uniqueidentifier', { IsPrimaryKey: true, AllowsNull: false, Sequence: 1 }),
        makeFieldDef('f-lw-name', 'Name', 'nvarchar', { AllowsNull: false, Length: 100, Sequence: 2 }),
        makeFieldDef('f-lw-desc', 'Description', 'nvarchar', { AllowsNull: true, Length: -1, Sequence: 3 }),
        makeFieldDef('f-lw-cat', 'CategoryName', 'nvarchar', { AllowsNull: true, IsVirtual: true, ReadOnly: true, Sequence: 4 }),
        makeFieldDef('f-lw-created', '__mj_CreatedAt', 'datetimeoffset', { AllowsNull: false, ReadOnly: true, Sequence: 5 }),
    ],
    EntityPermissions: [],
    EntityRelationships: [],
    EntityRelationshipsByRelatedEntity: [],
    EntitySettings: [],
};

interface InternalHydrationState {
    _fieldsHydrated: boolean;
    _raw: Record<string, unknown> | null;
    _fields: unknown[];
}

function isHydrated(entity: BaseEntity): boolean {
    return (entity as unknown as InternalHydrationState)._fieldsHydrated;
}

let lazyEntityInfo: EntityInfo;
const testUser = { ID: 'u-lazy-1', Name: 'Tester', Email: 't@example.com', UserRoles: [] } as unknown as UserInfo;

beforeAll(() => {
    lazyEntityInfo = new EntityInfo(LAZY_ENTITY_DATA);
    const mockProvider = {
        Entities: [lazyEntityInfo],
        EntityByName: (name: string) => (name === 'LazyWidgets' ? lazyEntityInfo : undefined),
        CurrentUser: testUser,
        SetCachedRecordName: () => { /* noop */ },
        GetCachedRecordName: () => null,
        GetEntityObject: async (entityName: string, user?: UserInfo) => {
            if (entityName !== 'LazyWidgets') return null;
            const instance = new BaseEntity(lazyEntityInfo, mockProvider as unknown as IEntityDataProvider);
            instance.ContextCurrentUser = user ?? testUser;
            instance.NewRecord();
            return instance;
        },
    } as unknown as ProviderBase;
    Metadata.Provider = mockProvider;
    BaseEntity.Provider = mockProvider as unknown as IEntityDataProvider;
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
    BaseEntity.Provider = null as unknown as IEntityDataProvider;
});

describe('BaseEntity lazy EntityField hydration regression guard', () => {
    it('keeps _fieldsHydrated === false after LoadFromData on a fresh instance and after NewRecord()', async () => {
        const directEntity = new BaseEntity(lazyEntityInfo);
        await directEntity.LoadFromData({
            ID: '11111111-1111-1111-1111-111111111111',
            Name: 'Direct Widget',
            Description: 'Loaded directly',
            CategoryName: 'Tools',
            __mj_CreatedAt: '2026-04-01T00:00:00.000Z',
        });
        expect(isHydrated(directEntity)).toBe(false);
        expect(directEntity.IsSaved).toBe(true);
        expect(directEntity.RecordLoaded).toBe(true);

        // Also verify when NewRecord() ran first (as in Metadata.GetEntityObject())
        const fromGetEntityObject = new BaseEntity(lazyEntityInfo);
        fromGetEntityObject.NewRecord();
        await fromGetEntityObject.LoadFromData({
            ID: '22222222-2222-2222-2222-222222222222',
            Name: 'Factory Widget',
            Description: 'Loaded after NewRecord',
            CategoryName: 'Hardware',
            __mj_CreatedAt: '2026-04-01T00:00:00.000Z',
        });
        expect(isHydrated(fromGetEntityObject)).toBe(false);
        expect(fromGetEntityObject.Get('Name')).toBe('Factory Widget');
        expect(isHydrated(fromGetEntityObject)).toBe(false);
    });

    it('keeps _fieldsHydrated === false across all 500 entities in a TransformSimpleObjectToEntityObject batch', async () => {
        const rows: Record<string, unknown>[] = [];
        for (let i = 0; i < 500; i++) {
            rows.push({
                ID: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
                Name: `Widget #${i}`,
                Description: `Description for widget ${i}`,
                CategoryName: 'BatchCategory',
                __mj_CreatedAt: '2026-04-01T12:00:00.000Z',
            });
        }

        const entities = await TransformSimpleObjectToEntityObject<BaseEntity>(
            Metadata.Provider as unknown as IMetadataProvider,
            'LazyWidgets',
            rows,
            testUser,
        );

        expect(entities).toHaveLength(500);
        for (let i = 0; i < entities.length; i++) {
            expect(isHydrated(entities[i])).toBe(false);
            expect(entities[i].Get('Name')).toBe(`Widget #${i}`);
            expect(isHydrated(entities[i])).toBe(false);
        }
    });

    it('keeps _fieldsHydrated === false across Get(), GetAll(), Dirty, and FieldIsDirty(), and hydrates only on Set()', async () => {
        const entity = new BaseEntity(lazyEntityInfo);
        await entity.LoadFromData({
            ID: '33333333-3333-3333-3333-333333333333',
            Name: 'Read-Only Widget',
            Description: 'Initial description',
            CategoryName: 'Gadgets',
            __mj_CreatedAt: '2026-04-15T08:30:00.000Z',
        });

        expect(isHydrated(entity)).toBe(false);
        expect(entity.Get('Name')).toBe('Read-Only Widget');
        expect(entity.Get('__mj_CreatedAt')).toBeInstanceOf(Date);
        expect(entity.Dirty).toBe(false);
        expect(entity.FieldIsDirty('Name')).toBe(false);
        expect(isHydrated(entity)).toBe(false);

        const all = entity.GetAll();
        expect(isHydrated(entity)).toBe(false);
        expect(all).toMatchObject({
            ID: '33333333-3333-3333-3333-333333333333',
            Name: 'Read-Only Widget',
            Description: 'Initial description',
            CategoryName: 'Gadgets',
        });
        expect(entity.GetAll(false, true)).toEqual({});
        expect(isHydrated(entity)).toBe(false);

        // Mutating a field via Set() triggers hydration and tracks Dirty / OldValue
        entity.Set('Name', 'Mutated Widget');
        expect(isHydrated(entity)).toBe(true);
        expect(entity.Dirty).toBe(true);
        expect(entity.FieldIsDirty('Name')).toBe(true);
        expect(entity.GetFieldByName('Name')?.OldValue).toBe('Read-Only Widget');
        expect(entity.Get('Name')).toBe('Mutated Widget');
    });

    it('preserves NotLoaded semantics for partial rows before and after deferred hydration', async () => {
        const entity = new BaseEntity(lazyEntityInfo);
        // Load a partial row missing Description and CategoryName
        await entity.LoadFromData({
            ID: '44444444-4444-4444-4444-444444444444',
            Name: 'Partial Widget',
        });

        expect(isHydrated(entity)).toBe(false);

        // GetAll() in raw mode omits fields absent from the source row and keeps _fieldsHydrated === false
        const allBeforeHydration = entity.GetAll();
        expect(isHydrated(entity)).toBe(false);
        expect(allBeforeHydration).toEqual({
            ID: '44444444-4444-4444-4444-444444444444',
            Name: 'Partial Widget',
        });
        expect(allBeforeHydration).not.toHaveProperty('Description');
        expect(allBeforeHydration).not.toHaveProperty('CategoryName');

        // Accessing .Fields triggers hydration and marks omitted fields NotLoaded = true
        expect(entity.Fields).toHaveLength(5);
        expect(isHydrated(entity)).toBe(true);
        expect(entity.GetFieldByName('ID')?.NotLoaded).toBe(false);
        expect(entity.GetFieldByName('Name')?.NotLoaded).toBe(false);
        expect(entity.GetFieldByName('Description')?.NotLoaded).toBe(true);
        expect(entity.GetFieldByName('CategoryName')?.NotLoaded).toBe(true);
        expect(entity.GetFieldByName('__mj_CreatedAt')?.NotLoaded).toBe(true);
    });

    it('marks virtual non-PK fields as NotLoaded=true on datestamps_only create and reuses __mj_preMerged row without a second GetAll()', () => {
        const entity = new BaseEntity(lazyEntityInfo);
        entity.NewRecord();
        entity.Set('Name', 'Created Widget');
        entity.Set('Description', 'Created with datestamps_only');

        type FinalizeSaveAccess = {
            finalizeSave: (
                data: Record<string, unknown>,
                saveSubType: 'create' | 'update',
                options?: { SaveReturnMode?: 'full' | 'datestamps_only' },
            ) => boolean;
        };

        // Case 1: unmerged datestamps_only return row on create -> virtual CategoryName is marked NotLoaded=true
        const ok = (entity as unknown as FinalizeSaveAccess).finalizeSave(
            {
                ID: '55555555-5555-5555-5555-555555555555',
                __mj_CreatedAt: '2026-04-18T10:00:00.000Z',
            },
            'create',
            { SaveReturnMode: 'datestamps_only' },
        );
        expect(ok).toBe(true);
        expect(entity.Get('Name')).toBe('Created Widget');
        expect(entity.Get('Description')).toBe('Created with datestamps_only');
        expect(entity.GetFieldByName('CategoryName')?.NotLoaded).toBe(true);

        // Case 2: pre-merged row from DatabaseProviderBase.Save (__mj_preMerged = true) -> does not call GetAll() again
        let getAllCount = 0;
        const origGetAll = entity.GetAll.bind(entity);
        entity.GetAll = (...args: [boolean?, boolean?]) => {
            getAllCount++;
            return origGetAll(...args);
        };
        const preMerged: Record<string, unknown> = {
            ID: '55555555-5555-5555-5555-555555555555',
            Name: 'Updated Widget',
            Description: 'Created with datestamps_only',
            __mj_CreatedAt: '2026-04-18T10:00:00.000Z',
        };
        Object.defineProperty(preMerged, '__mj_preMerged', { value: true, enumerable: false });
        (entity as unknown as FinalizeSaveAccess).finalizeSave(preMerged, 'update', { SaveReturnMode: 'datestamps_only' });
        expect(getAllCount).toBe(0);
        expect(entity.Get('Name')).toBe('Updated Widget');
        expect(entity.GetFieldByName('CategoryName')?.NotLoaded).toBe(true);
    });
});
