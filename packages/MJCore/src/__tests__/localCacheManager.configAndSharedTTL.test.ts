/**
 * Two failure modes the fleet rig could not see, because both need a specific *order* of calls or a
 * specific kind of store (plan §16.3 #1 and #9, found in review).
 *
 * 1. **A host's cache settings must survive a provider that initialized the cache first.** Every
 *    database provider initializes `LocalCacheManager` from inside its own `Config()`, with no
 *    settings, so by the time a host passes `cacheSettings` the manager is already initialized. The
 *    old `Initialize` returned early in that case and dropped the config on the floor — every knob
 *    inert, on every deployment, with no error anywhere. The original test only ever initialized
 *    once, which is exactly why it passed.
 * 2. **A shared store expires its own keys; this process must not delete them by its own clock.**
 *    Each server would age the same entries out on its own schedule, publish a `removed` for each,
 *    and make every peer reload — a deletion storm for keys Redis already expires.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import type { ILocalStorageProvider } from '../generic/interfaces';
import { GetGlobalObjectStore } from '@memberjunction/global';

/** BaseSingleton keys its store on the class name; drop the instance so each test starts cold. */
function resetLocalCacheManager(): void {
    const g = GetGlobalObjectStore();
    const key = '___SINGLETON__LocalCacheManager';
    if (g && g[key]) {
        delete g[key];
    }
}

/** A storage provider that records what was removed, and can declare itself shared. */
function makeStore(shared: boolean): ILocalStorageProvider & { Removed: string[] } {
    const items = new Map<string, unknown>();
    const removed: string[] = [];
    return {
        Removed: removed,
        SharedAcrossProcesses: shared,
        async GetItem<T>(key: string): Promise<T | null> { return (items.get(key) as T) ?? null; },
        async SetItem<T>(key: string, value: T): Promise<void> { items.set(key, value); },
        async Remove(key: string): Promise<void> { removed.push(key); items.delete(key); },
        async GetItems<T>(keys: string[]): Promise<Map<string, T | null>> {
            return new Map(keys.map(k => [k, (items.get(k) as T) ?? null]));
        },
        async ClearCategory(): Promise<void> { items.clear(); },
        async GetCategoryKeys(): Promise<string[]> { return [...items.keys()]; },
    } as unknown as ILocalStorageProvider & { Removed: string[] };
}

describe('LocalCacheManager configuration', () => {
    beforeEach(() => {
        resetLocalCacheManager();
    });

    it('applies a config handed to a LATER Initialize, the way a provider-then-host startup does', async () => {
        const store = makeStore(false);

        // The provider's own Config() gets there first, with no settings — as it does on every server.
        await LocalCacheManager.Instance.Initialize(store);
        expect(LocalCacheManager.Instance.Config.maxSizeBytes).toBe(150 * 1024 * 1024);

        // Then the host passes what the operator configured.
        await LocalCacheManager.Instance.Initialize(store, {
            maxSizeBytes: 10 * 1024 * 1024,
            maxPercentOfCachePerEntity: 5,
            defaultTTLMs: 60_000,
            verboseLogging: true,
        });

        const config = LocalCacheManager.Instance.Config;
        expect(config.maxSizeBytes).toBe(10 * 1024 * 1024);
        expect(config.maxPercentOfCachePerEntity).toBe(5);
        expect(config.defaultTTLMs).toBe(60_000);
        expect(config.verboseLogging).toBe(true);
    });

    it('applies a config passed while an initialization is still in flight', async () => {
        const store = makeStore(false);
        const first = LocalCacheManager.Instance.Initialize(store);
        const second = LocalCacheManager.Instance.Initialize(store, { maxPercentOfCachePerEntity: 7 });
        await Promise.all([first, second]);
        expect(LocalCacheManager.Instance.Config.maxPercentOfCachePerEntity).toBe(7);
    });

    it('re-arms the eviction sweep when the interval changes, instead of recording it and doing nothing', async () => {
        vi.useFakeTimers();
        try {
            const store = makeStore(false);
            await LocalCacheManager.Instance.Initialize(store, { evictionSweepIntervalMs: 100_000 });
            const sweep = vi.spyOn(LocalCacheManager.Instance as unknown as { runEvictionSweep(): Promise<void> }, 'runEvictionSweep')
                .mockResolvedValue(undefined);

            LocalCacheManager.Instance.UpdateConfig({ evictionSweepIntervalMs: 1_000 });
            await vi.advanceTimersByTimeAsync(3_500);

            expect(sweep.mock.calls.length).toBeGreaterThanOrEqual(3);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('LocalCacheManager eviction against a shared store', () => {
    beforeEach(() => {
        resetLocalCacheManager();
    });

    /**
     * Registers one entry as if it had been cached `ageMs` ago, and forgets the probe key
     * Initialize writes and removes while deciding whether the store shares references.
     */
    async function cacheOneAgedEntry(store: ILocalStorageProvider & { Removed: string[] }, ageMs: number): Promise<string> {
        const fingerprint = 'MJ: AI Models|||-1|0||';
        await LocalCacheManager.Instance.SetRunViewResult(fingerprint, { EntityName: 'MJ: AI Models' },
            [{ ID: '1' }], new Date().toISOString(), undefined, 1);
        const registry = (LocalCacheManager.Instance as unknown as { _registry: Map<string, { cachedAt: number }> })._registry;
        for (const entry of registry.values()) {
            entry.cachedAt = Date.now() - ageMs;
        }
        store.Removed.length = 0;
        return fingerprint;
    }

    it('does NOT delete shared entries by its own TTL — the store expires them itself', async () => {
        const store = makeStore(true);
        await LocalCacheManager.Instance.Initialize(store, { defaultTTLMs: 1_000, evictionSweepIntervalMs: 0 });
        await cacheOneAgedEntry(store, 60_000);

        await (LocalCacheManager.Instance as unknown as { runEvictionSweep(): Promise<void> }).runEvictionSweep();

        expect(store.Removed).toEqual([]); // no delete, therefore no `removed` published to peers
    });

    it('still deletes expired entries from a store private to this process', async () => {
        const store = makeStore(false);
        await LocalCacheManager.Instance.Initialize(store, { defaultTTLMs: 1_000, evictionSweepIntervalMs: 0 });
        await cacheOneAgedEntry(store, 60_000);

        await (LocalCacheManager.Instance as unknown as { runEvictionSweep(): Promise<void> }).runEvictionSweep();

        expect(store.Removed.length).toBe(1);
    });
});
