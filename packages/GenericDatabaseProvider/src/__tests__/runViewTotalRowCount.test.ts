/**
 * COUNT(*)-on-every-read coverage for GenericDatabaseProvider.InternalRunView.
 *
 * Why this file exists:
 *
 * A non-paginated RunView used to fire a second `SELECT COUNT(*)` whenever the result happened
 * to come back exactly at the row cap — a guess at "there may be more", paid for by every caller
 * that never looks at TotalRowCount. On a 1000-row-capped entity that is a full extra table scan
 * per read, on the sync hot path, for a number nobody consumes.
 *
 * The count is now issued only when it is actually needed: OFFSET pagination (which needs the
 * total to compute pages), `ResultType: 'count_only'`, or an explicit `ReturnTotalRowCount: true`.
 * These tests pin that, so the guess cannot quietly come back.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GenericDatabaseProvider } from '../GenericDatabaseProvider';
import {
    SaveSQLResult,
    DeleteSQLResult,
    EntityInfo,
    UserInfo,
    ProviderType,
    PotentialDuplicateResponse,
    DatasetResultType,
    DatasetStatusResultType,
    ILocalStorageProvider,
    IMetadataProvider,
    CompositeKey,
    RecordMergeResult,
    TransactionGroupBase,
    QueryExecutionSpec,
} from '@memberjunction/core';
import type { RunViewParams, RunViewResult, RunQueryResult } from '@memberjunction/core';

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

/** Provider that records every statement InternalRunView issues. */
class CountProbeProvider extends GenericDatabaseProvider {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    private _testEntities: EntityInfo[] = [];
    /** Every SQL string passed to ExecuteSQL, in order. */
    public ExecutedSQL: string[] = [];
    /** Rows the main SELECT returns. */
    public Rows: Record<string, unknown>[] = [];

    public registerEntity(entity: EntityInfo): void { this._testEntities.push(entity); }
    public override get Entities(): EntityInfo[] { return this._testEntities; }

    public async testRunView<T>(params: RunViewParams, user: UserInfo): Promise<RunViewResult<T>> {
        return (this as unknown as {
            InternalRunView: <R>(p: RunViewParams, u: UserInfo) => Promise<RunViewResult<R>>;
        }).InternalRunView<T>(params, user);
    }

    public override async ExecuteSQL<T>(sql: string): Promise<Array<T>> {
        this.ExecutedSQL.push(sql);
        if (/COUNT\(\*\)/i.test(sql)) return [{ TotalRowCount: 4242 } as unknown as T];
        return this.Rows as unknown as Array<T>;
    }

    // Permission checks are not what these tests are about.
    public override CheckUserReadPermissions(): void {}

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
    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(): Promise<{ EntityID: string; PrimaryKey: CompositeKey; RecordName: string }[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> {}
    protected async InternalRunQuery(): Promise<RunQueryResult> { return { Success: true, Results: [] }; }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return []; }
    protected async InternalExecuteQueryFromSpec(_s: QueryExecutionSpec, _u?: UserInfo): Promise<RunQueryResult> {
        throw new Error('Not supported');
    }
    protected async GetCurrentUser(): Promise<UserInfo> { return new UserInfo(null as unknown as IMetadataProvider, {}); }
    public async GetRecordDependencies(): Promise<{ EntityName: string; RelatedEntityName: string; FieldName: string; PrimaryKey: CompositeKey }[]> { return []; }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> {
        return { EntityName: '', PrimaryKey: new CompositeKey(), DuplicateRunDetailMatchRecords: [] } as unknown as PotentialDuplicateResponse;
    }
    public async MergeRecords(): Promise<RecordMergeResult> {
        return {} as unknown as RecordMergeResult;
    }
    public async GetDatasetByName(): Promise<DatasetResultType> { return {} as unknown as DatasetResultType; }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> { return {} as unknown as DatasetStatusResultType; }
    public get InstanceConnectionString(): string { return 'count-probe-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    public get LocalStorageProvider(): ILocalStorageProvider {
        return { GetItem: async () => null, SetItem: async () => {}, Remove: async () => {} } as ILocalStorageProvider;
    }
    protected get Metadata(): IMetadataProvider { return this as unknown as IMetadataProvider; }
}

function makeField(name: string) {
    return { Name: name, CodeName: name } as unknown as EntityInfo['Fields'][number];
}

function makeEntity(name: string, userViewMaxRows: number): EntityInfo {
    const allFields = ['ID', 'Name'].map(makeField);
    return {
        Name: name,
        SchemaName: '__mj',
        BaseView: 'vwProbe',
        Fields: allFields,
        PrimaryKeys: [allFields[0]],
        FirstPrimaryKey: allFields[0],
        UserViewMaxRows: userViewMaxRows,
        FieldByName: (n: string) => allFields.find(f => f.Name.toLowerCase() === n.trim().toLowerCase()),
        DatetimeFields: [],
        AllowAllRowsAPI: true,
        GetUserRowLevelSecurityWhereClause: () => '',
        // `next` routes RunView's RLS step through GetEffectiveRowFilterWhereClause, which
        // composes the role layer with API-key row filters; GetUserRowLevelSecurityWhereClause
        // is now deprecated as role-only. RunView calls the effective form, so the mock has to
        // answer it or every path under test throws before reaching the count decision.
        GetEffectiveRowFilterWhereClause: () => '',
    } as unknown as EntityInfo;
}

const MAX_ROWS = 3;
const user = { ID: 'user-1', Name: 'test' } as unknown as UserInfo;

describe('GenericDatabaseProvider — TotalRowCount is not paid for on every read (PR 2 item 6)', () => {
    let provider: CountProbeProvider;

    beforeEach(() => {
        provider = new CountProbeProvider();
        provider.registerEntity(makeEntity('Probe', MAX_ROWS));
        // A full page — the exact shape that used to trigger the speculative COUNT(*).
        provider.Rows = Array.from({ length: MAX_ROWS }, (_, i) => ({ ID: `id-${i}`, Name: `n${i}` }));
    });

    const countQueries = () => provider.ExecutedSQL.filter(s => /COUNT\(\*\)/i.test(s));

    it('issues NO count query for a plain read that fills the row cap', async () => {
        const result = await provider.testRunView({ EntityName: 'Probe' }, user);

        expect(result.Success).toBe(true);
        expect(countQueries()).toHaveLength(0);
        expect(provider.ExecutedSQL).toHaveLength(1); // the SELECT, and nothing else
    });

    it('issues NO count query for a MaxRows read that fills the row cap', async () => {
        await provider.testRunView({ EntityName: 'Probe', MaxRows: MAX_ROWS }, user);

        expect(countQueries()).toHaveLength(0);
    });

    it('DOES count when paginating — the total is what computes the page count', async () => {
        const result = await provider.testRunView({ EntityName: 'Probe', MaxRows: MAX_ROWS, StartRow: 0 }, user);

        expect(countQueries()).toHaveLength(1);
        expect(result.TotalRowCount).toBe(4242);
    });

    it('DOES count for ResultType count_only', async () => {
        await provider.testRunView({ EntityName: 'Probe', ResultType: 'count_only' }, user);

        expect(countQueries()).toHaveLength(1);
    });

    it('DOES count when the caller opts in with ReturnTotalRowCount', async () => {
        const result = await provider.testRunView({ EntityName: 'Probe', ReturnTotalRowCount: true }, user);

        expect(countQueries()).toHaveLength(1);
        expect(result.TotalRowCount).toBe(4242);
    });

    it('reports the rows it actually returned as the total when it did not count', async () => {
        const result = await provider.testRunView({ EntityName: 'Probe' }, user);

        // Not a lie about the table's size — it is the size of what was returned, and the caller
        // that needs the true total now says so explicitly.
        expect(result.Results).toHaveLength(MAX_ROWS);
        expect(result.TotalRowCount).toBe(MAX_ROWS);
    });
});
