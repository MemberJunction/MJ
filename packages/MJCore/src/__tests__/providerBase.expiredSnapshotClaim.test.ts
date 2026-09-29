/**
 * A freshness claim with nothing behind it must not be believed (plan §16.3 #3, found in review).
 *
 * The metadata snapshot is written as a payload followed by a timestamps key, deliberately in that
 * order so a half-written snapshot reads as obsolete. Under a per-key expiry the same order works
 * against us: the timestamps key is written last, so it is the last to expire, and there is a window
 * where the store holds a claim of freshness and no metadata. A cache clear produces the same window
 * on purpose, removing the timestamps key last.
 *
 * A process booting into that window used to adopt the stored timestamps and then return with no
 * metadata loaded. Its staleness check compared those timestamps with the database, found them
 * current, and concluded that its EMPTY metadata was up to date — a server that serves nothing and
 * never repairs itself. No single-process test saw it because it needs two keys to expire
 * independently; the fleet rig never saw it because nothing there waits an hour.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderConfigDataBase } from '../generic/interfaces';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import type { ILocalStorageProvider, IMetadataProvider, DatasetItemFilterType, DatasetStatusResultType } from '../generic/interfaces';
import type { UserInfo } from '../generic/securityInfo';

const DATA_KEY = '___MJCore_Metadata_AllMetadata';
const TIMESTAMPS_KEY = '___MJCore_Metadata_Timestamps';
const DB_UPDATED_AT = new Date('2026-09-01T00:00:00.000Z');

class StoredMetadataProvider extends TestMetadataProvider {
    constructor(private readonly store: ILocalStorageProvider) {
        super();
    }

    public override get LocalStorageProvider(): ILocalStorageProvider {
        return this.store;
    }

    public DatabaseUpdatedAt = DB_UPDATED_AT;

    public override async GetDatasetStatusByName(datasetName: string, _filters?: DatasetItemFilterType[], _user?: UserInfo, _provider?: IMetadataProvider): Promise<DatasetStatusResultType> {
        return { DatasetID: 'mock-dataset-id', DatasetName: datasetName, Success: true, Status: 'Ready', LatestUpdateDate: this.DatabaseUpdatedAt, EntityUpdateDates: [] };
    }

    /** Re-reads the store the way a booting process does. */
    public async LoadFromStorageForTest(): Promise<void> {
        await (this as unknown as { LoadLocalMetadataFromStorage(): Promise<void> }).LoadLocalMetadataFromStorage();
    }

    /** What this process would report as its own timestamps. */
    public get HeldTimestampsForTest(): unknown {
        return (this as unknown as { _latestLocalMetadataTimestamps: unknown })._latestLocalMetadataTimestamps;
    }

    /** Drops the held metadata, as a cold process has none. */
    public ForgetMetadataForTest(): void {
        (this as unknown as { _localMetadata: { AllEntities: unknown[] } })._localMetadata = { AllEntities: [] } as never;
    }
}

describe('a stored freshness claim with no payload behind it', () => {
    let store: MockCacheStorageProvider;
    let provider: StoredMetadataProvider;

    beforeEach(async () => {
        store = new MockCacheStorageProvider();
        provider = new StoredMetadataProvider(store);
        provider.setMockDelay(0);
        await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));
        expect(await store.GetItem(TIMESTAMPS_KEY)).not.toBeNull();
    });

    it('is ignored when the payload expired first, so the process does not claim to be current while empty', async () => {
        // The payload's TTL elapsed; the timestamps key, written later, is still there.
        await store.Remove(DATA_KEY);
        provider.ForgetMetadataForTest();

        await provider.LoadFromStorageForTest();

        expect(provider.HeldTimestampsForTest).toBeNull();
        // With no timestamps to compare, the process asks the database rather than assuming current.
        expect(await provider.CheckToSeeIfRefreshNeeded(undefined, true)).toBe(true);
    });

    it('is believed when the payload is there too', async () => {
        provider.ForgetMetadataForTest();
        await provider.LoadFromStorageForTest();

        expect(provider.HeldTimestampsForTest).not.toBeNull();
    });

    it('does not discard timestamps this process holds when the store was cleared entirely', async () => {
        // Both keys gone (another process cleared the cache) but this process still holds metadata:
        // it compares what it holds with the database instead of assuming it is stale.
        await store.Remove(DATA_KEY);
        await store.Remove(TIMESTAMPS_KEY);

        await provider.LoadFromStorageForTest();

        expect(provider.Entities.length).toBeGreaterThan(0);
        expect(await provider.CheckToSeeIfRefreshNeeded(undefined, true)).toBe(false);
    });
});

describe('a dataset date key that outlived its blob', () => {
    it('reports the cache out of date instead of throwing', async () => {
        const store = new MockCacheStorageProvider();
        const provider = new StoredMetadataProvider(store);
        provider.setMockDelay(0);
        await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));

        const dataset = {
            DatasetID: 'd1', DatasetName: 'Probe', Success: true, Status: 'Ready',
            LatestUpdateDate: new Date('2026-09-02T00:00:00.000Z'), Results: [],
        };
        await provider.CacheDataset('Probe', null as unknown as DatasetItemFilterType[], dataset as never);
        const dataKey = (await store.GetCategoryKeys('default')).find(k => k.includes('Probe') && !k.endsWith('_date'));
        expect(dataKey).toBeDefined();

        // The blob's TTL elapsed; its `_date` key, written after it, is still there.
        await store.Remove(dataKey as string);

        await expect(provider.IsDatasetCacheUpToDate('Probe')).resolves.toBe(false);
    });
});
