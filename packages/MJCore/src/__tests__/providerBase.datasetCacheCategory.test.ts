/**
 * The dataset cache's category, and the freshness comparison the category gated.
 *
 * Six functions on `ProviderBase` touch the dataset cache. Between `987a126aab` (2026-05-02) and
 * `ProviderBase.DatasetCacheCategory`, exactly one of them named a category: the batched warm read
 * in `GetAndCacheDatasetByName` asked for `'DatasetCache'` while every write and every other reader
 * passed none and so landed in `default`. Every storage provider isolates by category, so the warm
 * read looked in a namespace nothing ever wrote to and missed on every transport — browsers
 * included. The fallback refetched from the server and rewrote the cache, which is why five months
 * of this was slow rather than wrong, and why no test caught it: nothing asserted that a second
 * call did NOT go to the server.
 *
 * Two consequences the cases below pin:
 *
 *  1. **The warm path serves from cache.** `fetchCount` is the only honest witness. A test that
 *     compares two returned datasets passes whether the second call was served or refetched, which
 *     is exactly how `dataset-cache.DS1` missed this.
 *  2. **`ClearCategory('DatasetCache')` actually clears datasets.** It reported success over an
 *     empty namespace before, which is a clear that lies.
 *
 * The freshness cases exist because fixing the category *switches on* a comparison that had not
 * executed since May. `GetAndCacheDatasetByName` and `IsDatasetCacheUpToDate` each carried their own
 * copy of it and they had drifted; both now call `DatasetRowCountsMatch`. Each case says whether it
 * is a regression pin (watched to fail against the un-fixed code) or an invariant pin (it cannot be
 * made to fail, and is here to stop a future "simplification" from changing the behaviour).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderBase } from '../generic/providerBase';
import { InMemoryLocalStorageProvider } from '../generic/InMemoryLocalStorageProvider';
import {
    DatasetItemFilterType,
    DatasetResultType,
    DatasetStatusResultType,
    EntityRecordNameInput,
    EntityRecordNameResult,
    ILocalStorageProvider,
} from '../generic/interfaces';
import { CompositeKey } from '../generic/compositeKey';

const DATASET = 'MJ_Metadata';
const ENTITY_ID = 'E1000000-0000-0000-0000-000000000001';
const CACHED_AT = new Date('2026-06-01T12:00:00.000Z');

/** A dataset carrying one entity with `rowCount` rows, stamped `latestUpdate`. */
function dataset(rowCount: number, latestUpdate: Date = CACHED_AT): DatasetResultType {
    return {
        DatasetID: 'D1',
        DatasetName: DATASET,
        Success: true,
        Status: 'OK',
        LatestUpdateDate: latestUpdate,
        Results: [
            {
                Code: 'Entities',
                EntityName: 'MJ: Entities',
                EntityID: ENTITY_ID,
                Results: Array.from({ length: rowCount }, (_, i) => ({ ID: `row-${i}` })),
            },
        ],
    };
}

/** A server status reporting `rowCount` rows for the one entity, stamped `latestUpdate`. */
function status(rowCount: number, latestUpdate: Date = CACHED_AT): DatasetStatusResultType {
    return {
        DatasetID: 'D1',
        DatasetName: DATASET,
        Success: true,
        Status: 'OK',
        LatestUpdateDate: latestUpdate,
        EntityUpdateDates: [
            { EntityName: 'MJ: Entities', EntityID: ENTITY_ID, UpdateDate: latestUpdate, RowCount: rowCount },
        ],
    };
}

/** A server status with nothing to compare — the / plan case. */
function statusWithNoCounts(latestUpdate: Date = CACHED_AT): DatasetStatusResultType {
    return { ...status(0, latestUpdate), EntityUpdateDates: [] };
}

class TestProvider extends ProviderBase {
    public readonly Storage = new InMemoryLocalStorageProvider();

    /** Server round trips. The only honest witness that the warm path served from cache. */
    public DatasetFetchCount = 0;
    public StatusFetchCount = 0;

    public DatasetToReturn: DatasetResultType = dataset(2);
    public StatusToReturn: DatasetStatusResultType | null = status(2);

    public override get LocalStorageProvider(): ILocalStorageProvider {
        return this.Storage;
    }

    public override get InstanceConnectionString(): string {
        return 'test://dataset-cache';
    }

    public override async GetDatasetByName(): Promise<DatasetResultType> {
        this.DatasetFetchCount++;
        return this.DatasetToReturn;
    }

    public override async GetDatasetStatusByName(): Promise<DatasetStatusResultType> {
        this.StatusFetchCount++;
        return this.StatusToReturn as DatasetStatusResultType;
    }

    /** Reaches the protected comparison the two freshness paths now share. */
    public RowCountsMatch(cached: DatasetResultType | null | undefined, s: DatasetStatusResultType): boolean {
        return this.DatasetRowCountsMatch(cached, s);
    }

    /** The keys the store holds in a category, for asserting where a write landed. */
    public async KeysIn(category: string): Promise<string[]> {
        return await this.Storage.GetCategoryKeys(category);
    }

    public DatasetKey(itemFilters?: DatasetItemFilterType[]): string {
        return this.GetDatasetCacheKey(DATASET, itemFilters);
    }

    // ── abstract surface these tests do not exercise ───────────────────────────
    protected async InternalGetEntityRecordName(entityName: string, compositeKey: CompositeKey): Promise<string> {
        return `${entityName}:${compositeKey.ToString()}`;
    }
    protected async InternalGetEntityRecordNames(info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> {
        return info.map((i) => ({
            EntityName: i.EntityName,
            CompositeKey: i.CompositeKey,
            Status: 'success',
            Success: true,
            RecordName: `${i.EntityName}:${i.CompositeKey.ToString()}`,
        }));
    }
    get ProviderType() { return 0 as never; }
    get StartedAt() { return new Date(); }
    async GetRecordFavoriteStatus() { return false; }
    async SetRecordFavoriteStatus() {}
    async GetRecordDuplicates() { return null as never; }
    async MergeRecords() { return null as never; }
    async GetRecordDependencies() { return [] as never; }
    async CreateTransactionGroup() { return null as never; }
    async Refresh() { return true; }
    get AllEntities() { return []; }
    get AllApplications() { return []; }
    get CurrentUser() { return null as never; }
    get Entities() { return []; }
    get Applications() { return []; }
    get LatestLocalMetadataTimestamps() { return []; }
    get LatestRemoteMetadataTimestamps() { return []; }
}

describe('ProviderBase dataset cache — the category every call site shares', () => {
    let provider: TestProvider;

    beforeEach(() => {
        provider = new TestProvider();
    });

    /**
     * REGRESSION PIN. Against the un-fixed code this fails with
     * `expected 2 to be 1` — the warm call read `DatasetCache`, found nothing, and refetched.
     */
    it('serves the second call from cache instead of going back to the server', async () => {
        const cold = await provider.GetAndCacheDatasetByName(DATASET);
        expect(cold.Results[0].Results.length).toBe(2);
        expect(provider.DatasetFetchCount).toBe(1);

        const warm = await provider.GetAndCacheDatasetByName(DATASET);

        expect(provider.DatasetFetchCount).toBe(1);
        expect(warm.Results[0].Results.length).toBe(2);
    });

    /**
     * REGRESSION PIN. Against the un-fixed code the writes land in `default`, so this fails with
     * `expected [] to have a length of 2` on the DatasetCache assertion.
     */
    it('writes the blob and its _date proxy into the DatasetCache category, not default', async () => {
        await provider.CacheDataset(DATASET, null, dataset(2));

        const key = provider.DatasetKey();
        const inCategory = await provider.KeysIn(ProviderBase.DatasetCacheCategory);
        expect(inCategory).toHaveLength(2);
        expect(inCategory).toContain(key);
        expect(inCategory).toContain(`${key}_date`);

        expect(await provider.KeysIn('default')).toHaveLength(0);
    });

    /**
     * REGRESSION PIN — the honesty of `mj cache clear --category DatasetCache`. Against the un-fixed
     * code the keys sit in `default`, so clearing `DatasetCache` removes nothing while reporting
     * success and this fails with `expected true to be false`.
     */
    it('ClearCategory(DatasetCache) actually removes a cached dataset', async () => {
        await provider.CacheDataset(DATASET, null, dataset(2));
        expect(await provider.IsDatasetCached(DATASET)).toBe(true);

        await provider.Storage.ClearCategory(ProviderBase.DatasetCacheCategory);

        expect(await provider.IsDatasetCached(DATASET)).toBe(false);
        expect(await provider.GetCachedDataset(DATASET)).toBeUndefined();
        expect(await provider.GetLocalDatasetTimestamp(DATASET)).toBeUndefined();
    });

    /**
     * REGRESSION PIN. The six functions must agree on the category, not merely each be
     * self-consistent: a write by `CacheDataset` has to be visible to all four readers. Against the
     * un-fixed code the four readers agreed with each other in `default` and only the warm path
     * disagreed, so this case passes there — it fails only if a future change splits the readers.
     * Kept as the explicit statement of the invariant the constant exists to hold.
     */
    it('every reader sees what CacheDataset wrote', async () => {
        await provider.CacheDataset(DATASET, null, dataset(2));

        expect(await provider.IsDatasetCached(DATASET)).toBe(true);
        expect((await provider.GetLocalDatasetTimestamp(DATASET))?.getTime()).toBe(CACHED_AT.getTime());
        expect((await provider.GetCachedDataset(DATASET))?.Results[0].Results.length).toBe(2);

        provider.StatusToReturn = status(2);
        expect(await provider.IsDatasetCacheUpToDate(DATASET)).toBe(true);
    });

    it('ClearDatasetCache removes what CacheDataset wrote', async () => {
        await provider.CacheDataset(DATASET, null, dataset(2));
        await provider.ClearDatasetCache(DATASET);

        expect(await provider.IsDatasetCached(DATASET)).toBe(false);
        expect(await provider.KeysIn(ProviderBase.DatasetCacheCategory)).toHaveLength(0);
    });

    it('keys datasets by their item filters, so two filter sets do not share a slot', async () => {
        const filters: DatasetItemFilterType[] = [{ ItemCode: 'Entities', Filter: "Name='X'" }];
        await provider.CacheDataset(DATASET, null, dataset(2));
        await provider.CacheDataset(DATASET, filters, dataset(5));

        expect((await provider.GetCachedDataset(DATASET))?.Results[0].Results.length).toBe(2);
        expect((await provider.GetCachedDataset(DATASET, filters))?.Results[0].Results.length).toBe(5);
    });
});

describe('ProviderBase dataset freshness — the comparison the dead category masked', () => {
    let provider: TestProvider;

    beforeEach(() => {
        provider = new TestProvider();
    });

    /**
     * REGRESSION PIN for the unification. The pre-unification warm path dereferenced
     * `cachedDataset.Results.find(...)` unguarded, so a blob without `Results` threw
     * `TypeError: Cannot read properties of undefined (reading 'find')` out of
     * `GetAndCacheDatasetByName` — and that call sits on the metadata bootstrap path, where a throw
     * replaces a server refetch with a failure to load metadata. Unreachable while the category was
     * broken; reachable the moment it was fixed. `IsDatasetCacheUpToDate` already guarded it, which
     * is the drift the shared helper removes.
     */
    it('refetches rather than throwing when a cached blob has no Results', async () => {
        const malformed = { ...dataset(2) } as DatasetResultType;
        delete (malformed as { Results?: unknown }).Results;

        const key = provider.DatasetKey();
        await provider.Storage.SetItem(key, malformed, ProviderBase.DatasetCacheCategory);
        await provider.Storage.SetItem(`${key}_date`, CACHED_AT.toISOString(), ProviderBase.DatasetCacheCategory);
        provider.StatusToReturn = status(2);

        const result = await provider.GetAndCacheDatasetByName(DATASET);

        expect(provider.DatasetFetchCount).toBe(1);
        expect(result.Results[0].Results.length).toBe(2);
    });

    /**
     * INVARIANT PIN. A status with no per-entity counts never touches the blob and is
     * judged on its timestamp alone, so it is up to date. An early `return false` for an unreadable
     * blob looked strictly safer and was a regression: it made such a dataset permanently stale,
     * reloading on every check. `dataset-cache.DS2` caught that; no unit test described the case,
     * which is why this one exists. It cannot be made to fail against the un-fixed code.
     */
    it('judges a dataset with no per-entity counts on its timestamp alone', async () => {
        expect(provider.RowCountsMatch(dataset(2), statusWithNoCounts())).toBe(true);
        expect(provider.RowCountsMatch(null, statusWithNoCounts())).toBe(true);
        expect(provider.RowCountsMatch(undefined, statusWithNoCounts())).toBe(true);

        await provider.CacheDataset(DATASET, null, dataset(2));
        provider.StatusToReturn = statusWithNoCounts();
        expect(await provider.IsDatasetCacheUpToDate(DATASET)).toBe(true);
    });

    /**
     * INVARIANT PIN. The blob and its `_date` proxy expire independently and a clear removes them in
     * order, so a date can outlive its blob. With a count to compare and no blob the comparison
     * cannot be made, which is "not up to date" — refetch.
     */
    it('reports not-up-to-date when a count must be compared but the blob is gone', async () => {
        expect(provider.RowCountsMatch(null, status(2))).toBe(false);
        expect(provider.RowCountsMatch(undefined, status(2))).toBe(false);

        // The date outliving the blob is the live shape of this, not a contrivance.
        const key = provider.DatasetKey();
        await provider.Storage.SetItem(`${key}_date`, CACHED_AT.toISOString(), ProviderBase.DatasetCacheCategory);
        provider.StatusToReturn = status(2);

        expect(await provider.IsDatasetCached(DATASET)).toBe(true);
        expect(await provider.IsDatasetCacheUpToDate(DATASET)).toBe(false);
    });

    /**
     * The whole point of the row-count check: a pure DELETE leaves `LatestUpdateDate` untouched, so
     * the timestamp comparison passes and only the count betrays it. This is the staleness the warm
     * path must not serve, and it could not have been observed while the path never hit.
     */
    it('does not serve a cached dataset after rows were deleted behind it', async () => {
        await provider.GetAndCacheDatasetByName(DATASET);
        expect(provider.DatasetFetchCount).toBe(1);

        // Two rows deleted on the server; the dataset's timestamp is unchanged.
        provider.StatusToReturn = status(0, CACHED_AT);
        provider.DatasetToReturn = dataset(0, CACHED_AT);

        const after = await provider.GetAndCacheDatasetByName(DATASET);

        expect(provider.DatasetFetchCount).toBe(2);
        expect(after.Results[0].Results.length).toBe(0);
    });

    it('does not serve a cached dataset once the server reports a newer timestamp', async () => {
        await provider.GetAndCacheDatasetByName(DATASET);
        expect(provider.DatasetFetchCount).toBe(1);

        const later = new Date(CACHED_AT.getTime() + 60_000);
        provider.StatusToReturn = status(2, later);
        provider.DatasetToReturn = dataset(3, later);

        const after = await provider.GetAndCacheDatasetByName(DATASET);

        expect(provider.DatasetFetchCount).toBe(2);
        expect(after.Results[0].Results.length).toBe(3);
    });

    it('refetches when the server reports an entity the cache does not hold', async () => {
        await provider.CacheDataset(DATASET, null, dataset(2));
        provider.StatusToReturn = {
            ...status(2),
            EntityUpdateDates: [
                { EntityName: 'MJ: Users', EntityID: 'E1000000-0000-0000-0000-0000000000FF', UpdateDate: CACHED_AT, RowCount: 2 },
            ],
        };

        expect(await provider.IsDatasetCacheUpToDate(DATASET)).toBe(false);
    });

    /**
     * A status the server could not produce is not evidence of freshness. Covered here because the
     * warm path consults the status on every call now that it actually reads the cache.
     */
    it('refetches when the server cannot report a status at all', async () => {
        await provider.GetAndCacheDatasetByName(DATASET);
        expect(provider.DatasetFetchCount).toBe(1);

        provider.StatusToReturn = null;
        await provider.GetAndCacheDatasetByName(DATASET);

        expect(provider.DatasetFetchCount).toBe(2);
        expect(await provider.IsDatasetCacheUpToDate(DATASET)).toBe(false);
    });

    it('matches when every reported count agrees with the cache', async () => {
        expect(provider.RowCountsMatch(dataset(2), status(2))).toBe(true);
        expect(provider.RowCountsMatch(dataset(3), status(2))).toBe(false);
    });
});
