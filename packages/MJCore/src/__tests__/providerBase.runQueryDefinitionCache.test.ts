/**
 * ProviderBase.RunQuery's result cache (`CacheLocal: true`) and the query's definition.
 *
 * - The slot key is built from the RESOLVED query, so a request by ID, by name, or by both
 *   reaches one slot (and a query's slots can be found by its ID).
 * - A server provider supplies the definition it would execute. A slot written under another
 *   definition is a miss, so an edited query's old results are not served.
 * - A client sends the definition hash its slot was written under to the server's cache check
 *   ('' for a slot without one) and stores the hash the server returns.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
    RunQueryWithCacheCheckParams,
    RunQueriesWithCacheCheckResponse,
} from '../generic/interfaces';
import { RunQueryParams, RunQueryResult } from '../generic/runQuery';
import { QueryExecutionSpec } from '../generic/queryExecutionSpec';
import { CompositeKey } from '../generic/compositeKey';
import { UserInfo, RecordDependency } from '../generic/securityInfo';
import { RecordMergeRequest, RecordMergeResult } from '../generic/entityInfo';
import { TransactionGroupBase } from '../generic/transactionGroup';
import { LocalCacheManager, CacheCategory, QueryDefinitionSignature } from '../generic/localCacheManager';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';

const QUERY_ID = 'AAAAAAAA-0000-0000-0000-000000000001';
const QUERY_NAME = 'Revenue';

/**
 * A provider whose one query can be "edited": `Edit()` changes the SQL version its executions
 * return and, for a server, the definition it reports.
 */
class DefinitionTestProvider extends ProviderBase {
    public Executions = 0;
    public SQLVersion = 1;
    public ReceivedChecks: RunQueryWithCacheCheckParams[] = [];

    constructor(private readonly server: boolean) {
        super();
    }

    public Edit(): void {
        this.SQLVersion++;
    }

    private get definition(): QueryDefinitionSignature {
        return { QueryID: QUERY_ID, Hash: `hash-v${this.SQLVersion}`, Stamp: new Date(Date.UTC(2026, 0, this.SQLVersion)).toISOString() };
    }

    private get rows(): Record<string, unknown>[] {
        return [{ Version: this.SQLVersion }];
    }

    protected override get TrustLocalCacheCompletely(): boolean {
        return this.server;
    }

    protected override ResolveQueryCacheAuthorization(params: RunQueryParams, _user?: UserInfo): QueryCacheAuthorization {
        const matches = (params.QueryID && params.QueryID.toLowerCase() === QUERY_ID.toLowerCase())
            || (!params.QueryID && params.QueryName === QUERY_NAME);
        if (!matches) {
            return { resolvable: false, authorized: false };
        }
        return {
            resolvable: true,
            authorized: true,
            categoryPath: '',
            queryName: QUERY_NAME,
            queryId: QUERY_ID,
            definition: this.server ? this.definition : undefined,
        };
    }

    protected async InternalRunQuery(): Promise<RunQueryResult> {
        this.Executions++;
        return { Success: true, QueryID: QUERY_ID, QueryName: QUERY_NAME, Results: this.rows, RowCount: 1, TotalRowCount: 1, ExecutionTime: 0, ErrorMessage: '' };
    }

    /** Stand-in server: 'current' only when the client's slot hash is the server's own. */
    public async RunQueriesWithCacheCheck<T = unknown>(params: RunQueryWithCacheCheckParams[]): Promise<RunQueriesWithCacheCheckResponse<T>> {
        this.ReceivedChecks.push(...params);
        const serverHash = this.definition.Hash;
        return {
            success: true,
            results: params.map((p, i) => p.cacheStatus?.definitionHash === serverHash
                ? { queryIndex: i, queryId: QUERY_ID, status: 'current' as const, definitionHash: serverHash }
                : { queryIndex: i, queryId: QUERY_ID, status: 'stale' as const, results: this.rows as T[], maxUpdatedAt: '', rowCount: 1, definitionHash: serverHash }),
        };
    }

    // --- Required abstract implementations (unused here) ---
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
    public get InstanceConnectionString(): string { return 'runquery-definition-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    get LocalStorageProvider(): ILocalStorageProvider {
        return { GetItem: async () => null, SetItem: async () => {}, Remove: async () => {} } as ILocalStorageProvider;
    }
    protected get Metadata(): IMetadataProvider { return this as unknown as IMetadataProvider; }
}

let storage: MockCacheStorageProvider;

async function run(provider: DefinitionTestProvider, identity: Pick<RunQueryParams, 'QueryID' | 'QueryName'>): Promise<RunQueryResult> {
    const result = await provider.RunQuery({ ...identity, CacheLocal: true });
    // Slot writes are fire-and-forget; let them land before the next request.
    await new Promise(resolve => setTimeout(resolve, 0));
    return result;
}

describe('ProviderBase.RunQuery cache and query definitions', () => {
    beforeEach(async () => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        storage = new MockCacheStorageProvider();
        await LocalCacheManager.Instance.Initialize(storage);
    });

    afterEach(() => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
    });

    it('serves one slot whether the query is requested by ID, by name, or by both', async () => {
        const provider = new DefinitionTestProvider(true);

        await run(provider, { QueryID: QUERY_ID });
        const byName = await run(provider, { QueryName: QUERY_NAME });
        const byBoth = await run(provider, { QueryID: QUERY_ID, QueryName: QUERY_NAME });

        expect(provider.Executions).toBe(1);
        expect(byName.CacheHit).toBe(true);
        expect(byBoth.CacheHit).toBe(true);
        expect(storage.getStorageSize(CacheCategory.RunQueryCache)).toBe(1);
    });

    it('misses after the query is edited and returns the new SQL\'s rows', async () => {
        const provider = new DefinitionTestProvider(true);
        await run(provider, { QueryID: QUERY_ID });

        provider.Edit();
        const afterEdit = await run(provider, { QueryName: QUERY_NAME });
        const again = await run(provider, { QueryID: QUERY_ID });

        expect(afterEdit.CacheHit).not.toBe(true);
        expect(afterEdit.Results).toEqual([{ Version: 2 }]);
        expect(again.CacheHit).toBe(true);
        expect(again.Results).toEqual([{ Version: 2 }]);
        expect(provider.Executions).toBe(2);
    });

    it('on a client, sends the slot\'s definition hash to the server and stores the hash it returns', async () => {
        const provider = new DefinitionTestProvider(false);

        await run(provider, { QueryID: QUERY_ID });        // miss: executed, slot has no hash yet
        const second = await run(provider, { QueryID: QUERY_ID }); // check with '' → stale, slot gets the hash
        const third = await run(provider, { QueryID: QUERY_ID });  // check with the hash → current
        provider.Edit();
        const afterEdit = await run(provider, { QueryID: QUERY_ID }); // old hash → stale, new rows

        expect(provider.ReceivedChecks.map(c => c.cacheStatus?.definitionHash)).toEqual(['', 'hash-v1', 'hash-v1']);
        expect(second.Results).toEqual([{ Version: 1 }]);
        expect(third.Results).toEqual([{ Version: 1 }]);
        expect(afterEdit.Results).toEqual([{ Version: 2 }]);
        expect(provider.Executions).toBe(1);
    });
});
