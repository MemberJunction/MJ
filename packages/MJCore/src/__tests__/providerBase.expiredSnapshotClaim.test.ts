/**
 * A stored freshness claim must not be believed when the metadata it vouches for is absent.
 *
 * The snapshot is written payload-first, timestamps last, so a half-written one reads as obsolete.
 * Per-key expiry inverts that: the timestamps key is written last and so expires last, leaving a
 * window where the store holds a claim of freshness and no metadata. A cache clear leaves the same
 * window, removing the timestamps key last for the same reason.
 *
 * A process booting into that window must not adopt those timestamps. If it does, its staleness
 * check compares them against the database, finds them current, and concludes that its empty
 * metadata is up to date — a server that serves nothing and never repairs itself.
 *
 * Reproducing it needs two keys expiring independently, which is why the cases below drive expiry
 * directly rather than waiting.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderConfigDataBase } from '../generic/interfaces';
import { ProviderBase } from '../generic/providerBase';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import type { ILocalStorageProvider, IMetadataProvider, DatasetItemFilterType, DatasetStatusResultType, DatasetStatusEntityUpdateDateType } from '../generic/interfaces';
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

    /** What the server reports per entity; the row counts are what the blob is needed to compare against. */
    public DatabaseEntityUpdateDates: DatasetStatusEntityUpdateDateType[] = [];

    public override async GetDatasetStatusByName(datasetName: string, _filters?: DatasetItemFilterType[], _user?: UserInfo, _provider?: IMetadataProvider): Promise<DatasetStatusResultType> {
        return { DatasetID: 'mock-dataset-id', DatasetName: datasetName, Success: true, Status: 'Ready', LatestUpdateDate: this.DatabaseUpdatedAt, EntityUpdateDates: this.DatabaseEntityUpdateDates };
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
    /**
     * Caches a dataset and returns the key of the blob (not the `_date` key that vouches for it).
     * Datasets live in `ProviderBase.DatasetCacheCategory`, so both the lookup and the eviction
     * below have to name it — a category-less `Remove` would delete nothing and leave the blob in
     * place, which is the whole condition these cases simulate.
     */
    async function cacheProbe(provider: StoredMetadataProvider, store: MockCacheStorageProvider): Promise<string> {
        const dataset = {
            DatasetID: 'd1', DatasetName: 'Probe', Success: true, Status: 'Ready',
            LatestUpdateDate: new Date('2026-09-02T00:00:00.000Z'),
            Results: [{ EntityID: 'E1', EntityName: 'Probes', Results: [{ ID: '1' }] }],
        };
        await provider.CacheDataset('Probe', null as unknown as DatasetItemFilterType[], dataset as never);
        const dataKey = (await store.GetCategoryKeys(ProviderBase.DatasetCacheCategory)).find(k => k.includes('Probe') && !k.endsWith('_date'));
        expect(dataKey).toBeDefined();
        return dataKey as string;
    }

    async function newProvider(store: MockCacheStorageProvider): Promise<StoredMetadataProvider> {
        const provider = new StoredMetadataProvider(store);
        provider.setMockDelay(0);
        await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));
        return provider;
    }

    it('reports the cache out of date instead of throwing, when there are row counts to compare', async () => {
        const store = new MockCacheStorageProvider();
        const provider = await newProvider(store);
        provider.DatabaseEntityUpdateDates = [{ EntityName: 'Probes', EntityID: 'E1', UpdateDate: new Date('2026-09-02T00:00:00.000Z'), RowCount: 1 }];
        const dataKey = await cacheProbe(provider, store);

        expect(await provider.IsDatasetCacheUpToDate('Probe')).toBe(true);

        // The blob's TTL elapsed; its `_date` key, written after it, is still there.
        await store.Remove(dataKey, ProviderBase.DatasetCacheCategory);

        await expect(provider.IsDatasetCacheUpToDate('Probe')).resolves.toBe(false);
    });

    it('still answers on the server timestamp alone when the server reports no entity row counts', async () => {
        // The row-count comparison is an EXTRA check layered on the timestamp comparison, not a
        // requirement that the blob be readable. A dataset whose status carries no per-entity counts
        // (including the integration tier's) has always been judged by its timestamp, and a guard
        // that demanded the blob made such a dataset permanently stale — an infinite reload loop.
        const store = new MockCacheStorageProvider();
        const provider = await newProvider(store);
        provider.DatabaseEntityUpdateDates = [];
        const dataKey = await cacheProbe(provider, store);
        await store.Remove(dataKey, ProviderBase.DatasetCacheCategory);

        await expect(provider.IsDatasetCacheUpToDate('Probe')).resolves.toBe(true);
    });
});
