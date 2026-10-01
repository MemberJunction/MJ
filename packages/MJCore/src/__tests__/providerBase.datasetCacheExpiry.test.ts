/**
 * Dataset cache entries must expire, and their proxy key must expire FIRST (plan §22.3, §25).
 *
 * Dataset blobs are written to the `default` category, which this branch made never-expire because
 * that category holds proxy keys — entries that vouch for other entries, where a proxy outliving its
 * subject means a reader finds a freshness claim with nothing behind it. Datasets landing there
 * inherited "never expire" as a side effect, so every distinct filter set (`GetDatasetCacheKey`
 * includes the filters) accumulated a blob that nothing ever removed. Before this branch they
 * expired on the provider's default TTL.
 *
 * The fix is a per-write TTL, which the store prefers over its category default. The blob gets a
 * longer life than its `_date` key, so the pair expires in the safe order: the claim goes first and
 * the cache reads as absent, never as "fresh, but empty".
 */
import { describe, it, expect } from 'vitest';
import { ProviderConfigDataBase } from '../generic/interfaces';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import type { ILocalStorageProvider, LocalStorageWriteOptions, DatasetItemFilterType } from '../generic/interfaces';

type Write = { key: string; category?: string; options?: LocalStorageWriteOptions };

/** Records what each write was asked to do, and answers reads from what it stored. */
class RecordingStorage implements ILocalStorageProvider {
    public readonly Writes: Write[] = [];
    private readonly items = new Map<string, unknown>();

    private static slot(key: string, category?: string): string { return `${category ?? 'default'}::${key}`; }

    public async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> {
        return (this.items.get(RecordingStorage.slot(key, category)) as T) ?? null;
    }
    public async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> {
        const out = new Map<string, T | null>();
        for (const k of keys) { out.set(k, await this.GetItem<T>(k, category)); }
        return out;
    }
    public async SetItem<T>(key: string, value: T, category?: string, options?: LocalStorageWriteOptions): Promise<void> {
        this.Writes.push({ key, category, options });
        this.items.set(RecordingStorage.slot(key, category), value);
    }
    public async Remove(key: string, category?: string): Promise<void> {
        this.items.delete(RecordingStorage.slot(key, category));
    }
    public async ClearCategory(category: string): Promise<void> {
        for (const k of [...this.items.keys()]) {
            if (k.startsWith(`${category}::`)) { this.items.delete(k); }
        }
    }
    public async GetCategoryKeys(category: string): Promise<string[]> {
        return [...this.items.keys()].filter(k => k.startsWith(`${category}::`)).map(k => k.slice(category.length + 2));
    }
}

class StorageProbeProvider extends TestMetadataProvider {
    constructor(private readonly store: ILocalStorageProvider) { super(); }
    public override get LocalStorageProvider(): ILocalStorageProvider { return this.store; }
}

describe('dataset cache entries expire, proxy key first', () => {
    async function cacheOne(): Promise<RecordingStorage> {
        const store = new RecordingStorage();
        const provider = new StorageProbeProvider(store);
        provider.setMockDelay(0);
        await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));
        store.Writes.length = 0;

        await provider.CacheDataset('Probe', null as unknown as DatasetItemFilterType[], {
            DatasetID: 'd1', DatasetName: 'Probe', Success: true, Status: 'Ready',
            LatestUpdateDate: new Date('2026-09-02T00:00:00.000Z'), Results: [],
        } as never);
        return store;
    }

    it('gives both the blob and its date key a finite lifetime', async () => {
        const store = await cacheOne();
        const dataset = store.Writes.find(w => !w.key.endsWith('_date'));
        const date = store.Writes.find(w => w.key.endsWith('_date'));

        expect(dataset?.options?.TTLSeconds).toBeGreaterThan(0);
        expect(date?.options?.TTLSeconds).toBeGreaterThan(0);
    });

    it('expires the date key BEFORE the blob it vouches for', async () => {
        const store = await cacheOne();
        const dataset = store.Writes.find(w => !w.key.endsWith('_date'));
        const date = store.Writes.find(w => w.key.endsWith('_date'));

        // Strictly less: equal TTLs leave the order to whichever key the store happens to evict
        // first, and the date is written second, so it would usually outlive the blob.
        expect(date!.options!.TTLSeconds!).toBeLessThan(dataset!.options!.TTLSeconds!);
    });
});
