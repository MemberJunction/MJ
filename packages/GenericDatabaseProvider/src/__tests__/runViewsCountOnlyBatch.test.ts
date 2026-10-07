/**
 * Routing for `InternalRunViews`: an all-`count_only` batch runs every view through
 * `RunViewCore` (full per-view security path) with a coalescing count executor, so
 * the counts reach the database as ONE statement. Mixed / single batches keep the
 * per-view path. The last block runs the real `RunViewCore`, which must hand its
 * COUNT SQL to that executor.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('sql-formatter', () => ({ format: (sql: string) => sql }));
vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: {
        get Instance() {
            return { Config: vi.fn(), Encrypt: vi.fn(), IsEncrypted: vi.fn().mockReturnValue(false), GetKeyByID: vi.fn() };
        },
    },
}));

import { GenericDatabaseProvider } from '../GenericDatabaseProvider';
import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import type { SaveCoercedValue, SaveCallBinding, SaveSQLFragment } from '../saveTypes.js';
import {
    CompositeKey,
    UserInfo,
    type DatasetResultType,
    type DatasetStatusResultType,
    type DeleteSQLResult,
    type EntityInfo,
    type EntityRecordNameResult,
    type ILocalStorageProvider,
    type IMetadataProvider,
    type PotentialDuplicateResponse,
    type ProviderType,
    type QueryExecutionSpec,
    type RecordMergeResult,
    type RunQueryResult,
    type RunViewParams,
    type RunViewResult,
    type SaveSQLResult,
    type TransactionGroupBase,
} from '@memberjunction/core';

type CountExecutor = (sql: string) => Promise<{ TotalRowCount: number }[]>;

/** The slice of the provider `InternalRunViews` touches, driven by a fake RunViewCore. */
function fakeProvider(executeSQL: (sql: string) => Promise<Record<string, unknown>[]>) {
    const proto = GenericDatabaseProvider.prototype as unknown as Record<string, Function>;
    const self = {
        ExecuteSQL: vi.fn(executeSQL),
        QuoteIdentifier: (n: string) => `[${n}]`,
        InternalRunView: vi.fn(async (): Promise<RunViewResult> => ({ Success: true, Results: [], RowCount: 1, TotalRowCount: 1 } as unknown as RunViewResult)),
        // Mimics the tail of the real RunViewCore for count_only: hands its COUNT SQL to the executor.
        RunViewCore: vi.fn(async (p: RunViewParams, _u: unknown, exec?: CountExecutor): Promise<RunViewResult> => {
            if (p.ExtraFilter === 'FAIL-EARLY') {
                return { Success: false, ErrorMessage: 'no CanRead', Results: [], RowCount: 0, TotalRowCount: 0 } as unknown as RunViewResult;
            }
            const rows = await exec!(`SELECT COUNT(*) AS [TotalRowCount] FROM [s].[${p.EntityName}]`);
            return { Success: true, Results: [], RowCount: rows[0].TotalRowCount, TotalRowCount: rows[0].TotalRowCount } as unknown as RunViewResult;
        }),
        RunCoalescedCountBatch: proto.RunCoalescedCountBatch,
        isConnectionError: (e: unknown) => (e as { code?: string }).code === 'POOL_CLOSED',
    };
    const internalRunViews = (params: RunViewParams[]) => (proto.InternalRunViews as Function).call(self, params) as Promise<RunViewResult[]>;
    return { self, internalRunViews };
}

describe('GenericDatabaseProvider.InternalRunViews — count_only coalescing', () => {
    it('runs an all-count_only batch as ONE UNION ALL statement', async () => {
        const { self, internalRunViews } = fakeProvider(async (sql) =>
            sql.split('\nUNION ALL\n').map((_, i) => ({ BatchIndex: i, TotalRowCount: i * 10 })),
        );
        const results = await internalRunViews([
            { EntityName: 'A', ResultType: 'count_only' },
            { EntityName: 'B', ResultType: 'count_only' },
            { EntityName: 'C', ResultType: 'count_only' },
        ]);
        expect(self.ExecuteSQL).toHaveBeenCalledTimes(1);
        expect(self.ExecuteSQL.mock.calls[0][0]).toContain('UNION ALL');
        expect(self.InternalRunView).not.toHaveBeenCalled();
        expect(results.map((r) => r.TotalRowCount)).toEqual([0, 10, 20]);
    });

    it('keeps a view that fails before its count as its own failure', async () => {
        const { self, internalRunViews } = fakeProvider(async () => [{ TotalRowCount: 7 }]);
        const results = await internalRunViews([
            { EntityName: 'A', ResultType: 'count_only' },
            { EntityName: 'B', ResultType: 'count_only', ExtraFilter: 'FAIL-EARLY' },
        ]);
        expect(results[0]).toMatchObject({ Success: true, TotalRowCount: 7 });
        expect(results[1]).toMatchObject({ Success: false, ErrorMessage: 'no CanRead' });
        // Only one survivor → run directly, no UNION ALL.
        expect(self.ExecuteSQL).toHaveBeenCalledTimes(1);
        expect(self.ExecuteSQL.mock.calls[0][0]).not.toContain('UNION ALL');
    });

    it('surfaces a connection error on the combined statement without re-running each count', async () => {
        const poolClosed = Object.assign(new Error('Pool is closed'), { code: 'POOL_CLOSED' });
        const { self, internalRunViews } = fakeProvider(async () => { throw poolClosed; });
        await expect(internalRunViews([
            { EntityName: 'A', ResultType: 'count_only' },
            { EntityName: 'B', ResultType: 'count_only' },
        ])).rejects.toBe(poolClosed);
        expect(self.ExecuteSQL).toHaveBeenCalledTimes(1);
    });

    it('leaves mixed and single-item batches on the per-view path', async () => {
        const { self, internalRunViews } = fakeProvider(async () => []);
        await internalRunViews([{ EntityName: 'A', ResultType: 'count_only' }, { EntityName: 'B', ResultType: 'simple' }]);
        await internalRunViews([{ EntityName: 'A', ResultType: 'count_only' }]);
        expect(self.InternalRunView).toHaveBeenCalledTimes(3);
        expect(self.RunViewCore).not.toHaveBeenCalled();
    });
});

/**
 * A provider that runs the real `InternalRunViews` and `RunViewCore` over entity fixtures, with
 * `ExecuteSQL` recorded. Every other abstract member is a no-op.
 */
class CountBatchTestProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    /** Every SQL statement `ExecuteSQL` received, in order. */
    public readonly ExecutedSQL: string[] = [];

    constructor(private readonly testEntities: EntityInfo[]) {
        super();
    }

    public override get Entities(): EntityInfo[] { return this.testEntities; }

    /** Answers a combined count statement with one row per branch: 5, 10, 15, … */
    public override async ExecuteSQL<T>(sql: string): Promise<Array<T>> {
        this.ExecutedSQL.push(sql);
        return sql.split('\nUNION ALL\n').map((_, i) => ({ BatchIndex: i, TotalRowCount: (i + 1) * 5 })) as unknown as T[];
    }

    public RunViewsAs(params: RunViewParams[], user: UserInfo): Promise<RunViewResult[]> {
        return this.InternalRunViews(params, user);
    }

    protected get UUIDFunctionPattern(): RegExp { return CountBatchTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return CountBatchTestProvider._defaultPattern; }
    public QuoteIdentifier(name: string): string { return `[${name}]`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `[${schema}].[${obj}]`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string {
        return `OFFSET ${startRow} ROWS FETCH NEXT ${maxRows} ROWS ONLY`;
    }
    protected CoerceSaveFieldValue(): SaveCoercedValue { throw new Error('Not supported in this test double'); }
    protected RenderSaveCallBinding(): SaveCallBinding { throw new Error('Not supported in this test double'); }
    protected WrapSaveCallForResult(): SaveSQLFragment { throw new Error('Not supported in this test double'); }
    protected WrapSaveCallWithRecordChange(): SaveSQLFragment { throw new Error('Not supported in this test double'); }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}
    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return 'Database'; }
    public get DatabaseConnection(): object { return {}; }
    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(): Promise<EntityRecordNameResult[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> {}
    protected async InternalRunQuery(): Promise<RunQueryResult> { return { Success: true, Results: [] } as unknown as RunQueryResult; }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return []; }
    protected async InternalExecuteQueryFromSpec(_spec: QueryExecutionSpec, _user?: UserInfo): Promise<RunQueryResult> {
        throw new Error('Not supported');
    }
    protected async GetCurrentUser(): Promise<UserInfo> { return new UserInfo(null as unknown as IMetadataProvider, {}); }
    public async GetRecordDependencies(): Promise<{ EntityName: string; RelatedEntityName: string; FieldName: string; PrimaryKey: CompositeKey }[]> { return []; }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> { return {} as PotentialDuplicateResponse; }
    public async MergeRecords(): Promise<RecordMergeResult> { return {} as RecordMergeResult; }
    public async GetDatasetByName(): Promise<DatasetResultType> { return {} as DatasetResultType; }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> { return {} as DatasetStatusResultType; }
    public get InstanceConnectionString(): string { return 'count-batch-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    public get LocalStorageProvider(): ILocalStorageProvider {
        return { GetItem: async () => null, SetItem: async () => {}, Remove: async () => {} } as unknown as ILocalStorageProvider;
    }
    protected get Metadata(): IMetadataProvider { return this as unknown as IMetadataProvider; }
}

/** An entity the user may read, with no row-level security and no external data source. */
function readableEntity(name: string): EntityInfo {
    const id = { Name: 'ID', CodeName: 'ID' };
    return {
        ID: `ENT-${name}`,
        Name: name,
        SchemaName: '__mj',
        BaseView: `vw${name}`,
        Fields: [id],
        PrimaryKeys: [id],
        FirstPrimaryKey: id,
        FieldByName: (n: string) => (n.trim().toLowerCase() === 'id' ? id : undefined),
        DatetimeFields: [],
        ExternalDataSourceID: null,
        UserViewMaxRows: 0,
        EnableFieldLevelSecurity: false,
        GetUserPermisions: () => ({ CanRead: true }),
        GetEffectiveRowFilterWhereClause: () => '',
    } as unknown as EntityInfo;
}

describe('GenericDatabaseProvider.RunViewCore — count_only batch through the real view path', () => {
    it('hands each count to the batch, so two count_only views reach the database as ONE UNION ALL statement', async () => {
        const provider = new CountBatchTestProvider([readableEntity('A'), readableEntity('B')]);
        const user = new UserInfo(null as unknown as IMetadataProvider, { ID: 'U1', Email: 'u1@example.com' });
        const results = await provider.RunViewsAs([
            { EntityName: 'A', ResultType: 'count_only' },
            { EntityName: 'B', ResultType: 'count_only', ExtraFilter: "Name='x'" },
        ], user);
        expect(provider.ExecutedSQL).toHaveLength(1);
        expect(provider.ExecutedSQL[0]).toContain('UNION ALL');
        expect(provider.ExecutedSQL[0]).toContain("FROM [__mj].[vwB] WHERE (Name='x')");
        expect(results.map((r) => [r.Success, r.TotalRowCount])).toEqual([[true, 5], [true, 10]]);
    });
});
