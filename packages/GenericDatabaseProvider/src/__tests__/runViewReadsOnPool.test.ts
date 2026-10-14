/**
 * RunViewParams.ReadOnPool: a background engine reload's view reads run on the pool, never on the
 * connection of a transaction another unit of work opened on the provider meanwhile. The real RunViewCore and
 * InternalRunViews run over entity fixtures; ExecuteSQL records the options each statement was issued with.
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
    EntityInfo,
    EntityUserPermissionInfo,
    UserInfo,
    type DatasetResultType,
    type DatasetStatusResultType,
    type DeleteSQLResult,
    type ExecuteSQLOptions,
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

/**
 * A provider that runs the real `InternalRunViews` and `RunViewCore` over entity fixtures, with
 * `ExecuteSQL` recorded. Every other abstract member is a no-op.
 */
class PoolReadTestProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    /** Every SQL statement `ExecuteSQL` received, in order, with the options it was given. */
    public readonly Executed: Array<{ SQL: string; Options: ExecuteSQLOptions | undefined }> = [];

    constructor(private readonly testEntities: EntityInfo[]) {
        super();
    }

    public override get Entities(): EntityInfo[] { return this.testEntities; }

    /** Answers with no rows; {@link poolReadProvider} replaces it with the recording spy every test uses. */
    public override async ExecuteSQL<T>(): Promise<Array<T>> {
        return [];
    }

    public RunViewsAs(params: RunViewParams[], user: UserInfo): Promise<RunViewResult[]> {
        return this.InternalRunViews(params, user);
    }

    protected get UUIDFunctionPattern(): RegExp { return PoolReadTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return PoolReadTestProvider._defaultPattern; }
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
    protected async InternalRunQuery(): Promise<RunQueryResult> { throw new Error('Not supported'); }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return []; }
    protected async InternalExecuteQueryFromSpec(_spec: QueryExecutionSpec, _user?: UserInfo): Promise<RunQueryResult> {
        throw new Error('Not supported');
    }
    protected async GetCurrentUser(): Promise<UserInfo> { return new UserInfo(); }
    public async GetRecordDependencies(): Promise<{ EntityName: string; RelatedEntityName: string; FieldName: string; PrimaryKey: CompositeKey }[]> { return []; }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> { return {} as PotentialDuplicateResponse; }
    public async MergeRecords(): Promise<RecordMergeResult> { return {} as RecordMergeResult; }
    public async GetDatasetByName(): Promise<DatasetResultType> { return {} as DatasetResultType; }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> { return {} as DatasetStatusResultType; }
    public get InstanceConnectionString(): string { return 'count-batch-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    public get LocalStorageProvider(): ILocalStorageProvider { throw new Error('Not supported in this test double'); }
    protected get Metadata(): IMetadataProvider { return this; }
}

/** An entity every user may read, with no row-level security. */
class ReadableEntityInfo extends EntityInfo {
    public override GetUserPermisions(user: UserInfo): EntityUserPermissionInfo {
        return Object.assign(new EntityUserPermissionInfo(), { Entity: this, User: user, CanCreate: false, CanRead: true, CanUpdate: false, CanDelete: false });
    }
    public override GetEffectiveRowFilterWhereClause(): string {
        return '';
    }
}

/** An entity the user may read, with no row-level security and no external data source. */
function readableEntity(name: string): EntityInfo {
    return new ReadableEntityInfo({
        ID: `ENT-${name}`,
        Name: name,
        SchemaName: '__mj',
        BaseView: `vw${name}`,
        Fields: [{ Name: 'ID', CodeName: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier', EntityID: `ENT-${name}`, Entity: name }],
        ExternalDataSourceID: null,
        UserViewMaxRows: 0,
        EnableFieldLevelSecurity: false,
    });
}

/**
 * A provider over `entities` whose `ExecuteSQL` records each statement and its options, and answers a count statement
 * with one count row per `UNION ALL` branch and a data statement with none. A spy, because `ExecuteSQL` is generic: the
 * spy's implementation returns plain rows where an override would have to produce a `T`.
 */
function poolReadProvider(entities: EntityInfo[]): PoolReadTestProvider {
    const provider = new PoolReadTestProvider(entities);
    vi.spyOn(provider, 'ExecuteSQL').mockImplementation(async (sql: string, _params?: unknown[], options?: ExecuteSQLOptions) => {
        provider.Executed.push({ SQL: sql, Options: options });
        return sql.includes('TotalRowCount') ? sql.split('\nUNION ALL\n').map((_, i) => ({ BatchIndex: i, TotalRowCount: 1 })) : [];
    });
    return provider;
}

describe('GenericDatabaseProvider.RunViewCore — RunViewParams.ReadOnPool', () => {
    const user = new UserInfo(undefined, { ID: 'U1', Email: 'u1@example.com' });

    it('issues every statement of a ReadOnPool view on the pool (ignoreAmbientTransaction)', async () => {
        const provider = poolReadProvider([readableEntity('A')]);
        await provider.RunViewsAs([{ EntityName: 'A', ResultType: 'simple', ReadOnPool: true }], user);
        expect(provider.Executed.length).toBeGreaterThan(0);
        expect(provider.Executed.every((e) => e.Options?.ignoreAmbientTransaction === true)).toBe(true);
    });

    it('leaves an ordinary view on the ambient transaction', async () => {
        const provider = poolReadProvider([readableEntity('A')]);
        await provider.RunViewsAs([{ EntityName: 'A', ResultType: 'simple' }], user);
        expect(provider.Executed.length).toBeGreaterThan(0);
        expect(provider.Executed.every((e) => e.Options?.ignoreAmbientTransaction !== true)).toBe(true);
    });

    it('keeps a count_only batch that mixes pool and ambient views on the per-view path, each on its own connection', async () => {
        const provider = poolReadProvider([readableEntity('A'), readableEntity('B')]);
        await provider.RunViewsAs([
            { EntityName: 'A', ResultType: 'count_only', ReadOnPool: true },
            { EntityName: 'B', ResultType: 'count_only' },
        ], user);
        expect(provider.Executed).toHaveLength(2);
        expect(provider.Executed.map((e) => e.Options?.ignoreAmbientTransaction === true).sort()).toEqual([false, true]);
    });

    it('runs an all-ReadOnPool count_only batch as one statement on the pool', async () => {
        const provider = poolReadProvider([readableEntity('A'), readableEntity('B')]);
        await provider.RunViewsAs([
            { EntityName: 'A', ResultType: 'count_only', ReadOnPool: true },
            { EntityName: 'B', ResultType: 'count_only', ReadOnPool: true },
        ], user);
        expect(provider.Executed).toHaveLength(1);
        expect(provider.Executed[0].Options?.ignoreAmbientTransaction).toBe(true);
    });
});
