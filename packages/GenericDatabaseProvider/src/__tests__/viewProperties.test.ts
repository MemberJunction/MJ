/**
 * User View properties through the real RunViewCore: the predicate each property adds sits after
 * the view's own clause and ExtraFilter with row-level security still on top, refusals come back as
 * Success:false naming the property, a view without properties runs exactly as before, and the
 * pre-cache step resolves values (token defaults included) so the cache fingerprint keys on them.
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
import type { MJUserViewEntityExtended } from '@memberjunction/core-entities';
import {
    CompositeKey,
    LocalCacheManager,
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
    type UserViewProperty,
} from '@memberjunction/core';

const ENTITY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CHAPTER_A = '11111111-1111-4111-8111-111111111111';
const CHAPTER_B = '22222222-2222-4222-8222-222222222222';
const ADA = new UserInfo(null as unknown as IMetadataProvider, { ID: '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', Email: 'ada@example.com', Name: 'Ada' });
const BOB = new UserInfo(null as unknown as IMetadataProvider, { ID: '7f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4e', Email: 'bob@example.com', Name: 'Bob' });
const RLS = "OwnerID='rls'";

class PropertiesTestProvider extends GenericDatabaseProviderTestBase {
    private static readonly _uuidPattern = /^\s*(gen_random_uuid|uuid_generate_v4)\s*\(\s*\)\s*$/i;
    private static readonly _defaultPattern = /^\s*(now|current_timestamp)\s*\(\s*\)\s*$/i;

    /** Every SQL statement `ExecuteSQL` received, in order. */
    public readonly ExecutedSQL: string[] = [];

    constructor(private readonly testEntities: EntityInfo[]) {
        super();
    }

    public override get Entities(): EntityInfo[] { return this.testEntities; }
    public override async ExecuteSQL<T>(sql: string): Promise<Array<T>> {
        this.ExecutedSQL.push(sql);
        return [];
    }
    public Run(params: RunViewParams, user: UserInfo): Promise<RunViewResult> { return this.InternalRunView(params, user); }
    public Prepare(params: RunViewParams, user: UserInfo): Promise<void> { return this.PrepareRunViewProperties(params, user); }

    protected get UUIDFunctionPattern(): RegExp { return PropertiesTestProvider._uuidPattern; }
    protected get DBDefaultFunctionPattern(): RegExp { return PropertiesTestProvider._defaultPattern; }
    public QuoteIdentifier(name: string): string { return `[${name}]`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `[${schema}].[${obj}]`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected GenerateDeleteSQL(): DeleteSQLResult { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    protected BuildPaginationSQL(maxRows: number, startRow: number): string { return `OFFSET ${startRow} ROWS FETCH NEXT ${maxRows} ROWS ONLY`; }
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
    protected async InternalExecuteQueryFromSpec(_spec: QueryExecutionSpec, _user?: UserInfo): Promise<RunQueryResult> { throw new Error('Not supported'); }
    protected async GetCurrentUser(): Promise<UserInfo> { return ADA; }
    public async GetRecordDependencies(): Promise<{ EntityName: string; RelatedEntityName: string; FieldName: string; PrimaryKey: CompositeKey }[]> { return []; }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> { return {} as PotentialDuplicateResponse; }
    public async MergeRecords(): Promise<RecordMergeResult> { return {} as RecordMergeResult; }
    public async GetDatasetByName(): Promise<DatasetResultType> { return {} as DatasetResultType; }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> { return {} as DatasetStatusResultType; }
    public get InstanceConnectionString(): string { return 'view-properties-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    public get LocalStorageProvider(): ILocalStorageProvider {
        return { GetItem: async () => null, SetItem: async () => {}, Remove: async () => {} } as unknown as ILocalStorageProvider;
    }
    protected get Metadata(): IMetadataProvider { return this as unknown as IMetadataProvider; }
}

/** A readable entity whose row-level security adds `OwnerID='rls'`; `denied` names fields the user cannot read. */
function membersEntity(denied: string[] = []): EntityInfo {
    const fields = ['ID', 'ChapterID', 'Status', 'JoinedAt'].map((name) => ({ Name: name, CodeName: name }));
    return {
        ID: ENTITY_ID,
        Name: 'Members',
        SchemaName: '__mj',
        BaseView: 'vwMembers',
        Fields: fields,
        PrimaryKeys: [fields[0]],
        FirstPrimaryKey: fields[0],
        FieldByName: (n: string) => fields.find((f) => f.Name.toLowerCase() === n.trim().toLowerCase()),
        DatetimeFields: [],
        ExternalDataSourceID: null,
        UserViewMaxRows: 0,
        EnableFieldLevelSecurity: denied.length > 0,
        GetDeniedReadFields: () => new Set(denied.map((d) => d.toLowerCase())),
        GetUserPermisions: () => ({ CanRead: true }),
        GetEffectiveRowFilterWhereClause: () => RLS,
    } as unknown as EntityInfo;
}

function view(properties: UserViewProperty[] | null, entity: EntityInfo): MJUserViewEntityExtended {
    return {
        ID: 'view-1',
        Name: 'Chapter Members',
        EntityID: ENTITY_ID,
        WhereClause: 'Status = 1',
        CustomWhereClause: false,
        Columns: [],
        OrderByClause: '',
        ViewEntityInfo: entity,
        PropertiesObject: properties,
    } as unknown as MJUserViewEntityExtended;
}

const chapter: UserViewProperty = { Name: 'Chapter', Type: 'uuid', Target: { Field: 'ChapterID', Operator: '=' } };
const lockedChapter: UserViewProperty = { ...chapter, AllowOverride: false };
const since: UserViewProperty = { Name: 'Since', Type: 'date', Target: { Field: 'JoinedAt', Operator: '>=' }, Default: { Token: 'Context.Today', Offset: { Amount: -30, Unit: 'day' } } };
const owner: UserViewProperty = { Name: 'Owner', Type: 'uuid', Target: { Field: 'ID', Operator: '<>' }, Default: { Token: 'Context.UserID' }, AllowOverride: false };

async function run(properties: UserViewProperty[] | null, extra: Partial<RunViewParams> = {}, denied: string[] = []) {
    const entity = membersEntity(denied);
    const provider = new PropertiesTestProvider([entity]);
    const result = await provider.Run({ ViewEntity: view(properties, entity), ExtraFilter: 'Age > 1', ...extra }, ADA);
    return { result, sql: provider.ExecutedSQL };
}

describe('RunViewCore with view properties', () => {
    it('a view with no properties produces exactly the SQL it always did', async () => {
        const { result, sql } = await run(null);
        expect(result.Success).toBe(true);
        expect(sql).toEqual([`SELECT [ID] FROM [__mj].[vwMembers] WHERE (Status = 1) AND (Age > 1) AND (${RLS})`]);
        const declaredEmpty = await run([]);
        expect(declaredEmpty.sql).toEqual(sql);
    });

    it('adds the predicate after the view clause and ExtraFilter, with row-level security on top', async () => {
        const { result, sql } = await run([chapter], { Properties: { Chapter: CHAPTER_A } });
        expect(result.Success).toBe(true);
        expect(sql).toEqual([`SELECT [ID] FROM [__mj].[vwMembers] WHERE (Status = 1) AND (Age > 1) AND ([ChapterID] = '${CHAPTER_A}') AND (${RLS})`]);
    });

    it('a non-overridable property takes the server value and refuses a client value, naming the property', async () => {
        const server = await run([lockedChapter], { ServerProperties: { Chapter: CHAPTER_A } });
        expect(server.sql[0]).toContain(`([ChapterID] = '${CHAPTER_A}')`);

        const client = await run([lockedChapter], { Properties: { Chapter: CHAPTER_B } });
        expect(client.result.Success).toBe(false);
        expect(client.result.ErrorMessage).toContain('View property "Chapter" is set by the server');
        expect(client.sql).toEqual([]);
    });

    it('refuses an unknown name, a wrong type, a missing required value and properties on an entity run', async () => {
        const cases: Array<[UserViewProperty[] | null, Partial<RunViewParams>, RegExp]> = [
            [[chapter], { Properties: { Region: 'x' } }, /Unknown view property "Region"/],
            [[chapter], { Properties: { Chapter: '42' } }, /needs a uuid value/],
            [[{ ...chapter, IsRequired: true }], {}, /"Chapter" is required/],
            [[{ ...chapter, Target: { Field: 'Gone', Operator: '=' } }], {}, /has invalid properties: Property "Chapter": Target.Field "Gone"/],
        ];
        for (const [declared, extra, message] of cases) {
            const { result, sql } = await run(declared, extra);
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toMatch(message);
            expect(sql).toEqual([]);
        }
        const provider = new PropertiesTestProvider([membersEntity()]);
        const entityRun = await provider.Run({ EntityName: 'Members', Properties: { Chapter: CHAPTER_A } }, ADA);
        expect(entityRun.ErrorMessage).toMatch(/Properties apply only to a stored view/);
    });

    it('a token default is worked out on the server in the run time zone', async () => {
        vi.useFakeTimers({ now: new Date('2026-10-14T22:30:00.000Z') });
        try {
            const utc = await run([since]);
            expect(utc.sql[0]).toContain(`([JoinedAt] >= '2026-09-14')`);
            const paris = await run([since], { TimeZone: 'Europe/Paris' });
            expect(paris.sql[0]).toContain(`([JoinedAt] >= '2026-09-15')`);
        } finally {
            vi.useRealTimers();
        }
    });

    it('applies the field-security check to a property target', async () => {
        const { result, sql } = await run([chapter], { Properties: { Chapter: CHAPTER_A } }, ['ChapterID']);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('ChapterID');
        expect(sql).toEqual([]);
        const noValue = await run([chapter], {}, ['ChapterID']);
        expect(noValue.result.Success).toBe(true);
    });
});

describe('PrepareRunViewProperties (before the cache lookup)', () => {
    async function prepare(properties: UserViewProperty[] | null, params: Partial<RunViewParams>, user = ADA) {
        const entity = membersEntity();
        const provider = new PropertiesTestProvider([entity]);
        const prepared: RunViewParams = { ViewEntity: view(properties, entity), ...params };
        await provider.Prepare(prepared, user);
        return prepared;
    }

    it('leaves a run without properties untouched', async () => {
        const prepared = await prepare(null, { ExtraFilter: 'Age > 1' });
        expect(prepared.Properties).toBeUndefined();
        expect(prepared.ServerProperties).toBeUndefined();
        expect(prepared.BypassCache).toBeUndefined();
    });

    it('replaces client values and defaults with the resolved values', async () => {
        const prepared = await prepare([chapter, owner], { Properties: { Chapter: CHAPTER_A } });
        expect(prepared.Properties).toBeUndefined();
        expect(prepared.ServerProperties).toEqual({ Chapter: CHAPTER_A, Owner: ADA.ID });
    });

    it('keeps a run it would refuse out of the cache and leaves the refusal to the run', async () => {
        const prepared = await prepare([lockedChapter], { Properties: { Chapter: CHAPTER_B } });
        expect(prepared.BypassCache).toBe(true);
        expect(prepared.Properties).toEqual({ Chapter: CHAPTER_B });
    });

    it('gives each chapter, and each user of a token default, its own cache fingerprint', async () => {
        const fingerprint = (p: RunViewParams) => LocalCacheManager.Instance.GenerateRunViewFingerprint({ ...p, ViewEntity: undefined, ViewID: 'view-1' }, 'conn');
        const a = fingerprint(await prepare([lockedChapter], { ServerProperties: { Chapter: CHAPTER_A } }));
        const b = fingerprint(await prepare([lockedChapter], { ServerProperties: { Chapter: CHAPTER_B } }));
        expect(a).not.toBe(b);
        const ada = fingerprint(await prepare([owner], {}, ADA));
        const bob = fingerprint(await prepare([owner], {}, BOB));
        expect(ada).not.toBe(bob);
        expect(fingerprint(await prepare(null, {}))).toBe('Unknown|_|_|-1|0|_|_|vw:view-1|conn');
    });

    it('resolves to the same predicates when RunViewCore resolves the prepared values again', async () => {
        const entity = membersEntity();
        const provider = new PropertiesTestProvider([entity]);
        const params: RunViewParams = { ViewEntity: view([chapter, owner], entity), Properties: { Chapter: CHAPTER_A } };
        await provider.Prepare(params, ADA);
        await provider.Run(params, ADA);
        expect(provider.ExecutedSQL[0]).toContain(`([ChapterID] = '${CHAPTER_A}' AND [ID] <> '${ADA.ID}')`);
    });
});
