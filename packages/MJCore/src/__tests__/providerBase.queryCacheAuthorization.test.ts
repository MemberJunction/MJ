/**
 * Unit coverage for the B45/B46 RunQuery cache-serve seam
 * (ProviderBase.ResolveQueryCacheAuthorization).
 *
 * Background: the RunQuery TTL cache gate must answer "may THIS user be served THIS slot?"
 * before serving rows another user warmed. The base seam resolves the request from the metadata
 * Queries cache and enforces the roles-only QueryInfo.UserCanRun — the strongest check available
 * at this layer (GenericDatabaseProvider overrides with the full entity-CanRead + composition
 * check). The seam also surfaces the RESOLVED query's canonical CategoryPath, which becomes the
 * B46 distinguishing fingerprint segment — so the slot key and the authorization decision are
 * derived from the SAME resolution and can never disagree about which query they describe.
 */
import { describe, it, expect } from 'vitest';
import { ProviderBase, QueryCacheAuthorization } from '../generic/providerBase';
import {
    RunViewResult,
    ProviderType,
    EntityRecordNameInput,
    EntityRecordNameResult,
    PotentialDuplicateResponse,
    DatasetResultType,
    DatasetStatusResultType,
    ILocalStorageProvider,
    IMetadataProvider,
} from '../generic/interfaces';
import { RunQueryParams, RunQueryResult } from '../generic/runQuery';
import { QueryExecutionSpec } from '../generic/queryExecutionSpec';
import { CompositeKey } from '../generic/compositeKey';
import { UserInfo, RecordDependency } from '../generic/securityInfo';
import { RecordMergeRequest, RecordMergeResult } from '../generic/entityInfo';
import { TransactionGroupBase } from '../generic/transactionGroup';
import { QueryInfo } from '../generic/queryInfo';

const FINANCE_ID = '11111111-1111-1111-1111-111111111111';
const SALES_ID = '22222222-2222-2222-2222-222222222222';
const DENIED_ID = '33333333-3333-3333-3333-333333333333';

/** QueryInfo-shaped stub: identity + category + a role-check verdict. */
function queryStub(id: string, name: string, categoryPath: string, canRun: boolean): QueryInfo {
    return { ID: id, Name: name, CategoryPath: categoryPath, UserCanRun: () => canRun } as unknown as QueryInfo;
}

/**
 * Minimal provider exposing the protected seam. Models the B46 collision shape directly:
 * two queries that share a Name and differ only by category, plus a role-denied query.
 */
class QueryAuthTestProvider extends ProviderBase {
    public auth(params: RunQueryParams, user?: UserInfo): QueryCacheAuthorization {
        return this.ResolveQueryCacheAuthorization(params, user);
    }

    public override get Queries(): QueryInfo[] {
        return [
            queryStub(FINANCE_ID, 'Revenue Summary', '/Finance/', true),
            queryStub(SALES_ID, 'Revenue Summary', '/Sales/', true),
            queryStub(DENIED_ID, 'Board Metrics', '/Finance/', false),
        ];
    }

    // --- Required abstract implementations (unused by the seam under test) ---
    override get PlatformKey() { return 'sqlserver' as const; }
    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return 'Network'; }
    public get DatabaseConnection(): object { return {}; }
    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(_info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> { /* noop */ }
    protected async InternalRunView<T>(): Promise<RunViewResult<T>> { throw new Error('not used'); }
    protected async InternalRunViews<T>(): Promise<RunViewResult<T>[]> { throw new Error('not used'); }
    protected async InternalRunQuery(): Promise<RunQueryResult> { return { Success: true, Results: [] }; }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return []; }
    protected async InternalExecuteQueryFromSpec(_spec: QueryExecutionSpec, _contextUser?: UserInfo): Promise<RunQueryResult> { throw new Error('not used'); }
    protected async GetCurrentUser(): Promise<UserInfo> { return new UserInfo(null as unknown as IMetadataProvider, {}); }
    public async GetRecordDependencies(): Promise<RecordDependency[]> { return []; }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> {
        return { EntityName: '', PrimaryKey: new CompositeKey(), DuplicateRunDetailMatchRecords: [] };
    }
    public async MergeRecords(): Promise<RecordMergeResult> {
        return { Success: false, OverallStatus: 'Error', RecordMergeLogID: '', RecordStatus: [], Request: {} as RecordMergeRequest, KeyValueOfSurvivingRecord: new CompositeKey() };
    }
    public async GetDatasetByName(): Promise<DatasetResultType> {
        return { Success: false, Status: 'Error', Results: [], LatestUpdateDate: new Date(), EntityUpdateDates: [] };
    }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> {
        return { Success: false, Status: 'Error', LatestUpdateDate: new Date(), EntityUpdateDates: [] };
    }
    public get InstanceConnectionString(): string { return 'query-cache-auth-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    get LocalStorageProvider(): ILocalStorageProvider {
        return { GetItem: async () => null, SetItem: async () => {}, Remove: async () => {} } as ILocalStorageProvider;
    }
    protected get Metadata(): IMetadataProvider { return this as unknown as IMetadataProvider; }
}

describe('ProviderBase.ResolveQueryCacheAuthorization (B45/B46 cache-serve seam)', () => {
    const provider = new QueryAuthTestProvider();
    const user = new UserInfo(null as unknown as IMetadataProvider, { ID: 'user-1', Email: 'u@test' });

    it('resolves by QueryID and reports the canonical category path', () => {
        const r = provider.auth({ QueryID: FINANCE_ID } as RunQueryParams, user);
        expect(r).toEqual({ resolvable: true, authorized: true, categoryPath: '/Finance/', queryName: 'Revenue Summary' });
    });

    it('resolves by name case- and whitespace-insensitively', () => {
        const r = provider.auth({ QueryName: '  board metrics ' } as RunQueryParams, user);
        expect(r.resolvable).toBe(true);
        expect(r.queryName).toBe('Board Metrics');
    });

    it('a caller-stated CategoryPath disambiguates same-named queries (the B46 collision shape)', () => {
        const finance = provider.auth({ QueryName: 'Revenue Summary', CategoryPath: '/Finance/' } as RunQueryParams, user);
        const sales = provider.auth({ QueryName: 'Revenue Summary', CategoryPath: '/sales/' } as RunQueryParams, user);
        expect(finance.categoryPath).toBe('/Finance/');
        expect(sales.categoryPath).toBe('/Sales/');
    });

    it('a stated CategoryPath matching NO query is unresolvable — it must NOT fall back to a same-named query in another category', () => {
        const r = provider.auth({ QueryName: 'Revenue Summary', CategoryPath: '/Marketing/' } as RunQueryParams, user);
        expect(r.resolvable).toBe(false);
        expect(r.authorized).toBe(false);
    });

    it('an unknown QueryID is unresolvable and unauthorized (gate then applies the warmer tie-break, never a serve)', () => {
        const r = provider.auth({ QueryID: '99999999-9999-9999-9999-999999999999' } as RunQueryParams, user);
        expect(r).toEqual({ resolvable: false, authorized: false });
    });

    it('a role-denied user gets resolvable:true + authorized:false — resolved identity is kept for the fingerprint, rows are not served', () => {
        const r = provider.auth({ QueryID: DENIED_ID } as RunQueryParams, user);
        expect(r.resolvable).toBe(true);
        expect(r.authorized).toBe(false);
        expect(r.categoryPath).toBe('/Finance/');
    });

    it('no context user ⇒ authorized (nothing to authorize against; the gate only consults this under a contextUser)', () => {
        const r = provider.auth({ QueryID: DENIED_ID } as RunQueryParams, undefined);
        expect(r.authorized).toBe(true);
    });

    it('QueryID takes precedence over a same-request QueryName (ID is authoritative)', () => {
        const r = provider.auth({ QueryID: SALES_ID, QueryName: 'Board Metrics' } as RunQueryParams, user);
        expect(r.queryName).toBe('Revenue Summary');
        expect(r.categoryPath).toBe('/Sales/');
    });
});
