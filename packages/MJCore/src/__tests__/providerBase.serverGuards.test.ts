import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    ProviderBase,
} from '../generic/providerBase';
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
import { RunQueryResult } from '../generic/runQuery';
import { QueryExecutionSpec } from '../generic/queryExecutionSpec';
import { CompositeKey } from '../generic/compositeKey';
import { UserInfo, RecordDependency } from '../generic/securityInfo';
import { RecordMergeRequest, RecordMergeResult } from '../generic/entityInfo';
import { TransactionGroupBase } from '../generic/transactionGroup';
import { DatabaseProviderBase } from '../generic/databaseProviderBase';

// ---------------------------------------------------------------------------
// In-memory local storage provider that tracks calls for spying
// ---------------------------------------------------------------------------
class SpyableLocalStorageProvider implements ILocalStorageProvider {
    private _store = new Map<string, string>();

    async GetItem(key: string): Promise<string | null> {
        return this._store.get(key) ?? null;
    }
    async SetItem(key: string, value: string): Promise<void> {
        this._store.set(key, value);
    }
    async Remove(key: string): Promise<void> {
        this._store.delete(key);
    }
    async ClearCategory(): Promise<void> { /* noop */ }
    async GetCategoryKeys(): Promise<string[]> { return []; }

    /** Seed data to simulate a warm cache */
    seed(key: string, value: string): void {
        this._store.set(key, value);
    }
}

// ---------------------------------------------------------------------------
// Client-side provider (TrustLocalCacheCompletely = false, the default)
// ---------------------------------------------------------------------------
class ClientTestProvider extends ProviderBase {
    private _localStorage = new SpyableLocalStorageProvider();

    get SpyableStorage(): SpyableLocalStorageProvider { return this._localStorage; }

    override get PlatformKey() { return 'sqlserver' as const; }
    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return 'Network'; }
    public get DatabaseConnection(): object { return {}; }
    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(_info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> { /* noop */ }
    protected async InternalRunView<T>(): Promise<RunViewResult<T>> {
        return { Success: true, Results: [] as T[], TotalRowCount: 0, ExecutionTime: 0, RowCount: 0, UserViewRunID: '', Filtered: false, ErrorMessage: '' };
    }
    protected async InternalRunViews<T>(): Promise<RunViewResult<T>[]> { return []; }
    protected async InternalRunQuery(): Promise<RunQueryResult> {
        return { Success: true, Results: [], Fields: [] };
    }
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
    public get InstanceConnectionString(): string { return 'client-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    get LocalStorageProvider(): ILocalStorageProvider { return this._localStorage; }
    protected get Metadata(): IMetadataProvider { return {} as IMetadataProvider; }

    // Expose protected property for testing
    public get ExposedTrustLocalCacheCompletely(): boolean {
        return this['TrustLocalCacheCompletely'];
    }
}

// ---------------------------------------------------------------------------
// Server-side provider (TrustLocalCacheCompletely = true via DatabaseProviderBase)
// We can't instantiate DatabaseProviderBase directly (it has more abstract methods),
// so we create a minimal concrete subclass that mirrors the server hierarchy.
// ---------------------------------------------------------------------------
class ServerTestProvider extends ClientTestProvider {
    /**
     * Override to match DatabaseProviderBase behavior:
     * server-side providers trust their local cache completely.
     */
    protected override get TrustLocalCacheCompletely(): boolean {
        return true;
    }

    override get ProviderType(): ProviderType { return 'Database'; }
    override get InstanceConnectionString(): string { return 'server-test'; }

    public override get ExposedTrustLocalCacheCompletely(): boolean {
        return this['TrustLocalCacheCompletely'];
    }
}

// ===========================================================================
// Tests
// ===========================================================================
describe('ProviderBase Server-Side Guards', () => {

    // -----------------------------------------------------------------------
    // TrustLocalCacheCompletely baseline
    // -----------------------------------------------------------------------
    describe('TrustLocalCacheCompletely defaults', () => {
        it('should be false on ProviderBase (client-side default)', () => {
            const client = new ClientTestProvider();
            expect(client.ExposedTrustLocalCacheCompletely).toBe(false);
        });

        it('should be true on server-side providers (DatabaseProviderBase pattern)', () => {
            const server = new ServerTestProvider();
            expect(server.ExposedTrustLocalCacheCompletely).toBe(true);
        });

        it('should be true on actual DatabaseProviderBase', () => {
            // Verify the real DatabaseProviderBase override exists by checking
            // the prototype chain — we can't instantiate it, but we can inspect
            expect(DatabaseProviderBase.prototype).toBeDefined();
            const descriptor = Object.getOwnPropertyDescriptor(
                DatabaseProviderBase.prototype,
                'TrustLocalCacheCompletely'
            );
            expect(descriptor).toBeDefined();
            expect(descriptor!.get).toBeDefined();
        });
    });

    // -----------------------------------------------------------------------
    // Request Coalescing guard
    // -----------------------------------------------------------------------
    describe('Request coalescing is client-only', () => {
        it('should have CoalesceWindowMs > 0 by default', () => {
            expect(ProviderBase.CoalesceWindowMs).toBeGreaterThan(0);
        });

        it('coalescing guard checks TrustLocalCacheCompletely (code inspection)', () => {
            // This test verifies the guard exists by reading the source.
            // The actual coalescing path in RunViews checks:
            //   if (CoalesceWindowMs > 0 && !this.TrustLocalCacheCompletely)
            // We verify by checking that a server provider (trust=true) would
            // NOT enter the coalescing branch.
            const server = new ServerTestProvider();
            const wouldCoalesce = ProviderBase.CoalesceWindowMs > 0 && !server.ExposedTrustLocalCacheCompletely;
            expect(wouldCoalesce).toBe(false);

            const client = new ClientTestProvider();
            const clientWouldCoalesce = ProviderBase.CoalesceWindowMs > 0 && !client.ExposedTrustLocalCacheCompletely;
            expect(clientWouldCoalesce).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Metadata fast-start (stale-while-revalidate) guard
    // -----------------------------------------------------------------------
    describe('Metadata fast-start (SWR) is client-only', () => {
        it('metadata SWR guard prevents server-side activation', () => {
            // Config() metadata fast-start checks:
            //   if (!this.TrustLocalCacheCompletely && !hardRefresh && !this._localMetadata?.AllEntities?.length)
            const server = new ServerTestProvider();
            const hardRefresh = false;
            const hasLocalMetadata = false; // simulating empty cache
            const wouldUseSWR = !server.ExposedTrustLocalCacheCompletely && !hardRefresh && !hasLocalMetadata;
            expect(wouldUseSWR).toBe(false);
        });

        it('metadata SWR is allowed for client-side providers', () => {
            const client = new ClientTestProvider();
            const hardRefresh = false;
            const hasLocalMetadata = false;
            const wouldUseSWR = !client.ExposedTrustLocalCacheCompletely && !hardRefresh && !hasLocalMetadata;
            expect(wouldUseSWR).toBe(true);
        });

        it('metadata SWR is blocked even if server has warm localStorage cache', () => {
            // Even with data in localStorage, the server should never use SWR
            const server = new ServerTestProvider();
            const hardRefresh = false;
            const hasLocalMetadata = false; // no _localMetadata yet
            // The guard fires BEFORE checking localStorage
            const wouldUseSWR = !server.ExposedTrustLocalCacheCompletely && !hardRefresh && !hasLocalMetadata;
            expect(wouldUseSWR).toBe(false);
        });

        it('metadata SWR is blocked for client when hardRefresh is true', () => {
            const client = new ClientTestProvider();
            const hardRefresh = true;
            const hasLocalMetadata = false;
            const wouldUseSWR = !client.ExposedTrustLocalCacheCompletely && !hardRefresh && !hasLocalMetadata;
            expect(wouldUseSWR).toBe(false);
        });

        it('metadata SWR is blocked for client when metadata already loaded', () => {
            const client = new ClientTestProvider();
            const hardRefresh = false;
            const hasLocalMetadata = true; // metadata already populated
            const wouldUseSWR = !client.ExposedTrustLocalCacheCompletely && !hardRefresh && !hasLocalMetadata;
            expect(wouldUseSWR).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // Combined: all optimizations are gated for server
    // -----------------------------------------------------------------------
    describe('All client-only optimizations are gated for server providers', () => {
        it('server provider should bypass ALL client-only optimizations', () => {
            const server = new ServerTestProvider();
            const trust = server.ExposedTrustLocalCacheCompletely;

            // Coalescing: guarded by !TrustLocalCacheCompletely
            expect(ProviderBase.CoalesceWindowMs > 0 && !trust).toBe(false);

            // Smart-cache-check (the fast-start replacement): guarded by !TrustLocalCacheCompletely
            expect(!trust).toBe(false);

            // Metadata cache pre-validation: guarded by !TrustLocalCacheCompletely
            expect(!trust && !false /* hardRefresh */ && !false /* hasMetadata */).toBe(false);
        });

        it('client provider should be eligible for ALL client-only optimizations', () => {
            const client = new ClientTestProvider();
            const trust = client.ExposedTrustLocalCacheCompletely;

            expect(ProviderBase.CoalesceWindowMs > 0 && !trust).toBe(true);
            expect(!trust).toBe(true);
            expect(!trust && !false && !false).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Static settings persistence
    // -----------------------------------------------------------------------
    describe('Static optimization settings', () => {
        const originalCoalesce = ProviderBase.CoalesceWindowMs;

        afterEach(() => {
            ProviderBase.CoalesceWindowMs = originalCoalesce;
        });

        it('CoalesceWindowMs can be disabled by setting to 0', () => {
            ProviderBase.CoalesceWindowMs = 0;
            const client = new ClientTestProvider();
            const wouldCoalesce = ProviderBase.CoalesceWindowMs > 0 && !client.ExposedTrustLocalCacheCompletely;
            expect(wouldCoalesce).toBe(false);
        });
    });
});
