import { describe, expect, it, vi } from 'vitest';

vi.mock('sql-formatter', () => ({ format: (sql: string) => sql }));
vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: {
        get Instance() {
            return { Config: vi.fn(), Encrypt: vi.fn(), IsEncrypted: vi.fn().mockReturnValue(false), GetKeyByID: vi.fn() };
        },
    },
}));

import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import { IsCoalescibleCountBatch } from '../countOnlyBatch.js';
import { NamedQueryParameter } from '../typedQueryParameter.js';
import type { SaveCoercedValue, SaveCallBinding, SaveSQLFragment } from '../saveTypes.js';
import { GetDialect, type SQLDialect } from '@memberjunction/sql-dialect';
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
    type RunViewParameters,
    type RunViewParams,
    type RunViewResult,
    type SaveSQLResult,
    type TransactionGroupBase,
} from '@memberjunction/core';

const ENTITY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADA = new UserInfo(null as unknown as IMetadataProvider, {
    ID: '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    Email: 'ada@example.com',
    Name: 'Ada',
});

class ParameterizedRunViewTestProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    public readonly ExecutedCalls: Array<{ sql: string; parameters?: unknown }> = [];
    public readonly ExecutedBatchCalls: Array<{ queries: string[]; parameters?: unknown[][] }> = [];

    constructor(
        private readonly testEntities: EntityInfo[],
        private readonly testDialect: SQLDialect = GetDialect('sqlserver'),
    ) {
        super();
    }

    public override get Dialect(): SQLDialect {
        return this.testDialect;
    }
    protected override getDialect(): SQLDialect {
        return this.testDialect;
    }
    public override get Entities(): EntityInfo[] {
        return this.testEntities;
    }
    public override async ExecuteSQL<T>(sql: string, parameters?: unknown): Promise<Array<T>> {
        this.ExecutedCalls.push({ sql, parameters });
        return [];
    }
    public override async ExecuteSQLBatch(queries: string[], parameters?: unknown[][]): Promise<unknown[][]> {
        this.ExecutedBatchCalls.push({ queries, parameters });
        return queries.map(() => []);
    }
    public BindFilter(
        extraFilter: string,
        parameters: RunViewParameters | undefined,
        queryParameters?: NamedQueryParameter[],
    ): string {
        return this.BindExtraFilterParameters(extraFilter, parameters, queryParameters);
    }
    public Run(params: RunViewParams, user: UserInfo): Promise<RunViewResult> {
        return this.InternalRunView(params, user);
    }

    protected get UUIDFunctionPattern(): RegExp {
        return ParameterizedRunViewTestProvider._uuidPattern;
    }
    protected get DBDefaultFunctionPattern(): RegExp {
        return ParameterizedRunViewTestProvider._defaultPattern;
    }
    public QuoteIdentifier(name: string): string {
        return this.testDialect.QuoteIdentifier(name);
    }
    public QuoteSchemaAndView(schema: string, obj: string): string {
        return this.testDialect.QuoteSchema(schema, obj);
    }
    protected BuildChildDiscoverySQL(): string {
        return '';
    }
    protected BuildHardLinkDependencySQL(): string {
        return '';
    }
    protected BuildSoftLinkDependencySQL(): string {
        return '';
    }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> {
        return { fullSQL: '' };
    }
    protected GenerateDeleteSQL(): DeleteSQLResult {
        return { fullSQL: '' };
    }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null {
        return null;
    }
    protected BuildSiblingRecordChangeSQL(): string {
        return '';
    }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string {
        return `OFFSET ${startRow} ROWS FETCH NEXT ${maxRows} ROWS ONLY`;
    }
    protected CoerceSaveFieldValue(): SaveCoercedValue {
        throw new Error('Not supported in this test double');
    }
    protected RenderSaveCallBinding(): SaveCallBinding {
        throw new Error('Not supported in this test double');
    }
    protected WrapSaveCallForResult(): SaveSQLFragment {
        throw new Error('Not supported in this test double');
    }
    protected WrapSaveCallWithRecordChange(): SaveSQLFragment {
        throw new Error('Not supported in this test double');
    }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}
    protected get AllowRefresh(): boolean {
        return false;
    }
    public get ProviderType(): ProviderType {
        return 'Database';
    }
    public get DatabaseConnection(): object {
        return {};
    }
    protected async InternalGetEntityRecordName(): Promise<string> {
        return '';
    }
    protected async InternalGetEntityRecordNames(): Promise<EntityRecordNameResult[]> {
        return [];
    }
    public async GetRecordFavoriteStatus(): Promise<boolean> {
        return false;
    }
    public async SetRecordFavoriteStatus(): Promise<void> {}
    protected async InternalRunQuery(): Promise<RunQueryResult> {
        return { Success: true, Results: [] } as unknown as RunQueryResult;
    }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> {
        return [];
    }
    protected async InternalExecuteQueryFromSpec(_spec: QueryExecutionSpec, _user?: UserInfo): Promise<RunQueryResult> {
        throw new Error('Not supported');
    }
    protected async GetCurrentUser(): Promise<UserInfo> {
        return ADA;
    }
    public async GetRecordDependencies(): Promise<
        { EntityName: string; RelatedEntityName: string; FieldName: string; PrimaryKey: CompositeKey }[]
    > {
        return [];
    }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> {
        return {} as PotentialDuplicateResponse;
    }
    public async MergeRecords(): Promise<RecordMergeResult> {
        return {} as RecordMergeResult;
    }
    public async GetDatasetByName(): Promise<DatasetResultType> {
        return {} as DatasetResultType;
    }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> {
        return {} as DatasetStatusResultType;
    }
    public get InstanceConnectionString(): string {
        return 'parameterized-runview-test';
    }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> {
        return {} as TransactionGroupBase;
    }
    public get LocalStorageProvider(): ILocalStorageProvider {
        return { GetItem: async () => null, SetItem: async () => {}, Remove: async () => {} } as unknown as ILocalStorageProvider;
    }
    protected get Metadata(): IMetadataProvider {
        return this as unknown as IMetadataProvider;
    }
}

function makeMembersEntity(): EntityInfo {
    const fields = ['ID', 'Name', 'Status', 'IsActive', 'Score'].map((name) => ({ Name: name, CodeName: name }));
    return {
        ID: ENTITY_ID,
        Name: 'Members',
        SchemaName: '__mj',
        BaseView: 'vwMembers',
        BaseTable: 'Member',
        UserViewMaxRows: 0,
        AuditViewRuns: false,
        IncludeInAPI: true,
        AllowAllRowsAPI: true,
        TrackRecordChanges: false,
        EnableFieldLevelSecurity: false,
        FieldLevelSecurityApplies: false,
        HasBinaryFields: false,
        Fields: fields,
        EncryptedFields: [],
        DatetimeFields: [],
        ExternalDataSourceID: null,
        PrimaryKeys: [fields[0]],
        FirstPrimaryKey: fields[0],
        FieldByName: (n: string) => fields.find((f) => f.Name.toLowerCase() === n.trim().toLowerCase()),
        Permissions: [],
        CheckPermissions: () => true,
        GetUserPermisions: () => ({ CanRead: true }),
        GetEffectiveRowFilterWhereClause: () => '',
        GetUserRowLevelSecurityWhereClause: () => '',
        GetDeniedReadFields: () => new Set<string>(),
    } as unknown as EntityInfo;
}

describe('GenericDatabaseProvider parameterized RunView (BindExtraFilterParameters & InternalRunView)', () => {
    it('binds scalars and expands non-empty arrays on SQL Server (@p0, @p1, ...)', () => {
        const provider = new ParameterizedRunViewTestProvider([makeMembersEntity()], GetDialect('sqlserver'));
        const bound: NamedQueryParameter[] = [];
        const sql = provider.BindFilter(
            'Status = @status AND IsActive = @active AND ID IN (@ids) AND Status <> @status',
            {
                status: 'Active',
                '@active': true,
                ids: ['id-1', 'id-2'],
            },
            bound,
        );

        expect(sql).toBe('Status = @p0 AND IsActive = @p1 AND ID IN (@p2, @p3) AND Status <> @p0');
        expect(bound).toEqual([
            new NamedQueryParameter('p0', 'Active'),
            new NamedQueryParameter('p1', 1),
            new NamedQueryParameter('p2', 'id-1'),
            new NamedQueryParameter('p3', 'id-2'),
        ]);
    });

    it('binds scalars and expands non-empty arrays on PostgreSQL ($1, $2, ...)', () => {
        const provider = new ParameterizedRunViewTestProvider([makeMembersEntity()], GetDialect('postgresql'));
        const bound: NamedQueryParameter[] = [];
        const sql = provider.BindFilter(
            'Status = @status AND IsActive = @active AND ID IN (@ids) AND Status <> @status',
            {
                status: 'Active',
                active: false,
                ids: [10, 20],
            },
            bound,
        );

        expect(sql).toBe('Status = $1 AND IsActive = $2 AND ID IN ($3, $4) AND Status <> $1');
        expect(bound).toEqual([
            new NamedQueryParameter('$1', 'Active'),
            new NamedQueryParameter('$2', false),
            new NamedQueryParameter('$3', 10),
            new NamedQueryParameter('$4', 20),
        ]);
    });

    it('never rewrites @tokens inside string literals, comments, quoted identifiers, or @@system variables', () => {
        for (const platform of ['sqlserver', 'postgresql'] as const) {
            const provider = new ParameterizedRunViewTestProvider([makeMembersEntity()], GetDialect(platform));
            const bound: NamedQueryParameter[] = [];
            const clause =
                "Email = 'user@ignoreMe.com' /* @inBlock */ AND [@inBracket] = @realParam AND \"@inQuote\" = @@ROWCOUNT -- @inLine";
            const sql = provider.BindFilter(clause, { realParam: 'bound-val' }, bound);
            const expectedPlaceholder = platform === 'sqlserver' ? '@p0' : '$1';
            const expectedParamName = platform === 'sqlserver' ? 'p0' : '$1';

            expect(sql).toBe(
                `Email = 'user@ignoreMe.com' /* @inBlock */ AND [@inBracket] = ${expectedPlaceholder} AND "@inQuote" = @@ROWCOUNT -- @inLine`,
            );
            expect(bound).toEqual([new NamedQueryParameter(expectedParamName, 'bound-val')]);
        }
    });

    it('rejects missing parameters, empty arrays, invalid parameter names, and non-finite numbers', () => {
        const provider = new ParameterizedRunViewTestProvider([makeMembersEntity()], GetDialect('sqlserver'));

        expect(() => provider.BindFilter('Status = @missing', {}, [])).toThrow(
            /references parameter '@missing', but no value was provided/,
        );
        expect(() => provider.BindFilter('ID IN (@ids)', { ids: [] }, [])).toThrow(
            /parameter '@ids' cannot be an empty array/,
        );
        expect(() => provider.BindFilter('Status = @ok', { '123bad': 'x', ok: 'y' }, [])).toThrow(
            /Invalid RunView parameter name '123bad'/,
        );
        expect(() => provider.BindFilter('Score = @score', { score: Number.NaN }, [])).toThrow(
            /numeric parameter values must be finite numbers/,
        );
        expect(() => provider.BindFilter('Status = @status', { status: 'Active', '@status': 'Pending' }, [])).toThrow(
            /Duplicate RunView parameter name '@status'/,
        );
    });

    it('threads bound parameters through InternalRunView to ExecuteSQL and returns ErrorMessage on missing parameter', async () => {
        const provider = new ParameterizedRunViewTestProvider([makeMembersEntity()], GetDialect('sqlserver'));
        const okResult = await provider.Run(
            {
                EntityName: 'Members',
                ExtraFilter: "Status = @status AND Name <> 'literal@notaparam'",
                Parameters: { status: "O'Reilly'; DROP TABLE Members;--" },
            },
            ADA,
        );

        expect(okResult.Success).toBe(true);
        expect(provider.ExecutedCalls).toHaveLength(1);
        expect(provider.ExecutedCalls[0].sql).toContain("Status = @p0 AND Name <> 'literal@notaparam'");
        expect(provider.ExecutedCalls[0].sql).not.toContain('DROP TABLE');
        expect(provider.ExecutedCalls[0].parameters).toEqual([
            new NamedQueryParameter('p0', "O'Reilly'; DROP TABLE Members;--"),
        ]);

        const badResult = await provider.Run(
            {
                EntityName: 'Members',
                ExtraFilter: 'Status = @missingParam',
            },
            ADA,
        );
        expect(badResult.Success).toBe(false);
        expect(badResult.ErrorMessage).toMatch(/references parameter '@missingParam'/);
    });

    it('excludes parameterized count_only requests from IsCoalescibleCountBatch', () => {
        const entity = makeMembersEntity();
        const resolveEntity = () => entity;

        expect(
            IsCoalescibleCountBatch(
                [
                    { EntityName: 'Members', ResultType: 'count_only', ExtraFilter: "Status = 'Active'" },
                    { EntityName: 'Members', ResultType: 'count_only', ExtraFilter: "Status = 'Pending'" },
                ],
                resolveEntity,
            ),
        ).toBe(true);

        expect(
            IsCoalescibleCountBatch(
                [
                    {
                        EntityName: 'Members',
                        ResultType: 'count_only',
                        ExtraFilter: 'Status = @s',
                        Parameters: { s: 'Active' },
                    },
                    { EntityName: 'Members', ResultType: 'count_only', ExtraFilter: "Status = 'Pending'" },
                ],
                resolveEntity,
            ),
        ).toBe(false);
    });
});
