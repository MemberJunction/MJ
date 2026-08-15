import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { EntityInfo, Metadata } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { SQLServerDialect } from '@memberjunction/sql-dialect';
import type { SQLDialect } from '@memberjunction/sql-dialect';
import { SQLServerCodeGenProvider } from '../SQLServerCodeGenProvider';
import { SQLCodeGenBase } from '../../../sql_codegen';
import type { CodeGenConnection, CodeGenQueryResult, CodeGenTransaction } from '../../../codeGenDatabaseProvider';

/**
 * Golden-master suite for BASE VIEW EMISSION through the full orchestrator path —
 * SQLCodeGenBase.generateBaseViewPieces / generateBaseView driving the real
 * SQLServerCodeGenProvider. Every shape asserts the EXACT emitted text, including
 * column ordering, because this text is both what lands in migrations and what the
 * regeneration decision (BaseViewRegenDecision.test.ts) compares against the
 * database. An accidental reorder or reformat here churns every entity's view on
 * the next CodeGen run.
 *
 * The FK display-field shapes are the c31d487cb bug class made visible: the
 * related-entity NameField joins are exactly what a fully-custom base view stops
 * receiving when it opts out of generation — so their emission for GENERATED views
 * is pinned character-for-character.
 *
 * The orchestrator resolves related-entity NameFields through the global Metadata
 * provider, so a minimal provider stub (Entities + EntityByName) is installed for
 * the duration of this file.
 */

// ─── Minimal metadata provider stub ──────────────────────────────────────────

type MetadataProviderStub = Pick<IMetadataProvider, 'Entities' | 'EntityByName'>;

function buildProviderStub(entities: EntityInfo[]): MetadataProviderStub {
    return {
        Entities: entities,
        EntityByName: (entityName: string): EntityInfo | undefined =>
            entities.find((e) => e.Name.trim().toLowerCase() === entityName.trim().toLowerCase()),
    };
}

// ─── Recording mock connection ───────────────────────────────────────────────

class RecordingConnection implements CodeGenConnection {
    public readonly Queries: string[] = [];

    public get Dialect(): SQLDialect {
        return new SQLServerDialect();
    }
    public async query(sql: string): Promise<CodeGenQueryResult> {
        this.Queries.push(sql);
        return { recordset: [] };
    }
    public async queryWithParams(): Promise<CodeGenQueryResult> {
        throw new Error('RecordingConnection: queryWithParams() must not be called by view emission');
    }
    public async executeStoredProcedure(): Promise<CodeGenQueryResult> {
        throw new Error('RecordingConnection: executeStoredProcedure() must not be called by view emission');
    }
    public async beginTransaction(): Promise<CodeGenTransaction> {
        throw new Error('RecordingConnection: beginTransaction() must not be called by view emission');
    }
}

// ─── Entity fixtures ─────────────────────────────────────────────────────────

const ORDERS_ID = 'ORDERS-ENTITY-0001';
const CUSTOMERS_ID = 'CUSTOMERS-ENTITY-0002';
const STATUSES_ID = 'STATUSES-ENTITY-0003';
const CATEGORIES_ID = 'CATEGORIES-ENTITY-0004';

function pk(entityID: string): Record<string, unknown> {
    return {
        ID: `pk-${entityID}`,
        EntityID: entityID,
        Name: 'ID',
        Type: 'uniqueidentifier',
        Length: 16,
        IsPrimaryKey: true,
        AllowsNull: false,
        AllowUpdateAPI: true,
        IsVirtual: false,
        AutoIncrement: false,
        DefaultValue: 'newsequentialid()',
    };
}

function nameField(entityID: string, over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ID: `name-${entityID}`,
        EntityID: entityID,
        Name: 'Name',
        Type: 'nvarchar',
        Length: 510,
        IsPrimaryKey: false,
        AllowsNull: false,
        AllowUpdateAPI: true,
        IsVirtual: false,
        AutoIncrement: false,
        DefaultValue: '',
        IsNameField: true,
        ...over,
    };
}

/** FK field with everything the display-join path reads, fully resolved (no bootstrap lookup needed). */
function customerFK(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ID: 'fk-customer',
        EntityID: ORDERS_ID,
        Name: 'CustomerID',
        Type: 'uniqueidentifier',
        Length: 16,
        IsPrimaryKey: false,
        AllowsNull: false, // NOT NULL → INNER JOIN
        AllowUpdateAPI: true,
        IsVirtual: false,
        AutoIncrement: false,
        DefaultValue: '',
        RelatedEntityID: CUSTOMERS_ID,
        RelatedEntityFieldName: 'ID',
        IncludeRelatedEntityNameFieldInBaseView: true,
        RelatedEntity: 'Customers',
        RelatedEntityClassName: 'Customer',
        RelatedEntityCodeName: 'Customer',
        RelatedEntitySchemaName: 'sales',
        RelatedEntityBaseTable: 'Customer',
        RelatedEntityBaseView: 'vwCustomers',
        RelatedEntityNameFieldMap: 'Customer', // pre-known → no metadata write-back
        ...over,
    };
}

function statusFK(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ID: 'fk-status',
        EntityID: ORDERS_ID,
        Name: 'StatusID',
        Type: 'uniqueidentifier',
        Length: 16,
        IsPrimaryKey: false,
        AllowsNull: true, // nullable → LEFT OUTER JOIN
        AllowUpdateAPI: true,
        IsVirtual: false,
        AutoIncrement: false,
        DefaultValue: '',
        RelatedEntityID: STATUSES_ID,
        RelatedEntityFieldName: 'ID',
        IncludeRelatedEntityNameFieldInBaseView: true,
        RelatedEntity: 'Order Statuses',
        RelatedEntityClassName: 'OrderStatus',
        RelatedEntityCodeName: 'OrderStatus',
        RelatedEntitySchemaName: 'sales',
        RelatedEntityBaseTable: 'OrderStatus',
        RelatedEntityBaseView: 'vwOrderStatuses',
        RelatedEntityNameFieldMap: 'Status',
        ...over,
    };
}

function ordersEntity(over: Record<string, unknown> = {}, fields?: Record<string, unknown>[]): EntityInfo {
    return new EntityInfo({
        ID: ORDERS_ID,
        Name: 'Orders',
        SchemaName: 'sales',
        BaseTable: 'Order',
        BaseTableCodeName: 'Order',
        BaseView: 'vwOrders',
        BaseViewGenerated: true,
        DeleteType: 'Hard',
        EntityFields: fields ?? [pk(ORDERS_ID), customerFK(), statusFK()],
        EntityPermissions: [{ RoleSQLName: 'cdp_UI' }],
        ...over,
    });
}

function customersEntity(nameFieldOver: Record<string, unknown> = {}): EntityInfo {
    return new EntityInfo({
        ID: CUSTOMERS_ID,
        Name: 'Customers',
        SchemaName: 'sales',
        BaseTable: 'Customer',
        BaseTableCodeName: 'Customer',
        BaseView: 'vwCustomers',
        BaseViewGenerated: true,
        DeleteType: 'Hard',
        EntityFields: [pk(CUSTOMERS_ID), nameField(CUSTOMERS_ID, nameFieldOver)],
        EntityPermissions: [],
    });
}

function statusesEntity(nameFieldOver: Record<string, unknown> = {}): EntityInfo {
    return new EntityInfo({
        ID: STATUSES_ID,
        Name: 'Order Statuses',
        SchemaName: 'sales',
        BaseTable: 'OrderStatus',
        BaseTableCodeName: 'OrderStatus',
        BaseView: 'vwOrderStatuses',
        BaseViewGenerated: true,
        DeleteType: 'Hard',
        EntityFields: [pk(STATUSES_ID), nameField(STATUSES_ID, nameFieldOver)],
        EntityPermissions: [],
    });
}

// ─── Harness ─────────────────────────────────────────────────────────────────

let generator: SQLCodeGenBase;
let pool: RecordingConnection;
let originalProvider: IMetadataProvider;

function installMetadata(entities: EntityInfo[]): void {
    Metadata.Provider = buildProviderStub(entities) as IMetadataProvider;
}

beforeAll(() => {
    originalProvider = Metadata.Provider;
});

afterAll(() => {
    Metadata.Provider = originalProvider;
});

beforeEach(() => {
    generator = new SQLCodeGenBase();
    generator.DBProvider = new SQLServerCodeGenProvider();
    pool = new RecordingConnection();
    installMetadata([]);
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('base view emission — plain entity', () => {
    it('GM-VIEW-01: plain entity emits the exact canonical view (header, guard, SELECT alias.*, GO)', async () => {
        const products = new EntityInfo({
            ID: 'PRODUCTS-ENTITY-0005',
            Name: 'Products',
            SchemaName: 'sales',
            BaseTable: 'Product',
            BaseTableCodeName: 'Product',
            BaseView: 'vwProducts',
            BaseViewGenerated: true,
            DeleteType: 'Hard',
            EntityFields: [pk('PRODUCTS-ENTITY-0005'), nameField('PRODUCTS-ENTITY-0005')],
            EntityPermissions: [],
        });

        const { viewSQL, viewPermSQL } = await generator.generateBaseViewPieces(pool, products);

        expect(viewSQL).toBe(`
------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Products
-----               SCHEMA:      sales
-----               BASE TABLE:  Product
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[sales].[vwProducts]', 'V') IS NOT NULL
    DROP VIEW [sales].[vwProducts];
GO

CREATE VIEW [sales].[vwProducts]
AS
SELECT
    p.*
FROM
    [sales].[Product] AS p
GO`);
        expect(viewPermSQL).toBe(''); // no roles → no GRANT, not even a newline
        expect(pool.Queries.length).toBe(0); // emission is pure — no DB access
    });

    it('GM-VIEW-02: soft-delete entity appends the exact WHERE __mj_DeletedAt IS NULL clause', async () => {
        const products = new EntityInfo({
            ID: 'PRODUCTS-ENTITY-0005',
            Name: 'Products',
            SchemaName: 'sales',
            BaseTable: 'Product',
            BaseTableCodeName: 'Product',
            BaseView: 'vwProducts',
            BaseViewGenerated: true,
            DeleteType: 'Soft',
            EntityFields: [pk('PRODUCTS-ENTITY-0005')],
            EntityPermissions: [],
        });

        const { viewSQL } = await generator.generateBaseViewPieces(pool, products);

        expect(viewSQL.endsWith(`FROM
    [sales].[Product] AS p
WHERE
    p.[__mj_DeletedAt] IS NULL
GO`)).toBe(true);
    });
});

describe('base view emission — related-entity display fields (the c31d487cb bug class, generated-view side)', () => {
    it('GM-VIEW-03: FKs emit display aliases + joins in exact field order; nullability picks INNER vs LEFT OUTER', async () => {
        installMetadata([ordersEntity(), customersEntity(), statusesEntity()]);

        const full = await generator.generateBaseView(pool, ordersEntity());

        expect(full).toBe(`
------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Orders
-----               SCHEMA:      sales
-----               BASE TABLE:  Order
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[sales].[vwOrders]', 'V') IS NOT NULL
    DROP VIEW [sales].[vwOrders];
GO

CREATE VIEW [sales].[vwOrders]
AS
SELECT
    o.*,
    Customer_CustomerID.[Name] AS [Customer],
    OrderStatus_StatusID.[Name] AS [Status]
FROM
    [sales].[Order] AS o
INNER JOIN
    [sales].[Customer] AS Customer_CustomerID
  ON
    [o].[CustomerID] = Customer_CustomerID.[ID]
LEFT OUTER JOIN
    [sales].[OrderStatus] AS OrderStatus_StatusID
  ON
    [o].[StatusID] = OrderStatus_StatusID.[ID]
GO
GRANT SELECT ON [sales].[vwOrders] TO [cdp_UI]`);
        expect(pool.Queries.length).toBe(0); // maps pre-known → zero metadata writes
    });

    it('GM-VIEW-04: reversing entity field order reverses BOTH the alias order and the join order', async () => {
        const reordered = ordersEntity({}, [pk(ORDERS_ID), statusFK(), customerFK()]);
        installMetadata([reordered, customersEntity(), statusesEntity()]);

        const { viewSQL } = await generator.generateBaseViewPieces(pool, reordered);

        expect(viewSQL).toContain(`SELECT
    o.*,
    OrderStatus_StatusID.[Name] AS [Status],
    Customer_CustomerID.[Name] AS [Customer]
FROM
    [sales].[Order] AS o
LEFT OUTER JOIN
    [sales].[OrderStatus] AS OrderStatus_StatusID
  ON
    [o].[StatusID] = OrderStatus_StatusID.[ID]
INNER JOIN
    [sales].[Customer] AS Customer_CustomerID
  ON
    [o].[CustomerID] = Customer_CustomerID.[ID]
GO`);
    });

    it('GM-VIEW-05: display alias colliding with a real base-table column gets the _Virtual suffix', async () => {
        const collidingCustomerColumn: Record<string, unknown> = {
            ID: 'f-customer-text',
            EntityID: ORDERS_ID,
            Name: 'Customer', // physical column already named what stripID(CustomerID) yields
            Type: 'nvarchar',
            Length: 200,
            IsPrimaryKey: false,
            AllowsNull: true,
            AllowUpdateAPI: true,
            IsVirtual: false,
            AutoIncrement: false,
            DefaultValue: '',
        };
        const entity = ordersEntity({}, [
            pk(ORDERS_ID),
            collidingCustomerColumn,
            customerFK({ RelatedEntityNameFieldMap: 'Customer_Virtual' }),
        ]);
        installMetadata([entity, customersEntity()]);

        const { viewSQL } = await generator.generateBaseViewPieces(pool, entity);

        expect(viewSQL).toContain('Customer_CustomerID.[Name] AS [Customer_Virtual]');
        expect(viewSQL).not.toContain('AS [Customer],');
    });

    it('GM-VIEW-06: an FK whose RelatedEntityNameFieldMap is not yet in the DB triggers the metadata write-back', async () => {
        const entity = ordersEntity({}, [pk(ORDERS_ID), customerFK({ RelatedEntityNameFieldMap: null })]);
        installMetadata([entity, customersEntity()]);

        const { viewSQL } = await generator.generateBaseViewPieces(pool, entity);

        // The view still gets the display field...
        expect(viewSQL).toContain('Customer_CustomerID.[Name] AS [Customer]');
        // ...and CodeGen persists the computed map so the runtime metadata matches the view
        expect(pool.Queries.length).toBe(1);
        expect(pool.Queries[0]).toContain('spUpdateEntityFieldRelatedEntityNameFieldMap');
        expect(pool.Queries[0]).toContain("'fk-customer'");
        expect(pool.Queries[0]).toContain("'Customer'");
    });

    it('GM-VIEW-07: a view-only (virtual, non-computed) related NameField makes the join target the related BASE VIEW', async () => {
        const entity = ordersEntity({}, [pk(ORDERS_ID), statusFK()]);
        installMetadata([entity, statusesEntity({ IsVirtual: true, IsComputed: false })]);

        const { viewSQL } = await generator.generateBaseViewPieces(pool, entity);

        expect(viewSQL).toContain(`LEFT OUTER JOIN
    [sales].[vwOrderStatuses] AS OrderStatus_StatusID
  ON
    [o].[StatusID] = OrderStatus_StatusID.[ID]`);
        expect(viewSQL).not.toContain('[sales].[OrderStatus] AS OrderStatus_StatusID');
    });

    it('GM-VIEW-08: an FK named exactly `ID` (shared-PK inheritance) emits NO display join — stripID() yields nothing to alias', async () => {
        const inheritancePK = {
            ...pk(ORDERS_ID),
            RelatedEntityID: CUSTOMERS_ID,
            RelatedEntityFieldName: 'ID',
            IncludeRelatedEntityNameFieldInBaseView: true,
            RelatedEntity: 'Customers',
            RelatedEntityClassName: 'Customer',
            RelatedEntityCodeName: 'Customer',
            RelatedEntitySchemaName: 'sales',
            RelatedEntityBaseTable: 'Customer',
            RelatedEntityBaseView: 'vwCustomers',
        };
        const entity = ordersEntity({}, [inheritancePK]);
        installMetadata([entity, customersEntity()]);

        const { viewSQL } = await generator.generateBaseViewPieces(pool, entity);

        expect(viewSQL).toContain(`SELECT
    o.*
FROM
    [sales].[Order] AS o
GO`);
        expect(viewSQL).not.toContain('JOIN');
    });

    it('GM-VIEW-09: self-FK with a view-only NameField is SKIPPED on SQL Server, but its root-ID TVF machinery still emits', async () => {
        // A self-join back to the view being created cannot compile, so the display
        // column is dropped (dialect capability canSelfJoinViewForVirtualNameField()
        // = false). The recursive-FK root-ID plumbing is independent and must stay.
        const categories = new EntityInfo({
            ID: CATEGORIES_ID,
            Name: 'Categories',
            SchemaName: 'sales',
            BaseTable: 'Category',
            BaseTableCodeName: 'Category',
            BaseView: 'vwCategories',
            BaseViewGenerated: true,
            DeleteType: 'Hard',
            EntityFields: [
                pk(CATEGORIES_ID),
                nameField(CATEGORIES_ID, { IsVirtual: true }), // view-only name
                {
                    ID: 'fk-parent',
                    EntityID: CATEGORIES_ID,
                    Name: 'ParentID',
                    Type: 'uniqueidentifier',
                    Length: 16,
                    IsPrimaryKey: false,
                    AllowsNull: true,
                    AllowUpdateAPI: true,
                    IsVirtual: false,
                    AutoIncrement: false,
                    DefaultValue: '',
                    RelatedEntityID: CATEGORIES_ID, // self-FK
                    RelatedEntityFieldName: 'ID',
                    IncludeRelatedEntityNameFieldInBaseView: true,
                    RelatedEntity: 'Categories',
                    RelatedEntityClassName: 'Category',
                    RelatedEntityCodeName: 'Category',
                    RelatedEntitySchemaName: 'sales',
                    RelatedEntityBaseTable: 'Category',
                    RelatedEntityBaseView: 'vwCategories',
                    RelatedEntityNameFieldMap: 'Parent',
                },
            ],
            EntityPermissions: [],
        });
        installMetadata([categories]);

        const { viewSQL } = await generator.generateBaseViewPieces(pool, categories);

        // No display join for the self-FK...
        expect(viewSQL).not.toContain('AS [Parent]');
        expect(viewSQL).not.toContain('Category_ParentID');
        // ...but the recursive root-ID column + OUTER APPLY are present, exactly:
        expect(viewSQL).toContain(`SELECT
    c.*,
    root_ParentID.RootID AS [RootParentID]
FROM
    [sales].[Category] AS c
OUTER APPLY
    [sales].[fnCategoryParentID_GetRootID]([c].[ID], [c].[ParentID]) AS root_ParentID
GO`);
    });
});

describe('base view emission — geo virtual columns', () => {
    function sitesEntity(fields: Record<string, unknown>[]): EntityInfo {
        return new EntityInfo({
            ID: 'SITES-ENTITY-0006',
            Name: 'Sites',
            SchemaName: 'sales',
            BaseTable: 'Site',
            BaseTableCodeName: 'Site',
            BaseView: 'vwSites',
            BaseViewGenerated: true,
            DeleteType: 'Hard',
            SupportsGeoCoding: true,
            EntityFields: fields,
            EntityPermissions: [],
        });
    }

    it('GM-VIEW-10: geo entity without native lat/lng joins vwRecordGeoCodes and aliases __mj_Latitude/__mj_Longitude', async () => {
        // NOTE (cosmetic quirk, pinned as current behavior): when an entity has geo
        // columns but NO FK display fields, the geo select block is the first entry
        // in relatedFieldsSelect and carries no leading newline — so the first geo
        // alias lands on the SAME line as `s.*,`. Valid SQL, odd formatting. With FK
        // display fields present the block is appended after ',\n' and aligns
        // normally. A formatting fix here would change every geo entity's stored
        // view text and force a one-time regeneration wave — hence pinned, not fixed.
        const entity = sitesEntity([pk('SITES-ENTITY-0006')]);
        const { viewSQL } = await generator.generateBaseViewPieces(pool, entity);

        expect(viewSQL).toContain(`SELECT
    s.*,    __mj_rgc.[Latitude] AS [__mj_Latitude],
    __mj_rgc.[Longitude] AS [__mj_Longitude]
FROM
    [sales].[Site] AS s
LEFT OUTER JOIN
    [__mj].[vwRecordGeoCodes] AS __mj_rgc
  ON
    __mj_rgc.[EntityID] = 'SITES-ENTITY-0006'
    AND __mj_rgc.[RecordID] = CAST([s].[ID] AS NVARCHAR(450))
    AND __mj_rgc.[LocationType] = 'Primary'
GO`);
    });

    it('GM-VIEW-10b: with FK display fields present, the geo block is appended after ",\\n" and aligns on its own lines', async () => {
        const entity = new EntityInfo({
            ID: 'SITES-ENTITY-0006',
            Name: 'Sites',
            SchemaName: 'sales',
            BaseTable: 'Site',
            BaseTableCodeName: 'Site',
            BaseView: 'vwSites',
            BaseViewGenerated: true,
            DeleteType: 'Hard',
            SupportsGeoCoding: true,
            EntityFields: [pk('SITES-ENTITY-0006'), customerFK({ EntityID: 'SITES-ENTITY-0006' })],
            EntityPermissions: [],
        });
        installMetadata([entity, customersEntity()]);

        const { viewSQL } = await generator.generateBaseViewPieces(pool, entity);

        expect(viewSQL).toContain(`SELECT
    s.*,
    Customer_CustomerID.[Name] AS [Customer],
    __mj_rgc.[Latitude] AS [__mj_Latitude],
    __mj_rgc.[Longitude] AS [__mj_Longitude]
FROM`);
    });

    it('GM-VIEW-11: geo entity WITH native lat/lng aliases the physical columns directly — no RecordGeoCodes join', async () => {
        const entity = sitesEntity([
            pk('SITES-ENTITY-0006'),
            {
                ID: 'f-lat', EntityID: 'SITES-ENTITY-0006', Name: 'Lat', Type: 'decimal', Length: 9,
                IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false,
                AutoIncrement: false, DefaultValue: '', ExtendedType: 'GeoLatitude',
            },
            {
                ID: 'f-lng', EntityID: 'SITES-ENTITY-0006', Name: 'Lng', Type: 'decimal', Length: 9,
                IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false,
                AutoIncrement: false, DefaultValue: '', ExtendedType: 'GeoLongitude',
            },
        ]);
        const { viewSQL } = await generator.generateBaseViewPieces(pool, entity);

        // Same first-line quirk as GM-VIEW-10: no FK display fields → the first geo
        // alias shares the `s.*,` line. Pinned as current behavior.
        expect(viewSQL).toContain(`SELECT
    s.*,    [s].[Lat] AS [__mj_Latitude],
    [s].[Lng] AS [__mj_Longitude]
FROM
    [sales].[Site] AS s
GO`);
        expect(viewSQL).not.toContain('vwRecordGeoCodes');
    });
});

describe('base view emission — GRANT permissions attached to the view', () => {
    it('GM-VIEW-12: multiple roles collapse into ONE GRANT statement, in permission order', async () => {
        const entity = ordersEntity({
            EntityPermissions: [{ RoleSQLName: 'cdp_UI' }, { RoleSQLName: 'cdp_Developer' }],
        }, [pk(ORDERS_ID)]);
        installMetadata([entity]);

        const { viewPermSQL } = await generator.generateBaseViewPieces(pool, entity);

        expect(viewPermSQL).toBe('\nGRANT SELECT ON [sales].[vwOrders] TO [cdp_UI], [cdp_Developer]');
    });

    it('GM-VIEW-13: a permission row without a RoleSQLName is skipped entirely', async () => {
        const entity = ordersEntity({
            EntityPermissions: [{ RoleSQLName: '' }, { RoleSQLName: 'cdp_UI' }],
        }, [pk(ORDERS_ID)]);
        installMetadata([entity]);

        const { viewPermSQL } = await generator.generateBaseViewPieces(pool, entity);

        expect(viewPermSQL).toBe('\nGRANT SELECT ON [sales].[vwOrders] TO [cdp_UI]');
    });

    it('GM-VIEW-14: generateBaseView concatenates DDL + GRANT so the GRANT sits after the GO batch separator', async () => {
        const entity = ordersEntity({}, [pk(ORDERS_ID)]);
        installMetadata([entity]);

        const full = await generator.generateBaseView(pool, entity);

        expect(full.endsWith('GO\nGRANT SELECT ON [sales].[vwOrders] TO [cdp_UI]')).toBe(true);
        expect(full).not.toContain('GOGRANT');
    });
});
