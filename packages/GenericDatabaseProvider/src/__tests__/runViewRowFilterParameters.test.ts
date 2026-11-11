/**
 * RunView binds the row-filter values as query parameters (#5713): every user runs the same SQL
 * text, so SQL Server compiles one plan per query shape instead of one per user. These tests run the
 * real view path with a fixture entity whose row filter binds `{{UserID}}` through the binder.
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

import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import type { SaveCoercedValue, SaveCallBinding, SaveSQLFragment } from '../saveTypes.js';
import { PostgreSQLDialect, SQLServerDialect, type DatabasePlatform, type SQLDialect } from '@memberjunction/sql-dialect';
import { NamedQueryParameter } from '../typedQueryParameter.js';
import type { RowFilterBoundParameter } from '../rowFilterParameters.js';
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
    type RowFilterParameterBinder,
    type RunQueryResult,
    type RunViewParams,
    type RunViewResult,
    type SaveSQLResult,
    type TransactionGroupBase,
} from '@memberjunction/core';

/** Runs the real view path over one entity fixture and records every statement it executes. */
class RowFilterTestProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*newid\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*getdate\s*\(\s*\)\s*$/i;

    /** Every statement `ExecuteSQL` received, with its parameters, in order. */
    public readonly Executed: Array<{ SQL: string; Parameters: unknown[] | undefined }> = [];
    /** Every shared-parameter batch, in order. */
    public readonly Batches: Array<{ Queries: string[]; Parameters: RowFilterBoundParameter[] }> = [];

    constructor(private readonly testEntities: EntityInfo[], private readonly dialect: SQLDialect | null, private readonly platform: DatabasePlatform = 'sqlserver') {
        super();
    }

    protected override getDialect(): SQLDialect | null { return this.dialect; }

    protected override async ExecuteSQLBatchWithSharedParameters(queries: string[], parameters: RowFilterBoundParameter[]): Promise<Record<string, unknown>[][]> {
        this.Batches.push({ Queries: queries, Parameters: parameters });
        return queries.map(() => []);
    }

    public override get PlatformKey(): DatabasePlatform { return this.platform; }
    public override get Entities(): EntityInfo[] { return this.testEntities; }

    public override async ExecuteSQL<T>(sql: string, parameters?: unknown[]): Promise<Array<T>> {
        this.Executed.push({ SQL: sql, Parameters: parameters });
        return [];
    }

    public RunViewAs(params: RunViewParams, user: UserInfo): Promise<RunViewResult> {
        return this.InternalRunView(params, user);
    }

    public RunViewWithCountExecutor(params: RunViewParams, user: UserInfo): Promise<RunViewResult> {
        return this.RunViewCore(params, user, async () => [{ TotalRowCount: 0 }]);
    }

    protected get UUIDFunctionPattern(): RegExp { return RowFilterTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return RowFilterTestProvider._defaultPattern; }
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
    protected ProjectSaveCallToDatestamps(): SaveSQLFragment { throw new Error('Not supported in this test double'); }
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
    public get InstanceConnectionString(): string { return 'containment-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    public get LocalStorageProvider(): ILocalStorageProvider {
        return { GetItem: async () => null, SetItem: async () => {}, Remove: async () => {} } as unknown as ILocalStorageProvider;
    }
    protected get Metadata(): IMetadataProvider { return this as unknown as IMetadataProvider; }
}

/** An entity whose read filter is `OwnerID = '{{UserID}}'`, in both forms the provider can ask for. */
function ownedEntity(): EntityInfo {
    const id = { Name: 'ID', CodeName: 'ID' };
    return {
        ID: 'ENT-NOTES',
        Name: 'Notes',
        SchemaName: '__mj',
        BaseView: 'vwNotes',
        Fields: [id],
        PrimaryKeys: [id],
        FirstPrimaryKey: id,
        FieldByName: (n: string) => (n.trim().toLowerCase() === 'id' ? id : undefined),
        DatetimeFields: [],
        ExternalDataSourceID: null,
        UserViewMaxRows: 0,
        EnableFieldLevelSecurity: false,
        AuditViewRuns: false,
        GetUserPermisions: () => ({ CanRead: true }),
        GetEffectiveRowFilterWhereClause: (u: UserInfo, _type: unknown, _prefix: string, binder?: RowFilterParameterBinder) =>
            `OwnerID = ${binder?.Bind('UserID', u.ID) ?? `'${u.ID}'`}`,
    } as unknown as EntityInfo;
}

const userNamed = (id: string) => new UserInfo(null as unknown as IMetadataProvider, { ID: id, Email: `${id}@example.com` });

describe('RunView binds row-filter values as parameters (#5713)', () => {
    it('runs the same SQL text for two users, with each user\'s value bound (SQL Server placeholders)', async () => {
        const provider = new RowFilterTestProvider([ownedEntity()], new SQLServerDialect());

        await provider.RunViewAs({ EntityName: 'Notes' }, userNamed('user-a'));
        await provider.RunViewAs({ EntityName: 'Notes' }, userNamed('user-b'));

        const [a, b] = provider.Executed;
        expect(a.SQL).toBe('SELECT * FROM [__mj].[vwNotes] WHERE (OwnerID = @p0)');
        expect(b.SQL).toBe(a.SQL);
        expect(a.Parameters).toEqual([new NamedQueryParameter('p0', 'user-a')]);
        expect(b.Parameters).toEqual([new NamedQueryParameter('p0', 'user-b')]);
    });

    it('uses $n placeholders on PostgreSQL', async () => {
        const provider = new RowFilterTestProvider([ownedEntity()], new PostgreSQLDialect(), 'postgresql');

        await provider.RunViewAs({ EntityName: 'Notes' }, userNamed('user-a'));

        expect(provider.Executed[0].SQL).toContain('WHERE (OwnerID = $1)');
        expect(provider.Executed[0].Parameters).toEqual([new NamedQueryParameter('$1', 'user-a')]);
    });

    it('sends the data and count statements of a paged read as one batch sharing the parameters', async () => {
        const provider = new RowFilterTestProvider([ownedEntity()], new SQLServerDialect());

        await provider.RunViewAs({ EntityName: 'Notes', MaxRows: 10, StartRow: 0 }, userNamed('user-a'));

        expect(provider.Executed).toEqual([]);
        expect(provider.Batches).toHaveLength(1);
        const [batch] = provider.Batches;
        expect(batch.Queries).toHaveLength(2);
        for (const query of batch.Queries) {
            expect(query).toContain('(OwnerID = @p0)');
        }
        expect(batch.Parameters).toEqual([new NamedQueryParameter('p0', 'user-a')]);
    });

    it('keeps the row-filter value literal when the ExtraFilter binds its own parameters', async () => {
        const provider = new RowFilterTestProvider([ownedEntity()], new SQLServerDialect());

        await provider.RunViewAs({ EntityName: 'Notes', ExtraFilter: 'Status = @Status', Parameters: { Status: 'Open' } }, userNamed('user-a'));

        const [run] = provider.Executed;
        expect(run.SQL).toContain('Status = @p0');
        expect(run.SQL).toContain("(OwnerID = 'user-a')");
        expect(run.Parameters).toEqual([new NamedQueryParameter('p0', 'Open')]);
    });

    it('keeps the literal clause when the provider has no binder', async () => {
        const provider = new RowFilterTestProvider([ownedEntity()], null);

        await provider.RunViewAs({ EntityName: 'Notes' }, userNamed('user-a'));

        expect(provider.Executed[0]).toEqual({ SQL: "SELECT * FROM [__mj].[vwNotes] WHERE (OwnerID = 'user-a')", Parameters: undefined });
    });

    it('keeps the literal clause on the coalesced count path, whose UNION ALL carries no parameters', async () => {
        const entity = ownedEntity();
        const rowFilter = vi.fn(entity.GetEffectiveRowFilterWhereClause.bind(entity));
        Object.assign(entity, { GetEffectiveRowFilterWhereClause: rowFilter });
        const provider = new RowFilterTestProvider([entity], new SQLServerDialect());

        const result = await provider.RunViewWithCountExecutor({ EntityName: 'Notes', ResultType: 'count_only' }, userNamed('user-a'));

        expect(result.Success).toBe(true);
        expect(rowFilter).toHaveBeenCalled();
        for (const call of rowFilter.mock.calls) {
            expect(call[3]).toBeUndefined();
        }
    });
});
