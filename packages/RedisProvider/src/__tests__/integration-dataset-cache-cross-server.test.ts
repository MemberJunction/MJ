/**
 * Integration test: the dataset cache across two servers sharing one Redis.
 *
 * A single process cannot show what this file is for. The defect being pinned was a disagreement
 * between the category a dataset was WRITTEN to (`default`, because `CacheDataset` passed none) and
 * the one the warm read ASKED for (`'DatasetCache'`). Redis keys are `{prefix}:{category}:{key}`, so
 * the two never met and the warm path missed on every call — for five months, silently, because the
 * fallback refetched and the answer stayed correct. Both halves of that live in the key namespace,
 * which is exactly what a second process shares and an in-memory mock cannot model.
 *
 * Three properties here, in order of what they would have caught:
 *
 *  1. **One namespace.** A dataset cached by server A is visible to server B. If the readers and the
 *     writers disagree about the category again, this is the first thing to break.
 *  2. **No stale serve.** A change made behind server A's back — a pure DELETE, which leaves the
 *     dataset's `LatestUpdateDate` untouched and is therefore invisible to the timestamp comparison
 *     — must not be served from A's warm cache. This is the risk the fix carries: it switches on a
 *     freshness comparison that had not executed since `987a126aab`, so any bug in it had been
 *     masked by the cache never hitting.
 *  3. **The clear tells the truth.** `ClearSharedCacheCategories` with `Categories: ['DatasetCache']`
 *     is the exact path `mj cache clear --category DatasetCache` takes. It used to scan an empty
 *     namespace and report `Cleared 0 key(s) in DatasetCache` — a success that removed nothing.
 *     Here it must report the keys it found and the dataset must actually be gone afterwards.
 *
 * Requires a real Redis connection — set REDIS_URL to run. Skipped automatically otherwise, which is
 * how the sibling two-server test gates itself and why neither runs in the default unit tier.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ProviderBase } from '@memberjunction/core';
import type {
    DatasetItemFilterType,
    DatasetResultType,
    DatasetStatusResultType,
    EntityRecordNameInput,
    EntityRecordNameResult,
    ILocalStorageProvider,
} from '@memberjunction/core';
import type { CompositeKey } from '@memberjunction/core';

const REDIS_URL = process.env.REDIS_URL;
const describeRedis = describe.skipIf(!REDIS_URL);

const DATASET = 'CrossServerProbe';
const ENTITY_ID = 'E1000000-0000-0000-0000-00000000ABCD';
const STAMP = new Date('2026-06-01T12:00:00.000Z');

/**
 * The one thing both servers read. Standing in for the database: each server answers
 * `GetDatasetByName` / `GetDatasetStatusByName` out of this, so a write here is a change made
 * "behind" whichever server is holding a cached copy.
 */
class SharedDatabase {
    public RowCount = 3;
    /** Deliberately NOT advanced by DeleteRows — a pure delete does not move it. That is the point. */
    public LatestUpdateDate = STAMP;

    public DeleteRows(n: number): void {
        this.RowCount -= n;
    }

    public Dataset(): DatasetResultType {
        return {
            DatasetID: 'D1',
            DatasetName: DATASET,
            Success: true,
            Status: 'OK',
            LatestUpdateDate: this.LatestUpdateDate,
            Results: [
                {
                    Code: 'Probes',
                    EntityName: 'Probes',
                    EntityID: ENTITY_ID,
                    Results: Array.from({ length: this.RowCount }, (_, i) => ({ ID: `row-${i}` })),
                },
            ],
        };
    }

    public Status(): DatasetStatusResultType {
        return {
            DatasetID: 'D1',
            DatasetName: DATASET,
            Success: true,
            Status: 'OK',
            LatestUpdateDate: this.LatestUpdateDate,
            EntityUpdateDates: [
                { EntityName: 'Probes', EntityID: ENTITY_ID, UpdateDate: this.LatestUpdateDate, RowCount: this.RowCount },
            ],
        };
    }
}

/** One server: its own storage provider connection, the shared database behind it. */
class Server extends ProviderBase {
    public DatasetFetchCount = 0;

    constructor(private readonly store: ILocalStorageProvider, private readonly db: SharedDatabase) {
        super();
    }

    public override get LocalStorageProvider(): ILocalStorageProvider {
        return this.store;
    }

    /** Both servers must report the SAME connection string — it is part of the dataset cache key. */
    public override get InstanceConnectionString(): string {
        return 'mssql://cross-server-test';
    }

    public override async GetDatasetByName(): Promise<DatasetResultType> {
        this.DatasetFetchCount++;
        return this.db.Dataset();
    }

    public override async GetDatasetStatusByName(): Promise<DatasetStatusResultType> {
        return this.db.Status();
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

describeRedis('Integration: the dataset cache across two servers', () => {
    const KEY_PREFIX = `test-dataset-xserver-${process.pid}`;

    type RedisProviderCtor = typeof import('../RedisLocalStorageProvider.js').RedisLocalStorageProvider;
    type RedisProvider = InstanceType<RedisProviderCtor>;

    let RedisProviderClass: RedisProviderCtor;
    let ClearSharedCache: typeof import('../SharedCacheClear.js').ClearSharedCacheCategories;
    let storeA: RedisProvider;
    let storeB: RedisProvider;
    let db: SharedDatabase;
    let serverA: Server;
    let serverB: Server;

    beforeAll(async () => {
        RedisProviderClass = (await import('../RedisLocalStorageProvider.js')).RedisLocalStorageProvider;
        ClearSharedCache = (await import('../SharedCacheClear.js')).ClearSharedCacheCategories;

        const config = { url: REDIS_URL, keyPrefix: KEY_PREFIX, enablePubSub: false, enableLogging: false };
        storeA = new RedisProviderClass(config);
        storeB = new RedisProviderClass(config);

        await new Promise<void>((resolve) => {
            let ready = 0;
            const check = () => { if (++ready >= 2) resolve(); };
            storeA.Client.on('ready', check);
            storeB.Client.on('ready', check);
            if (storeA.IsConnected) check();
            if (storeB.IsConnected) check();
        });
    });

    afterAll(async () => {
        await storeA?.ClearCategory(ProviderBase.DatasetCacheCategory);
        await storeA?.Disconnect();
        await storeB?.Disconnect();
    });

    beforeEach(async () => {
        await storeA.ClearCategory(ProviderBase.DatasetCacheCategory);
        db = new SharedDatabase();
        serverA = new Server(storeA, db);
        serverB = new Server(storeB, db);
    });

    it('lets server B read the dataset server A cached', async () => {
        await serverA.GetAndCacheDatasetByName(DATASET);
        expect(serverA.DatasetFetchCount).toBe(1);

        // B never fetched; it is reading A's cache entry out of the shared key namespace.
        expect(await serverB.IsDatasetCached(DATASET)).toBe(true);
        const fromB = await serverB.GetCachedDataset(DATASET);
        expect(fromB?.Results?.[0]?.Results).toHaveLength(3);
        expect(serverB.DatasetFetchCount).toBe(0);
    });

    it('serves B from A\'s cache rather than going to the database', async () => {
        await serverA.GetAndCacheDatasetByName(DATASET);

        const served = await serverB.GetAndCacheDatasetByName(DATASET);

        expect(served.Results[0].Results).toHaveLength(3);
        expect(serverB.DatasetFetchCount).toBe(0);
    });

    /**
     * The headline. A pure DELETE leaves `LatestUpdateDate` untouched, so the timestamp comparison
     * says "fresh" and only the row count betrays it. Neither server may serve the stale copy.
     */
    it('does not serve a stale copy after rows are deleted behind it', async () => {
        await serverA.GetAndCacheDatasetByName(DATASET);
        expect(serverA.DatasetFetchCount).toBe(1);

        db.DeleteRows(2);

        const fromA = await serverA.GetAndCacheDatasetByName(DATASET);
        expect(serverA.DatasetFetchCount).toBe(2);
        expect(fromA.Results[0].Results).toHaveLength(1);

        // And B, which has the same shared entry, must not serve the stale copy either.
        const fromB = await serverB.GetAndCacheDatasetByName(DATASET);
        expect(fromB.Results[0].Results).toHaveLength(1);

        // A's refetch rewrote the shared entry, so both servers now agree it is up to date.
        expect(await serverA.IsDatasetCacheUpToDate(DATASET)).toBe(true);
        expect(await serverB.IsDatasetCacheUpToDate(DATASET)).toBe(true);
    });

    it('reports the cache out of date on BOTH servers once rows are deleted', async () => {
        await serverA.GetAndCacheDatasetByName(DATASET);
        db.DeleteRows(1);

        expect(await serverA.IsDatasetCacheUpToDate(DATASET)).toBe(false);
        expect(await serverB.IsDatasetCacheUpToDate(DATASET)).toBe(false);
    });

    /**
     * The honesty of `mj cache clear --category DatasetCache`, through the function the command
     * calls. Before the category was unified this reported a successful clear of 0 keys while the
     * dataset sat untouched in `default`.
     */
    it('ClearSharedCacheCategories(DatasetCache) finds the keys and actually removes them', async () => {
        await serverA.GetAndCacheDatasetByName(DATASET);
        expect(await serverA.IsDatasetCached(DATASET)).toBe(true);

        const results = await ClearSharedCache({
            Connection: { url: REDIS_URL, keyPrefix: KEY_PREFIX },
            Categories: [ProviderBase.DatasetCacheCategory],
        });

        const outcome = results.find(r => r.Category === ProviderBase.DatasetCacheCategory);
        expect(outcome).toBeDefined();
        expect(outcome!.Ok).toBe(true);
        // The blob and its `_date` proxy. A report of 0 here is the bug this case exists for.
        expect(outcome!.KeyCount).toBeGreaterThanOrEqual(2);

        expect(await serverA.IsDatasetCached(DATASET)).toBe(false);
        expect(await serverB.IsDatasetCached(DATASET)).toBe(false);

        // And the next call refetches rather than serving nothing.
        const after = await serverA.GetAndCacheDatasetByName(DATASET);
        expect(serverA.DatasetFetchCount).toBe(2);
        expect(after.Results[0].Results).toHaveLength(3);
    });

    it('keeps the dataset keys under the DatasetCache category in the shared keyspace', async () => {
        await serverA.GetAndCacheDatasetByName(DATASET);

        const datasetKeys = await storeB.GetCategoryKeys(ProviderBase.DatasetCacheCategory);
        expect(datasetKeys.filter(k => k.includes(DATASET))).toHaveLength(2);

        const defaultKeys = await storeB.GetCategoryKeys('default');
        expect(defaultKeys.filter(k => k.includes(DATASET))).toHaveLength(0);
    });
});
