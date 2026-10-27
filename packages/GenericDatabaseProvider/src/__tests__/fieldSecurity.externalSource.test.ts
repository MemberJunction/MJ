/**
 * Field-level security on a RunView over an entity backed by an external data source.
 *
 * Such an entity is proxied to a driver before the SQL path, so the clause gates and the column
 * selection that path applies never run for it. These tests run the real `InternalRunView` (no
 * pre-cache gate in the path) with a stub router and pin that the external path gets the same
 * treatment: the clauses the driver is handed, a saved view's stored ones included, are checked,
 * and the rows it returns are projected for the caller, even when the request names only a
 * `ViewID`, which the result-path projection cannot resolve on its own.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

vi.mock('sql-formatter', () => ({ format: (sql: string) => sql }));
vi.mock('@memberjunction/encryption', () => ({
    EncryptionEngine: {
        get Instance() {
            return { Config: vi.fn(), Encrypt: vi.fn(), IsEncrypted: vi.fn().mockReturnValue(false), GetKeyByID: vi.fn() };
        },
    },
}));

import { MJGlobal } from '@memberjunction/global';
import { GenericDatabaseProviderTestBase } from './helpers/GenericDatabaseProviderTestBase';
import type { SaveCoercedValue, SaveCallBinding, SaveSQLFragment } from '../saveTypes.js';
import {
    CompositeKey,
    ExternalDataSourceReadRouter,
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
import type { MJUserViewEntityExtended } from '@memberjunction/core-entities';
import type { DatabasePlatform } from '@memberjunction/sql-dialect';

const ENTITY_NAME = 'Widgets';
const ENTITY_ID = 'ENT-Widgets';

/** Records every statement; throws `failWith` instead of answering when it is set. */
class ExternalTestProvider extends GenericDatabaseProviderTestBase {
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

    /** Saved views by ID, so a request that carries only `ViewID` resolves one, as `ViewInfo.GetViewEntity` would. */
    public readonly SavedViews = new Map<string, MJUserViewEntityExtended>();

    protected override async LoadRunViewEntity(params: RunViewParams, contextUser?: UserInfo): Promise<MJUserViewEntityExtended | null> {
        if (!params.ViewEntity && params.ViewID) {
            return this.SavedViews.get(params.ViewID) ?? null;
        }
        return super.LoadRunViewEntity(params, contextUser);
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

    protected get UUIDFunctionPattern(): RegExp { return ExternalTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return ExternalTestProvider._defaultPattern; }
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
    public get InstanceConnectionString(): string { return 'external-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    public get LocalStorageProvider(): ILocalStorageProvider {
        return { GetItem: async () => null, SetItem: async () => {}, Remove: async () => {} } as unknown as ILocalStorageProvider;
    }
    protected get Metadata(): IMetadataProvider { return this as unknown as IMetadataProvider; }
}

/** The calls the stub driver received, and the rows it answers with. */
const external = {
    calls: [] as RunViewParams[],
    rows: [] as Record<string, unknown>[],
};

/** A driver that records what it is asked and returns `external.rows` at full width. */
class StubExternalReadRouter extends ExternalDataSourceReadRouter {
    public async RunViewExternal<T = unknown>(_entity: EntityInfo, params: RunViewParams): Promise<RunViewResult<T>> {
        external.calls.push(params);
        const rows = external.rows.map((r) => ({ ...r })) as unknown as T[];
        return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
    }
    public async LoadExternalRecord<T = unknown>(): Promise<RunViewResult<T>> {
        throw new Error('Not supported in this test double');
    }
    public async RunQueryExternal(): Promise<RunQueryResult> {
        throw new Error('Not supported in this test double');
    }
    public async GetCacheTTLSeconds(): Promise<number> {
        return 0;
    }
}

/** `Widgets`, backed by an external data source, with `deniedFields` denied to every caller. */
function externalWidgets(deniedFields: string[] = []): EntityInfo {
    const fields = ['ID', 'Name', 'Sequence', 'BankAccount'].map((name) => ({ Name: name, CodeName: name }));
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
        EncryptedFields: [],
        BinaryFields: [],
        ExternalDataSourceID: 'EDS-1',
        UserViewMaxRows: 0,
        EnableFieldLevelSecurity: deniedFields.length > 0,
        FieldLevelSecurityApplies: deniedFields.length > 0,
        GetDeniedReadFields: () => new Set(deniedFields.map((f) => f.toLowerCase())),
        HasBinaryFields: false,
        GetUserPermisions: () => ({ CanRead: true }),
        GetEffectiveRowFilterWhereClause: () => '',
    } as unknown as EntityInfo;
}

/** A saved view over `widgets` with the given stored clauses. */
function savedView(widgets: EntityInfo, clauses: { WhereClause?: string; OrderByClause?: string }): MJUserViewEntityExtended {
    return {
        ID: 'V1', Name: 'Saved', EntityID: ENTITY_ID, ViewEntityInfo: widgets, Columns: [],
        WhereClause: clauses.WhereClause ?? null, CustomWhereClause: true, OrderByClause: clauses.OrderByClause ?? '',
    } as unknown as MJUserViewEntityExtended;
}

function providerWithView(denied: string[], clauses: { WhereClause?: string; OrderByClause?: string }): ExternalTestProvider {
    const widgets = externalWidgets(denied);
    const provider = new ExternalTestProvider('sqlserver', [widgets]);
    provider.SavedViews.set('V1', savedView(widgets, clauses));
    return provider;
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

beforeAll(() => {
    MJGlobal.Instance.ClassFactory.Register(ExternalDataSourceReadRouter, StubExternalReadRouter, null, 1000, true);
});

beforeEach(() => {
    external.calls = [];
    external.rows = [{ ID: 'w1', Name: 'Alpha', Sequence: 1, BankAccount: '250000' }];
});

describe('an external-data-source RunView checks the clauses the driver is handed', () => {
    it("refuses a ViewID-only saved view whose stored WhereClause filters on a denied column, before the driver runs", async () => {
        const provider = providerWithView(['BankAccount'], { WhereClause: 'BankAccount > 100000' });
        const error = await rejection(() => provider.RunViewAs({ ViewID: 'V1' }, user));
        expect(error?.name).toBe(FieldSecurityError.ErrorName);
        expect(external.calls).toEqual([]);
    });

    it("refuses a ViewID-only saved view whose stored sort reads a denied column", async () => {
        const provider = providerWithView(['BankAccount'], { OrderByClause: 'BankAccount DESC' });
        const error = await rejection(() => provider.RunViewAs({ ViewID: 'V1' }, user));
        expect(error?.name).toBe(FieldSecurityError.ErrorName);
        expect(external.calls).toEqual([]);
    });

    it('refuses a sort by column position for a caller denied a column', async () => {
        const provider = providerWithView(['BankAccount'], { OrderByClause: '4 DESC' });
        const error = await rejection(() => provider.RunViewAs({ ViewID: 'V1' }, user));
        expect(error?.name).toBe(FieldSecurityError.ErrorName);
        expect(external.calls).toEqual([]);
    });

    it("refuses a caller's own filter on a denied column", async () => {
        const provider = new ExternalTestProvider('sqlserver', [externalWidgets(['BankAccount'])]);
        const error = await rejection(() => provider.RunViewAs({ EntityName: ENTITY_NAME, ExtraFilter: 'BankAccount > 100000' }, user));
        expect(error?.name).toBe(FieldSecurityError.ErrorName);
        expect(external.calls).toEqual([]);
    });

    it('runs the same view for a caller denied nothing, handing the driver its clauses', async () => {
        const provider = providerWithView([], { WhereClause: 'BankAccount > 100000', OrderByClause: 'BankAccount DESC' });
        const result = await provider.RunViewAs({ ViewID: 'V1' }, user);
        expect(result.Success).toBe(true);
        expect(external.calls).toHaveLength(1);
        expect(external.calls[0].ExtraFilter).toBe('BankAccount > 100000');
        expect(external.calls[0].OrderBy).toBe('BankAccount DESC');
    });
});

describe('an external-data-source RunView projects the rows for the caller', () => {
    it('drops a denied column from the rows of a ViewID-only request', async () => {
        const provider = providerWithView(['BankAccount'], { WhereClause: "Name = 'Alpha'" });
        const result = await provider.RunViewAs({ ViewID: 'V1', ResultType: 'simple' }, user);
        expect(result.Success).toBe(true);
        expect(result.Results).toEqual([{ ID: 'w1', Name: 'Alpha', Sequence: 1 }]);
    });

    it('drops a denied column from the rows of a request that names the entity', async () => {
        const provider = new ExternalTestProvider('sqlserver', [externalWidgets(['BankAccount'])]);
        const result = await provider.RunViewAs({ EntityName: ENTITY_NAME, ResultType: 'simple' }, user);
        expect(result.Results).toEqual([{ ID: 'w1', Name: 'Alpha', Sequence: 1 }]);
    });

    it('keeps every column for a caller denied nothing', async () => {
        const provider = providerWithView([], {});
        const result = await provider.RunViewAs({ ViewID: 'V1', ResultType: 'simple' }, user);
        expect(result.Results).toEqual([{ ID: 'w1', Name: 'Alpha', Sequence: 1, BankAccount: '250000' }]);
    });
});
