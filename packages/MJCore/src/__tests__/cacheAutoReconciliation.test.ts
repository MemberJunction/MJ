import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import { InMemoryLocalStorageProvider } from '../generic/inMemoryLocalStorageProvider';
import { ProviderBase } from '../generic/providerBase';
import {
    AllMetadata,
    DatasetResultType,
    DatasetStatusResultType,
    EntityRecordNameInput,
    EntityRecordNameResult,
    ILocalStorageProvider,
    IMetadataProvider,
    MetadataInfo,
    PotentialDuplicateResponse,
    ProviderType,
    RunViewResult,
} from '../generic/interfaces';
import { RunViewParams } from '../views/runView';
import { RunQueryResult } from '../generic/runQuery';
import { QueryExecutionSpec } from '../generic/queryExecutionSpec';
import { CompositeKey } from '../generic/compositeKey';
import { RecordDependency, UserInfo } from '../generic/securityInfo';
import { EntityInfo, RecordMergeRequest, RecordMergeResult } from '../generic/entityInfo';
import { TransactionGroupBase } from '../generic/transactionGroup';
import * as loggingModule from '../generic/logging';
import { GetGlobalObjectStore } from '@memberjunction/global';

class MetadataReconcileTestProvider extends ProviderBase {
    private readonly _storage = new InMemoryLocalStorageProvider();
    public MockDatasetResult: DatasetResultType = {
        DatasetID: 'ds-meta',
        DatasetName: 'MJ_Metadata',
        Success: true,
        Status: 'OK',
        LatestUpdateDate: new Date('2026-04-20T12:05:00.000Z'),
        Results: [],
    };
    public MockStatusResult: DatasetStatusResultType = {
        DatasetID: 'ds-meta',
        DatasetName: 'MJ_Metadata',
        Success: true,
        Status: 'OK',
        LatestUpdateDate: new Date('2026-04-20T12:05:00.000Z'),
        EntityUpdateDates: [],
    };

    public SetLocalTimestamps(stamps: MetadataInfo[]): void {
        this._latestLocalMetadataTimestamps = stamps;
    }

    public SetRemoteTimestamps(stamps: MetadataInfo[]): void {
        this._latestRemoteMetadataTimestamps = stamps;
    }

    public RegisterDatasetMembership(dataset: DatasetResultType): void {
        this.registerMetadataDatasetMembership(dataset);
    }

    public async InvokeAdoptServerMetadata(md: AllMetadata): Promise<void> {
        const adoptFn = (this as unknown as { adoptServerMetadata: (res: AllMetadata) => Promise<void> }).adoptServerMetadata;
        await adoptFn.call(this, md);
    }

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
    protected async GetCurrentUser(): Promise<UserInfo> { return new UserInfo(this, { ID: 'u1', Name: 'Tester' }); }
    public async GetRecordDependencies(): Promise<RecordDependency[]> { return []; }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> {
        return { EntityName: '', PrimaryKey: new CompositeKey(), DuplicateRunDetailMatchRecords: [] };
    }
    public async MergeRecords(): Promise<RecordMergeResult> {
        return { Success: false, OverallStatus: 'Error', RecordMergeLogID: '', RecordStatus: [], Request: {} as RecordMergeRequest, KeyValueOfSurvivingRecord: new CompositeKey() };
    }
    public async GetDatasetByName(): Promise<DatasetResultType> {
        return this.MockDatasetResult;
    }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> {
        return this.MockStatusResult;
    }
    public get InstanceConnectionString(): string { return 'test-reconcile-conn'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    get LocalStorageProvider(): ILocalStorageProvider { return this._storage; }
    protected get Metadata(): IMetadataProvider { return this; }
}

describe('Part 1: LocalCacheManager lastVerifiedAt & TouchRunViewResultVerifiedAt', () => {
    let cacheManager: LocalCacheManager;

    beforeEach(async () => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        cacheManager = LocalCacheManager.Instance;
        // InMemoryLocalStorageProvider has SharesReferences = true, so stored payloads are deep-frozen
        await cacheManager.Initialize(new InMemoryLocalStorageProvider(), { verboseLogging: false });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('populates cachedAt and lastVerifiedAt on SetRunViewResult and updates lastVerifiedAt in O(1) via TouchRunViewResultVerifiedAt even on frozen entries', async () => {
        const params: RunViewParams = { EntityName: 'Widgets' };
        const fp = cacheManager.GenerateRunViewFingerprint(params);

        const beforeWrite = Date.now();
        await cacheManager.SetRunViewResult(
            fp,
            params,
            [{ ID: 'w1', Name: 'Widget 1', __mj_UpdatedAt: '2026-04-20T12:00:00.000Z' }],
            '2026-04-20T12:00:00.000Z',
            undefined,
            1,
        );
        const afterWrite = Date.now();

        const initialHit = await cacheManager.GetRunViewResult(fp);
        expect(initialHit).not.toBeNull();
        expect(initialHit?.cachedAt).toBeGreaterThanOrEqual(beforeWrite);
        expect(initialHit?.cachedAt).toBeLessThanOrEqual(afterWrite);
        expect(initialHit?.lastVerifiedAt).toBe(initialHit?.cachedAt);

        // TouchRunViewResultVerifiedAt must succeed without throwing on a deep-frozen in-memory entry
        const touchedTimestamp = afterWrite + 60_000;
        cacheManager.TouchRunViewResultVerifiedAt(fp, touchedTimestamp);

        const afterTouchHit = await cacheManager.GetRunViewResult(fp);
        expect(afterTouchHit?.lastVerifiedAt).toBe(touchedTimestamp);
        // cachedAt remains the original creation time
        expect(afterTouchHit?.cachedAt).toBe(initialHit?.cachedAt);
    });

    it('updates lastVerifiedAt when ApplyDifferentialUpdate mutates a cached slot', async () => {
        const params: RunViewParams = { EntityName: 'Widgets' };
        const fp = cacheManager.GenerateRunViewFingerprint(params);

        const mockProvider = {
            EntityByName: () => new EntityInfo({
                ID: 'ent-widgets',
                Name: 'Widgets',
                AllowCaching: true,
                EntityFields: [{ ID: 'f1', Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier' }],
            }),
        } as unknown as IMetadataProvider;

        await cacheManager.SetRunViewResult(
            fp,
            params,
            [{ ID: 'w1', Name: 'Widget 1', __mj_UpdatedAt: '2026-04-20T12:00:00.000Z' }],
            '2026-04-20T12:00:00.000Z',
            undefined,
            1,
            mockProvider,
        );

        const pastTime = Date.now() - 30_000;
        cacheManager.TouchRunViewResultVerifiedAt(fp, pastTime);
        expect((await cacheManager.GetRunViewResult(fp))?.lastVerifiedAt).toBe(pastTime);

        const updated = await cacheManager.ApplyDifferentialUpdate(
            fp,
            params,
            [{ ID: 'w2', Name: 'Widget 2', __mj_UpdatedAt: '2026-04-20T12:05:00.000Z' }],
            [],
            'ID',
            '2026-04-20T12:05:00.000Z',
            2,
        );
        expect(updated).not.toBeNull();
        expect(updated?.lastVerifiedAt).toBeGreaterThan(pastTime);

        const afterDiff = await cacheManager.GetRunViewResult(fp);
        expect(afterDiff?.rowCount).toBe(2);
        expect(afterDiff?.lastVerifiedAt).toBeGreaterThan(pastTime);
    });
});

describe('Part 4: ProviderBase.adoptServerMetadata Row-Count Reconciliation', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('advances all local timestamps when received dataset item row counts match _latestRemoteMetadataTimestamps', async () => {
        const provider = new MetadataReconcileTestProvider();
        const warnSpy = vi.spyOn(loggingModule, 'LogWarning');

        const dataset: DatasetResultType = {
            DatasetID: 'ds-meta',
            DatasetName: 'MJ_Metadata',
            Success: true,
            Status: 'OK',
            LatestUpdateDate: new Date('2026-04-20T12:05:00.000Z'),
            Results: [
                {
                    Code: 'Entities',
                    EntityName: 'MJ: Entities',
                    EntityID: 'ent-1',
                    Results: [{ ID: 'e1' }, { ID: 'e2' }],
                    LatestUpdateDate: new Date('2026-04-20T12:00:00.000Z'),
                },
                {
                    Code: 'EntityFields',
                    EntityName: 'MJ: Entity Fields',
                    EntityID: 'ent-2',
                    Results: [{ ID: 'f1' }, { ID: 'f2' }, { ID: 'f3' }],
                    LatestUpdateDate: new Date('2026-04-20T12:05:00.000Z'),
                },
            ],
        };

        provider.RegisterDatasetMembership(dataset);
        provider.SetRemoteTimestamps([
            { ID: 'ent-1', Type: 'MJ: Entities', UpdatedAt: new Date('2026-04-20T12:00:00.000Z'), RowCount: 2 },
            { ID: 'ent-2', Type: 'MJ: Entity Fields', UpdatedAt: new Date('2026-04-20T12:05:00.000Z'), RowCount: 3 },
            { ID: '', Type: 'AllMetadata', UpdatedAt: new Date('2026-04-20T12:05:00.000Z'), RowCount: 5 },
        ]);

        await provider.InvokeAdoptServerMetadata(new AllMetadata());

        expect(warnSpy).not.toHaveBeenCalled();
        expect(provider.LocalMetadataObsolete()).toBe(false);
    });

    it('logs a warning and preserves unadvanced local timestamp for a dataset item whose received row count disagrees with remote status', async () => {
        const provider = new MetadataReconcileTestProvider();
        const warnSpy = vi.spyOn(loggingModule, 'LogWarning').mockImplementation(() => {});

        // Prior local timestamps had 5 EntityFields at 12:00:00Z
        provider.SetLocalTimestamps([
            { ID: 'ent-1', Type: 'MJ: Entities', UpdatedAt: new Date('2026-04-20T12:00:00.000Z'), RowCount: 2 },
            { ID: 'ent-2', Type: 'MJ: Entity Fields', UpdatedAt: new Date('2026-04-20T12:00:00.000Z'), RowCount: 5 },
            { ID: '', Type: 'AllMetadata', UpdatedAt: new Date('2026-04-20T12:00:00.000Z'), RowCount: 7 },
        ]);

        // Remote status reports 7 EntityFields at 12:05:00Z
        provider.SetRemoteTimestamps([
            { ID: 'ent-1', Type: 'MJ: Entities', UpdatedAt: new Date('2026-04-20T12:00:00.000Z'), RowCount: 2 },
            { ID: 'ent-2', Type: 'MJ: Entity Fields', UpdatedAt: new Date('2026-04-20T12:05:00.000Z'), RowCount: 7 },
            { ID: '', Type: 'AllMetadata', UpdatedAt: new Date('2026-04-20T12:05:00.000Z'), RowCount: 9 },
        ]);

        // Suppose the dataset loaded only 5 rows for EntityFields (stale cache slot)
        const staleDataset: DatasetResultType = {
            DatasetID: 'ds-meta',
            DatasetName: 'MJ_Metadata',
            Success: true,
            Status: 'OK',
            LatestUpdateDate: new Date('2026-04-20T12:00:00.000Z'),
            Results: [
                {
                    Code: 'Entities',
                    EntityName: 'MJ: Entities',
                    EntityID: 'ent-1',
                    Results: [{ ID: 'e1' }, { ID: 'e2' }],
                    LatestUpdateDate: new Date('2026-04-20T12:00:00.000Z'),
                },
                {
                    Code: 'EntityFields',
                    EntityName: 'MJ: Entity Fields',
                    EntityID: 'ent-2',
                    Results: [{ ID: 'f1' }, { ID: 'f2' }, { ID: 'f3' }, { ID: 'f4' }, { ID: 'f5' }],
                    LatestUpdateDate: new Date('2026-04-20T12:00:00.000Z'),
                },
            ],
        };

        provider.RegisterDatasetMembership(staleDataset);
        await provider.InvokeAdoptServerMetadata(new AllMetadata());

        // Must have logged a warning for MJ: Entity Fields
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Row count mismatch when adopting server metadata for "MJ: Entity Fields": received 5 rows but remote status reported 7 rows'),
            'Metadata',
        );

        // Matching item (MJ: Entities) is NOT obsolete
        expect(provider.LocalMetadataObsolete('MJ: Entities')).toBe(false);
        // Mismatched item (MJ: Entity Fields) was NOT advanced to 7 rows / 12:05:00Z, so LocalMetadataObsolete self-heals on next check!
        expect(provider.LocalMetadataObsolete('MJ: Entity Fields')).toBe(true);
        expect(provider.LocalMetadataObsolete()).toBe(true);
    });
});
