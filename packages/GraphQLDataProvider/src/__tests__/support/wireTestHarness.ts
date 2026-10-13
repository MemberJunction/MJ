/**
 * Harness for driving the REAL GraphQLDataProvider against the fake GraphQL wire
 * (see ./graphQLWire.ts).
 *
 * Nothing from `@memberjunction/core` is mocked: the fixtures below are REAL
 * `EntityInfo` / `EntityFieldInfo` / `BaseEntity` instances built from plain init
 * data — the same construction path production metadata loading uses — so derived
 * behavior (CodeName generation, TSType/GraphQLType classification, ReadOnly rules,
 * primary-key detection, dirty tracking, GraphQL type names) is the real thing.
 *
 * The only test-specific wiring on the provider subclass is:
 *  - `EntityByName` reads from a per-instance fixture map instead of loaded metadata
 *    (the same technique MJCore's own providerBase suites use), and
 *  - `InitForWire` sets the private config/session/client state directly instead of
 *    running the full `Config()` metadata bootstrap (which would need a live server).
 * Every method under test — InternalRunView/InternalRunViews, Save, Delete,
 * ExecuteGQL, RefreshToken, RunViewsWithCacheCheck, and the ProviderBase RunView
 * orchestration — is the REAL implementation.
 */

import {
    BaseEntity,
    EntityInfo,
    RunViewParams,
    RunViewResult,
    UserInfo,
} from '@memberjunction/core';
import { ViewColumnInfo } from '@memberjunction/core-entities';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '../../graphQLDataProvider';

// ────────────────────────────────────────────────────────────────────────────
// Singleton hygiene
// ────────────────────────────────────────────────────────────────────────────

const GRAPHQL_PROVIDER_SINGLETON_KEY = '___SINGLETON__GraphQLDataProvider';

/**
 * Removes the GraphQLDataProvider singleton from the Global Object Store so each
 * test constructs a fresh provider (the constructor otherwise returns the stored one).
 */
export function ResetGraphQLProviderSingleton(): void {
    const store = GetGlobalObjectStore();
    if (store && store[GRAPHQL_PROVIDER_SINGLETON_KEY]) {
        delete store[GRAPHQL_PROVIDER_SINGLETON_KEY];
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Test provider subclass — exposes the REAL protected methods under test
// ────────────────────────────────────────────────────────────────────────────

export class WireTestGraphQLProvider extends GraphQLDataProvider {
    private testEntitiesByName = new Map<string, EntityInfo>();

    /** Registers a fixture EntityInfo so EntityByName can resolve it. */
    public RegisterTestEntity(entity: EntityInfo): void {
        this.testEntitiesByName.set(entity.Name.trim().toLowerCase(), entity);
    }

    /**
     * Test override: resolve entities from the fixture map instead of loaded metadata.
     * Mirrors the real lookup semantics (case-insensitive, trimmed).
     */
    public override EntityByName(entityName: string): EntityInfo | undefined {
        if (!entityName) {
            return undefined;
        }
        return this.testEntitiesByName.get(entityName.trim().toLowerCase());
    }

    /**
     * Sets config/session state and creates the wire client through the REAL
     * `CreateNewGraphQLClient` (so header construction is production code), without
     * running the full metadata bootstrap that `Config()` performs.
     */
    public InitForWire(config: GraphQLProviderConfigData, sessionId: string): void {
        this['_configData'] = config;
        this['_sessionId'] = sessionId;
        this['_client'] = this.CreateNewGraphQLClient(
            config.URL,
            config.Token,
            sessionId,
            config.MJAPIKey,
            config.UserAPIKey
        );
    }

    /** Public gateway to the REAL protected InternalRunView. */
    public CallInternalRunView<T>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>> {
        return this.InternalRunView<T>(params, contextUser);
    }

    /** Public gateway to the REAL protected InternalRunViews. */
    public CallInternalRunViews<T>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]> {
        return this.InternalRunViews<T>(params, contextUser);
    }
}

/**
 * Builds a fresh provider wired to the fake GraphQL client, registered as the
 * process singleton (matching how the provider runs in a real client app).
 */
export function CreateWireTestProvider(config?: GraphQLProviderConfigData, sessionId = 'test-session-1'): WireTestGraphQLProvider {
    ResetGraphQLProviderSingleton();
    const provider = new WireTestGraphQLProvider();
    provider.InitForWire(config ?? BuildTestConfig(), sessionId);
    return provider;
}

/** Standard test config with a refresh function that returns a fixed new token. */
export function BuildTestConfig(overrides?: {
    token?: string;
    url?: string;
    refreshedToken?: string;
    mjAPIKey?: string;
    userAPIKey?: string;
    onAuthenticationError?: (error: Error) => void;
}): GraphQLProviderConfigData {
    return new GraphQLProviderConfigData(
        overrides?.token ?? 'initial-jwt-token',
        overrides?.url ?? 'http://localhost:4000/graphql',
        'ws://localhost:4000/graphql',
        async () => overrides?.refreshedToken ?? 'refreshed-jwt-token',
        '__mj',
        undefined,
        undefined,
        overrides?.mjAPIKey,
        overrides?.userAPIKey,
        overrides?.onAuthenticationError
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Entity fixtures — REAL EntityInfo instances built from plain init data
// ────────────────────────────────────────────────────────────────────────────

export const CUSTOMER_ENTITY_ID = 'A1B2C3D4-0000-4000-8000-000000000001';
export const USER_VIEW_ENTITY_ID = 'A1B2C3D4-0000-4000-8000-000000000002';

interface TestFieldSpec {
    Name: string;
    Type: string;
    Length?: number;
    IsPrimaryKey?: boolean;
    AllowsNull?: boolean;
    AllowUpdateAPI?: boolean;
    DefaultValue?: string;
    Sequence: number;
    EntityID?: string;
}

function buildField(spec: TestFieldSpec): Record<string, unknown> {
    return {
        ID: `EF-${spec.EntityID ?? CUSTOMER_ENTITY_ID}-${spec.Sequence}`,
        EntityID: spec.EntityID ?? CUSTOMER_ENTITY_ID,
        Name: spec.Name,
        Type: spec.Type,
        Length: spec.Length ?? null,
        IsPrimaryKey: spec.IsPrimaryKey ?? false,
        AllowsNull: spec.AllowsNull ?? true,
        AllowUpdateAPI: spec.AllowUpdateAPI ?? false,
        DefaultValue: spec.DefaultValue ?? null,
        AutoIncrement: false,
        IsVirtual: false,
        Sequence: spec.Sequence,
        Status: 'Active',
    };
}

/**
 * "Customers" fixture in a custom `CRM` schema, so tests prove the schema-prefix
 * behavior of getGraphQLTypeNameBase (CRM + Customer → `CRMCustomer`).
 *
 * Field lineup exercises every branch the provider cares about:
 * - `ID`            uniqueidentifier PK   → ReadOnly, auto-included in field lists
 * - `Name`          nvarchar NOT NULL     → writable, no default (null → '' fallback)
 * - `First Name`    nvarchar NULL         → CodeName differs from Name (`First_Name`)
 * - `Tier`          nvarchar NOT NULL     → writable with DefaultValue 'Standard'
 * - `IsActive`      bit                   → boolean conversion path
 * - `Age`           int                   → number conversion path
 * - `SignedUpAt`    datetime              → Date → epoch-ms conversion path
 * - `Photo`         varbinary             → binary, excluded from dynamic field lists
 * - `__mj_CreatedAt`/`__mj_UpdatedAt`     → FieldMapper `__mj_` ↔ `_mj__` round-trip
 */
export function BuildCustomerEntityInfo(): EntityInfo {
    return new EntityInfo({
        ID: CUSTOMER_ENTITY_ID,
        Name: 'Customers',
        BaseTable: 'Customer',
        BaseView: 'vwCustomers',
        SchemaName: 'CRM',
        Status: 'Active',
        EntityFields: [
            buildField({ Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Sequence: 1 }),
            buildField({ Name: 'Name', Type: 'nvarchar', Length: 400, AllowsNull: false, AllowUpdateAPI: true, Sequence: 2 }),
            buildField({ Name: 'First Name', Type: 'nvarchar', Length: 200, AllowsNull: true, AllowUpdateAPI: true, Sequence: 3 }),
            buildField({ Name: 'Tier', Type: 'nvarchar', Length: 100, AllowsNull: false, AllowUpdateAPI: true, DefaultValue: 'Standard', Sequence: 4 }),
            buildField({ Name: 'IsActive', Type: 'bit', AllowsNull: false, AllowUpdateAPI: true, DefaultValue: '1', Sequence: 5 }),
            buildField({ Name: 'Age', Type: 'int', AllowsNull: true, AllowUpdateAPI: true, Sequence: 6 }),
            buildField({ Name: 'SignedUpAt', Type: 'datetime', AllowsNull: true, AllowUpdateAPI: true, Sequence: 7 }),
            buildField({ Name: 'Photo', Type: 'varbinary', AllowsNull: true, Sequence: 8 }),
            buildField({ Name: '__mj_CreatedAt', Type: 'datetimeoffset', AllowsNull: false, Sequence: 9 }),
            buildField({ Name: '__mj_UpdatedAt', Type: 'datetimeoffset', AllowsNull: false, Sequence: 10 }),
        ],
    });
}

/** Minimal "User Views"-shaped entity so saved-view fixtures are real BaseEntities. */
export function BuildUserViewEntityInfo(): EntityInfo {
    return new EntityInfo({
        ID: USER_VIEW_ENTITY_ID,
        Name: 'Test User Views',
        BaseTable: 'UserView',
        BaseView: 'vwUserViews',
        SchemaName: '__mj',
        Status: 'Active',
        EntityFields: [
            buildField({ Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, Sequence: 1, EntityID: USER_VIEW_ENTITY_ID }),
            buildField({ Name: 'Name', Type: 'nvarchar', Length: 200, AllowsNull: false, AllowUpdateAPI: true, Sequence: 2, EntityID: USER_VIEW_ENTITY_ID }),
            buildField({ Name: 'Entity', Type: 'nvarchar', Length: 200, AllowsNull: true, AllowUpdateAPI: true, Sequence: 3, EntityID: USER_VIEW_ENTITY_ID }),
            buildField({ Name: 'EntityID', Type: 'uniqueidentifier', AllowsNull: true, AllowUpdateAPI: true, Sequence: 4, EntityID: USER_VIEW_ENTITY_ID }),
        ],
    });
}

// ────────────────────────────────────────────────────────────────────────────
// Entity classes — REAL BaseEntity subclasses over the fixtures
// ────────────────────────────────────────────────────────────────────────────

/** Concrete BaseEntity for the Customers fixture (mirrors a generated entity class). */
export class TestCustomerEntity extends BaseEntity {}

/**
 * Saved-view fixture entity: a real BaseEntity that exposes the two members
 * `InternalRunView` reads off `RunViewParams.ViewEntity` — the target entity name
 * (`Entity`) and the view's column list (`Columns`) — the same shape
 * `MJUserViewEntityExtended` provides in production.
 */
export class TestUserViewEntity extends BaseEntity {
    private testColumns: ViewColumnInfo[] = [];

    public SetTestColumns(columns: ViewColumnInfo[]): void {
        this.testColumns = columns;
    }

    public get Columns(): ViewColumnInfo[] {
        return this.testColumns;
    }

    public get Entity(): string {
        return this.Get('Entity');
    }
}

/** Builds a loaded saved-view entity targeting the Customers fixture. */
export function BuildLoadedUserView(
    provider: WireTestGraphQLProvider,
    viewValues?: { ID?: string; Name?: string }
): TestUserViewEntity {
    const view = new TestUserViewEntity(BuildUserViewEntityInfo(), provider);
    view.LoadFromData({
        ID: viewValues?.ID ?? 'VIEW-0001',
        Name: viewValues?.Name ?? 'Active Customers',
        Entity: 'Customers',
        EntityID: CUSTOMER_ENTITY_ID,
    });
    return view;
}

/** A minimal context user for Save/Delete calls (the provider passes it through, unused on the wire). */
export function BuildTestUser(provider: WireTestGraphQLProvider): UserInfo {
    return new UserInfo(provider, {
        ID: 'USER-0001',
        Name: 'Test User',
        Email: 'test.user@example.com',
        UserRoles: [],
    });
}
