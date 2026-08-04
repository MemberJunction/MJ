/**
 * Tests for the client-side Fields-aware cache fingerprint.
 *
 * Background: the SERVER cache widens every cacheable query to ALL entity
 * fields, stores one full-width superset per entity+filter, and projects
 * per-read — so its fingerprint deliberately excludes Fields. The CLIENT
 * smart-cache flow does neither: it keeps queries narrow over the wire and
 * stores rows exactly as the server returned them, with no projection on read.
 *
 * Under a Fields-agnostic client fingerprint, a narrow cached entry would pass
 * the staleness check for a DIFFERENT field subset of the same entity+filter
 * (maxUpdatedAt / rowCount are column-independent) and silently serve rows
 * missing the newly requested columns. The fix keys client cache entries by a
 * normalized Fields suffix so every field subset stores, validates, and serves
 * its own shape (exact-match slots — no cross-subset serving).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProviderBase } from '../generic/providerBase';
import { LocalCacheManager, CacheCategory } from '../generic/localCacheManager';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';
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
    RunViewWithCacheCheckParams,
    RunViewsWithCacheCheckResponse,
} from '../generic/interfaces';
import { RunQueryResult } from '../generic/runQuery';
import { QueryExecutionSpec } from '../generic/queryExecutionSpec';
import { CompositeKey } from '../generic/compositeKey';
import { UserInfo, RecordDependency } from '../generic/securityInfo';
import { EntityInfo, RecordMergeRequest, RecordMergeResult } from '../generic/entityInfo';
import { TransactionGroupBase } from '../generic/transactionGroup';
import { RunViewParams } from '../views/runView';

// Wide row emulating the server's full-width data; the stub server projects it
// down to each request's Fields (post-#2814 servers always return the
// requested shape).
const SERVER_ROW: Record<string, unknown> = {
    ID: 'row-1',
    Name: 'Test Record',
    Status: 'Active',
    Description: 'Some description text',
    __mj_UpdatedAt: '2026-06-01T00:00:00.000Z',
};

/**
 * Client-mode provider (TrustLocalCacheCompletely=false) with a stubbed
 * RunViewsWithCacheCheck "server": responds 'current' when the client sends a
 * cacheStatus (i.e., it found a cache entry for this exact request), otherwise
 * 'stale' with rows projected to the request's Fields.
 */
class ClientSmartCacheTestProvider extends ProviderBase {
    public receivedChecks: RunViewWithCacheCheckParams[][] = [];

    public async RunViewsWithCacheCheck<T>(checkParams: RunViewWithCacheCheckParams[]): Promise<RunViewsWithCacheCheckResponse<T>> {
        this.receivedChecks.push(checkParams);
        return {
            success: true,
            results: checkParams.map((cp, i) => {
                if (cp.cacheStatus) {
                    return { viewIndex: i, status: 'current' as const };
                }
                const rows = this.projectServerRow(cp.params);
                return {
                    viewIndex: i,
                    status: 'stale' as const,
                    results: rows as T[],
                    maxUpdatedAt: '2026-06-01T00:00:00.000Z',
                    rowCount: rows.length,
                };
            }),
        };
    }

    private projectServerRow(p: RunViewParams): Record<string, unknown>[] {
        if (!p.Fields || p.Fields.length === 0) {
            return [{ ...SERVER_ROW }];
        }
        const requested = new Set(p.Fields.map(f => f.trim().toLowerCase()));
        const projected: Record<string, unknown> = {};
        for (const key of Object.keys(SERVER_ROW)) {
            if (requested.has(key.toLowerCase())) {
                projected[key] = SERVER_ROW[key];
            }
        }
        return [projected];
    }

    public lastCheck(): RunViewWithCacheCheckParams[] {
        return this.receivedChecks[this.receivedChecks.length - 1];
    }

    // --- Hooks the production code calls ---
    public override EntityByName(name: string): EntityInfo | undefined {
        // AllowCaching=true so LocalCacheManager's write gate accepts entries
        return name === 'Cacheable'
            ? ({ Name: 'Cacheable', AllowCaching: true, TrustServerCacheCompletely: true, Fields: [] } as unknown as EntityInfo)
            : undefined;
    }
    protected override get TrustLocalCacheCompletely(): boolean { return false; }

    // --- Required abstract implementations (unused by the smart-cache flow) ---
    override get PlatformKey() { return 'sqlserver' as const; }
    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return 'Network'; }
    public get DatabaseConnection(): object { return {}; }
    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(_info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> { /* noop */ }
    protected async InternalRunView<T>(): Promise<RunViewResult<T>> {
        throw new Error('InternalRunView should not be called in the smart-cache flow');
    }
    protected async InternalRunViews<T>(): Promise<RunViewResult<T>[]> {
        throw new Error('InternalRunViews should not be called in the smart-cache flow');
    }
    protected async InternalRunQuery(): Promise<RunQueryResult> { return { Success: true, Results: [] }; }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return []; }
    protected async InternalExecuteQueryFromSpec(_spec: QueryExecutionSpec, _contextUser?: UserInfo): Promise<RunQueryResult> {
        throw new Error('Not supported');
    }
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
    public get InstanceConnectionString(): string { return 'client-fields-fingerprint-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    get LocalStorageProvider(): ILocalStorageProvider {
        return {
            GetItem: async () => null,
            SetItem: async () => {},
            Remove: async () => {},
        } as ILocalStorageProvider;
    }
    protected get Metadata(): IMetadataProvider { return this as unknown as IMetadataProvider; }
}

function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    if (g) {
        delete g['___SINGLETON__LocalCacheManager'];
    }
}

/** The fire-and-forget cache write on the 'stale' path needs a tick to settle. */
async function settle(ms = 25) {
    await new Promise(r => setTimeout(r, ms));
}

function rowKeys(result: RunViewResult): string[] {
    return Object.keys(result.Results[0] as Record<string, unknown>).sort();
}

describe('Client-side Fields-aware cache fingerprint (smart-cache flow)', () => {
    let provider: ClientSmartCacheTestProvider;
    let mockStorage: MockCacheStorageProvider;
    const originalCoalesce = ProviderBase.CoalesceWindowMs;
    const originalDedupLinger = ProviderBase.DedupLingerMs;

    beforeEach(async () => {
        resetLocalCacheManager();
        mockStorage = new MockCacheStorageProvider();
        await LocalCacheManager.Instance.Initialize(mockStorage);
        provider = new ClientSmartCacheTestProvider();
        // Disable coalescing/linger so each call hits the pipeline deterministically
        ProviderBase.CoalesceWindowMs = 0;
        ProviderBase.DedupLingerMs = 0;
    });

    afterEach(() => {
        ProviderBase.CoalesceWindowMs = originalCoalesce;
        ProviderBase.DedupLingerMs = originalDedupLinger;
        resetLocalCacheManager();
    });

    function makeParams(fields?: string[]): RunViewParams {
        return {
            EntityName: 'Cacheable',
            CacheLocal: true,
            ResultType: 'simple',
            ...(fields ? { Fields: fields } : {}),
        };
    }

    it('a different Fields subset is a separate slot — it must NOT validate against another subset’s entry (the poisoning regression)', async () => {
        // Warm the cache for {ID, Name}
        const r1 = await provider.RunViews([makeParams(['ID', 'Name'])]);
        expect(rowKeys(r1[0])).toEqual(['ID', 'Name']);
        await settle();

        // Request {ID, Status}: under a Fields-agnostic fingerprint this would
        // send the {ID,Name} entry's cacheStatus, the server would answer
        // 'current', and the caller would receive rows with NO Status column.
        const r2 = await provider.RunViews([makeParams(['ID', 'Status'])]);

        // The client must NOT have claimed a cached status for this subset…
        expect(provider.lastCheck()[0].cacheStatus).toBeUndefined();
        // …and the caller gets the shape they asked for, from fresh data.
        expect(rowKeys(r2[0])).toEqual(['ID', 'Status']);
    });

    it('the same Fields subset revalidates and serves its OWN slot', async () => {
        const r1 = await provider.RunViews([makeParams(['ID', 'Name'])]);
        await settle();

        const r2 = await provider.RunViews([makeParams(['ID', 'Name'])]);
        // Cache entry found → cacheStatus sent → server answered 'current' → served from cache
        expect(provider.lastCheck()[0].cacheStatus).toBeDefined();
        expect(r2[0].Results).toEqual(r1[0].Results);
        expect(rowKeys(r2[0])).toEqual(['ID', 'Name']);
    });

    it('Fields differing only in order/case/whitespace share one slot (normalization)', async () => {
        await provider.RunViews([makeParams(['ID', 'Name'])]);
        await settle();

        const r2 = await provider.RunViews([makeParams([' name ', 'id'])]);
        expect(provider.lastCheck()[0].cacheStatus).toBeDefined();
        expect(r2[0].Results).toHaveLength(1);
    });

    it('a no-Fields (all columns) request is its own slot and serves the full row', async () => {
        await provider.RunViews([makeParams(['ID', 'Name'])]);
        await settle();

        const r2 = await provider.RunViews([makeParams()]);
        // Different slot → no cacheStatus → fresh full-width fetch
        expect(provider.lastCheck()[0].cacheStatus).toBeUndefined();
        expect(rowKeys(r2[0])).toEqual(Object.keys(SERVER_ROW).sort());
    });

    it('distinct subsets produce distinct storage entries keyed by a |f: suffix', async () => {
        await provider.RunViews([makeParams(['ID', 'Name'])]);
        await provider.RunViews([makeParams(['ID', 'Status'])]);
        await provider.RunViews([makeParams()]);
        await settle();

        const keys = await mockStorage.GetCategoryKeys(CacheCategory.RunViewCache);
        const suffixes = keys.map(k => k.substring(k.lastIndexOf('|f:'))).sort();
        expect(suffixes).toEqual(['|f:*', '|f:id,name', '|f:id,status']);
    });
});
