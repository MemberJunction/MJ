/**
 * Field-level security on the clauses a RunView actually runs.
 *
 * The provider's pre-cache gate checks the request's own clauses. These tests run the real
 * `InternalRunView` (no pre-cache gate in the path) and pin that the clauses it builds and runs are
 * checked there too: a caller's clauses on a request the pre-cache gate could not resolve, a saved
 * view's stored WhereClause (CustomWhereClause views included), a user-search term spliced in as
 * SQL. They also pin that a restricted caller cannot tell a denied column from a missing one: the
 * database's "no such column" rejection, and an aggregate refused for naming an unknown column,
 * both become the same field-security error a denied column gets.
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
import {
    CompositeKey,
    FieldSecurityDenialMessage,
    FieldSecurityError,
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
import type { DatabasePlatform } from '@memberjunction/sql-dialect';

const ENTITY_NAME = 'Widgets';
const ENTITY_ID = 'ENT-Widgets';

/** Records every statement; throws `failWith` instead of answering when it is set. */
class ClauseTestProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    public readonly ExecutedSQL: string[] = [];
    public FailWith: Error | null = null;

    constructor(private readonly platform: DatabasePlatform, private readonly testEntities: EntityInfo[]) {
        super();
    }

    public override get PlatformKey(): DatabasePlatform { return this.platform; }
    public override get Entities(): EntityInfo[] { return this.testEntities; }
    public override EntityByName(name: string): EntityInfo | undefined {
        return this.testEntities.find((e) => e.Name.toLowerCase() === name?.toLowerCase());
    }
    public override EntityByID(id: string): EntityInfo | undefined {
        return this.testEntities.find((e) => e.ID === id);
    }

    public override async ExecuteSQL<T>(sql: string): Promise<Array<T>> {
        this.ExecutedSQL.push(sql);
        if (this.FailWith) throw this.FailWith;
        return [];
    }

    public RunViewAs(params: RunViewParams, user: UserInfo): Promise<RunViewResult> {
        return this.InternalRunView(params, user);
    }

    public QuoteIdentifier(name: string): string {
        return this.platform === 'postgresql' ? `"${name}"` : `[${name}]`;
    }
    public QuoteSchemaAndView(schema: string, obj: string): string {
        return `${this.QuoteIdentifier(schema)}.${this.QuoteIdentifier(obj)}`;
    }

    protected get UUIDFunctionPattern(): RegExp { return ClauseTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return ClauseTestProvider._defaultPattern; }
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
    public get InstanceConnectionString(): string { return 'clause-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    public get LocalStorageProvider(): ILocalStorageProvider {
        return { GetItem: async () => null, SetItem: async () => {}, Remove: async () => {} } as unknown as ILocalStorageProvider;
    }
    protected get Metadata(): IMetadataProvider { return this as unknown as IMetadataProvider; }
}

/** `Widgets`, readable, with `deniedFields` denied to every caller; `Code` is user-searched with a format that splices the term unquoted. */
function widgetsEntity(deniedFields: string[] = []): EntityInfo {
    const fields = ['ID', 'Name', 'Sequence', 'BankAccount', 'Code'].map((name) => ({
        Name: name,
        CodeName: name,
        IncludeInUserSearchAPI: name === 'Code',
        UserSearchParamFormatAPI: name === 'Code' ? ' = {0}' : null,
    }));
    const id = fields[0];
    return {
        ID: ENTITY_ID,
        Name: ENTITY_NAME,
        CodeName: ENTITY_NAME,
        SchemaName: '__mj',
        BaseView: 'vwWidgets',
        Fields: fields,
        PrimaryKeys: [id],
        FirstPrimaryKey: id,
        FieldByName: (n: string) => fields.find((f) => f.Name.toLowerCase() === n.trim().toLowerCase()),
        DatetimeFields: [],
        ExternalDataSourceID: null,
        UserViewMaxRows: 0,
        EnableFieldLevelSecurity: deniedFields.length > 0,
        FieldLevelSecurityApplies: deniedFields.length > 0,
        GetDeniedReadFields: () => new Set(deniedFields.map((f) => f.toLowerCase())),
        HasBinaryFields: false,
        HasSearchFields: true,
        GetUserPermisions: () => ({ CanRead: true }),
        GetEffectiveRowFilterWhereClause: () => '',
    } as unknown as EntityInfo;
}

const user = new UserInfo(null as unknown as IMetadataProvider, { ID: 'U1', Email: 'u1@example.com' });

/** The error `run` rejects with, or null when it resolves. */
async function rejection(run: () => Promise<unknown>): Promise<Error | null> {
    try {
        await run();
        return null;
    } catch (e: unknown) {
        return e instanceof Error ? e : new Error(String(e));
    }
}

describe('InternalRunView checks the clauses it runs', () => {
    it('refuses a caller filter on a denied column before any SQL runs', async () => {
        const provider = new ClauseTestProvider('sqlserver', [widgetsEntity(['BankAccount'])]);
        const error = await rejection(() => provider.RunViewAs({ EntityName: ENTITY_NAME, ExtraFilter: "BankAccount LIKE '1%'" }, user));
        expect(error?.name).toBe(FieldSecurityError.ErrorName);
        expect(error?.message).toBe(FieldSecurityDenialMessage('BankAccount', ENTITY_NAME));
        expect(provider.ExecutedSQL).toEqual([]);
    });

    it('refuses an OverrideExcludeFilter on a denied column', async () => {
        const provider = new ClauseTestProvider('sqlserver', [widgetsEntity(['BankAccount'])]);
        const error = await rejection(() => provider.RunViewAs({ EntityName: ENTITY_NAME, OverrideExcludeFilter: 'BankAccount > 1' }, user));
        expect(error?.name).toBe(FieldSecurityError.ErrorName);
        expect(provider.ExecutedSQL).toEqual([]);
    });

    it("refuses a saved view's stored WhereClause on a denied column, CustomWhereClause views included", async () => {
        const widgets = widgetsEntity(['BankAccount']);
        const provider = new ClauseTestProvider('sqlserver', [widgets]);
        const view = {
            ID: 'V1', Name: 'Saved', EntityID: ENTITY_ID, ViewEntityInfo: widgets, Columns: [],
            WhereClause: '[BankAccount] > 1', CustomWhereClause: true, OrderByClause: null,
        };
        const error = await rejection(() => provider.RunViewAs({ ViewEntity: view } as unknown as RunViewParams, user));
        expect(error?.name).toBe(FieldSecurityError.ErrorName);
        expect(provider.ExecutedSQL).toEqual([]);
    });

    it('refuses a whole-row construct in the filter for a caller denied a column', async () => {
        const provider = new ClauseTestProvider('sqlserver', [widgetsEntity(['BankAccount'])]);
        const error = await rejection(() => provider.RunViewAs({ EntityName: ENTITY_NAME, ExtraFilter: 'CHECKSUM(*) = 1' }, user));
        expect(error?.name).toBe(FieldSecurityError.ErrorName);
        expect(provider.ExecutedSQL).toEqual([]);
    });

    it('refuses a user-search term spliced in unquoted that names a denied column', async () => {
        const provider = new ClauseTestProvider('sqlserver', [widgetsEntity(['BankAccount'])]);
        const error = await rejection(() => provider.RunViewAs({ EntityName: ENTITY_NAME, UserSearchString: 'BankAccount' }, user));
        expect(error?.name).toBe(FieldSecurityError.ErrorName);
        expect(provider.ExecutedSQL).toEqual([]);
    });

    it('runs the same requests for a caller denied nothing', async () => {
        const provider = new ClauseTestProvider('sqlserver', [widgetsEntity()]);
        const result = await provider.RunViewAs({ EntityName: ENTITY_NAME, ExtraFilter: "BankAccount LIKE '1%' AND CHECKSUM(*) <> 0" }, user);
        expect(result.Success).toBe(true);
        expect(provider.ExecutedSQL.length).toBeGreaterThan(0);
    });
});

describe('a denied column and a missing column give a restricted caller the same answer', () => {
    it('SQL Server: turns "Invalid column name" into the error a denied column gets', async () => {
        const provider = new ClauseTestProvider('sqlserver', [widgetsEntity(['BankAccount'])]);
        provider.FailWith = new Error("Invalid column name 'BankAcount'.");

        const missing = await rejection(() => provider.RunViewAs({ EntityName: ENTITY_NAME, ExtraFilter: "BankAcount LIKE '1%'" }, user));
        const denied = await rejection(() => provider.RunViewAs({ EntityName: ENTITY_NAME, ExtraFilter: "BankAccount LIKE '1%'" }, user));

        expect(missing?.name).toBe(FieldSecurityError.ErrorName);
        expect(missing?.message).toBe(FieldSecurityDenialMessage('BankAcount', ENTITY_NAME));
        expect(denied?.message).toBe(FieldSecurityDenialMessage('BankAccount', ENTITY_NAME));
    });

    it('PostgreSQL: turns "column … does not exist" into the error a denied column gets, in the same case', async () => {
        // The PostgreSQL provider quotes a capitalized word before the database sees it, so an
        // unknown `BankAcount` comes back as "BankAcount"; a lower-case word stays lower case.
        const provider = new ClauseTestProvider('postgresql', [widgetsEntity(['BankAccount'])]);
        provider.FailWith = new Error('column "BankAcount" does not exist');

        const missing = await rejection(() => provider.RunViewAs({ EntityName: ENTITY_NAME, ExtraFilter: "BankAcount LIKE '1%'" }, user));
        const denied = await rejection(() => provider.RunViewAs({ EntityName: ENTITY_NAME, ExtraFilter: "BankAccount LIKE '1%'" }, user));

        expect(missing?.message).toBe(FieldSecurityDenialMessage('BankAcount', ENTITY_NAME));
        expect(denied?.message).toBe(FieldSecurityDenialMessage('BankAccount', ENTITY_NAME));

        provider.FailWith = new Error('column "bankacount" does not exist');
        const missingLower = await rejection(() => provider.RunViewAs({ EntityName: ENTITY_NAME, ExtraFilter: "bankacount LIKE '1%'" }, user));
        const deniedLower = await rejection(() => provider.RunViewAs({ EntityName: ENTITY_NAME, ExtraFilter: "bankaccount LIKE '1%'" }, user));
        expect(missingLower?.message).toBe(FieldSecurityDenialMessage('bankacount', ENTITY_NAME));
        expect(deniedLower?.message).toBe(FieldSecurityDenialMessage('bankaccount', ENTITY_NAME));
    });

    it('an aggregate over an unknown column is refused with the same error as one over a denied column', async () => {
        const provider = new ClauseTestProvider('sqlserver', [widgetsEntity(['BankAccount'])]);
        const missing = await rejection(() => provider.RunViewAs({ EntityName: ENTITY_NAME, Aggregates: [{ expression: 'MAX(BankAcount)' }] }, user));
        const denied = await rejection(() => provider.RunViewAs({ EntityName: ENTITY_NAME, Aggregates: [{ expression: 'MAX(BankAccount)' }] }, user));
        expect(missing?.message).toBe(FieldSecurityDenialMessage('BankAcount', ENTITY_NAME));
        expect(denied?.message).toBe(FieldSecurityDenialMessage('BankAccount', ENTITY_NAME));
    });

    it('leaves the database error and the per-aggregate error alone for a caller denied nothing', async () => {
        const provider = new ClauseTestProvider('sqlserver', [widgetsEntity()]);
        const aggregate = await provider.RunViewAs({ EntityName: ENTITY_NAME, Aggregates: [{ expression: 'MAX(BankAcount)' }] }, user);
        expect(aggregate.AggregateResults?.[0].error).toMatch(/not a column/);

        provider.FailWith = new Error("Invalid column name 'BankAcount'.");
        const result = await provider.RunViewAs({ EntityName: ENTITY_NAME, ExtraFilter: "BankAcount LIKE '1%'" }, user);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/Invalid column name/);
    });
});
