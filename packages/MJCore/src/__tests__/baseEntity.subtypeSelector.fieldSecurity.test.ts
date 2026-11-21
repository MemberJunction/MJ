/**
 * IS-A subtype selection under field-level security.
 *
 * A `SubtypeSelector` path such as `ItemTypeID.SubtypeName` reads a field on a record the
 * selector reaches. That read must obey the acting user's field rules:
 *
 * - A field the user may not read gives "no subtype", the way `GetRecordName` treats a denied
 *   name field, instead of throwing a `FieldSecurityError` out of `ResolveSubtypeEntityName`.
 * - The FK-target lookup memo holds entity objects shaped to the user that loaded them, so it is
 *   keyed by user as well as by provider: one user's object is never handed to another.
 * - A record found in an engine cache was loaded as the system user and holds every column. The
 *   selector asks whether the ACTING user may read the field, not the cached object's own user.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { BaseEngineRegistry } from '../generic/baseEngineRegistry';
import { CompositeKey } from '../generic/compositeKey';
import { EntityInfo, FieldPermissionAccess } from '../generic/entityInfo';
import { IMetadataProvider } from '../generic/interfaces';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { UserInfo } from '../generic/securityInfo';

const ITEM_TYPES_ID = 'e-item-types';
const ITEMS_ID = 'e-items';
const WIDGETS_ID = 'e-widgets';
const GADGETS_ID = 'e-gadgets';
const ADMIN_ROLE_ID = 'role-admin';
const RESTRICTED_ROLE_ID = 'role-restricted';
const TYPE_ROW_ID = 'type-1';
const SUBTYPE_FIELD_ID = `f-${ITEM_TYPES_ID}-SubtypeName`;

interface FieldSpec {
    Name: string;
    Type: string;
    IsPrimaryKey?: boolean;
    RelatedEntity?: string;
    RelatedEntityID?: string;
    EntityFieldPermissions?: Record<string, unknown>[];
}

function field(entityId: string, entityName: string, spec: FieldSpec, sequence: number): Record<string, unknown> {
    return {
        ID: `f-${entityId}-${spec.Name}`, EntityID: entityId, Entity: entityName, Name: spec.Name, Type: spec.Type,
        IsPrimaryKey: spec.IsPrimaryKey ?? false, IsSoftPrimaryKey: false, IsSoftForeignKey: false,
        AllowsNull: !spec.IsPrimaryKey, AutoIncrement: false, IsVirtual: false, IsNameField: false,
        AllowUpdateAPI: !spec.IsPrimaryKey, ValueListType: 'None', Sequence: sequence, Status: 'Active',
        RelatedEntity: spec.RelatedEntity ?? null, RelatedEntityID: spec.RelatedEntityID ?? null,
        RelatedEntityFieldName: spec.RelatedEntity ? 'ID' : null, EntityFieldValues: [],
        EntityFieldPermissions: spec.EntityFieldPermissions ?? [],
    };
}

function entity(id: string, name: string, parentId: string | null, fields: FieldSpec[], extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ID: id, Name: name, BaseTable: name.replace(/\s/g, ''), BaseView: `vw${name.replace(/\s/g, '')}`, SchemaName: 'dbo',
        VirtualEntity: false, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true, IncludeInAPI: true,
        ParentID: parentId, Status: 'Active',
        EntityFields: fields.map((f, i) => field(id, name, f, i + 1)),
        EntityPermissions: [ADMIN_ROLE_ID, RESTRICTED_ROLE_ID].map(roleId => (
            { EntityID: id, RoleID: roleId, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }
        )),
        EntityRelationships: [], EntitySettings: [],
        ...extra,
    };
}

/** `Item Types.SubtypeName` is readable by the admin role only; field security is on for Item Types. */
const ENTITY_ROWS: Record<string, unknown>[] = [
    entity(ITEM_TYPES_ID, 'Item Types', null, [
        { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
        {
            Name: 'SubtypeName', Type: 'nvarchar',
            EntityFieldPermissions: [{
                ID: 'fp-admin', EntityFieldID: SUBTYPE_FIELD_ID, RoleID: ADMIN_ROLE_ID,
                ReadAccess: FieldPermissionAccess.Allow, UpdateAccess: FieldPermissionAccess.Allow, CreateAccess: FieldPermissionAccess.Allow,
            }],
        },
    ], { EnableFieldLevelSecurity: true }),
    entity(ITEMS_ID, 'Items', null, [
        { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
        { Name: 'ItemTypeID', Type: 'uniqueidentifier', RelatedEntity: 'Item Types', RelatedEntityID: ITEM_TYPES_ID },
    ], { SubtypeSelector: JSON.stringify({ Path: 'ItemTypeID.SubtypeName', UseForLoadedRecords: true }) }),
    entity(WIDGETS_ID, 'Widgets', ITEMS_ID, [{ Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true }]),
    entity(GADGETS_ID, 'Gadgets', ITEMS_ID, [{ Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true }]),
];

/** Loads rows from an in-memory "database" through the ordinary, field-security-narrowed hydration. */
class SelectorTestEntity extends BaseEntity {
    public Rows: Map<string, Record<string, unknown>> = new Map();

    public override async InnerLoad(key: CompositeKey): Promise<boolean> {
        const row = this.Rows.get(String(key.KeyValuePairs[0]?.Value ?? ''));
        return row ? this.LoadFromData({ ...row }) : false;
    }
}

interface SelectorProvider extends IMetadataProvider {
    Entities: EntityInfo[];
    CurrentUser: UserInfo;
    GetEntityObjectCalls: number;
    EntityByID(id: string): EntityInfo | undefined;
    GetEntityObject(name: string, user?: UserInfo): Promise<BaseEntity | null>;
}

function createUser(id: string, roleId: string): UserInfo {
    return new UserInfo(null, {
        ID: id, Name: id, Email: `${id}@example.com`, IsActive: true,
        UserRoles: [{ UserID: id, RoleID: roleId, RoleName: roleId }],
    });
}

const admin = createUser('user-admin', ADMIN_ROLE_ID);
const restricted = createUser('user-restricted', RESTRICTED_ROLE_ID);

function createProvider(): SelectorProvider {
    const rows = new Map<string, Record<string, unknown>>([[TYPE_ROW_ID, { ID: TYPE_ROW_ID, SubtypeName: 'Widgets' }]]);
    const shape = {
        Entities: [] as EntityInfo[],
        CurrentUser: admin,
        GetEntityObjectCalls: 0,
        EntityByID(id: string): EntityInfo | undefined {
            return shape.Entities.find(e => e.ID === id);
        },
        async GetEntityObject(name: string, contextUser?: UserInfo): Promise<BaseEntity | null> {
            shape.GetEntityObjectCalls++;
            const info = shape.Entities.find(e => e.Name.toLowerCase() === name.toLowerCase());
            if (!info) return null;
            const created = new SelectorTestEntity(info, shape as unknown as ProviderBase);
            created.Rows = rows;
            created.ContextCurrentUser = contextUser ?? admin;
            return created;
        },
    };
    const typed = shape as unknown as SelectorProvider;
    shape.Entities = ENTITY_ROWS.map(row => new EntityInfo(row, typed));
    return typed;
}

function newItem(provider: SelectorProvider, user: UserInfo): SelectorTestEntity {
    const info = provider.Entities.find(e => e.ID === ITEMS_ID)!;
    const item = new SelectorTestEntity(info, provider as unknown as ProviderBase);
    item.ContextCurrentUser = user;
    item.NewRecord();
    item.Set('ItemTypeID', TYPE_ROW_ID);
    return item;
}

/** An engine-cached Item Types record, loaded as the system user: it holds every column. */
async function systemLoadedTypeRow(provider: SelectorProvider): Promise<BaseEntity> {
    const row = (await provider.GetEntityObject('Item Types', admin))!;
    await row.InnerLoad(CompositeKey.FromID(TYPE_ROW_ID));
    return row;
}

const registeredEngines: object[] = [];
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
    for (const engine of registeredEngines.splice(0)) {
        BaseEngineRegistry.Instance.UnregisterEngine(engine);
    }
    Metadata.Provider = previousGlobal;
    BaseEntity.Provider = previousEntityProvider as ProviderBase;
    BaseEntity.ClearSubtypeLookupCache();
});

describe('IsFieldReadableByActiveUser', () => {
    it('answers for the object\'s own user without throwing', async () => {
        const provider = createProvider();
        const asRestricted = (await provider.GetEntityObject('Item Types', restricted))!;
        const asAdmin = (await provider.GetEntityObject('Item Types', admin))!;
        expect(asRestricted.IsFieldReadableByActiveUser('SubtypeName')).toBe(false);
        expect(asRestricted.IsFieldReadableByActiveUser('ID')).toBe(true);
        expect(asAdmin.IsFieldReadableByActiveUser('SubtypeName')).toBe(true);
    });
});

describe('SubtypeSelector reads obey the acting user\'s field rules', () => {
    it('resolves the subtype for a user who may read the selector field', async () => {
        await expect(newItem(createProvider(), admin).ResolveSubtypeEntityName()).resolves.toBe('Widgets');
    });

    it('REGRESSION: a denied selector field gives no subtype instead of throwing', async () => {
        await expect(newItem(createProvider(), restricted).ResolveSubtypeEntityName()).resolves.toBeNull();
    });

    it('REGRESSION: the lookup memo never hands one user\'s loaded record to another', async () => {
        const provider = createProvider();
        await expect(newItem(provider, admin).ResolveSubtypeEntityName()).resolves.toBe('Widgets');
        // Same provider, same FK value. A memo keyed by provider alone replays the admin's
        // full-width record here, and the restricted user resolves through a value they cannot read.
        await expect(newItem(provider, restricted).ResolveSubtypeEntityName()).resolves.toBeNull();
        expect(provider.GetEntityObjectCalls).toBe(2);
    });

    it('still memoizes per user within one provider', async () => {
        const provider = createProvider();
        await newItem(provider, admin).ResolveSubtypeEntityName();
        await newItem(provider, admin).ResolveSubtypeEntityName();
        expect(provider.GetEntityObjectCalls).toBe(1);
    });

    it('REGRESSION: a system-loaded engine-cached record is read with the acting user\'s rules', async () => {
        const provider = createProvider();
        const cached = await systemLoadedTypeRow(provider);
        const engine = { Loaded: true, Configs: [{ Type: 'entity', EntityName: 'Item Types', PropertyName: 'ItemTypes' }], ItemTypes: [cached] };
        BaseEngineRegistry.Instance.RegisterEngine(engine);
        registeredEngines.push(engine);

        await expect(newItem(provider, admin).ResolveSubtypeEntityName()).resolves.toBe('Widgets');
        await expect(newItem(provider, restricted).ResolveSubtypeEntityName()).resolves.toBeNull();
    });
});
