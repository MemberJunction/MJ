import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderBase } from '../generic/providerBase';
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
    AllMetadata,
} from '../generic/interfaces';
import { RunQueryResult } from '../generic/runQuery';
import { QueryExecutionSpec } from '../generic/queryExecutionSpec';
import { CompositeKey } from '../generic/compositeKey';
import { UserInfo, RecordDependency } from '../generic/securityInfo';
import { RecordMergeRequest, RecordMergeResult } from '../generic/entityInfo';
import { TransactionGroupBase } from '../generic/transactionGroup';
import { BaseEntity, BaseEntityEvent } from '../generic/baseEntity';
import { MJGlobal, MJEventType } from '@memberjunction/global';

// ---------------------------------------------------------------------------
// Minimal concrete provider exposing the metadata-member refresh seams
// ---------------------------------------------------------------------------
class MemberRefreshTestProvider extends ProviderBase {
    public RefreshCalls = 0;
    public HardRefreshCalls = 0;

    constructor(private readonly _connectionString: string = 'test-backend') {
        super();
    }

    protected override async RefreshAfterMetadataMemberChange(): Promise<boolean> {
        this.RefreshCalls++;
        return true;
    }

    public override async Refresh(): Promise<boolean> {
        this.HardRefreshCalls++;
        return true;
    }

    // Public seams over the protected mechanism
    public RegisterMembership(d: DatasetResultType): void {
        this.registerMetadataDatasetMembership(d);
    }
    public HandleMemberEvent(lowerEntityName: string, entityEvent: BaseEntityEvent): void {
        this.handleMetadataMemberEntityEvent(lowerEntityName, entityEvent);
    }
    public CancelPendingRefresh(): void {
        this.CancelPendingMetadataMemberRefresh();
    }

    // ── Boilerplate abstract implementations ──────────────────────────
    override get PlatformKey() { return 'sqlserver' as const; }
    protected get AllowRefresh(): boolean { return true; }
    public get ProviderType(): ProviderType { return 'Database'; }
    public get DatabaseConnection(): object { return {}; }
    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(_info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> { /* noop */ }
    protected async InternalRunView<T>(): Promise<RunViewResult<T>> {
        return { Success: true, Results: [] as T[], TotalRowCount: 0, ExecutionTime: 0, RowCount: 0, UserViewRunID: '', Filtered: false, ErrorMessage: '' };
    }
    protected async InternalRunViews<T>(): Promise<RunViewResult<T>[]> { return []; }
    protected async InternalRunQuery(): Promise<RunQueryResult> { return { Success: true, Results: [], Fields: [] }; }
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
        return { DatasetID: '', DatasetName: '', Success: false, Status: 'Error', Results: [], LatestUpdateDate: new Date() };
    }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> {
        return { DatasetID: '', DatasetName: '', Success: false, Status: 'Error', LatestUpdateDate: new Date(), EntityUpdateDates: [] };
    }
    public get InstanceConnectionString(): string { return this._connectionString; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    get LocalStorageProvider(): ILocalStorageProvider { return null as unknown as ILocalStorageProvider; }
    protected get Metadata(): IMetadataProvider { return {} as IMetadataProvider; }
}

/** A dataset result shaped like MJ_Metadata: the item list IS the membership declaration. */
function buildDataset(entityNames: string[]): DatasetResultType {
    return {
        DatasetID: 'ds-metadata',
        DatasetName: 'MJ_Metadata',
        Success: true,
        Status: '',
        LatestUpdateDate: new Date(),
        Results: entityNames.map((name, i) => ({
            Code: `Item${i}`,
            EntityName: name,
            EntityID: `ent-${i}`,
            Results: [],
        })),
    };
}

function saveEvent(entityName: string, savingProvider?: ProviderBase): BaseEntityEvent {
    const fakeEntity = {
        EntityInfo: { Name: entityName },
        ProviderToUse: savingProvider,
    } as unknown as BaseEntity;
    return { type: 'save', baseEntity: fakeEntity, payload: null } as BaseEntityEvent;
}

function remoteInvalidateEvent(entityName: string, receivingProvider?: IMetadataProvider): BaseEntityEvent {
    return {
        type: 'remote-invalidate',
        entityName,
        baseEntity: null,
        provider: receivingProvider,
        payload: null,
    } as BaseEntityEvent;
}

// ===========================================================================
// Tests
// ===========================================================================
describe('ProviderBase - metadata refresh driven by dataset membership', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('a write to a dataset member entity schedules ONE debounced refresh', async () => {
        const provider = new MemberRefreshTestProvider();
        provider.RegisterMembership(buildDataset(['MJ: Entities', 'MJ: Entity Field Permissions']));

        provider.HandleMemberEvent('mj: entity field permissions', saveEvent('MJ: Entity Field Permissions'));
        expect(provider.RefreshCalls).toBe(0); // debounced, not immediate

        await vi.advanceTimersByTimeAsync(ProviderBase.MetadataDatasetRefreshDebounceMs + 100);
        expect(provider.RefreshCalls).toBe(1);
    });

    it('membership comes from the dataset definition — an arbitrary new item entity is covered with no code change', async () => {
        const provider = new MemberRefreshTestProvider();
        provider.RegisterMembership(buildDataset(['Some: Brand New Metadata Entity']));

        provider.HandleMemberEvent('some: brand new metadata entity', saveEvent('Some: Brand New Metadata Entity'));
        await vi.advanceTimersByTimeAsync(ProviderBase.MetadataDatasetRefreshDebounceMs + 100);

        expect(provider.RefreshCalls).toBe(1);
    });

    it('ignores writes to entities that are not dataset members', async () => {
        const provider = new MemberRefreshTestProvider();
        provider.RegisterMembership(buildDataset(['MJ: Entities']));

        provider.HandleMemberEvent('accounts', saveEvent('Accounts'));
        provider.HandleMemberEvent('mj: ai prompts', saveEvent('MJ: AI Prompts'));
        await vi.advanceTimersByTimeAsync(ProviderBase.MetadataDatasetRefreshDebounceMs + 100);

        expect(provider.RefreshCalls).toBe(0);
    });

    it('collapses a burst into ONE refresh — enabling field security writes one row per field/role pair', async () => {
        const provider = new MemberRefreshTestProvider();
        provider.RegisterMembership(buildDataset(['MJ: Entity Field Permissions']));

        for (let i = 0; i < 84; i++) {
            provider.HandleMemberEvent('mj: entity field permissions', saveEvent('MJ: Entity Field Permissions'));
        }
        await vi.advanceTimersByTimeAsync(ProviderBase.MetadataDatasetRefreshDebounceMs + 100);

        expect(provider.RefreshCalls).toBe(1);
    });

    it('an empty or failed dataset load does not erase previously recorded membership', async () => {
        const provider = new MemberRefreshTestProvider();
        provider.RegisterMembership(buildDataset(['MJ: Entities']));
        provider.RegisterMembership(buildDataset([])); // must be a no-op

        provider.HandleMemberEvent('mj: entities', saveEvent('MJ: Entities'));
        await vi.advanceTimersByTimeAsync(ProviderBase.MetadataDatasetRefreshDebounceMs + 100);

        expect(provider.RefreshCalls).toBe(1);
    });

    it('a remote-invalidate for another provider does not refresh this one; its own (or unattributed) does', async () => {
        const provider = new MemberRefreshTestProvider('backend-a');
        const otherProvider = new MemberRefreshTestProvider('backend-b');
        provider.RegisterMembership(buildDataset(['MJ: Roles']));

        provider.HandleMemberEvent('mj: roles', remoteInvalidateEvent('MJ: Roles', otherProvider));
        await vi.advanceTimersByTimeAsync(ProviderBase.MetadataDatasetRefreshDebounceMs + 100);
        expect(provider.RefreshCalls).toBe(0);

        provider.HandleMemberEvent('mj: roles', remoteInvalidateEvent('MJ: Roles', provider));
        await vi.advanceTimersByTimeAsync(ProviderBase.MetadataDatasetRefreshDebounceMs + 100);
        expect(provider.RefreshCalls).toBe(1);

        provider.HandleMemberEvent('mj: roles', remoteInvalidateEvent('MJ: Roles', undefined));
        await vi.advanceTimersByTimeAsync(ProviderBase.MetadataDatasetRefreshDebounceMs + 100);
        expect(provider.RefreshCalls).toBe(2);
    });

    it('a save through a provider on a DIFFERENT backend does not refresh this one; the same backend does', async () => {
        const provider = new MemberRefreshTestProvider('mssql://db-one:1433/mj');
        const sameBackend = new MemberRefreshTestProvider('mssql://db-one:1433/mj'); // e.g. a per-request provider
        const otherBackend = new MemberRefreshTestProvider('mssql://db-two:1433/other');
        provider.RegisterMembership(buildDataset(['MJ: Entities']));

        provider.HandleMemberEvent('mj: entities', saveEvent('MJ: Entities', otherBackend));
        await vi.advanceTimersByTimeAsync(ProviderBase.MetadataDatasetRefreshDebounceMs + 100);
        expect(provider.RefreshCalls).toBe(0);

        provider.HandleMemberEvent('mj: entities', saveEvent('MJ: Entities', sameBackend));
        await vi.advanceTimersByTimeAsync(ProviderBase.MetadataDatasetRefreshDebounceMs + 100);
        expect(provider.RefreshCalls).toBe(1);
    });

    it('a save with no identifiable provider fails OPEN — the refresh happens', async () => {
        const provider = new MemberRefreshTestProvider();
        provider.RegisterMembership(buildDataset(['MJ: Entities']));

        provider.HandleMemberEvent('mj: entities', saveEvent('MJ: Entities', undefined));
        await vi.advanceTimersByTimeAsync(ProviderBase.MetadataDatasetRefreshDebounceMs + 100);

        expect(provider.RefreshCalls).toBe(1);
    });

    it('the base refresh policy is a HARD Refresh — the writer must not trust any cache layer for the re-read', async () => {
        // Use a provider that does NOT override RefreshAfterMetadataMemberChange
        class BasePolicyProvider extends MemberRefreshTestProvider {
            protected override async RefreshAfterMetadataMemberChange(): Promise<boolean> {
                return ProviderBase.prototype['RefreshAfterMetadataMemberChange'].call(this);
            }
        }
        const provider = new BasePolicyProvider();
        provider.RegisterMembership(buildDataset(['MJ: Entities']));

        provider.HandleMemberEvent('mj: entities', saveEvent('MJ: Entities'));
        await vi.advanceTimersByTimeAsync(ProviderBase.MetadataDatasetRefreshDebounceMs + 100);

        expect(provider.HardRefreshCalls).toBe(1);
    });

    it('a failed refresh is swallowed and logged, never an unhandled rejection', async () => {
        class FailingProvider extends MemberRefreshTestProvider {
            protected override async RefreshAfterMetadataMemberChange(): Promise<boolean> {
                throw new Error('network down');
            }
        }
        const provider = new FailingProvider();
        provider.RegisterMembership(buildDataset(['MJ: Roles']));

        provider.HandleMemberEvent('mj: roles', saveEvent('MJ: Roles'));
        await expect(
            vi.advanceTimersByTimeAsync(ProviderBase.MetadataDatasetRefreshDebounceMs + 100)
        ).resolves.not.toThrow();
    });

    it('CancelPendingMetadataMemberRefresh stops an armed timer (teardown path)', async () => {
        const provider = new MemberRefreshTestProvider();
        provider.RegisterMembership(buildDataset(['MJ: Entities']));

        provider.HandleMemberEvent('mj: entities', saveEvent('MJ: Entities'));
        provider.CancelPendingRefresh();
        await vi.advanceTimersByTimeAsync(ProviderBase.MetadataDatasetRefreshDebounceMs + 100);

        expect(provider.RefreshCalls).toBe(0);
    });

    it('end-to-end through the event bus: a member-entity save reaches a registered provider', async () => {
        const provider = new MemberRefreshTestProvider();
        provider.RegisterMembership(buildDataset(['MJ: Entity Permissions'])); // registers with the static fan-out

        MJGlobal.Instance.RaiseEvent({
            event: MJEventType.ComponentEvent,
            eventCode: BaseEntity.BaseEventCode,
            args: saveEvent('MJ: Entity Permissions', provider),
            component: provider,
        });
        await vi.advanceTimersByTimeAsync(ProviderBase.MetadataDatasetRefreshDebounceMs + 100);

        expect(provider.RefreshCalls).toBe(1);
    });
});

describe('ProviderBase - refresh-check throttle bypass', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    function stubCheckDependencies(provider: MemberRefreshTestProvider): ReturnType<typeof vi.fn> {
        const remoteSpy = vi.fn().mockResolvedValue(true);
        (provider as unknown as { RefreshRemoteMetadataTimestamps: unknown }).RefreshRemoteMetadataTimestamps = remoteSpy;
        (provider as unknown as { LoadLocalMetadataFromStorage: () => Promise<void> }).LoadLocalMetadataFromStorage = vi.fn().mockResolvedValue(undefined);
        (provider as unknown as { LocalMetadataObsolete: () => boolean }).LocalMetadataObsolete = vi.fn().mockReturnValue(false);
        return remoteSpy;
    }

    it('within the min-check interval, a plain check is throttled but a bypassed check still runs', async () => {
        const provider = new MemberRefreshTestProvider();
        const remoteSpy = stubCheckDependencies(provider);

        await provider.CheckToSeeIfRefreshNeeded(); // stamps _lastRefreshCheckAt
        expect(remoteSpy).toHaveBeenCalledTimes(1);

        // Second plain check inside the window: throttled — no remote timestamp fetch
        await provider.CheckToSeeIfRefreshNeeded();
        expect(remoteSpy).toHaveBeenCalledTimes(1);

        // Event-driven callers hold positive evidence a member entity was just written — the
        // throttle must not eat their check, or the second of two permission changes made less
        // than the window apart is silently dropped.
        await provider.CheckToSeeIfRefreshNeeded(undefined, true);
        expect(remoteSpy).toHaveBeenCalledTimes(2);
    });
});

// ===========================================================================
// Scheduling-policy knobs (server debounce vs client coalescing window)
// ===========================================================================
describe('ProviderBase - member-refresh scheduling policy', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('base policy DEBOUNCES: every event re-arms the timer, so the refresh runs after the burst ends', async () => {
        const provider = new MemberRefreshTestProvider();
        provider.RegisterMembership(buildDataset(['MJ: Entities']));

        provider.HandleMemberEvent('mj: entities', saveEvent('MJ: Entities'));
        await vi.advanceTimersByTimeAsync(400); // inside the 500ms window
        provider.HandleMemberEvent('mj: entities', saveEvent('MJ: Entities'));
        await vi.advanceTimersByTimeAsync(400); // 800ms after first event — but only 400ms after re-arm
        expect(provider.RefreshCalls).toBe(0);

        await vi.advanceTimersByTimeAsync(200); // 600ms after the LAST event
        expect(provider.RefreshCalls).toBe(1);
    });

    it('coalescing policy does NOT re-arm: events join the armed window, one refresh per window at any write rate', async () => {
        class CoalescingProvider extends MemberRefreshTestProvider {
            protected override get MetadataMemberRefreshDelayMs(): number { return 10_000; }
            protected override get MetadataMemberRefreshRearmsOnNewEvents(): boolean { return false; }
        }
        const provider = new CoalescingProvider();
        provider.RegisterMembership(buildDataset(['MJ: Dashboards']));

        provider.HandleMemberEvent('mj: dashboards', saveEvent('MJ: Dashboards'));
        // Steady write activity throughout the window — with re-arming this would starve forever
        for (let i = 0; i < 9; i++) {
            await vi.advanceTimersByTimeAsync(1_000);
            provider.HandleMemberEvent('mj: dashboards', saveEvent('MJ: Dashboards'));
        }
        await vi.advanceTimersByTimeAsync(1_100); // past the ORIGINAL window's end
        expect(provider.RefreshCalls).toBe(1);

        // A write after the window fired arms a fresh window
        provider.HandleMemberEvent('mj: dashboards', saveEvent('MJ: Dashboards'));
        await vi.advanceTimersByTimeAsync(10_100);
        expect(provider.RefreshCalls).toBe(2);
    });
});

// ===========================================================================
// Single-flight metadata reload
// ===========================================================================
describe('ProviderBase - single-flight metadata reload', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    /** Minimal in-memory storage so Config's LocalCacheManager.Initialize has a real provider. */
    const memoryStorage: ILocalStorageProvider = {
        SharesReferences: false,
        async GetItem(): Promise<string | null> { return null; },
        async GetItems(): Promise<Map<string, string | null>> { return new Map(); },
        async SetItem(): Promise<void> { /* noop */ },
        async Remove(): Promise<void> { /* noop */ },
        async ClearCategory(): Promise<void> { /* noop */ },
        async GetCategoryKeys(): Promise<string[]> { return []; },
    } as unknown as ILocalStorageProvider;

    class SingleFlightProvider extends MemberRefreshTestProvider {
        public GetAllMetadataCalls = 0;
        private _pendingResolvers: Array<(value: AllMetadata) => void> = [];

        override get LocalStorageProvider(): ILocalStorageProvider { return memoryStorage; }

        /** Real Refresh → Config path (the parent test class stubs Refresh to a counter). */
        public override async Refresh(providerToUse?: IMetadataProvider): Promise<boolean> {
            return ProviderBase.prototype.Refresh.call(this, providerToUse);
        }

        protected override async GetAllMetadata(): Promise<AllMetadata> {
            this.GetAllMetadataCalls++;
            return new Promise<AllMetadata>((resolve) => {
                this._pendingResolvers.push(resolve);
            });
        }

        /** Completes the OLDEST in-flight GetAllMetadata. */
        public ResolveOldestReload(): void {
            const resolve = this._pendingResolvers.shift();
            if (resolve) {
                resolve(new AllMetadata());
            }
        }
    }

    it('a refresh request arriving mid-reload queues exactly ONE follow-up instead of racing a concurrent reload', async () => {
        const provider = new SingleFlightProvider();

        const first = provider.Refresh();
        const second = provider.Refresh(); // lands while the first reload is still awaiting its queries
        const third = provider.Refresh();  // still only ONE follow-up may be queued
        await vi.waitFor(() => expect(provider.GetAllMetadataCalls).toBe(1));
        // Give the other two Refresh() calls every chance to start a concurrent reload — they must not
        for (let i = 0; i < 10; i++) {
            await Promise.resolve();
        }
        expect(provider.GetAllMetadataCalls).toBe(1);

        provider.ResolveOldestReload();
        await vi.waitFor(() => expect(provider.GetAllMetadataCalls).toBe(2)); // the single queued follow-up

        provider.ResolveOldestReload();
        await expect(Promise.all([first, second, third])).resolves.toEqual([true, true, true]);
        expect(provider.GetAllMetadataCalls).toBe(2); // never a third
    });
});
