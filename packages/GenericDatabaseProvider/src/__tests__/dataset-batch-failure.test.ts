import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import { SaveSQLResult, DeleteSQLResult, UserInfo, LocalCacheManager } from '@memberjunction/core';

// Mock sql-formatter (used by SqlLoggingSessionImpl)
vi.mock('sql-formatter', () => ({
    format: (sql: string) => sql,
}));

/**
 * A FAILED DATASET BATCH IS A FAILED DATASET, NOT AN EMPTY ONE (MJ#4486).
 *
 * GetDatasetByName ran one batch for every cache-missed item. When that batch threw — a dropped
 * connection, a request landing on a transaction handle mid-commit — the catch logged it and fell
 * through with `batchResults = []`, so every item reported Success with zero rows, the dataset
 * reported Success, the empty rows were written through to the cache, and for MJ_Metadata the
 * provider replaced a good metadata cache with nothing. Every EntityByName in the process then
 * failed until restart. The batch error must surface on the items and the dataset, and nothing
 * from a failed read may be cached.
 */
class TestProvider extends GenericDatabaseProviderTestBase {
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
    /** The dataset-items metadata read (first ExecuteSQL call) returns these rows. */
    public datasetItems: Record<string, unknown>[] = [];
    override async ExecuteSQL<T>(): Promise<Array<T>> {
        return this.datasetItems as unknown as Array<T>;
    }

    /** What the one data batch does: resolve with per-item rows, or throw. */
    public batchBehavior: (() => Promise<Record<string, unknown>[][]>) = async () => [];
    public batchCalls = 0;
    override async ExecuteSQLBatch(): Promise<Record<string, unknown>[][]> {
        this.batchCalls++;
        return this.batchBehavior();
    }

    private _trustCache = false;
    public setTrustLocalCache(trust: boolean): void { this._trustCache = trust; }
    override get TrustLocalCacheCompletely(): boolean { return this._trustCache; }

    /** The deferral predicate is protected; expose it. */
    public get RefreshMustWait(): boolean { return this.MetadataMemberRefreshMustWait; }

    /** A physical handle that exists between begin and commit/rollback, so the real depth accounting runs. */
    private _physical = false;
    protected override get HasPhysicalTransaction(): boolean { return this._physical; }
    protected override async BeginPhysicalTransaction(): Promise<void> { this._physical = true; }
    protected override async CommitPhysicalTransaction(): Promise<void> { this._physical = false; }
    protected override async RollbackPhysicalTransaction(): Promise<void> { this._physical = false; }
}

const mockUser: UserInfo = { ID: 'test-user-id', Name: 'Test User', Email: 'test@test.com' } as UserInfo;

function item(code: string, entity: string, view: string): Record<string, unknown> {
    return {
        DatasetID: 'ds-001', Code: code, Entity: entity, EntityID: `ent-${code}`, EntitySchemaName: '__mj',
        EntityBaseView: view, WhereClause: null, DateFieldToCheck: '__mj_UpdatedAt',
        DatasetItemUpdatedAt: '2026-01-01T00:00:00.000Z', DatasetUpdatedAt: '2026-01-01T00:00:00.000Z', Columns: null,
    };
}

describe('GetDatasetByName when the data batch throws (MJ#4486)', () => {
    let provider: TestProvider;
    let cacheSetSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        provider = new TestProvider();
        provider.datasetItems = [item('Entities', 'MJ: Entities', 'vwEntities'), item('Roles', 'MJ: Roles', 'vwRoles')];
        vi.spyOn(LocalCacheManager.Instance, 'IsInitialized', 'get').mockReturnValue(true);
        vi.spyOn(LocalCacheManager.Instance, 'GetRunViewResult').mockResolvedValue(null);
        cacheSetSpy = vi.spyOn(LocalCacheManager.Instance, 'SetRunViewResult').mockResolvedValue(undefined);
        vi.spyOn(LocalCacheManager.Instance, 'GenerateRunViewFingerprint').mockReturnValue('fp');
        provider.setTrustLocalCache(true);
    });
    afterEach(() => vi.restoreAllMocks());

    it('reports the dataset as failed, carrying the batch error, instead of an empty success', async () => {
        provider.batchBehavior = async () => { throw new Error('Connection closed before request completed.'); };

        const result = await provider.GetDatasetByName('MJ_Metadata', undefined, mockUser);

        expect(result.Success).toBe(false);
        expect(result.Status).toContain('Connection closed before request completed.');
        expect(result.Results).toHaveLength(2);
        for (const r of result.Results) {
            expect(r.Success, r.Code).toBe(false);
            expect(r.Status, r.Code).toContain('Connection closed');
            expect(r.Results).toEqual([]);
        }
    });

    it('writes nothing through to the cache for a failed read', async () => {
        provider.batchBehavior = async () => { throw new Error('Requests can only be made in the LoggedIn state, not the SentClientRequest state'); };

        await provider.GetDatasetByName('MJ_Metadata', undefined, mockUser);

        // An empty slot cached here would be served as a genuine empty result until it expired.
        expect(cacheSetSpy).not.toHaveBeenCalled();
    });

    it('still succeeds, and caches, when the batch resolves — including a genuinely empty item', async () => {
        provider.batchBehavior = async () => [[{ ID: 'e1', Name: 'MJ: Entities' }], []];

        const result = await provider.GetDatasetByName('MJ_Metadata', undefined, mockUser);

        expect(result.Success).toBe(true);
        expect(result.Status).toBe('');
        expect(result.Results.map(r => r.Results.length)).toEqual([1, 0]);
        expect(cacheSetSpy).toHaveBeenCalledTimes(2);
    });
});

describe('a member-change metadata refresh waits for the ambient transaction (MJ#4486)', () => {
    it('must wait while the provider is inside a transaction, and not otherwise', async () => {
        // The test base's physical begin/commit are no-ops, so this exercises the real depth
        // accounting in GenericDatabaseProvider rather than poking the field.
        const provider = new TestProvider();
        expect(provider.RefreshMustWait).toBe(false);
        await provider.BeginTransaction();
        expect(provider.RefreshMustWait).toBe(true);
        await provider.CommitTransaction();
        expect(provider.RefreshMustWait).toBe(false);
    });
});
