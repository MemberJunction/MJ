/**
 * Tests for the oversized-entry write gate in LocalCacheManager.
 *
 * Background: a single RunView/RunQuery result larger than the cache budget
 * previously triggered a catastrophic failure mode — evictIfNeeded would walk
 * the LRU list deleting EVERY entry trying to reach an unreachable free-space
 * target, wiping the entire cache, and then the oversized entry would be
 * stored anyway (only to be evicted on the next store). The real-world case:
 * ArtifactMetadataEngine bulk-loading `MJ: Artifact Versions` with hundreds of
 * MB of Content on boot wiped the whole IndexedDB cache every login.
 *
 * The fix: SetRunViewResult and SetRunQueryResult now skip the write entirely
 * when the estimated entry size exceeds `maxEntryPercentOfCache` (default 25%)
 * of `maxSizeBytes`. Skipping is graceful — the query still returns data to
 * the caller, it just isn't cached.
 *
 * These tests cover:
 *   - The gate fires for oversized RunView entries (write skipped, no storage
 *     touch, no registry/index pollution)
 *   - Existing cached entries survive an oversized write (no cache wipe)
 *   - The gate fires for oversized RunQuery entries
 *   - Entries under the cap still cache normally
 *   - maxEntryPercentOfCache: 0 disables the gate
 *   - Custom cap percentages are honored
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';

function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    if (g) {
        delete g['___SINGLETON__LocalCacheManager'];
    }
}

// Suppress verbose logging in tests
vi.mock('../generic/logging', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
    LogStatusVerbose: vi.fn(),
}));

function makeEntity(name: string): { Name: string; AllowCaching: boolean; PrimaryKeys: { Name: string }[] } {
    return {
        Name: name,
        AllowCaching: true,
        PrimaryKeys: [{ Name: 'ID' }],
    };
}

function setMetadataProvider(entities: unknown[]): () => void {
    const previous = Metadata.Provider;
    Metadata.Provider = {
        Entities: entities,
        CurrentUser: { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] },
    } as unknown as ProviderBase;
    return () => {
        Metadata.Provider = previous;
    };
}

/**
 * Builds a result set whose estimated size (JSON length × 2) comfortably
 * exceeds `targetBytes`. Rows are uniform so the sampling estimator is exact.
 */
function makeOversizedResults(targetBytes: number, rowCount = 10): Record<string, string>[] {
    // Each row serializes to roughly perRowChars chars → estimator counts chars × 2.
    const perRowChars = Math.ceil(targetBytes / 2 / rowCount) + 100;
    return Array.from({ length: rowCount }, (_, i) => ({
        ID: `v-${i}`,
        Content: 'x'.repeat(perRowChars),
    }));
}

const ENTITY = makeEntity('MJ: Artifact Versions');

describe('LocalCacheManager oversized-entry write gate', () => {
    let cacheManager: LocalCacheManager;
    let mockStorage: MockCacheStorageProvider;
    let restoreMetadata: () => void = () => {};

    // 1MB budget, 25% default cap → 256KB per-entry cap. Small numbers keep tests fast.
    const BUDGET = 1024 * 1024;

    beforeEach(async () => {
        resetLocalCacheManager();
        cacheManager = LocalCacheManager.Instance;
        mockStorage = new MockCacheStorageProvider();
        await cacheManager.Initialize(mockStorage, { maxSizeBytes: BUDGET });
        restoreMetadata = setMetadataProvider([ENTITY]);
    });

    afterEach(() => {
        restoreMetadata();
    });

    describe('Gate fires for oversized RunView entries', () => {
        it('Skips the write — GetRunViewResult returns null', async () => {
            const fp = `${ENTITY.Name}|_|_|-1|0|_`;
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: ENTITY.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                makeOversizedResults(BUDGET), // bigger than the whole budget
                '2026-01-01T00:00:00Z'
            );

            expect(await cacheManager.GetRunViewResult(fp)).toBeNull();
        });

        it('Skipped write does NOT touch the storage provider', async () => {
            mockStorage.resetCallCounts();
            await cacheManager.SetRunViewResult(
                `${ENTITY.Name}|fp|big`,
                { EntityName: ENTITY.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                makeOversizedResults(BUDGET),
                '2026-01-01T00:00:00Z'
            );

            expect(mockStorage.setCallCount).toBe(0);
        });

        it('Skipped write does NOT register in the entity→fingerprint index', async () => {
            const fp = `${ENTITY.Name}|fp|big-index`;
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: ENTITY.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                makeOversizedResults(BUDGET),
                '2026-01-01T00:00:00Z'
            );

            const fps = cacheManager.GetFingerprintsForEntity(ENTITY.Name);
            expect(fps.has(fp)).toBe(false);
        });

        it('An entry just over the cap (but under the budget) is also skipped', async () => {
            // Cap is 25% of 1MB = 256KB; write ~400KB — under budget, over cap.
            mockStorage.resetCallCounts();
            await cacheManager.SetRunViewResult(
                `${ENTITY.Name}|fp|midsize`,
                { EntityName: ENTITY.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                makeOversizedResults(400 * 1024),
                '2026-01-01T00:00:00Z'
            );

            expect(mockStorage.setCallCount).toBe(0);
        });
    });

    describe('Oversized writes no longer wipe the cache (the headline bug)', () => {
        it('Existing entries from OTHER entities survive an oversized write', async () => {
            const other = makeEntity('MJ: Artifact Types');
            restoreMetadata();
            restoreMetadata = setMetadataProvider([ENTITY, other]);

            // Seed a small, legitimate entry.
            const smallFp = `${other.Name}|_|_|-1|0|_`;
            await cacheManager.SetRunViewResult(
                smallFp,
                { EntityName: other.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1', Name: 'Report' }],
                '2026-01-01T00:00:00Z'
            );
            expect(await cacheManager.GetRunViewResult(smallFp)).not.toBeNull();

            // Now attempt the oversized write. Pre-fix this evicted EVERYTHING.
            await cacheManager.SetRunViewResult(
                `${ENTITY.Name}|_|_|-1|0|_`,
                { EntityName: ENTITY.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                makeOversizedResults(BUDGET * 2),
                '2026-01-01T00:00:00Z'
            );

            // The small entry must still be there — the gate skipped BEFORE eviction ran.
            const survived = await cacheManager.GetRunViewResult(smallFp);
            expect(survived).not.toBeNull();
            expect(survived!.results).toHaveLength(1);
        });
    });

    describe('Gate fires for oversized RunQuery entries', () => {
        it('Skips the write — GetRunQueryResult returns null', async () => {
            const fp = 'BigQuery|q-1|_|_';
            await cacheManager.SetRunQueryResult(
                fp,
                'BigQuery',
                makeOversizedResults(BUDGET),
                '2026-01-01T00:00:00Z'
            );

            expect(await cacheManager.GetRunQueryResult(fp)).toBeNull();
        });

        it('Under-cap RunQuery entries still cache normally', async () => {
            const fp = 'SmallQuery|q-2|_|_';
            await cacheManager.SetRunQueryResult(
                fp,
                'SmallQuery',
                [{ ID: '1', Total: 42 }],
                '2026-01-01T00:00:00Z'
            );

            const cached = await cacheManager.GetRunQueryResult(fp);
            expect(cached).not.toBeNull();
            expect(cached!.results).toHaveLength(1);
        });
    });

    describe('Entries under the cap are unaffected', () => {
        it('A normal-sized RunView write proceeds and is retrievable', async () => {
            const fp = `${ENTITY.Name}|fp|small`;
            mockStorage.resetCallCounts();
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: ENTITY.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1', Name: 'v1' }],
                '2026-01-01T00:00:00Z'
            );

            expect(mockStorage.setCallCount).toBe(1);
            expect(await cacheManager.GetRunViewResult(fp)).not.toBeNull();
        });
    });

    describe('Configuration knobs', () => {
        it('maxEntryPercentOfCache: 0 disables the gate (oversized write proceeds)', async () => {
            resetLocalCacheManager();
            const uncapped = LocalCacheManager.Instance;
            await uncapped.Initialize(mockStorage, { maxSizeBytes: BUDGET, maxEntryPercentOfCache: 0 });
            mockStorage.resetCallCounts();

            await uncapped.SetRunViewResult(
                `${ENTITY.Name}|fp|uncapped`,
                { EntityName: ENTITY.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                makeOversizedResults(400 * 1024), // over default cap, under budget
                '2026-01-01T00:00:00Z'
            );

            expect(mockStorage.setCallCount).toBe(1);
        });

        it('A custom cap percentage is honored', async () => {
            resetLocalCacheManager();
            const strict = LocalCacheManager.Instance;
            // 5% of 1MB = ~51KB cap
            await strict.Initialize(mockStorage, { maxSizeBytes: BUDGET, maxEntryPercentOfCache: 5 });
            mockStorage.resetCallCounts();

            // ~100KB — over the 5% cap, well under the default 25% cap.
            await strict.SetRunViewResult(
                `${ENTITY.Name}|fp|strict`,
                { EntityName: ENTITY.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                makeOversizedResults(100 * 1024),
                '2026-01-01T00:00:00Z'
            );
            expect(mockStorage.setCallCount).toBe(0);

            // A tiny write still lands.
            await strict.SetRunViewResult(
                `${ENTITY.Name}|fp|strict-small`,
                { EntityName: ENTITY.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );
            expect(mockStorage.setCallCount).toBe(1);
        });
    });
});
