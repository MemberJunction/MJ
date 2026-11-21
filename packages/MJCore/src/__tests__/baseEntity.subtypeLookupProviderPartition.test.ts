/**
 * The SubtypeSelector FK-path lookup memo is partitioned by provider.
 *
 * Resolving an IS-A subtype through a selector path such as `ItemTypeID.SubtypeName` loads the FK
 * target row, and the loaded row (or a miss) is memoized. The memo used to be one process-global map
 * keyed only by `entity|pk`, so in a multi-provider process provider B was handed the row provider A
 * loaded — another database, another user's context — and resolved B's record to A's subtype. The
 * memo now lives per provider: each provider memoizes its own lookups, and never sees another's.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { CompositeKey } from '../generic/compositeKey';
import { EntityInfo } from '../generic/entityInfo';
import { IMetadataProvider } from '../generic/interfaces';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { UserInfo } from '../generic/securityInfo';

const ITEM_TYPES_ID = 'e-item-types';
const ITEMS_ID = 'e-items';
const WIDGETS_ID = 'e-widgets';
const GADGETS_ID = 'e-gadgets';
const ROLE_ID = 'role-partition';
const TYPE_ROW_ID = 'type-1';

interface FieldSpec {
    Name: string;
    Type: string;
    IsPrimaryKey?: boolean;
    RelatedEntity?: string;
    RelatedEntityID?: string;
}

function field(entityId: string, entityName: string, spec: FieldSpec, sequence: number): Record<string, unknown> {
    return {
        ID: `f-${entityId}-${spec.Name}`, EntityID: entityId, Entity: entityName, Name: spec.Name, Type: spec.Type,
        IsPrimaryKey: spec.IsPrimaryKey ?? false, IsSoftPrimaryKey: false, IsSoftForeignKey: false,
        AllowsNull: !spec.IsPrimaryKey, AutoIncrement: false, IsVirtual: false, IsNameField: false,
        AllowUpdateAPI: !spec.IsPrimaryKey, ValueListType: 'None', Sequence: sequence, Status: 'Active',
        RelatedEntity: spec.RelatedEntity ?? null, RelatedEntityID: spec.RelatedEntityID ?? null,
        RelatedEntityFieldName: spec.RelatedEntity ? 'ID' : null, EntityFieldValues: [],
    };
}

function entity(id: string, name: string, parentId: string | null, fields: FieldSpec[], extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ID: id, Name: name, BaseTable: name.replace(/\s/g, ''), BaseView: `vw${name.replace(/\s/g, '')}`, SchemaName: 'dbo',
        VirtualEntity: false, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true, IncludeInAPI: true,
        ParentID: parentId, Status: 'Active',
        EntityFields: fields.map((f, i) => field(id, name, f, i + 1)),
        EntityPermissions: [{ EntityID: id, RoleID: ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }],
        EntityRelationships: [], EntitySettings: [],
        ...extra,
    };
}

const ENTITY_ROWS: Record<string, unknown>[] = [
    entity(ITEM_TYPES_ID, 'Item Types', null, [
        { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
        { Name: 'SubtypeName', Type: 'nvarchar' },
    ]),
    entity(ITEMS_ID, 'Items', null, [
        { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
        { Name: 'ItemTypeID', Type: 'uniqueidentifier', RelatedEntity: 'Item Types', RelatedEntityID: ITEM_TYPES_ID },
    ], { SubtypeSelector: JSON.stringify({ Path: 'ItemTypeID.SubtypeName' }) }),
    entity(WIDGETS_ID, 'Widgets', ITEMS_ID, [{ Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true }]),
    entity(GADGETS_ID, 'Gadgets', ITEMS_ID, [{ Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true }]),
];

/** Loads rows from its provider's in-memory "database" instead of a real one. */
class PartitionTestEntity extends BaseEntity {
    public Rows: Map<string, Record<string, unknown>> = new Map();

    public override async InnerLoad(key: CompositeKey): Promise<boolean> {
        const id = String(key.KeyValuePairs[0]?.Value ?? '');
        const row = this.Rows.get(id);
        if (!row) {
            return false;
        }
        for (const [name, value] of Object.entries(row)) {
            this.Set(name, value);
        }
        return true;
    }
}

interface PartitionProvider extends IMetadataProvider {
    Entities: EntityInfo[];
    CurrentUser: UserInfo;
    TypeRows: Map<string, Record<string, unknown>>;
    GetEntityObjectCalls: number;
    EntityByID(id: string): EntityInfo | undefined;
    GetEntityObject(name: string, user?: UserInfo): Promise<BaseEntity | null>;
}

function createUser(): UserInfo {
    return new UserInfo(null, {
        ID: 'user-partition', Name: 'System', Email: 'system@example.com', IsActive: true,
        UserRoles: [{ UserID: 'user-partition', RoleID: ROLE_ID, RoleName: 'Admin' }],
    });
}

/** A provider whose Item Types "table" maps TYPE_ROW_ID to the given subtype name. */
function createProvider(subtypeName: string): PartitionProvider {
    const user = createUser();
    const shape = {
        Entities: [] as EntityInfo[],
        CurrentUser: user,
        TypeRows: new Map<string, Record<string, unknown>>([[TYPE_ROW_ID, { ID: TYPE_ROW_ID, SubtypeName: subtypeName }]]),
        GetEntityObjectCalls: 0,
        EntityByID(id: string): EntityInfo | undefined {
            return shape.Entities.find(e => e.ID === id);
        },
        async GetEntityObject(name: string, contextUser?: UserInfo): Promise<BaseEntity | null> {
            shape.GetEntityObjectCalls++;
            const info = shape.Entities.find(e => e.Name.toLowerCase() === name.toLowerCase());
            if (!info) return null;
            const created = new PartitionTestEntity(info, shape as unknown as ProviderBase);
            created.Rows = shape.TypeRows;
            created.ContextCurrentUser = contextUser ?? user;
            return created;
        },
    };
    const typed = shape as unknown as PartitionProvider;
    shape.Entities = ENTITY_ROWS.map(row => new EntityInfo(row, typed));
    return typed;
}

function newItem(provider: PartitionProvider): PartitionTestEntity {
    const info = provider.Entities.find(e => e.ID === ITEMS_ID)!;
    const item = new PartitionTestEntity(info, provider as unknown as ProviderBase);
    item.ContextCurrentUser = provider.CurrentUser;
    item.NewRecord();
    item.Set('ItemTypeID', TYPE_ROW_ID);
    return item;
}

let previousGlobal: IMetadataProvider;
let previousEntityProvider: unknown;

beforeEach(() => {
    previousGlobal = Metadata.Provider;
    previousEntityProvider = BaseEntity.Provider;
    Metadata.Provider = null as unknown as IMetadataProvider;
    BaseEntity.Provider = null as unknown as ProviderBase;
    BaseEntity.ClearSubtypeLookupCache();
});

afterEach(() => {
    Metadata.Provider = previousGlobal;
    BaseEntity.Provider = previousEntityProvider as ProviderBase;
    BaseEntity.ClearSubtypeLookupCache();
});

describe('SubtypeSelector path lookups are memoized per provider', () => {
    it('two providers resolve the same FK value against their own data', async () => {
        const a = createProvider('Widgets');
        const b = createProvider('Gadgets');

        await expect(newItem(a).ResolveSubtypeEntityName()).resolves.toBe('Widgets');
        // Same entity name and FK value: a global memo would replay A's row here.
        await expect(newItem(b).ResolveSubtypeEntityName()).resolves.toBe('Gadgets');
        expect(a.GetEntityObjectCalls).toBe(1);
        expect(b.GetEntityObjectCalls).toBe(1);
    });

    it('a miss memoized for one provider is not a miss for another', async () => {
        const a = createProvider('Widgets');
        a.TypeRows.clear(); // A's database has no such type row
        const b = createProvider('Gadgets');

        await expect(newItem(a).ResolveSubtypeEntityName()).resolves.toBeNull();
        await expect(newItem(b).ResolveSubtypeEntityName()).resolves.toBe('Gadgets');
    });

    it('still memoizes within one provider', async () => {
        const a = createProvider('Widgets');
        await expect(newItem(a).ResolveSubtypeEntityName()).resolves.toBe('Widgets');
        await expect(newItem(a).ResolveSubtypeEntityName()).resolves.toBe('Widgets');
        expect(a.GetEntityObjectCalls).toBe(1);

        BaseEntity.ClearSubtypeLookupCache();
        await expect(newItem(a).ResolveSubtypeEntityName()).resolves.toBe('Widgets');
        expect(a.GetEntityObjectCalls).toBe(2);
    });
});
