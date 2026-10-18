/**
 * RunQueriesWithCacheCheck and the client's query definition.
 *
 * A client validates its cached RunQuery results with the server. CacheValidationSQL measures the
 * query's DATA, so after the query's SQL is edited it still reports the client's rows as current.
 * The client therefore also sends the definition hash its slot was written under, and the server
 * answers 'stale', with fresh rows, whenever that hash is not its own. A client that sends no hash
 * (a release before the hash existed) gets the check as before. Every non-error result carries the
 * server's hash, for the client to store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';

vi.mock('sql-formatter', () => ({
    format: (sql: string) => sql,
}));

import {
    SaveSQLResult,
    DeleteSQLResult,
    UserInfo,
    RunQueryParams,
    RunQueryResult,
    RunQueryWithCacheCheckParams,
    QueryDefinitionSignature,
    LocalCacheManager,
    InMemoryLocalStorageProvider,
    ExternalDataSourceReadRouter,
} from '@memberjunction/core';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { MJQueryEntityExtended } from '@memberjunction/core-entities';

const QUERY_ID = 'AAAAAAAA-0000-0000-0000-000000000001';
const VALIDATION_STAMP = { maxUpdatedAt: '2026-01-01T00:00:00.000Z', rowCount: 3 };

class DefinitionCheckProvider extends GenericDatabaseProviderTestBase {
    public ServerHash = 'hash-v2';
    public Executions = 0;

    protected get UUIDFunctionPattern(): RegExp { return /^$/; }
    protected get DBDefaultFunctionPattern(): RegExp { return /^$/; }
    public QuoteIdentifier(name: string): string { return `"${name}"`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `"${schema}"."${obj}"`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string { return `LIMIT ${maxRows} OFFSET ${startRow}`; }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}

    private readonly query = {
        ID: QUERY_ID,
        Name: 'Revenue',
        Status: 'Approved',
        CacheValidationSQL: 'SELECT MAX(__mj_UpdatedAt) AS MaxUpdatedAt, COUNT(*) AS RowCount FROM t',
        UserCanRun: () => ({ canRun: true, deniedEntities: [] }),
    } as unknown as MJQueryEntityExtended;

    protected override resolveQuery(_params: RunQueryParams): MJQueryEntityExtended | undefined {
        return this.query;
    }

    protected override QueryDefinitionSignatureFor(query: MJQueryEntityExtended): QueryDefinitionSignature | undefined {
        return { QueryID: query.ID, Hash: this.ServerHash };
    }

    /** CacheValidationSQL always reports the data the client already holds: unchanged. */
    protected override async getBatchedQueryCacheStatus(
        items: Array<{ index: number; item: RunQueryWithCacheCheckParams; query: MJQueryEntityExtended }>,
    ): Promise<Map<number, { success: boolean; maxUpdatedAt?: string; rowCount?: number; errorMessage?: string }>> {
        return new Map(items.map(({ index }) => [index, { success: true, ...VALIDATION_STAMP }]));
    }

    /** Exposes the external-data-source path with its result cache. */
    public RunExternal(router: ExternalDataSourceReadRouter): Promise<RunQueryResult> {
        const external = { ...(this.query as unknown as Record<string, unknown>), ExternalDataSourceID: 'EEEEEEEE-0000-0000-0000-00000000000E', QueryFields: [], CategoryPath: '' };
        return this.runExternalQueryWithCache(external as unknown as MJQueryEntityExtended, 'SELECT 1', { QueryID: QUERY_ID }, router, user);
    }

    protected override async InternalRunQuery(_params: RunQueryParams, _contextUser?: UserInfo): Promise<RunQueryResult> {
        this.Executions++;
        return { Success: true, QueryID: QUERY_ID, QueryName: 'Revenue', Results: [{ Marker: 'new SQL' }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 0, ErrorMessage: '' };
    }
}

const user = { ID: 'user-1', Email: 'u@test' } as unknown as UserInfo;

function check(definitionHash?: string): RunQueryWithCacheCheckParams[] {
    return [{ params: { QueryID: QUERY_ID }, cacheStatus: { ...VALIDATION_STAMP, ...(definitionHash !== undefined ? { definitionHash } : {}) } }];
}

describe('RunQueriesWithCacheCheck definition check', () => {
    let provider: DefinitionCheckProvider;

    beforeEach(() => {
        provider = new DefinitionCheckProvider();
    });

    it('answers stale with fresh rows when the client\'s slot came from another definition, even though the data is unchanged', async () => {
        const response = await provider.RunQueriesWithCacheCheck(check('hash-v1'), user);

        expect(response.success).toBe(true);
        expect(response.results[0].status).toBe('stale');
        expect(response.results[0].results).toEqual([{ Marker: 'new SQL' }]);
        // Stamped like a first fetch, so the rewritten slot validates 'current' next time.
        expect(response.results[0].maxUpdatedAt).toBe(VALIDATION_STAMP.maxUpdatedAt);
        expect(response.results[0].definitionHash).toBe('hash-v2');
        expect(provider.Executions).toBe(1);
    });

    it('treats an empty hash (a slot written without one) as another definition', async () => {
        const response = await provider.RunQueriesWithCacheCheck(check(''), user);
        expect(response.results[0].status).toBe('stale');
    });

    it('answers current when the hash matches and the data is unchanged', async () => {
        const response = await provider.RunQueriesWithCacheCheck(check('hash-v2'), user);

        expect(response.results[0].status).toBe('current');
        expect(response.results[0].definitionHash).toBe('hash-v2');
        expect(provider.Executions).toBe(0);
    });

    it('skips the definition check for a client that sends no hash', async () => {
        const response = await provider.RunQueriesWithCacheCheck(check(undefined), user);

        expect(response.results[0].status).toBe('current');
        expect(provider.Executions).toBe(0);
    });

    it('returns its hash with a first fetch', async () => {
        const response = await provider.RunQueriesWithCacheCheck([{ params: { QueryID: QUERY_ID } }], user);

        expect(response.results[0].status).toBe('stale');
        expect(response.results[0].definitionHash).toBe('hash-v2');
    });
});

describe('external-data-source query cache and the query definition', () => {
    beforeEach(async () => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        await LocalCacheManager.Instance.Initialize(new InMemoryLocalStorageProvider());
    });

    it('misses a cached result written under another definition of the query', async () => {
        const provider = new DefinitionCheckProvider();
        let remoteRuns = 0;
        let marker = 'v1 SQL';
        const router = {
            GetCacheTTLSeconds: async () => 600,
            RunQueryExternal: async (): Promise<RunQueryResult> => {
                remoteRuns++;
                return { Success: true, QueryID: QUERY_ID, QueryName: 'Revenue', Results: [{ Marker: marker }], RowCount: 1, TotalRowCount: 1, ExecutionTime: 0, ErrorMessage: '' };
            },
        } as unknown as ExternalDataSourceReadRouter;

        provider.ServerHash = 'hash-v1';
        await provider.RunExternal(router);
        await vi.waitFor(async () => expect((await provider.RunExternal(router)).CacheHit).toBe(true));
        expect(remoteRuns).toBe(1);

        provider.ServerHash = 'hash-v2';
        marker = 'v2 SQL';
        const afterEdit = await provider.RunExternal(router);

        expect(afterEdit.CacheHit).not.toBe(true);
        expect(afterEdit.Results).toEqual([{ Marker: 'v2 SQL' }]);
        expect(remoteRuns).toBe(2);
    });
});
