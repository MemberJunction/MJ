/**
 * Tests for ProviderBase's entity-record-name cache boundedness.
 *
 * Regression coverage for a memory leak (Memory Leak Audit Round 5/6):
 * `_entityRecordNameCache` was a plain unbounded `Map<string, string>`, gaining one
 * entry per distinct record touched via Load()/Save()/LoadFromData() for the life of
 * the process, unlike its bounded siblings `_entityMapByName`/`_entityMapByID` (which
 * are rebuilt — and thus bounded by entity count — on every metadata refresh). It is
 * now an `MJLruCache` with a fixed `maxSize`, so growth stops at that ceiling instead
 * of growing forever with distinct-record volume.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderBase } from '../generic/providerBase';
import { CompositeKey } from '../generic/compositeKey';
import { EntityRecordNameInput, EntityRecordNameResult } from '../generic/interfaces';

// Access the private cache field + abstract internal lookup via a test subclass.
class TestableProvider extends ProviderBase {
    public lookupCallCount = 0;

    protected async InternalGetEntityRecordName(entityName: string, compositeKey: CompositeKey): Promise<string> {
        this.lookupCallCount++;
        return `${entityName}:${compositeKey.ToString()}`;
    }

    protected async InternalGetEntityRecordNames(info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> {
        this.lookupCallCount += info.length;
        return info.map((i) => ({
            EntityName: i.EntityName,
            CompositeKey: i.CompositeKey,
            Status: 'success',
            Success: true,
            RecordName: `${i.EntityName}:${i.CompositeKey.ToString()}`,
        }));
    }

    public get CacheSize(): number {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (this as any)._entityRecordNameCache.Size;
    }

    public get CacheMaxSize(): number {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (this as any)._entityRecordNameCache.MaxSize;
    }

    // Required abstract implementations (unused in these tests)
    get ProviderType() { return 0 as never; }
    get StartedAt() { return new Date(); }
    async GetRecordFavoriteStatus() { return false; }
    async SetRecordFavoriteStatus() {}
    async GetRecordDuplicates() { return null as never; }
    async MergeRecords() { return null as never; }
    async GetRecordDependencies() { return [] as never; }
    async GetDatasetByName() { return null as never; }
    async GetDatasetStatusByName() { return null as never; }
    async CreateTransactionGroup() { return null as never; }
    async Refresh() { return true; }
    get AllEntities() { return []; }
    get AllApplications() { return []; }
    get CurrentUser() { return null as never; }
    get Entities() { return []; }
    get Applications() { return []; }
    get LatestLocalMetadataTimestamps() { return []; }
    get LatestRemoteMetadataTimestamps() { return []; }
    get LocalStorageProvider() { return null as never; }
}

function keyFor(id: string): CompositeKey {
    return CompositeKey.FromID(id);
}

describe('ProviderBase entity record name cache', () => {
    let provider: TestableProvider;

    beforeEach(() => {
        provider = new TestableProvider();
    });

    it('caches a record name set via SetCachedRecordName for synchronous retrieval', async () => {
        provider.SetCachedRecordName('Accounts', keyFor('1'), 'Acme Corp');
        const cached = await provider.GetCachedRecordName('Accounts', keyFor('1'));
        expect(cached).toBe('Acme Corp');
    });

    it('GetCachedRecordName returns undefined when not cached and loadIfNeeded is false', async () => {
        const cached = await provider.GetCachedRecordName('Accounts', keyFor('missing'));
        expect(cached).toBeUndefined();
        expect(provider.lookupCallCount).toBe(0);
    });

    it('GetEntityRecordName caches on first call and serves subsequent calls from cache', async () => {
        const first = await provider.GetEntityRecordName('Accounts', keyFor('1'));
        const second = await provider.GetEntityRecordName('Accounts', keyFor('1'));
        expect(first).toBe(second);
        expect(provider.lookupCallCount).toBe(1); // second call was a cache hit
    });

    it('forceRefresh bypasses the cache and re-queries', async () => {
        await provider.GetEntityRecordName('Accounts', keyFor('1'));
        await provider.GetEntityRecordName('Accounts', keyFor('1'), undefined, true);
        expect(provider.lookupCallCount).toBe(2);
    });

    it('is bounded by maxSize — does not grow without limit as distinct records are touched', () => {
        const maxSize = provider.CacheMaxSize;
        expect(maxSize).toBeGreaterThan(0);

        // Populate well past maxSize with distinct record keys.
        const overfill = maxSize + 500;
        for (let i = 0; i < overfill; i++) {
            provider.SetCachedRecordName('Accounts', keyFor(`record-${i}`), `Name ${i}`);
        }

        // Size must never exceed the configured ceiling — this is the actual leak fix:
        // previously this loop would have grown _entityRecordNameCache.size to `overfill`.
        expect(provider.CacheSize).toBeLessThanOrEqual(maxSize);
    });

    it('evicts the least-recently-used entry once the cache is full', async () => {
        const maxSize = provider.CacheMaxSize;

        // Fill exactly to capacity.
        for (let i = 0; i < maxSize; i++) {
            provider.SetCachedRecordName('Accounts', keyFor(`record-${i}`), `Name ${i}`);
        }
        expect(provider.CacheSize).toBe(maxSize);

        // The very first entry is now the least-recently-used.
        const oldestBefore = await provider.GetCachedRecordName('Accounts', keyFor('record-0'));
        expect(oldestBefore).toBe('Name 0');

        // Touch every entry except record-0 so it stays the LRU victim, then insert one more.
        for (let i = 1; i < maxSize; i++) {
            provider.SetCachedRecordName('Accounts', keyFor(`record-${i}`), `Name ${i}`);
        }
        provider.SetCachedRecordName('Accounts', keyFor('record-overflow'), 'Overflow Name');

        expect(provider.CacheSize).toBe(maxSize);
        const oldestAfter = await provider.GetCachedRecordName('Accounts', keyFor('record-0'));
        expect(oldestAfter).toBeUndefined();
        const overflowEntry = await provider.GetCachedRecordName('Accounts', keyFor('record-overflow'));
        expect(overflowEntry).toBe('Overflow Name');
    });

    it('GetEntityRecordNames caches successful batch lookups', async () => {
        const info: EntityRecordNameInput[] = [
            { EntityName: 'Accounts', CompositeKey: keyFor('1') },
            { EntityName: 'Accounts', CompositeKey: keyFor('2') },
        ];
        const results = await provider.GetEntityRecordNames(info);
        expect(results).toHaveLength(2);
        expect(provider.lookupCallCount).toBe(2);

        // Second call for the same records should be served entirely from cache.
        const cachedResults = await provider.GetEntityRecordNames(info);
        expect(cachedResults.every((r) => r.Status === 'cached')).toBe(true);
        expect(provider.lookupCallCount).toBe(2); // unchanged — no new lookups
    });
});
