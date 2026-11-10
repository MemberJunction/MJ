import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import { SaveSQLResult, DeleteSQLResult, UserInfo, LocalCacheManager, ExecuteSQLOptions } from '@memberjunction/core';
import type { ExecuteSQLBatchOptions } from '../GenericDatabaseProvider';

vi.mock('sql-formatter', () => ({ format: (sql: string) => sql }));

/**
 * A DATASET ITEM ASKED FOR WITH THE ItemFilter `1=0` RETURNS NO ROWS WITHOUT A DATABASE READ.
 *
 * The scoped metadata reload (ProviderBase.TryPartialMetadataReload) reloads only the saved-query
 * family: it reuses the MJ_Metadata definition verbatim and sends `1=0` for every other item. Each
 * of those items still issued its own `SELECT … WHERE 1=0` — on PostgreSQL one pool connection
 * apiece — so a reload meant to read 8 items ran ~30 queries, during exactly the bursts of saved-query
 * writes that fill the pool. The result is unchanged: an empty, successful item.
 */
const user: UserInfo = { ID: 'u', Name: 'U', Email: 'u@test' } as UserInfo;

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
    protected BuildPaginationSQL(maxRows: number, startRow: number): string { return `LIMIT ${maxRows} OFFSET ${startRow}`; }

    public datasetItems: Record<string, unknown>[] = [];
    /** Every item query the data batch ran. */
    public batchQueries: string[] = [];

    override async ExecuteSQL<T>(_sql?: string, _params?: unknown[], _options?: ExecuteSQLOptions): Promise<Array<T>> {
        return this.datasetItems as unknown as Array<T>;
    }
    override async ExecuteSQLBatch(queries: string[], _params?: unknown[][], _options?: ExecuteSQLBatchOptions): Promise<Record<string, unknown>[][]> {
        this.batchQueries.push(...queries);
        return queries.map(() => [{ ID: 'row', __mj_UpdatedAt: '2026-02-01T00:00:00.000Z' }]);
    }
    override get TrustLocalCacheCompletely(): boolean { return false; }
}

const item = (code: string, whereClause: string | null = null): Record<string, unknown> => ({
    DatasetID: 'ds', Code: code, Entity: `MJ: ${code}`, EntityID: `e-${code}`, EntitySchemaName: '__mj', EntityBaseView: `vw${code}`,
    WhereClause: whereClause, DateFieldToCheck: '__mj_UpdatedAt', DatasetItemUpdatedAt: '2026-01-01T00:00:00.000Z', DatasetUpdatedAt: '2026-01-01T00:00:00.000Z', Columns: null,
});

describe('GetDatasetByName: an item filtered with 1=0 is not read', () => {
    let provider: TestProvider;
    beforeEach(() => {
        provider = new TestProvider();
        provider.datasetItems = [item('Entities'), item('Roles', `Name <> 'Hidden'`), item('Queries')];
        vi.spyOn(LocalCacheManager.Instance, 'IsInitialized', 'get').mockReturnValue(false);
    });
    afterEach(() => vi.restoreAllMocks());

    it('runs SQL only for the items it was not told to skip', async () => {
        const result = await provider.GetDatasetByName('MJ_Metadata', [
            { ItemCode: 'Entities', Filter: '1=0' },
            { ItemCode: 'Roles', Filter: '1=0' },
        ], user);

        expect(provider.batchQueries).toHaveLength(1);
        expect(provider.batchQueries[0]).toContain('"vwQueries"');
        expect(result.Success).toBe(true);
    });

    it('returns each skipped item as an empty, successful result, in dataset order, dated like an empty read', async () => {
        const result = await provider.GetDatasetByName('MJ_Metadata', [
            { ItemCode: 'Entities', Filter: '1=0' },
            { ItemCode: 'Roles', Filter: ' 1 = 0 ' },
        ], user);

        expect(result.Results.map(r => r.Code)).toEqual(['Entities', 'Roles', 'Queries']);
        const [entities, roles, queries] = result.Results;
        expect(entities).toMatchObject({ Code: 'Entities', EntityName: 'MJ: Entities', EntityID: 'e-Entities', Results: [], Success: true });
        expect(roles).toMatchObject({ Code: 'Roles', Results: [], Success: true });
        // The date an empty read reports: the dataset definition's own timestamp.
        expect(new Date(entities.LatestUpdateDate).toISOString()).toBe('2026-01-01T00:00:00.000Z');
        expect(queries.Results).toHaveLength(1);
        expect(queries.Success).toBe(true);
    });

    it('reads every item when no 1=0 filter is given', async () => {
        await provider.GetDatasetByName('MJ_Metadata', undefined, user);
        expect(provider.batchQueries).toHaveLength(3);
    });

    it('an ItemFilter that merely contains 1=0 is still run as written', async () => {
        await provider.GetDatasetByName('MJ_Metadata', [{ ItemCode: 'Entities', Filter: `1=0 OR Name = 'X'` }], user);

        expect(provider.batchQueries).toHaveLength(3);
        expect(provider.batchQueries.find(q => q.includes('"vwEntities"'))).toContain(`1=0 OR Name = 'X'`);
    });

    it('skips for any dataset, not only MJ_Metadata', async () => {
        const result = await provider.GetDatasetByName('Some_Dataset', [{ ItemCode: 'Queries', Filter: '1=0' }], undefined);

        expect(provider.batchQueries).toHaveLength(2);
        expect(provider.batchQueries.some(q => q.includes('"vwQueries"'))).toBe(false);
        expect(result.Results.find(r => r.Code === 'Queries')).toMatchObject({ Results: [], Success: true });
    });
});
