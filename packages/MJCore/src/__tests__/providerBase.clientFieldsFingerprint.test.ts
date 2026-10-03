/**
 * Tests for the client-side Fields-aware cache fingerprint.
 *
 * Background: the SERVER cache widens every cacheable query to ALL entity
 * fields, stores one full-width superset per entity+filter, and projects
 * per-read — so its fingerprint deliberately excludes Fields. The CLIENT
 * smart-cache flow does neither: it keeps queries narrow over the wire and
 * stores rows exactly as the server returned them, with no projection on read.
 *
 * Under a Fields-agnostic client fingerprint, a narrow cached entry would pass
 * the staleness check for a DIFFERENT field subset of the same entity+filter
 * (maxUpdatedAt / rowCount are column-independent) and silently serve rows
 * missing the newly requested columns. The fix keys client cache entries by a
 * normalized Fields suffix so every field subset stores, validates, and serves
 * its own shape (exact-match slots — no cross-subset serving).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProviderBase } from '../generic/providerBase';
import { LocalCacheManager, CacheCategory } from '../generic/localCacheManager';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { ClientSmartCacheTestProvider, ResetLocalCacheManager, Settle } from './mocks/ClientSmartCacheTestProvider';
import { RunViewResult } from '../generic/interfaces';
import { EntityInfo } from '../generic/entityInfo';
import { RunViewParams } from '../views/runView';

// Wide row emulating the server's full-width data; the stub server projects it
// down to each request's Fields (post-#2814 servers always return the
// requested shape).
const SERVER_ROW: Record<string, unknown> = {
    ID: 'row-1',
    Name: 'Test Record',
    Status: 'Active',
    Description: 'Some description text',
    __mj_UpdatedAt: '2026-06-01T00:00:00.000Z',
};

// AllowCaching=true so LocalCacheManager's write gate accepts entries
const CACHEABLE = { Name: 'Cacheable', AllowCaching: true, TrustServerCacheCompletely: true, Fields: [] } as unknown as EntityInfo;

function rowKeys(result: RunViewResult): string[] {
    return Object.keys(result.Results[0] as Record<string, unknown>).sort();
}

describe('Client-side Fields-aware cache fingerprint (smart-cache flow)', () => {
    let provider: ClientSmartCacheTestProvider;
    let mockStorage: MockCacheStorageProvider;
    const originalCoalesce = ProviderBase.CoalesceWindowMs;
    const originalDedupLinger = ProviderBase.DedupLingerMs;

    beforeEach(async () => {
        ResetLocalCacheManager();
        mockStorage = new MockCacheStorageProvider();
        await LocalCacheManager.Instance.Initialize(mockStorage);
        provider = new ClientSmartCacheTestProvider({ Entity: CACHEABLE, ServerRows: () => [SERVER_ROW] });
        // Disable coalescing/linger so each call hits the pipeline deterministically
        ProviderBase.CoalesceWindowMs = 0;
        ProviderBase.DedupLingerMs = 0;
    });

    afterEach(() => {
        ProviderBase.CoalesceWindowMs = originalCoalesce;
        ProviderBase.DedupLingerMs = originalDedupLinger;
        ResetLocalCacheManager();
    });

    function makeParams(fields?: string[]): RunViewParams {
        return {
            EntityName: 'Cacheable',
            CacheLocal: true,
            ResultType: 'simple',
            ...(fields ? { Fields: fields } : {}),
        };
    }

    it('a different Fields subset is a separate slot — it must NOT validate against another subset’s entry (the poisoning regression)', async () => {
        // Warm the cache for {ID, Name}
        const r1 = await provider.RunViews([makeParams(['ID', 'Name'])]);
        expect(rowKeys(r1[0])).toEqual(['ID', 'Name']);
        await Settle();

        // Request {ID, Status}: under a Fields-agnostic fingerprint this would
        // send the {ID,Name} entry's cacheStatus, the server would answer
        // 'current', and the caller would receive rows with NO Status column.
        const r2 = await provider.RunViews([makeParams(['ID', 'Status'])]);

        // The client must NOT have claimed a cached status for this subset…
        expect(provider.lastCheck()[0].cacheStatus).toBeUndefined();
        // …and the caller gets the shape they asked for, from fresh data.
        expect(rowKeys(r2[0])).toEqual(['ID', 'Status']);
    });

    it('the same Fields subset revalidates and serves its OWN slot', async () => {
        const r1 = await provider.RunViews([makeParams(['ID', 'Name'])]);
        await Settle();

        const r2 = await provider.RunViews([makeParams(['ID', 'Name'])]);
        // Cache entry found → cacheStatus sent → server answered 'current' → served from cache
        expect(provider.lastCheck()[0].cacheStatus).toBeDefined();
        expect(r2[0].Results).toEqual(r1[0].Results);
        expect(rowKeys(r2[0])).toEqual(['ID', 'Name']);
    });

    it('Fields differing only in order/case/whitespace share one slot (normalization)', async () => {
        await provider.RunViews([makeParams(['ID', 'Name'])]);
        await Settle();

        const r2 = await provider.RunViews([makeParams([' name ', 'id'])]);
        expect(provider.lastCheck()[0].cacheStatus).toBeDefined();
        expect(r2[0].Results).toHaveLength(1);
    });

    it('a no-Fields (all columns) request is its own slot and serves the full row', async () => {
        await provider.RunViews([makeParams(['ID', 'Name'])]);
        await Settle();

        const r2 = await provider.RunViews([makeParams()]);
        // Different slot → no cacheStatus → fresh full-width fetch
        expect(provider.lastCheck()[0].cacheStatus).toBeUndefined();
        expect(rowKeys(r2[0])).toEqual(Object.keys(SERVER_ROW).sort());
    });

    it('distinct subsets produce distinct storage entries keyed by a |f: suffix', async () => {
        await provider.RunViews([makeParams(['ID', 'Name'])]);
        await provider.RunViews([makeParams(['ID', 'Status'])]);
        await provider.RunViews([makeParams()]);
        await Settle();

        const keys = await mockStorage.GetCategoryKeys(CacheCategory.RunViewCache);
        const suffixes = keys.map(k => k.substring(k.lastIndexOf('|f:'))).sort();
        expect(suffixes).toEqual(['|f:*', '|f:id,name', '|f:id,status']);
    });
});
