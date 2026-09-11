/**
 * The full-page fallback COUNT and the `SkipTotalRowCount` opt-out.
 *
 * When a page comes back exactly full (`Results.length === MaxRows`), `InternalRunView` runs the
 * count SQL as a SECOND, sequential round trip to report the true total. For a `MaxRows: 1`
 * existence/lookup read, finding the row IS a full page — so every successful single-row lookup
 * paid double round trips to compute a total it never read. Measured on a live sync workload the
 * fallback fired exactly at the hit rate of the two per-record lookups and cost ~11% of all SQL
 * time.
 *
 * The count cannot simply be dropped for MaxRows:1 — `TotalRowCount` on a capped read is
 * load-bearing (the vector dashboard reads it as the real count on a MaxRows:1 query; the cache
 * gauntlet asserts it exceeds the truncated row count). So the caller says so instead:
 * `SkipTotalRowCount: true` skips the fallback (and the pagination count), never the
 * `count_only` count. These tests drive the REAL InternalRunView with ExecuteSQL recorded.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GenericDatabaseProvider } from '../GenericDatabaseProvider';
import {
    SaveSQLResult,
    DeleteSQLResult,
    EntityInfo,
    EntityFieldInfo,
    UserInfo,
    ProviderType,
    PotentialDuplicateResponse,
    DatasetResultType,
    DatasetStatusResultType,
    ILocalStorageProvider,
    IMetadataProvider,
} from '@memberjunction/core';
import type { RunViewParams, RunViewResult } from '@memberjunction/core';
import type { RunQueryResult } from '@memberjunction/core';
import { CompositeKey } from '@memberjunction/core';
import { RecordMergeResult } from '@memberjunction/core';
import { TransactionGroupBase } from '@memberjunction/core';
import { QueryExecutionSpec } from '@memberjunction/core';

vi.mock('sql-formatter', () => ({ format: (sql: string) => sql }));
vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: {
        get Instance() {
            return {
                Config: vi.fn(),
                Encrypt: vi.fn(),
                IsEncrypted: vi.fn().mockReturnValue(false),
                GetKeyByID: vi.fn().mockReturnValue({ Marker: '$ENC$' }),
            };
        },
    },
}));

/** Concrete provider whose ExecuteSQL records every statement and answers from a script. */
class CountProbeProvider extends GenericDatabaseProvider {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    public executed: string[] = [];
    /** Rows the DATA query returns; the COUNT query always answers TotalRowCount: 47. */
    public dataRows: Array<Record<string, unknown>> = [];

    private _testEntities: EntityInfo[] = [];
    public registerEntity(entity: EntityInfo): void { this._testEntities.push(entity); }
    public override get Entities(): EntityInfo[] { return this._testEntities; }

    protected get UUIDFunctionPattern(): RegExp { return CountProbeProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return CountProbeProvider._defaultPattern; }
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

    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}

    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return 'Database'; }
    public get DatabaseConnection(): object { return {}; }

    public async ExecuteSQL<T>(sql: string): Promise<Array<T>> {
        this.executed.push(sql);
        if (/COUNT\(\*\)|TotalRowCount/i.test(sql)) {
            return [{ TotalRowCount: 47 }] as unknown as T[];
        }
        return this.dataRows as unknown as T[];
    }

    // Permission metadata is not under test — allow every read.
    protected override CheckUserReadPermissions(): void {}

    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(): Promise<{ EntityID: string; PrimaryKey: CompositeKey; RecordName: string }[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> {}
    protected async InternalRunQuery(): Promise<RunQueryResult> { return { Success: true, Results: [] }; }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return []; }
    protected async InternalExecuteQueryFromSpec(_spec: QueryExecutionSpec, _user?: UserInfo): Promise<RunQueryResult> {
        throw new Error('Not supported');
    }
    protected async GetCurrentUser(): Promise<UserInfo> { return new UserInfo(null as unknown as IMetadataProvider, {}); }
    public async GetRecordDependencies(): Promise<{ EntityName: string; RelatedEntityName: string; FieldName: string; PrimaryKey: CompositeKey; }[]> { return []; }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> {
        return { EntityName: '', PrimaryKey: new CompositeKey(), DuplicateRunDetailMatchRecords: [] } as unknown as PotentialDuplicateResponse;
    }
    public async MergeRecords(): Promise<RecordMergeResult> {
        return { Success: false } as unknown as RecordMergeResult;
    }
    public async GetDatasetByName(): Promise<DatasetResultType> {
        return { Success: false } as unknown as DatasetResultType;
    }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> {
        return { Success: false } as unknown as DatasetStatusResultType;
    }
    public get InstanceConnectionString(): string { return 'count-probe-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    public get LocalStorageProvider(): ILocalStorageProvider {
        return { GetItem: async () => null, SetItem: async () => {}, Remove: async () => {} } as ILocalStorageProvider;
    }
    protected get Metadata(): IMetadataProvider { return this as unknown as IMetadataProvider; }

    public testRunView<T = unknown>(params: RunViewParams): Promise<RunViewResult<T>> {
        return this.InternalRunView<T>(params, { ID: 'u1' } as unknown as UserInfo);
    }
}

function makeField(name: string): EntityFieldInfo {
    return { Name: name, CodeName: name } as unknown as EntityFieldInfo;
}

function makeEntity(name: string): EntityInfo {
    const allFields = ['ID', 'Name'].map(makeField);
    return {
        Name: name,
        SchemaName: '__mj',
        BaseView: `vw${name}`,
        Fields: allFields,
        PrimaryKeys: [allFields[0]],
        FirstPrimaryKey: allFields[0],
        UserViewMaxRows: 1000,
        FieldByName: (n: string) => allFields.find(f => f.Name.toLowerCase() === n.trim().toLowerCase()),
        DatetimeFields: [],
        // RLS is not under test — no row filter.
        GetEffectiveRowFilterWhereClause: () => '',
    } as unknown as EntityInfo;
}

const countQueries = (executed: string[]) => executed.filter(sql => /COUNT\(\*\)|TotalRowCount/i.test(sql));

describe('InternalRunView — full-page fallback COUNT and SkipTotalRowCount', () => {
    let provider: CountProbeProvider;

    beforeEach(() => {
        provider = new CountProbeProvider();
        provider.registerEntity(makeEntity('Widgets'));
    });

    it('a MaxRows:1 HIT runs the fallback COUNT by default — the behaviour hot lookups pay for', async () => {
        provider.dataRows = [{ ID: 'r1', Name: 'w' }];
        const result = await provider.testRunView({ EntityName: 'Widgets', MaxRows: 1, ResultType: 'simple' });
        expect(result.Success).toBe(true);
        expect(countQueries(provider.executed)).toHaveLength(1);
        // And the count is what makes TotalRowCount load-bearing on capped reads.
        expect(result.TotalRowCount).toBe(47);
    });

    it('SkipTotalRowCount: true skips the fallback COUNT on a MaxRows:1 hit and reports the returned rows', async () => {
        provider.dataRows = [{ ID: 'r1', Name: 'w' }];
        const result = await provider.testRunView({ EntityName: 'Widgets', MaxRows: 1, ResultType: 'simple', SkipTotalRowCount: true });
        expect(result.Success).toBe(true);
        expect(countQueries(provider.executed)).toHaveLength(0);
        expect(result.Results).toHaveLength(1);
        expect(result.TotalRowCount).toBe(1);
    });

    it('a MISS never counted and still does not — the flag changes nothing on an empty page', async () => {
        provider.dataRows = [];
        const result = await provider.testRunView({ EntityName: 'Widgets', MaxRows: 1, ResultType: 'simple', SkipTotalRowCount: true });
        expect(result.Success).toBe(true);
        expect(countQueries(provider.executed)).toHaveLength(0);
        expect(result.TotalRowCount).toBe(0);
    });

    it('count_only ignores the flag — that result IS the count', async () => {
        provider.dataRows = [];
        const result = await provider.testRunView({ EntityName: 'Widgets', ResultType: 'count_only', SkipTotalRowCount: true });
        expect(result.Success).toBe(true);
        expect(countQueries(provider.executed)).toHaveLength(1);
        expect(result.TotalRowCount).toBe(47);
    });

    it('a full multi-row page still counts by default — paginated "1-100 of N" callers unchanged', async () => {
        provider.dataRows = [{ ID: 'r1', Name: 'a' }, { ID: 'r2', Name: 'b' }];
        const result = await provider.testRunView({ EntityName: 'Widgets', MaxRows: 2, ResultType: 'simple' });
        expect(result.Success).toBe(true);
        expect(countQueries(provider.executed)).toHaveLength(1);
        expect(result.TotalRowCount).toBe(47);
    });
});
