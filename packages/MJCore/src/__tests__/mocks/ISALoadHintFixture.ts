/**
 * Fixture for the IS-A load-hint tests: a small hierarchy with a type table, an in-memory store,
 * and a provider that records every round trip it serves.
 *
 *   Product Types   the type table a SubtypeSelector reads: ProductExtensionEntity names the subtype
 *   Products        disjoint IS-A root; ProductTypeID → Product Types
 *     ├── Meetings        IS-A Products (a leaf; the limited role can't read it)
 *     ├── Publications    IS-A Products (a leaf)
 *     └── Courses         IS-A Products, with a single child of its own
 *           └── Webinars  IS-A Courses
 *   Parties         overlapping IS-A root (AllowMultipleSubtypes = true)
 *     ├── Customers
 *     └── Vendors
 *
 * Every IS-A child declares the shared `ID` key, as generated child entities do. A round trip is
 * one call the provider serves, a record load or an IS-A child probe; in a browser, each is one
 * GraphQL request.
 */
import { BaseEntity } from '../../generic/baseEntity';
import { CompositeKey } from '../../generic/compositeKey';
import { EntityInfo } from '../../generic/entityInfo';
import type { IEntityDataProvider } from '../../generic/interfaces';
import { UserInfo } from '../../generic/securityInfo';

// ─── Metadata ──────────────────────────────────────────────────────────────

export const ADMIN_ROLE_ID = 'lh-role-admin';
/** A role that can read everything except Meetings. */
export const LIMITED_ROLE_ID = 'lh-role-limited';

const PRODUCT_TYPES_ID = 'lh-entity-product-types';
const PRODUCTS_ID = 'lh-entity-products';
const MEETINGS_ID = 'lh-entity-meetings';
const PUBLICATIONS_ID = 'lh-entity-publications';
const COURSES_ID = 'lh-entity-courses';
const WEBINARS_ID = 'lh-entity-webinars';
const PARTIES_ID = 'lh-entity-parties';
const CUSTOMERS_ID = 'lh-entity-customers';
const VENDORS_ID = 'lh-entity-vendors';

interface FieldSpec {
    Name: string;
    Type: string;
    IsPrimaryKey?: boolean;
    Length?: number;
    /** Makes the field a foreign key to this entity's `ID`. */
    References?: { ID: string; Name: string };
}

const ID_FIELD: FieldSpec = { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true };

function makeFields(entityID: string, entityName: string, specs: FieldSpec[]): Record<string, unknown>[] {
    return specs.map((spec, index) => ({
        ID: `${entityID}-field-${spec.Name}`,
        EntityID: entityID,
        Entity: entityName,
        Name: spec.Name,
        Type: spec.Type,
        Length: spec.Length ?? null,
        IsPrimaryKey: spec.IsPrimaryKey ?? false,
        IsSoftPrimaryKey: false,
        IsSoftForeignKey: false,
        AllowsNull: !spec.IsPrimaryKey,
        AutoIncrement: false,
        IsVirtual: false,
        IsNameField: spec.Name === 'Name',
        AllowUpdateAPI: !spec.IsPrimaryKey,
        ValueListType: 'None',
        Sequence: index + 1,
        Status: 'Active',
        EntityFieldValues: [],
        RelatedEntityID: spec.References?.ID ?? null,
        RelatedEntity: spec.References?.Name ?? null,
        RelatedEntityFieldName: spec.References ? 'ID' : null,
    }));
}

function makePermission(entityID: string, roleID: string): Record<string, unknown> {
    return {
        ID: `${entityID}-perm-${roleID}`,
        EntityID: entityID,
        RoleID: roleID,
        CanCreate: true,
        CanRead: true,
        CanUpdate: true,
        CanDelete: true,
    };
}

interface EntitySpec {
    ID: string;
    Name: string;
    BaseTable: string;
    ParentID?: string;
    AllowMultipleSubtypes?: boolean;
    /** False for the entities the limited role can't read. Default true. */
    LimitedRoleCanRead?: boolean;
    Fields: FieldSpec[];
}

function makeEntity(spec: EntitySpec): Record<string, unknown> {
    const permissions = [makePermission(spec.ID, ADMIN_ROLE_ID)];
    if (spec.LimitedRoleCanRead !== false) {
        permissions.push(makePermission(spec.ID, LIMITED_ROLE_ID));
    }
    return {
        ID: spec.ID,
        Name: spec.Name,
        BaseTable: spec.BaseTable,
        BaseView: `vw${spec.BaseTable}s`,
        SchemaName: 'dbo',
        VirtualEntity: false,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        IncludeInAPI: true,
        ParentID: spec.ParentID ?? null,
        AllowMultipleSubtypes: spec.AllowMultipleSubtypes ?? false,
        Status: 'Active',
        EntityFields: makeFields(spec.ID, spec.Name, spec.Fields),
        EntityPermissions: permissions,
        EntityRelationships: [],
        EntitySettings: [],
    };
}

const ENTITY_SPECS: EntitySpec[] = [
    {
        ID: PRODUCT_TYPES_ID, Name: 'Product Types', BaseTable: 'ProductType',
        Fields: [ID_FIELD, { Name: 'Name', Type: 'nvarchar', Length: 100 }, { Name: 'ProductExtensionEntity', Type: 'nvarchar', Length: 255 }],
    },
    {
        ID: PRODUCTS_ID, Name: 'Products', BaseTable: 'Product',
        Fields: [
            ID_FIELD,
            { Name: 'Name', Type: 'nvarchar', Length: 255 },
            { Name: 'ProductTypeID', Type: 'uniqueidentifier', References: { ID: PRODUCT_TYPES_ID, Name: 'Product Types' } },
        ],
    },
    {
        ID: MEETINGS_ID, Name: 'Meetings', BaseTable: 'Meeting', ParentID: PRODUCTS_ID, LimitedRoleCanRead: false,
        Fields: [ID_FIELD, { Name: 'Venue', Type: 'nvarchar', Length: 255 }],
    },
    {
        ID: PUBLICATIONS_ID, Name: 'Publications', BaseTable: 'Publication', ParentID: PRODUCTS_ID,
        Fields: [ID_FIELD, { Name: 'ISBN', Type: 'nvarchar', Length: 20 }],
    },
    {
        ID: COURSES_ID, Name: 'Courses', BaseTable: 'Course', ParentID: PRODUCTS_ID,
        Fields: [ID_FIELD, { Name: 'CreditHours', Type: 'int' }],
    },
    {
        ID: WEBINARS_ID, Name: 'Webinars', BaseTable: 'Webinar', ParentID: COURSES_ID,
        Fields: [ID_FIELD, { Name: 'PlatformURL', Type: 'nvarchar', Length: 500 }],
    },
    {
        ID: PARTIES_ID, Name: 'Parties', BaseTable: 'Party', AllowMultipleSubtypes: true,
        Fields: [ID_FIELD, { Name: 'Name', Type: 'nvarchar', Length: 255 }],
    },
    {
        ID: CUSTOMERS_ID, Name: 'Customers', BaseTable: 'Customer', ParentID: PARTIES_ID,
        Fields: [ID_FIELD, { Name: 'CreditLimit', Type: 'decimal' }],
    },
    {
        ID: VENDORS_ID, Name: 'Vendors', BaseTable: 'Vendor', ParentID: PARTIES_ID,
        Fields: [ID_FIELD, { Name: 'PaymentTerms', Type: 'nvarchar', Length: 50 }],
    },
];

/** Fresh EntityInfo objects for the whole fixture hierarchy. */
export function BuildLoadHintEntities(): EntityInfo[] {
    return ENTITY_SPECS.map(spec => new EntityInfo(makeEntity(spec)));
}

export function MakeLoadHintUser(roleID: string): UserInfo {
    return new UserInfo(null, {
        ID: `lh-user-${roleID}`,
        Name: `User ${roleID}`,
        Email: `${roleID}@example.com`,
        FirstName: 'Test',
        LastName: 'User',
        IsActive: true,
        UserRoles: [{ UserID: `lh-user-${roleID}`, RoleID: roleID, RoleName: roleID }],
    });
}

// ─── Entities, store and provider ──────────────────────────────────────────

/** A concrete entity class for every fixture entity. */
export class LoadHintTestEntity extends BaseEntity {
    /**
     * True while the record holds its row in raw mode, without built fields — the state
     * `BaseEngine` caches keep their rows in. Reads private state, as baseEntity.frozenRawRow.test.ts does.
     */
    public get RawModeActive(): boolean {
        const state = this as unknown as { _raw: unknown; _fieldsHydrated: boolean };
        return state._raw !== null && !state._fieldsHydrated;
    }
}

/** Rows keyed by entity name, then by lowercased ID. Each row holds only its own table's columns. */
export class InMemoryISAStore {
    private readonly tables = new Map<string, Map<string, Record<string, unknown>>>();
    private readonly hiddenFromLoads = new Set<string>();

    public Insert(entityName: string, row: Record<string, unknown>): void {
        const tableKey = entityName.toLowerCase();
        let table = this.tables.get(tableKey);
        if (!table) {
            table = new Map();
            this.tables.set(tableKey, table);
        }
        table.set(String(row['ID']).toLowerCase(), row);
    }

    /** Makes loads of this row come back empty, the way a row-level filter would, while probes still see it. */
    public HideFromLoads(entityName: string, id: string): void {
        this.hiddenFromLoads.add(`${entityName.toLowerCase()}|${id.toLowerCase()}`);
    }

    public HasRow(entityName: string, id: string): boolean {
        return this.tables.get(entityName.toLowerCase())?.has(id.toLowerCase()) ?? false;
    }

    /** The entity's view row: its own row joined to every ancestor's, or null when its own row is missing or hidden. */
    public ViewRow(entityInfo: EntityInfo, id: string): Record<string, unknown> | null {
        if (this.hiddenFromLoads.has(`${entityInfo.Name.toLowerCase()}|${id.toLowerCase()}`)) {
            return null;
        }
        const own = this.tables.get(entityInfo.Name.toLowerCase())?.get(id.toLowerCase());
        if (!own) {
            return null;
        }
        const row: Record<string, unknown> = {};
        for (const ancestor of [...entityInfo.ParentChain].reverse()) {
            Object.assign(row, this.tables.get(ancestor.Name.toLowerCase())?.get(id.toLowerCase()) ?? {});
        }
        return Object.assign(row, own);
    }
}

export type RoundTripKind = 'Load' | 'FindISAChildEntity' | 'FindISAChildEntities';

export interface RoundTrip {
    Kind: RoundTripKind;
    EntityName: string;
}

/**
 * The provider surface BaseEntity uses on the load path, backed by {@link InMemoryISAStore}.
 * Serves the metadata calls as well, the way ProviderBase does.
 */
export class LoadHintTestProvider {
    public readonly RoundTrips: RoundTrip[] = [];
    public readonly ProviderType = 'Database';
    private readonly loadFailures = new Map<string, { Remaining: number; Error: Error }>();
    private readonly discoveryFailures = new Map<string, Error>();

    constructor(
        public readonly Entities: EntityInfo[],
        public readonly Store: InMemoryISAStore,
        public readonly CurrentUser: UserInfo,
    ) {}

    public get AsEntityDataProvider(): IEntityDataProvider {
        return this as unknown as IEntityDataProvider;
    }

    public EntityByName(name: string): EntityInfo | undefined {
        return this.Entities.find(e => e.Name.trim().toLowerCase() === name.trim().toLowerCase());
    }

    public async GetEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T> {
        const info = this.EntityByName(entityName);
        if (!info) {
            throw new Error(`Entity ${entityName} not found in the load-hint fixture`);
        }
        const entity = new LoadHintTestEntity(info, this.AsEntityDataProvider);
        entity.ContextCurrentUser = contextUser ?? this.CurrentUser;
        await entity.InitializeParentEntity();
        entity.NewRecord();
        return entity as unknown as T;
    }

    public async Load(entity: BaseEntity, key: CompositeKey): Promise<Record<string, unknown> | null> {
        this.RoundTrips.push({ Kind: 'Load', EntityName: entity.EntityInfo.Name });
        const failure = this.loadFailures.get(entity.EntityInfo.Name.toLowerCase());
        if (failure && failure.Remaining > 0) {
            failure.Remaining--;
            throw failure.Error;
        }
        return this.Store.ViewRow(entity.EntityInfo, String(key.GetValueByIndex(0)));
    }

    public async FindISAChildEntity(entityInfo: EntityInfo, recordPKValue: string): Promise<{ ChildEntityName: string } | null> {
        this.RoundTrips.push({ Kind: 'FindISAChildEntity', EntityName: entityInfo.Name });
        const failure = this.discoveryFailures.get(entityInfo.Name.toLowerCase());
        if (failure) {
            throw failure;
        }
        const child = entityInfo.ChildEntities.find(c => this.Store.HasRow(c.Name, recordPKValue));
        return child ? { ChildEntityName: child.Name } : null;
    }

    /** Makes the next `times` row reads of `entityName` throw `error` (each still counts as a round trip). */
    public FailLoads(entityName: string, times: number, error: Error): void {
        this.loadFailures.set(entityName.toLowerCase(), { Remaining: times, Error: error });
    }

    /** Makes every `FindISAChildEntity` probe of `entityName` throw `error` (each still counts as a round trip). */
    public FailDiscovery(entityName: string, error: Error): void {
        this.discoveryFailures.set(entityName.toLowerCase(), error);
    }

    public async FindISAChildEntities(entityInfo: EntityInfo, recordPKValue: string): Promise<{ ChildEntityName: string }[]> {
        this.RoundTrips.push({ Kind: 'FindISAChildEntities', EntityName: entityInfo.Name });
        return entityInfo.ChildEntities
            .filter(c => this.Store.HasRow(c.Name, recordPKValue))
            .map(c => ({ ChildEntityName: c.Name }));
    }

    /** Round trips of one kind, optionally for one entity. */
    public Count(kind: RoundTripKind, entityName?: string): number {
        return this.RoundTrips.filter(r => r.Kind === kind && (!entityName || r.EntityName === entityName)).length;
    }

    public ResetRoundTrips(): void {
        this.RoundTrips.length = 0;
    }

    /** Loads a record the way `GetEntityObject(name, key)` does: a new object, then InnerLoad. */
    public async LoadRecord(entityName: string, id: string, contextUser?: UserInfo): Promise<BaseEntity> {
        const entity = await this.GetEntityObject<BaseEntity>(entityName, contextUser);
        const loaded = await entity.InnerLoad(CompositeKey.FromID(id));
        if (!loaded) {
            throw new Error(`No ${entityName} row ${id} in the load-hint fixture`);
        }
        return entity;
    }
}

/**
 * A loaded engine caching Product Types as entity objects, shaped the way BaseEngineRegistry
 * reads engines. A named class, because UnregisterEngine keys off `constructor.name`.
 */
export class FakeProductTypeEngine {
    public Loaded = true;
    public Configs = [{ Type: 'entity', EntityName: 'Product Types', PropertyName: 'ProductTypes' }];
    constructor(public ProductTypes: BaseEntity[]) {}
}
