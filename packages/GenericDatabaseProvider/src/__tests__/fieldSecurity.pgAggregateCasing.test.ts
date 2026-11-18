/**
 * On PostgreSQL, an aggregate refused for naming a column the entity does not have reports that
 * column the way a denied column's refusal reports it: as typed when MJ quotes the word before
 * the database sees it (a capitalized word), folded to lower case when it does not.
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

describe('PostgreSQL aggregates: an unknown column is reported as a denied one is', () => {
    it('a capitalized name is reported as typed, as the denied column is', async () => {
        const provider = new ClauseTestProvider('postgresql', [widgetsEntity(['BankAccount'])]);
        const missing = await rejection(() => provider.RunViewAs({ EntityName: ENTITY_NAME, Aggregates: [{ expression: 'MAX(BankAcount)' }] }, user));
        const denied = await rejection(() => provider.RunViewAs({ EntityName: ENTITY_NAME, Aggregates: [{ expression: 'MAX(BankAccount)' }] }, user));
        expect(missing?.message).toBe(FieldSecurityDenialMessage('BankAcount', ENTITY_NAME));
        expect(denied?.message).toBe(FieldSecurityDenialMessage('BankAccount', ENTITY_NAME));
    });

    it('a lower-case name is reported in lower case, as the denied column is', async () => {
        const provider = new ClauseTestProvider('postgresql', [widgetsEntity(['BankAccount'])]);
        const missing = await rejection(() => provider.RunViewAs({ EntityName: ENTITY_NAME, Aggregates: [{ expression: 'MAX(bankacount)' }] }, user));
        const denied = await rejection(() => provider.RunViewAs({ EntityName: ENTITY_NAME, Aggregates: [{ expression: 'MAX(bankaccount)' }] }, user));
        expect(missing?.message).toBe(FieldSecurityDenialMessage('bankacount', ENTITY_NAME));
        expect(denied?.message).toBe(FieldSecurityDenialMessage('bankaccount', ENTITY_NAME));
    });
});
