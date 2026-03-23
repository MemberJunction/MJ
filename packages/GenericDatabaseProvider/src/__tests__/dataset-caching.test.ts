import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GenericDatabaseProvider } from '../GenericDatabaseProvider';
import {
    DatabaseProviderBase,
    SaveSQLResult,
    DeleteSQLResult,
    EntityInfo,
    EntityFieldInfo,
    UserInfo,
    BaseEntity,
    LocalCacheManager,
    RunViewParams,
} from '@memberjunction/core';

// Mock sql-formatter (used by SqlLoggingSessionImpl)
vi.mock('sql-formatter', () => ({
    format: (sql: string) => sql,
}));

/**
 * Concrete test subclass with mocked SQL execution for dataset caching tests.
 */
class TestProvider extends GenericDatabaseProvider {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    protected get UUIDFunctionPattern(): RegExp { return TestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return TestProvider._defaultPattern; }

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
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}

    // Track SQL calls
    public executeSQLCalls: Array<{ sql: string; params?: unknown[] }> = [];
    private executeSQLResults: Array<Record<string, unknown>[]> = [];
    private executeSQLCallIndex = 0;

    /**
     * Queue up results that will be returned by successive ExecuteSQL calls.
     */
    public setExecuteSQLResults(results: Array<Record<string, unknown>[]>): void {
        this.executeSQLResults = results;
        this.executeSQLCallIndex = 0;
    }

    override async ExecuteSQL<T>(sql?: string, params?: unknown[]): Promise<Array<T>> {
        this.executeSQLCalls.push({ sql: sql ?? '', params });
        const result = this.executeSQLResults[this.executeSQLCallIndex] ?? [];
        this.executeSQLCallIndex++;
        return result as unknown as Array<T>;
    }

    public resetState(): void {
        this.executeSQLCalls = [];
        this.executeSQLResults = [];
        this.executeSQLCallIndex = 0;
    }

    // Override TrustLocalCacheCompletely for testing
    private _trustCache = false;
    public setTrustLocalCache(trust: boolean): void { this._trustCache = trust; }
    override get TrustLocalCacheCompletely(): boolean { return this._trustCache; }
}

const mockUser: UserInfo = {
    ID: 'test-user-id',
    Name: 'Test User',
    Email: 'test@test.com',
} as UserInfo;

/**
 * Builds a mock dataset item metadata row as returned by the dataset items SQL query.
 */
function buildDatasetItemRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        DatasetID: 'ds-001',
        Code: 'Entities',
        Entity: 'MJ: Entities',
        EntityID: 'ent-001',
        EntitySchemaName: '__mj',
        EntityBaseView: 'vwEntities',
        WhereClause: null,
        DateFieldToCheck: '__mj_UpdatedAt',
        DatasetItemUpdatedAt: '2026-01-01T00:00:00.000Z',
        DatasetUpdatedAt: '2026-01-01T00:00:00.000Z',
        Columns: null,
        ...overrides,
    };
}

describe('Dataset Caching in GetDatasetByName', () => {
    let provider: TestProvider;
    let cacheGetSpy: ReturnType<typeof vi.spyOn>;
    let cacheSetSpy: ReturnType<typeof vi.spyOn>;
    let cacheFingerprintSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        provider = new TestProvider();

        // Mock LocalCacheManager.Instance
        cacheGetSpy = vi.spyOn(LocalCacheManager.Instance, 'GetRunViewResult');
        cacheSetSpy = vi.spyOn(LocalCacheManager.Instance, 'SetRunViewResult').mockResolvedValue(undefined);
        cacheFingerprintSpy = vi.spyOn(LocalCacheManager.Instance, 'GenerateRunViewFingerprint')
            .mockImplementation((params: RunViewParams) => {
                const entity = params.EntityName?.trim() || 'Unknown';
                const filter = (typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '').trim();
                return `${entity}|${filter || '_'}|_|-1|0|_`;
            });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('falls back to SQL when cache is not available (TrustLocalCacheCompletely = false)', async () => {
        provider.setTrustLocalCache(false);

        // First call returns dataset item metadata, second returns entity data
        const itemRow = buildDatasetItemRow();
        const entityData = [{ ID: '1', Name: 'TestEntity', __mj_UpdatedAt: '2026-03-01T00:00:00.000Z' }];
        provider.setExecuteSQLResults([
            [itemRow],     // Dataset metadata query
            entityData,    // Batch query for the item
        ]);

        const result = await provider.GetDatasetByName('MJ_Metadata', undefined, mockUser);

        expect(result.Success).toBe(true);
        expect(result.Results).toHaveLength(1);
        expect(result.Results[0].Code).toBe('Entities');
        expect(result.Results[0].Results).toEqual(entityData);
        // Should NOT have checked cache
        expect(cacheGetSpy).not.toHaveBeenCalled();
        // Should have made 2 SQL calls (metadata + batch)
        expect(provider.executeSQLCalls).toHaveLength(2);
    });

    it('uses cached data and skips SQL when cache hit occurs', async () => {
        provider.setTrustLocalCache(true);
        vi.spyOn(LocalCacheManager.Instance, 'IsInitialized', 'get').mockReturnValue(true);

        const cachedRows = [
            { ID: '1', Name: 'Entity1', __mj_UpdatedAt: '2026-03-01T00:00:00.000Z' },
            { ID: '2', Name: 'Entity2', __mj_UpdatedAt: '2026-03-02T00:00:00.000Z' },
        ];
        cacheGetSpy.mockResolvedValue({
            results: cachedRows,
            maxUpdatedAt: '2026-03-02T00:00:00.000Z',
            rowCount: 2,
        });

        const itemRow = buildDatasetItemRow();
        provider.setExecuteSQLResults([
            [itemRow],     // Dataset metadata query (still needed to know what items exist)
            // NO second result needed — cache hit means no SQL batch
        ]);

        const result = await provider.GetDatasetByName('MJ_Metadata', undefined, mockUser);

        expect(result.Success).toBe(true);
        expect(result.Results).toHaveLength(1);
        expect(result.Results[0].Results).toEqual(cachedRows);
        // Only 1 SQL call (metadata), no batch query
        expect(provider.executeSQLCalls).toHaveLength(1);
        // Cache was checked
        expect(cacheGetSpy).toHaveBeenCalledTimes(1);
        // No write-through needed (data was already cached)
        expect(cacheSetSpy).not.toHaveBeenCalled();
    });

    it('executes SQL for cache misses and writes through to cache', async () => {
        provider.setTrustLocalCache(true);
        vi.spyOn(LocalCacheManager.Instance, 'IsInitialized', 'get').mockReturnValue(true);

        // Cache miss
        cacheGetSpy.mockResolvedValue(null);

        const itemRow = buildDatasetItemRow();
        const entityData = [{ ID: '1', Name: 'TestEntity', __mj_UpdatedAt: '2026-03-01T00:00:00.000Z' }];
        provider.setExecuteSQLResults([
            [itemRow],     // Dataset metadata
            entityData,    // SQL batch result
        ]);

        const result = await provider.GetDatasetByName('MJ_Metadata', undefined, mockUser);

        expect(result.Success).toBe(true);
        expect(result.Results[0].Results).toEqual(entityData);
        // 2 SQL calls: metadata + batch
        expect(provider.executeSQLCalls).toHaveLength(2);
        // Write-through to cache
        expect(cacheSetSpy).toHaveBeenCalledTimes(1);
        expect(cacheSetSpy).toHaveBeenCalledWith(
            expect.any(String),        // fingerprint
            expect.any(Object),        // synthetic params
            entityData,                // results
            '2026-03-01T00:00:00.000Z' // maxUpdatedAt
        );
    });

    it('handles mixed cache hits and misses across multiple items', async () => {
        provider.setTrustLocalCache(true);
        vi.spyOn(LocalCacheManager.Instance, 'IsInitialized', 'get').mockReturnValue(true);

        const entitiesRow = buildDatasetItemRow({ Code: 'Entities', Entity: 'MJ: Entities', EntityID: 'ent-001' });
        const rolesRow = buildDatasetItemRow({ Code: 'Roles', Entity: 'MJ: Roles', EntityID: 'ent-002', EntityBaseView: 'vwRoles' });

        // Entities = cache hit, Roles = cache miss
        const cachedEntities = [{ ID: '1', Name: 'Entity1', __mj_UpdatedAt: '2026-03-01T00:00:00.000Z' }];
        cacheGetSpy
            .mockResolvedValueOnce({ results: cachedEntities, maxUpdatedAt: '2026-03-01T00:00:00.000Z', rowCount: 1 }) // Entities hit
            .mockResolvedValueOnce(null); // Roles miss

        const rolesData = [{ ID: 'r1', Name: 'Admin', __mj_UpdatedAt: '2026-02-15T00:00:00.000Z' }];
        provider.setExecuteSQLResults([
            [entitiesRow, rolesRow], // Dataset metadata
            rolesData,               // SQL batch for Roles only
        ]);

        const result = await provider.GetDatasetByName('MJ_Metadata', undefined, mockUser);

        expect(result.Success).toBe(true);
        expect(result.Results).toHaveLength(2);

        // Entities came from cache
        const entitiesResult = result.Results.find(r => r.Code === 'Entities');
        expect(entitiesResult?.Results).toEqual(cachedEntities);

        // Roles came from SQL
        const rolesResult = result.Results.find(r => r.Code === 'Roles');
        expect(rolesResult?.Results).toEqual(rolesData);

        // Only 2 SQL calls: metadata + 1 batch query (Roles only)
        expect(provider.executeSQLCalls).toHaveLength(2);
        // Write-through for Roles only
        expect(cacheSetSpy).toHaveBeenCalledTimes(1);
    });

    it('preserves original item order in results regardless of cache hit/miss order', async () => {
        provider.setTrustLocalCache(true);
        vi.spyOn(LocalCacheManager.Instance, 'IsInitialized', 'get').mockReturnValue(true);

        const item1 = buildDatasetItemRow({ Code: 'Alpha', Entity: 'Alpha Entity', EntityID: 'a1', EntityBaseView: 'vwAlpha' });
        const item2 = buildDatasetItemRow({ Code: 'Beta', Entity: 'Beta Entity', EntityID: 'b1', EntityBaseView: 'vwBeta' });
        const item3 = buildDatasetItemRow({ Code: 'Gamma', Entity: 'Gamma Entity', EntityID: 'g1', EntityBaseView: 'vwGamma' });

        // Alpha = miss, Beta = hit, Gamma = miss
        cacheGetSpy
            .mockResolvedValueOnce(null) // Alpha miss
            .mockResolvedValueOnce({ results: [{ ID: 'b' }], maxUpdatedAt: '2026-01-01T00:00:00.000Z', rowCount: 1 }) // Beta hit
            .mockResolvedValueOnce(null); // Gamma miss

        provider.setExecuteSQLResults([
            [item1, item2, item3], // metadata
            [{ ID: 'a' }],        // Alpha SQL
            [{ ID: 'g' }],        // Gamma SQL
        ]);

        const result = await provider.GetDatasetByName('TestDataset', undefined, mockUser);

        // Order should match original items: Alpha, Beta, Gamma
        expect(result.Results[0].Code).toBe('Alpha');
        expect(result.Results[1].Code).toBe('Beta');
        expect(result.Results[2].Code).toBe('Gamma');
    });

    it('generates correct fingerprint with WhereClause + ItemFilter combined', async () => {
        provider.setTrustLocalCache(true);
        vi.spyOn(LocalCacheManager.Instance, 'IsInitialized', 'get').mockReturnValue(true);
        cacheGetSpy.mockResolvedValue(null);

        const itemRow = buildDatasetItemRow({
            Code: 'Entities',
            WhereClause: "SchemaName = '__mj'",
        });
        provider.setExecuteSQLResults([
            [itemRow],
            [{ ID: '1' }],
        ]);

        await provider.GetDatasetByName('MJ_Metadata', [{ ItemCode: 'Entities', Filter: "Status = 'Active'" }], mockUser);

        // Fingerprint should combine WhereClause AND ItemFilter
        expect(cacheFingerprintSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                EntityName: 'MJ: Entities',
                ExtraFilter: "SchemaName = '__mj' AND (Status = 'Active')",
            }),
            // InstanceConnectionString is undefined in test context
            undefined
        );
    });
});

describe('Dataset Caching in GetDatasetStatusByName', () => {
    let provider: TestProvider;
    let cacheGetSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        provider = new TestProvider();
        cacheGetSpy = vi.spyOn(LocalCacheManager.Instance, 'GetRunViewResult');
        vi.spyOn(LocalCacheManager.Instance, 'GenerateRunViewFingerprint')
            .mockImplementation((params: RunViewParams) => {
                const entity = params.EntityName?.trim() || 'Unknown';
                const filter = (typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '').trim();
                return `${entity}|${filter || '_'}|_|-1|0|_`;
            });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('derives status from cache when all items are cached (zero SQL status queries)', async () => {
        provider.setTrustLocalCache(true);
        vi.spyOn(LocalCacheManager.Instance, 'IsInitialized', 'get').mockReturnValue(true);

        const cachedRows = [
            { ID: '1', Name: 'Entity1', __mj_UpdatedAt: '2026-03-01T00:00:00.000Z' },
            { ID: '2', Name: 'Entity2', __mj_UpdatedAt: '2026-03-15T00:00:00.000Z' },
        ];
        cacheGetSpy.mockResolvedValue({
            results: cachedRows,
            maxUpdatedAt: '2026-03-15T00:00:00.000Z',
            rowCount: 2,
        });

        const itemRow = buildDatasetItemRow();
        provider.setExecuteSQLResults([
            [itemRow], // Dataset metadata (still needed)
            // NO status query — derived from cache
        ]);

        const result = await provider.GetDatasetStatusByName('MJ_Metadata', undefined, mockUser);

        expect(result.Success).toBe(true);
        expect(result.EntityUpdateDates).toHaveLength(1);
        expect(result.EntityUpdateDates[0].RowCount).toBe(2);
        expect(result.EntityUpdateDates[0].EntityName).toBe('MJ: Entities');
        // Only 1 SQL call (metadata), no status queries
        expect(provider.executeSQLCalls).toHaveLength(1);
    });

    it('falls back to SQL for cache misses in status check', async () => {
        provider.setTrustLocalCache(true);
        vi.spyOn(LocalCacheManager.Instance, 'IsInitialized', 'get').mockReturnValue(true);
        cacheGetSpy.mockResolvedValue(null); // Cache miss

        const itemRow = buildDatasetItemRow();
        const statusResult = [{ UpdateDate: '2026-03-01T00:00:00.000Z', TheRowCount: 5 }];
        provider.setExecuteSQLResults([
            [itemRow],      // Dataset metadata
            statusResult,   // SQL status query
        ]);

        const result = await provider.GetDatasetStatusByName('MJ_Metadata', undefined, mockUser);

        expect(result.Success).toBe(true);
        expect(result.EntityUpdateDates[0].RowCount).toBe(5);
        // 2 SQL calls: metadata + status batch
        expect(provider.executeSQLCalls).toHaveLength(2);
    });

    it('returns correct max update date derived from cached rows', async () => {
        provider.setTrustLocalCache(true);
        vi.spyOn(LocalCacheManager.Instance, 'IsInitialized', 'get').mockReturnValue(true);

        const cachedRows = [
            { ID: '1', __mj_UpdatedAt: '2026-01-01T00:00:00.000Z' },
            { ID: '2', __mj_UpdatedAt: '2026-06-15T12:00:00.000Z' }, // Latest
            { ID: '3', __mj_UpdatedAt: '2026-03-01T00:00:00.000Z' },
        ];
        cacheGetSpy.mockResolvedValue({
            results: cachedRows,
            maxUpdatedAt: '2026-06-15T12:00:00.000Z',
            rowCount: 3,
        });

        const itemRow = buildDatasetItemRow();
        provider.setExecuteSQLResults([[itemRow]]);

        const result = await provider.GetDatasetStatusByName('MJ_Metadata', undefined, mockUser);

        expect(result.Success).toBe(true);
        const updateDate = new Date(result.EntityUpdateDates[0].UpdateDate);
        expect(updateDate.toISOString()).toBe('2026-06-15T12:00:00.000Z');
    });
});

describe('computeLatestUpdateDate helper', () => {
    let provider: TestProvider;

    beforeEach(() => {
        provider = new TestProvider();
    });

    it('returns dataset max date when rows have no date field', () => {
        const item = buildDatasetItemRow({
            DatasetItemUpdatedAt: '2026-02-01T00:00:00.000Z',
            DatasetUpdatedAt: '2026-03-01T00:00:00.000Z',
        });
        const rows = [{ ID: '1', Name: 'test' }]; // No __mj_UpdatedAt

        const result = (provider as unknown as { computeLatestUpdateDate: (rows: unknown[], field: string, item: Record<string, unknown>) => Date })
            .computeLatestUpdateDate(rows, '__mj_UpdatedAt', item);

        expect(result.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    });

    it('returns row date when it is newer than dataset dates', () => {
        const item = buildDatasetItemRow({
            DatasetItemUpdatedAt: '2026-01-01T00:00:00.000Z',
            DatasetUpdatedAt: '2026-01-01T00:00:00.000Z',
        });
        const rows = [
            { ID: '1', __mj_UpdatedAt: '2026-06-01T00:00:00.000Z' },
            { ID: '2', __mj_UpdatedAt: '2026-03-01T00:00:00.000Z' },
        ];

        const result = (provider as unknown as { computeLatestUpdateDate: (rows: unknown[], field: string, item: Record<string, unknown>) => Date })
            .computeLatestUpdateDate(rows, '__mj_UpdatedAt', item);

        expect(result.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    });

    it('handles empty rows gracefully', () => {
        const item = buildDatasetItemRow({
            DatasetItemUpdatedAt: '2026-05-01T00:00:00.000Z',
            DatasetUpdatedAt: '2026-04-01T00:00:00.000Z',
        });

        const result = (provider as unknown as { computeLatestUpdateDate: (rows: unknown[], field: string, item: Record<string, unknown>) => Date })
            .computeLatestUpdateDate([], '__mj_UpdatedAt', item);

        expect(result.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    });
});
