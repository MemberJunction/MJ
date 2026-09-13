/**
 * Tests for the per-entry ceiling in LocalCacheManager — the half of the
 * oversized-entry contract that decides WHICH entries are too large, as opposed
 * to localCacheManager.maxEntrySizeGate.test.ts, which pins what happens to an
 * entry once it has been judged too large.
 *
 * Background: the ceiling used to be a fixed 25% of a fixed 150MB budget, and
 * it was not reachable from server configuration at all. On a large tenant the
 * single entry most worth caching — the metadata dataset item for
 * `MJ: Entity Fields`, ~115MB on a 2,134-entity schema — sat above 25% of the
 * budget and was therefore NEVER cached. Every process boot re-read the whole
 * schema from the database (~5 minutes), and the only trace was one log line
 * quoting byte counts.
 *
 * The ceiling is now DERIVED (`maxEntryPercentOfCache: 'auto'`): the whole
 * budget less a reserve held back for the rest of the cache. So an entry is
 * declined only when it genuinely cannot be retained, the ceiling grows when the
 * operator grows the budget, and the decline names the `maxMemoryMB` that would
 * admit the entry.
 *
 * These tests cover:
 *   - An entry above the OLD fixed 25% ceiling, but retainable, is now cached
 *   - The reserve still holds: an under-budget entry above the derived ceiling
 *     is declined, and the decline is actionable
 *   - The ceiling scales with the budget (same entry, bigger budget → cached)
 *   - An explicit percentage is honoured, and clamped to the hard maximum so no
 *     configuration can admit an entry that leaves no room for eviction
 *   - Storing a large entry does not wipe the rest of the cache (eviction frees
 *     the deficit, not the incoming entry's whole size)
 *   - The pathological cases stay bounded: the total budget still holds across
 *     repeated large writes, and one entity cannot hold more than one of them
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { LogStatusEx } from '../generic/logging';

// Suppress verbose logging in tests (and let the decline message be inspected)
vi.mock('../generic/logging', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
    LogStatusVerbose: vi.fn(),
}));

function resetLocalCacheManager(): void {
    const g = GetGlobalObjectStore();
    if (g) {
        delete g['___SINGLETON__LocalCacheManager'];
    }
}

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
 * Builds a result set whose estimated size (JSON length × 2) is just above
 * `targetBytes`. Rows are uniform, so the sampling estimator is exact.
 */
function makeResultsOfSize(targetBytes: number, rowCount = 10): Record<string, string>[] {
    const perRowChars = Math.ceil(targetBytes / 2 / rowCount);
    return Array.from({ length: rowCount }, (_, i) => ({
        ID: `v-${i}`,
        Content: 'x'.repeat(perRowChars),
    }));
}

/** The metadata dataset item that motivated the change. */
const BIG_ENTITY = makeEntity('MJ: Entity Fields');
const OTHER_ENTITY = makeEntity('MJ: Entities');

/** 1MB budget keeps the tests fast; every size below is a fraction of it. */
const BUDGET = 1024 * 1024;
const pctOfBudget = (pct: number): number => Math.floor(BUDGET * pct / 100);

type RunViewParamsArg = Parameters<LocalCacheManager['SetRunViewResult']>[1];
const paramsFor = (entityName: string): RunViewParamsArg => ({ EntityName: entityName }) as RunViewParamsArg;

async function initCache(
    storage: MockCacheStorageProvider,
    config?: { maxSizeBytes?: number; maxEntryPercentOfCache?: number | 'auto' }
): Promise<LocalCacheManager> {
    resetLocalCacheManager();
    const mgr = LocalCacheManager.Instance;
    await mgr.Initialize(storage, {
        maxSizeBytes: config?.maxSizeBytes ?? BUDGET,
        ...(config?.maxEntryPercentOfCache === undefined ? {} : { maxEntryPercentOfCache: config.maxEntryPercentOfCache }),
    });
    return mgr;
}

describe('LocalCacheManager per-entry ceiling', () => {
    let mockStorage: MockCacheStorageProvider;
    let restoreMetadata: () => void = () => {};

    beforeEach(() => {
        vi.mocked(LogStatusEx).mockClear();
        mockStorage = new MockCacheStorageProvider();
        restoreMetadata = setMetadataProvider([BIG_ENTITY, OTHER_ENTITY]);
    });

    afterEach(() => {
        restoreMetadata();
    });

    describe('A large but retainable entry is cached', () => {
        it('An entry above the old fixed 25% ceiling is now cached', async () => {
            // 40% of the budget: over the ceiling this cache used to apply, comfortably
            // retainable within it. This is the PLUS case in miniature — the ~115MB
            // "MJ: Entity Fields" dataset item against a 150MB budget is 73% of it.
            const cache = await initCache(mockStorage);
            const fp = `${BIG_ENTITY.Name}|_|_|-1|0|_`;

            await cache.SetRunViewResult(fp, paramsFor(BIG_ENTITY.Name), makeResultsOfSize(pctOfBudget(40)), '2026-01-01T00:00:00Z');

            const cached = await cache.GetRunViewResult(fp);
            expect(cached).not.toBeNull();
            expect(cached!.results).toHaveLength(10);
        });

        it('An entry at 73% of the budget — the measured PLUS ratio — is cached', async () => {
            const cache = await initCache(mockStorage);
            const fp = `${BIG_ENTITY.Name}|_|_|-1|0|plus-ratio`;

            await cache.SetRunViewResult(fp, paramsFor(BIG_ENTITY.Name), makeResultsOfSize(pctOfBudget(73)), '2026-01-01T00:00:00Z');

            expect(await cache.GetRunViewResult(fp)).not.toBeNull();
        });
    });

    describe('The reserve still holds', () => {
        it('An entry under the budget but over the derived ceiling is declined', async () => {
            // 90% of the budget: it would fit, but it would leave the rest of the cache
            // nothing, so it is refused. This is the upper bound the fix must keep.
            const cache = await initCache(mockStorage);
            const fp = `${BIG_ENTITY.Name}|_|_|-1|0|too-big`;

            await cache.SetRunViewResult(fp, paramsFor(BIG_ENTITY.Name), makeResultsOfSize(pctOfBudget(90)), '2026-01-01T00:00:00Z');

            expect(await cache.GetRunViewResult(fp)).toBeNull();
        });

        it('The ceiling never consumes more of the budget than the hard maximum', async () => {
            const cache = await initCache(mockStorage);

            expect(cache.MaxEntrySizeBytes).toBeLessThanOrEqual(pctOfBudget(90));
            expect(cache.MaxEntrySizeBytes).toBeGreaterThan(pctOfBudget(25));
        });

        it('The decline names the maxMemoryMB that would admit the entry', async () => {
            const cache = await initCache(mockStorage);

            await cache.SetRunViewResult(
                `${BIG_ENTITY.Name}|_|_|-1|0|actionable`,
                paramsFor(BIG_ENTITY.Name),
                makeResultsOfSize(pctOfBudget(90)),
                '2026-01-01T00:00:00Z'
            );

            const messages = vi.mocked(LogStatusEx).mock.calls.map(c => String((c[0] as { message: string }).message));
            const decline = messages.find(m => m.includes('CACHE-WRITE-GATE'));
            expect(decline).toBeDefined();
            expect(decline).toContain('maxMemoryMB');
            // Raising the budget to the named value must actually admit the entry: the
            // number is 100/(100-reserve) of the entry size, so it is at least 2MB here.
            expect(decline).toMatch(/maxMemoryMB to \d+ or more/);
        });
    });

    describe('The ceiling scales with the budget', () => {
        it('The same entry that is declined at one budget is cached at a larger one', async () => {
            const size = pctOfBudget(90);

            const small = await initCache(mockStorage, { maxSizeBytes: BUDGET });
            const fpSmall = `${BIG_ENTITY.Name}|_|_|-1|0|scale-small`;
            await small.SetRunViewResult(fpSmall, paramsFor(BIG_ENTITY.Name), makeResultsOfSize(size), '2026-01-01T00:00:00Z');
            expect(await small.GetRunViewResult(fpSmall)).toBeNull();

            const bigStorage = new MockCacheStorageProvider();
            const big = await initCache(bigStorage, { maxSizeBytes: BUDGET * 2 });
            const fpBig = `${BIG_ENTITY.Name}|_|_|-1|0|scale-big`;
            await big.SetRunViewResult(fpBig, paramsFor(BIG_ENTITY.Name), makeResultsOfSize(size), '2026-01-01T00:00:00Z');
            expect(await big.GetRunViewResult(fpBig)).not.toBeNull();
        });
    });

    describe('An explicit percentage is honoured, and bounded', () => {
        it('A stricter explicit percentage declines an entry that auto would cache', async () => {
            const cache = await initCache(mockStorage, { maxEntryPercentOfCache: 10 });
            const fp = `${BIG_ENTITY.Name}|_|_|-1|0|strict`;

            await cache.SetRunViewResult(fp, paramsFor(BIG_ENTITY.Name), makeResultsOfSize(pctOfBudget(40)), '2026-01-01T00:00:00Z');

            expect(await cache.GetRunViewResult(fp)).toBeNull();
        });

        it('An over-100 percentage is clamped to the hard maximum', async () => {
            // 150% would nominally admit an entry larger than the whole budget — the
            // original catastrophic case. The clamp caps the ceiling at 90% of budget.
            const cache = await initCache(mockStorage, { maxEntryPercentOfCache: 150 });
            expect(cache.MaxEntrySizeBytes).toBe(pctOfBudget(90));

            const fp = `${BIG_ENTITY.Name}|_|_|-1|0|clamped`;
            await cache.SetRunViewResult(fp, paramsFor(BIG_ENTITY.Name), makeResultsOfSize(pctOfBudget(95)), '2026-01-01T00:00:00Z');
            expect(await cache.GetRunViewResult(fp)).toBeNull();

            // ...but the clamp is 90%, not the stricter derived default: an 85% entry,
            // declined under 'auto', is admitted under this explicit configuration.
            const fpAllowed = `${BIG_ENTITY.Name}|_|_|-1|0|clamped-allowed`;
            await cache.SetRunViewResult(fpAllowed, paramsFor(BIG_ENTITY.Name), makeResultsOfSize(pctOfBudget(85)), '2026-01-01T00:00:00Z');
            expect(await cache.GetRunViewResult(fpAllowed)).not.toBeNull();
        });
    });

    describe('A large write does not wipe the rest of the cache', () => {
        it('Small entries from another entity survive a large write that needs room', async () => {
            const cache = await initCache(mockStorage);

            // ~400KB of small entries for a DIFFERENT entity (under that entity's own
            // 50%-of-budget share, so per-entity eviction is not what is being measured).
            const smallFps: string[] = [];
            for (let i = 0; i < 8; i++) {
                const fp = `${OTHER_ENTITY.Name}|_|_|-1|0|small-${i}`;
                smallFps.push(fp);
                await cache.SetRunViewResult(fp, paramsFor(OTHER_ENTITY.Name), makeResultsOfSize(pctOfBudget(5)), '2026-01-01T00:00:00Z');
            }
            const cachedBefore = (await Promise.all(smallFps.map(fp => cache.GetRunViewResult(fp)))).filter(r => r !== null);
            expect(cachedBefore.length).toBe(8);

            // A 70% entry now needs room: total would be ~110% of budget, so eviction runs.
            // It must free the DEFICIT (~10%), not the incoming entry's whole 70%.
            const bigFp = `${BIG_ENTITY.Name}|_|_|-1|0|needs-room`;
            await cache.SetRunViewResult(bigFp, paramsFor(BIG_ENTITY.Name), makeResultsOfSize(pctOfBudget(70)), '2026-01-01T00:00:00Z');

            expect(await cache.GetRunViewResult(bigFp)).not.toBeNull();
            const survivors = (await Promise.all(smallFps.map(fp => cache.GetRunViewResult(fp)))).filter(r => r !== null);
            expect(survivors.length).toBeGreaterThan(0);
        });
    });

    describe('The pathological cases stay bounded', () => {
        it('Repeated large writes never leave the cache over its total budget', async () => {
            const cache = await initCache(mockStorage);
            const entities = ['E One', 'E Two', 'E Three'].map(makeEntity);
            restoreMetadata();
            restoreMetadata = setMetadataProvider([BIG_ENTITY, OTHER_ENTITY, ...entities]);

            for (const [i, entity] of entities.entries()) {
                await cache.SetRunViewResult(
                    `${entity.Name}|_|_|-1|0|big-${i}`,
                    paramsFor(entity.Name),
                    makeResultsOfSize(pctOfBudget(70)),
                    '2026-01-01T00:00:00Z'
                );
                expect(cache.GetStats().totalSizeBytes).toBeLessThanOrEqual(BUDGET);
            }
        });

        it('One entity cannot hold two large entries at once', async () => {
            const cache = await initCache(mockStorage);

            for (let i = 0; i < 3; i++) {
                await cache.SetRunViewResult(
                    `${BIG_ENTITY.Name}|_|_|-1|0|repeat-${i}`,
                    paramsFor(BIG_ENTITY.Name),
                    makeResultsOfSize(pctOfBudget(70)),
                    '2026-01-01T00:00:00Z'
                );
            }

            expect(cache.GetFingerprintsForEntity(BIG_ENTITY.Name).size).toBe(1);
            expect(cache.GetStats().totalSizeBytes).toBeLessThanOrEqual(BUDGET);
        });
    });
});
