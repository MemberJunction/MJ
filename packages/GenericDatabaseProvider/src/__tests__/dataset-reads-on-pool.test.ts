import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import { SaveSQLResult, DeleteSQLResult, UserInfo, LocalCacheManager, ExecuteSQLOptions } from '@memberjunction/core';
import type { ExecuteSQLBatchOptions } from '../GenericDatabaseProvider';

vi.mock('sql-formatter', () => ({ format: (sql: string) => sql }));

/**
 * THE METADATA DATASET IS READ ON THE POOL, EVERY OTHER DATASET JOINS THE AMBIENT TRANSACTION (MJ#4514).
 *
 * The member-change refresh that loads MJ_Metadata is timer-driven, so it can be issued while the
 * same provider is committing a caller's transaction. Joining that transaction put the metadata
 * batch on its connection beside the COMMIT (tedious EINVALIDSTATE / ECLOSE). The reads for that one
 * dataset now carry `ignoreAmbientTransaction`; other datasets do not, because a caller that writes
 * and then loads inside one transaction expects to see its own rows.
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
    protected BuildPaginationSQL(maxRows: number, startRow: number): string { return `LIMIT ${maxRows} OFFSET ${startRow}`; }

    public datasetItems: Record<string, unknown>[] = [];
    public sqlOptions: Array<ExecuteSQLOptions | undefined> = [];
    public batchOptions: Array<ExecuteSQLBatchOptions | undefined> = [];
    override async ExecuteSQL<T>(_sql?: string, _params?: unknown[], options?: ExecuteSQLOptions): Promise<Array<T>> {
        this.sqlOptions.push(options);
        return this.datasetItems as unknown as Array<T>;
    }
    override async ExecuteSQLBatch(queries: string[], _params?: unknown[][], options?: ExecuteSQLBatchOptions): Promise<Record<string, unknown>[][]> {
        this.batchOptions.push(options);
        return queries.map(() => [{ ID: 'row' }]);
    }
    override get TrustLocalCacheCompletely(): boolean { return false; }
}

const user: UserInfo = { ID: 'u', Name: 'U', Email: 'u@test' } as UserInfo;
const item = (code: string): Record<string, unknown> => ({
    DatasetID: 'ds', Code: code, Entity: `MJ: ${code}`, EntityID: `e-${code}`, EntitySchemaName: '__mj', EntityBaseView: `vw${code}`,
    WhereClause: null, DateFieldToCheck: '__mj_UpdatedAt', DatasetItemUpdatedAt: '2026-01-01T00:00:00.000Z', DatasetUpdatedAt: '2026-01-01T00:00:00.000Z', Columns: null,
});

describe('dataset reads and the ambient transaction (MJ#4514)', () => {
    let provider: TestProvider;
    beforeEach(() => {
        provider = new TestProvider();
        provider.datasetItems = [item('Entities'), item('Roles')];
        vi.spyOn(LocalCacheManager.Instance, 'IsInitialized', 'get').mockReturnValue(false);
    });
    afterEach(() => vi.restoreAllMocks());

    it('MJ_Metadata: the items read and the data batch both run on the pool', async () => {
        const result = await provider.GetDatasetByName('MJ_Metadata', undefined, user);
        expect(result.Success).toBe(true);
        expect(provider.sqlOptions.map(o => o?.ignoreAmbientTransaction)).toEqual([true]);
        expect(provider.batchOptions.map(o => o?.ignoreAmbientTransaction)).toEqual([true]);
    });

    it('MJ_Metadata: the status read runs on the pool too', async () => {
        await provider.GetDatasetStatusByName('MJ_Metadata', undefined, user);
        expect(provider.sqlOptions.map(o => o?.ignoreAmbientTransaction)).toEqual([true]);
    });

    it('any other dataset keeps joining the ambient transaction', async () => {
        await provider.GetDatasetByName('AI_Metadata', undefined, user);
        await provider.GetDatasetStatusByName('AI_Metadata', undefined, user);
        expect(provider.sqlOptions.every(o => !o?.ignoreAmbientTransaction)).toBe(true);
        expect(provider.batchOptions.every(o => !o?.ignoreAmbientTransaction)).toBe(true);
    });
});
