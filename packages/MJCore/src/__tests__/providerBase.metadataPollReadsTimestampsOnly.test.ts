/**
 * A periodic metadata check reads the full stored snapshot only when it may differ from what the
 * process holds.
 *
 * Every check used to download, decompress and deserialize the whole snapshot (3.7 MB on a real
 * database, ~230 ms) before comparing timestamps, even when nothing had changed. On a shared cache
 * that happened on every server at every poll.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DatasetItemFilterType, DatasetStatusResultType, ILocalStorageProvider, IMetadataProvider, ProviderConfigDataBase } from '../generic/interfaces';
import { UserInfo } from '../generic/securityInfo';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';

const DATA_KEY = '___MJCore_Metadata_AllMetadata';
const TIMESTAMPS_KEY = '___MJCore_Metadata_Timestamps';
const DB_UPDATED_AT = new Date('2026-09-01T00:00:00.000Z');

/** Counts which keys the provider reads from its store. */
class CountingStore extends MockCacheStorageProvider {
    public Reads = new Map<string, number>();

    override async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> {
        for (const key of keys) {
            this.Reads.set(key, (this.Reads.get(key) ?? 0) + 1);
        }
        return super.GetItems<T>(keys, category);
    }

    public ReadsOf(key: string): number {
        return this.Reads.get(key) ?? 0;
    }
}

class StoredMetadataProvider extends TestMetadataProvider {
    constructor(private readonly store: ILocalStorageProvider) {
        super();
    }

    public override get LocalStorageProvider(): ILocalStorageProvider {
        return this.store;
    }

    /** What the database reports; the same on every check unless a test changes it. */
    public DatabaseUpdatedAt = DB_UPDATED_AT;

    public override async GetDatasetStatusByName(datasetName: string, _filters?: DatasetItemFilterType[], _user?: UserInfo, _provider?: IMetadataProvider): Promise<DatasetStatusResultType> {
        return { DatasetID: 'mock-dataset-id', DatasetName: datasetName, Success: true, Status: 'Ready', LatestUpdateDate: this.DatabaseUpdatedAt, EntityUpdateDates: [] };
    }
}

describe('periodic metadata check', () => {
    let store: CountingStore;
    let provider: StoredMetadataProvider;

    beforeEach(async () => {
        store = new CountingStore();
        provider = new StoredMetadataProvider(store);
        provider.setMockDelay(0);
        await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));
        expect(provider.Entities.length).toBeGreaterThan(0);
        expect(await store.GetItem(TIMESTAMPS_KEY)).not.toBeNull(); // Config saved a snapshot
        store.Reads.clear();
    });

    it('reads only the timestamps when the stored snapshot is the one held', async () => {
        expect(await provider.CheckToSeeIfRefreshNeeded(undefined, true)).toBe(false);
        expect(await provider.CheckToSeeIfRefreshNeeded(undefined, true)).toBe(false);
        expect(store.ReadsOf(DATA_KEY)).toBe(0);
        expect(store.ReadsOf(TIMESTAMPS_KEY)).toBe(2);
    });

    it('loads the full snapshot when another process stored a different one', async () => {
        const peerTimestamps = [{ ID: '', Type: 'All Entity Metadata', UpdatedAt: '2026-09-02T00:00:00.000Z', RowCount: 0 }];
        await store.SetItem(TIMESTAMPS_KEY, JSON.stringify(peerTimestamps));

        const obsolete = await provider.CheckToSeeIfRefreshNeeded(undefined, true);

        expect(store.ReadsOf(DATA_KEY)).toBe(1);
        expect(obsolete).toBe(true); // the peer's snapshot is not what the database reports
        // Having loaded it, the next check is back to reading timestamps only.
        store.Reads.clear();
        await provider.CheckToSeeIfRefreshNeeded(undefined, true);
        expect(store.ReadsOf(DATA_KEY)).toBe(0);
    });

    it('after the store is cleared, compares the held metadata with the database instead of assuming it is stale', async () => {
        await store.Remove(TIMESTAMPS_KEY);
        await store.Remove(DATA_KEY);

        // The database has not changed, so the metadata this process holds is still current.
        expect(await provider.CheckToSeeIfRefreshNeeded(undefined, true)).toBe(false);
        expect(store.ReadsOf(DATA_KEY)).toBe(1);
        expect(provider.Entities.length).toBeGreaterThan(0);

        // Nothing is stored now, so later checks do not read the (absent) snapshot again.
        store.Reads.clear();
        expect(await provider.CheckToSeeIfRefreshNeeded(undefined, true)).toBe(false);
        expect(store.ReadsOf(DATA_KEY)).toBe(0);
    });

    it('after the store is cleared, reports stale when the database did change', async () => {
        await store.Remove(TIMESTAMPS_KEY);
        await store.Remove(DATA_KEY);
        provider.DatabaseUpdatedAt = new Date('2026-09-05T00:00:00.000Z');
        expect(await provider.CheckToSeeIfRefreshNeeded(undefined, true)).toBe(true);
    });
});
