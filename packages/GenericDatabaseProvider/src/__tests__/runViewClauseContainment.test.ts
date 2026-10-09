/**
 * The provider builds a view's WHERE clause by wrapping each piece in parentheses and ANDing them:
 * `(<view WhereClause>) AND (<ExtraFilter>) AND (<exclusion>) AND (<row-level security>)`. Row-level
 * security here also carries API-key row filters and widget-guest scope.
 *
 * A caller-supplied piece that closes a parenthesis it did not open, such as `1=1) OR (1=1`, turns
 * that into `(1=1) OR (1=1) AND (<rls>)`. AND binds tighter than OR, so row-level security would then
 * narrow only one side of an OR the caller controls. These tests run the real `RunViewCore` and the
 * real cache-check WHERE builder and pin that such a piece is refused before any SQL runs.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
import type { DatabasePlatform } from '@memberjunction/sql-dialect';
import {
    ClearAllDataHooks,
    CompositeKey,
    UserInfo,
    type BaseEntity,
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

const RLS_CLAUSE = "UserID = 'me'";

/** Runs the real view path over one entity fixture and records every statement it executes. */
class ContainmentTestProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*newid\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*getdate\s*\(\s*\)\s*$/i;

    /** Every SQL statement `ExecuteSQL` received, in order. */
    public readonly ExecutedSQL: string[] = [];

    constructor(private readonly testEntities: EntityInfo[], private readonly platform: DatabasePlatform = 'sqlserver') {
        super();
    }

    public override get PlatformKey(): DatabasePlatform { return this.platform; }
    public override get Entities(): EntityInfo[] { return this.testEntities; }

    public override async ExecuteSQL<T>(sql: string): Promise<Array<T>> {
        this.ExecutedSQL.push(sql);
        return [];
    }

    public RunViewAs(params: RunViewParams, user: UserInfo): Promise<RunViewResult> {
        return this.InternalRunView(params, user);
    }

    protected get UUIDFunctionPattern(): RegExp { return ContainmentTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return ContainmentTestProvider._defaultPattern; }
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
    public get InstanceConnectionString(): string { return 'containment-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    public get LocalStorageProvider(): ILocalStorageProvider {
        return { GetItem: async () => null, SetItem: async () => {}, Remove: async () => {} } as unknown as ILocalStorageProvider;
    }
    protected get Metadata(): IMetadataProvider { return this as unknown as IMetadataProvider; }
}

/** A readable entity whose rows are narrowed for the caller by row-level security. */
function rlsProtectedEntity(): EntityInfo {
    const id = { Name: 'ID', CodeName: 'ID' };
    return {
        ID: 'ENT-CONVERSATIONS',
        Name: 'Conversations',
        SchemaName: '__mj',
        BaseView: 'vwConversations',
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
        GetEffectiveRowFilterWhereClause: () => RLS_CLAUSE,
    } as unknown as EntityInfo;
}

/** A saved view over the fixture entity, carrying the given stored WhereClause. */
function savedView(entity: EntityInfo, whereClause: string, customWhereClause: boolean): BaseEntity {
    return {
        ID: 'VIEW-1',
        Name: 'My View',
        EntityID: entity.ID,
        WhereClause: whereClause,
        CustomWhereClause: customWhereClause,
        OrderByClause: '',
        Columns: [],
        ViewEntityInfo: entity,
    } as unknown as BaseEntity;
}

const user = () => new UserInfo(null as unknown as IMetadataProvider, { ID: 'U1', Email: 'u1@example.com' });

describe('GenericDatabaseProvider — a caller-supplied WHERE piece cannot close its parentheses', () => {
    beforeEach(() => ClearAllDataHooks());
    afterEach(() => ClearAllDataHooks());

    it('keeps a balanced ExtraFilter in its own parentheses, ANDed with row-level security', async () => {
        const provider = new ContainmentTestProvider([rlsProtectedEntity()]);

        const result = await provider.RunViewAs({ EntityName: 'Conversations', ExtraFilter: "Name = 'a' OR Name = 'b'" }, user());

        expect(result.Success).toBe(true);
        expect(provider.ExecutedSQL).toEqual([
            `SELECT * FROM [__mj].[vwConversations] WHERE (Name = 'a' OR Name = 'b') AND (${RLS_CLAUSE})`,
        ]);
    });

    it('refuses an ExtraFilter that closes the wrapper, and runs no SQL', async () => {
        const provider = new ContainmentTestProvider([rlsProtectedEntity()]);

        const result = await provider.RunViewAs({ EntityName: 'Conversations', ExtraFilter: '1=1) OR (1=1' }, user());

        expect(provider.ExecutedSQL).toEqual([]);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/ExtraFilter.*parenthesis/);
    });

    it('refuses an OverrideExcludeFilter that closes the exclusion wrapper, and runs no SQL', async () => {
        const provider = new ContainmentTestProvider([rlsProtectedEntity()]);

        const result = await provider.RunViewAs({
            EntityName: 'Conversations',
            ExcludeUserViewRunID: '00000000-0000-0000-0000-000000000001',
            OverrideExcludeFilter: '1=1)) OR ((1=1',
        }, user());

        expect(provider.ExecutedSQL).toEqual([]);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/OverrideExcludeFilter.*parenthesis/);
    });

    it.each([false, true])('refuses a stored view WhereClause that closes the wrapper (CustomWhereClause=%s)', async (custom) => {
        const entity = rlsProtectedEntity();
        const provider = new ContainmentTestProvider([entity]);

        const result = await provider.RunViewAs({ ViewEntity: savedView(entity, '1=1) OR (1=1', custom) }, user());

        expect(provider.ExecutedSQL).toEqual([]);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/WhereClause.*parenthesis/);
    });

    it('reads the piece with the provider\'s own SQL dialect', async () => {
        // A PostgreSQL escape string: balanced on PostgreSQL, an unterminated literal on SQL Server.
        const extraFilter = "Name = E'it\\'s'";
        const pg = new ContainmentTestProvider([rlsProtectedEntity()], 'postgresql');
        const sqlServer = new ContainmentTestProvider([rlsProtectedEntity()], 'sqlserver');

        const pgResult = await pg.RunViewAs({ EntityName: 'Conversations', ExtraFilter: extraFilter }, user());
        const sqlServerResult = await sqlServer.RunViewAs({ EntityName: 'Conversations', ExtraFilter: extraFilter }, user());

        expect(pgResult.Success).toBe(true);
        expect(pg.ExecutedSQL[0]).toContain(`WHERE (${extraFilter}) AND (${RLS_CLAUSE})`);
        expect(sqlServer.ExecutedSQL).toEqual([]);
        expect(sqlServerResult.Success).toBe(false);
        expect(sqlServerResult.ErrorMessage).toMatch(/unterminated/);
    });

    it('the cache-check WHERE builder refuses an ExtraFilter that closes the wrapper, and runs no SQL', async () => {
        const provider = new ContainmentTestProvider([rlsProtectedEntity()]);

        const statuses = await provider.GetRunViewsDatabaseStatus([{ EntityName: 'Conversations', ExtraFilter: '1=1) OR (1=1' }], user());

        expect(provider.ExecutedSQL).toEqual([]);
        expect(statuses[0].Success).toBe(false);
        expect(statuses[0].ErrorMessage).toMatch(/ExtraFilter.*parenthesis/);
    });

    it('the cache-check WHERE builder keeps a balanced ExtraFilter ANDed with row-level security', async () => {
        const provider = new ContainmentTestProvider([rlsProtectedEntity()]);

        const statuses = await provider.GetRunViewsDatabaseStatus([{ EntityName: 'Conversations', ExtraFilter: "Name = 'a' OR Name = 'b'" }], user());

        expect(statuses[0].Success).toBe(true);
        expect(provider.ExecutedSQL[0]).toContain(`WHERE (Name = 'a' OR Name = 'b') AND (${RLS_CLAUSE})`);
    });
});
