import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import {
    DeleteSQLResult,
    EntityInfo,
    EntityPermissionType,
    LocalCacheManager,
    Metadata,
    ProviderBase,
    RowLevelSecurityFilterInfo,
    SaveSQLResult,
    UserInfo,
} from '@memberjunction/core';

vi.mock('sql-formatter', () => ({
    format: (sql: string) => sql,
}));

/**
 * Dataset reads run as the caller (security finding C6).
 *
 * `GetDatasetByName` / `GetDatasetStatusByName` spliced a caller's `ItemFilters[].Filter` after
 * `WHERE` with no screen, ran every item as one batch (SQL Server joins them with `;`), and applied
 * neither the caller's entity read permission nor their row-level security, even when a context
 * user was supplied. These tests pin the provider half of the fix:
 *
 * - an ItemFilter carrying a stacked statement is refused and never reaches the database;
 * - with a context user, an item whose entity the user cannot read is refused;
 * - with a context user, the user's read row filter is applied to the item query, kept out of reach
 *   of any OR in the caller's filter, and keys the item's cache slot;
 * - MJ_Metadata stays loadable by every principal (it is the schema every client boots from).
 */
class ScopeTestProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    protected get UUIDFunctionPattern(): RegExp { return ScopeTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return ScopeTestProvider._defaultPattern; }

    public QuoteIdentifier(name: string): string { return `"${name}"`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `"${schema}"."${obj}"`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string {
        return `LIMIT ${maxRows} OFFSET ${startRow}`;
    }

    private seededEntities: EntityInfo[] = [];
    public SeedEntities(entities: EntityInfo[]): void { this.seededEntities = entities; }
    public override get Entities(): EntityInfo[] { return this.seededEntities; }
    public override EntityByName(name: string): EntityInfo | undefined {
        return this.seededEntities.find(e => e.Name.trim().toLowerCase() === name?.trim().toLowerCase());
    }

    /** Rows the dataset-definition read returns. */
    public DatasetItems: Record<string, unknown>[] = [];
    /** Every item statement that reached the database, in order. */
    public ItemStatements: string[] = [];

    override async ExecuteSQL<T>(): Promise<Array<T>> {
        return this.DatasetItems as unknown as Array<T>;
    }
    override async ExecuteSQLBatch(queries: string[]): Promise<Record<string, unknown>[][]> {
        this.ItemStatements.push(...queries);
        return queries.map(() => [{ ID: 'row-1', UpdateDate: '2026-02-01T00:00:00.000Z', TheRowCount: 1 }]);
    }

    private trustCache = false;
    public SetTrustLocalCache(trust: boolean): void { this.trustCache = trust; }
    override get TrustLocalCacheCompletely(): boolean { return this.trustCache; }
}

const THINGS_ENTITY_ID = 'E0000000-0000-0000-0000-000000000001';
const FULL_ROLE_ID = 'R0000000-0000-0000-0000-00000000000A';
const SCOPED_ROLE_ID = 'R0000000-0000-0000-0000-00000000000B';
const OTHER_ROLE_ID = 'R0000000-0000-0000-0000-00000000000C';
const OWN_ROWS_FILTER_ID = 'F0000000-0000-0000-0000-000000000001';

/** 'Things': full read for FULL_ROLE, read limited to the caller's own rows for SCOPED_ROLE. */
function thingsEntity(): EntityInfo {
    return new EntityInfo({
        ID: THINGS_ENTITY_ID, Name: 'Things', SchemaName: '__mj', BaseTable: 'Thing', BaseView: 'vwThings',
        Permissions: [
            { ID: 'p-full', EntityID: THINGS_ENTITY_ID, RoleID: FULL_ROLE_ID, CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false, ReadRLSFilterID: null, Type: 'Allow' },
            { ID: 'p-scoped', EntityID: THINGS_ENTITY_ID, RoleID: SCOPED_ROLE_ID, CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false, ReadRLSFilterID: OWN_ROWS_FILTER_ID, Type: 'Allow' },
        ],
        Fields: [],
    });
}

function user(id: string, roleIds: string[]): UserInfo {
    return new UserInfo(undefined, {
        ID: id, Name: id, Email: `${id}@example.com`, IsActive: true,
        UserRoles: roleIds.map(roleId => ({ UserID: id, RoleID: roleId, Role: `Role-${roleId}` })),
    });
}

function item(code: string, dataset = 'TestDataset', overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        DatasetID: 'ds-001', Dataset: dataset, Code: code, Entity: 'Things', EntityID: THINGS_ENTITY_ID,
        EntitySchemaName: '__mj', EntityBaseView: 'vwThings', WhereClause: null, DateFieldToCheck: '__mj_UpdatedAt',
        DatasetItemUpdatedAt: '2026-01-01T00:00:00.000Z', DatasetUpdatedAt: '2026-01-01T00:00:00.000Z', Columns: null,
        ...overrides,
    };
}

const ownRowsFilter = new RowLevelSecurityFilterInfo({
    ID: OWN_ROWS_FILTER_ID, Name: 'Own Things', FilterText: "OwnerID = '{{UserID}}'", Description: 'Own rows only',
});

let savedProvider: typeof Metadata.Provider;
beforeAll(() => {
    // Row-level-security filter objects resolve through the global provider's filter list.
    savedProvider = Metadata.Provider;
    Metadata.Provider = { Entities: [], RowLevelSecurityFilters: [ownRowsFilter] } as unknown as ProviderBase;
});
afterAll(() => {
    Metadata.Provider = savedProvider;
});

describe('dataset ItemFilters are screened before they reach SQL', () => {
    let provider: ScopeTestProvider;
    beforeEach(() => {
        provider = new ScopeTestProvider();
        provider.SeedEntities([thingsEntity()]);
        provider.DatasetItems = [item('Things')];
    });

    it('GetDatasetByName refuses a stacked-statement filter and never sends it to the database', async () => {
        const result = await provider.GetDatasetByName('TestDataset', [{ ItemCode: 'Things', Filter: '1=0; SELECT 1' }]);

        expect(provider.ItemStatements).toEqual([]);
        expect(result.Success).toBe(false);
        expect(result.Results[0].Success).toBe(false);
        expect(result.Status).toMatch(/Invalid ItemFilter/);
    });

    it('GetDatasetStatusByName refuses a stacked-statement filter and never sends it to the database', async () => {
        const result = await provider.GetDatasetStatusByName('TestDataset', [{ ItemCode: 'Things', Filter: '1=0; SELECT 1' }]);

        expect(provider.ItemStatements).toEqual([]);
        expect(result.Success).toBe(false);
        expect(result.Status).toMatch(/Invalid ItemFilter/);
    });

    it('still runs an ordinary filter', async () => {
        const result = await provider.GetDatasetByName('TestDataset', [{ ItemCode: 'Things', Filter: "Name = 'x'" }]);

        expect(result.Success).toBe(true);
        expect(provider.ItemStatements[0]).toContain(`WHERE Name = 'x'`);
    });
});

describe('a dataset read with a context user applies that user\'s read permission and row filter', () => {
    let provider: ScopeTestProvider;
    beforeEach(() => {
        provider = new ScopeTestProvider();
        provider.SeedEntities([thingsEntity()]);
        provider.DatasetItems = [item('Things')];
    });

    it('refuses an item whose entity the user cannot read, without querying it', async () => {
        const outsider = user('outsider', [OTHER_ROLE_ID]);

        const result = await provider.GetDatasetByName('TestDataset', undefined, outsider);

        expect(result.Success).toBe(false);
        expect(result.Results[0].Success).toBe(false);
        expect(result.Results[0].Results).toEqual([]);
        expect(result.Status).toMatch(/does not have read permissions on Things/);
        expect(provider.ItemStatements).toEqual([]);
    });

    it('reports status as failed for an item the user cannot read, without querying it', async () => {
        const outsider = user('outsider', [OTHER_ROLE_ID]);

        const result = await provider.GetDatasetStatusByName('TestDataset', undefined, outsider);

        expect(result.Success).toBe(false);
        expect(result.Status).toMatch(/does not have read permissions on Things/);
        expect(result.EntityUpdateDates).toEqual([]);
        expect(provider.ItemStatements).toEqual([]);
    });

    it('applies the user\'s read row filter to the item query', async () => {
        const scoped = user('scoped-user', [SCOPED_ROLE_ID]);
        const rowFilter = thingsEntity().GetEffectiveRowFilterWhereClause(scoped, EntityPermissionType.Read, '');
        expect(rowFilter).toContain(`OwnerID = 'scoped-user'`);

        const result = await provider.GetDatasetByName('TestDataset', undefined, scoped);

        expect(result.Success).toBe(true);
        expect(provider.ItemStatements[0]).toBe(`SELECT * FROM "__mj"."vwThings" WHERE ${rowFilter}`);
    });

    it('applies the same row filter to the status query, so status and data describe one row set', async () => {
        const scoped = user('scoped-user', [SCOPED_ROLE_ID]);
        const rowFilter = thingsEntity().GetEffectiveRowFilterWhereClause(scoped, EntityPermissionType.Read, '');

        const result = await provider.GetDatasetStatusByName('TestDataset', undefined, scoped);

        expect(result.Success).toBe(true);
        expect(provider.ItemStatements[0]).toMatch(new RegExp(`FROM "__mj"\\."vwThings" WHERE ${escapeRegExp(rowFilter)}$`));
    });

    it('keeps an OR in the caller\'s filter from widening the row filter', async () => {
        const scoped = user('scoped-user', [SCOPED_ROLE_ID]);
        const rowFilter = thingsEntity().GetEffectiveRowFilterWhereClause(scoped, EntityPermissionType.Read, '');

        // A fragment that closes one parenthesis passes a screen that parses it inside one level.
        await provider.GetDatasetByName('TestDataset', [{ ItemCode: 'Things', Filter: '1=1) OR (1=1' }], scoped);

        expect(provider.ItemStatements[0]).toBe(`SELECT * FROM "__mj"."vwThings" WHERE (${rowFilter}) AND ((1=1) OR (1=1))`);
    });

    it('adds nothing for a user whose role reads the entity unfiltered', async () => {
        const full = user('full-user', [FULL_ROLE_ID]);

        const result = await provider.GetDatasetByName('TestDataset', [{ ItemCode: 'Things', Filter: "Name = 'x'" }], full);

        expect(result.Success).toBe(true);
        expect(provider.ItemStatements[0]).toBe(`SELECT * FROM "__mj"."vwThings" WHERE Name = 'x'`);
    });
});

describe('dataset item cache slots are keyed by the caller\'s row filter', () => {
    afterEach(() => vi.restoreAllMocks());

    it('never serves one user\'s row-filtered slot to another user', async () => {
        const provider = new ScopeTestProvider();
        provider.SeedEntities([thingsEntity()]);
        provider.DatasetItems = [item('Things')];
        provider.SetTrustLocalCache(true);

        const slots = new Map<string, Record<string, unknown>[]>();
        vi.spyOn(LocalCacheManager.Instance, 'IsInitialized', 'get').mockReturnValue(true);
        vi.spyOn(LocalCacheManager.Instance, 'GetRunViewResult').mockImplementation(async (fingerprint: string) => {
            const rows = slots.get(fingerprint);
            return rows ? { results: rows, maxUpdatedAt: '2026-02-01T00:00:00.000Z', rowCount: rows.length } : null;
        });
        vi.spyOn(LocalCacheManager.Instance, 'SetRunViewResult').mockImplementation(async (fingerprint: string, _params, rows) => {
            slots.set(fingerprint, rows as Record<string, unknown>[]);
        });

        await provider.GetDatasetByName('TestDataset', undefined, user('user-a', [SCOPED_ROLE_ID]));
        await provider.GetDatasetByName('TestDataset', undefined, user('user-b', [SCOPED_ROLE_ID]));

        // Both users went to the database, each with their own row filter.
        expect(provider.ItemStatements).toHaveLength(2);
        expect(provider.ItemStatements[0]).toContain(`OwnerID = 'user-a'`);
        expect(provider.ItemStatements[1]).toContain(`OwnerID = 'user-b'`);
        expect(slots.size).toBe(2);
    });
});

describe('MJ_Metadata stays loadable by every authenticated principal', () => {
    it('does not apply per-user read checks to the metadata dataset', async () => {
        // Widget guests and anonymous magic-link sessions hold no read grant on the metadata
        // entities, yet every client boots from this dataset.
        const provider = new ScopeTestProvider();
        provider.SeedEntities([thingsEntity()]);
        provider.DatasetItems = [item('Things', 'MJ_Metadata')];

        const result = await provider.GetDatasetByName('MJ_Metadata', undefined, user('guest', [OTHER_ROLE_ID]));

        expect(result.Success).toBe(true);
        expect(provider.ItemStatements[0]).toBe(`SELECT * FROM "__mj"."vwThings" `);
    });

    it('still screens a filter sent for the metadata dataset', async () => {
        const provider = new ScopeTestProvider();
        provider.SeedEntities([thingsEntity()]);
        provider.DatasetItems = [item('Things', 'MJ_Metadata')];

        const result = await provider.GetDatasetByName('MJ_Metadata', [{ ItemCode: 'Things', Filter: '1=0; SELECT 1' }], user('guest', [OTHER_ROLE_ID]));

        expect(provider.ItemStatements).toEqual([]);
        expect(result.Success).toBe(false);
    });
});

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
