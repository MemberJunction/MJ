/**
 * Verifies the `ILocalStorageProvider.ProcessLocalRegistry` contract:
 * a provider with `ProcessLocalRegistry = true` and `SharedAcrossProcesses = false`
 * (such as `SharedTabKernelStorageProvider` backed by browser IndexedDB) must:
 *
 * 1. Keep `__MJ_CACHE_REGISTRY__` process-local (`loadRegistry` and `persistRegistry` skipped).
 * 2. Immediately drop a schema-mismatched RunView slot on a serving read with NO rolling-deploy
 *    write hold, allowing immediate write-back under the current schema hash.
 * 3. Still honor local `defaultTTLMs` and per-entry `expiresAt` expiration in eviction sweeps
 *    (unlike Redis, browser IndexedDB does not expire entries natively).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalCacheManager, CachedRunViewData, CacheCategory, CacheEntryInfo } from '../generic/localCacheManager';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { Metadata } from '../generic/metadata';
import { RunViewParams } from '../views/runView';
import { GetGlobalObjectStore } from '@memberjunction/global';

class ProcessLocalRegistryMockStorageProvider extends MockCacheStorageProvider {
    public readonly SharedAcrossProcesses = false;
    public readonly ProcessLocalRegistry = true;
}

const ENTITY = 'TestEntity';
const FP = `${ENTITY}|_|_|-1|0|_|_`;
const PARAMS = { EntityName: ENTITY } as RunViewParams;
const OLD_ROWS = [{ ID: '1', Name: 'Stale' }];
const NEW_ROWS = [{ ID: '1', Name: 'Fresh', NewColumn: 'populated' }];
const REGISTRY_KEY = '__MJ_CACHE_REGISTRY__';

const OLD_METADATA = {
    __mj_UpdatedAt: new Date('2026-01-01T00:00:00Z'),
    Fields: [
        { Name: 'ID', __mj_UpdatedAt: new Date('2026-01-01T00:00:00Z') },
        { Name: 'Name', __mj_UpdatedAt: new Date('2026-01-01T00:00:00Z') },
    ],
};
const NEW_METADATA = {
    __mj_UpdatedAt: new Date('2026-01-01T00:00:00Z'),
    Fields: [
        ...OLD_METADATA.Fields,
        { Name: 'NewColumn', __mj_UpdatedAt: new Date('2026-02-01T00:00:00Z') },
    ],
};

type EntityMetadata = typeof OLD_METADATA;

function resetLocalCacheManager(): void {
    delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
}

function useMetadata(metadata: EntityMetadata): void {
    vi.spyOn(Metadata.prototype, 'EntityByName').mockReturnValue(
        { ...metadata, AllowCaching: true } as unknown as ReturnType<Metadata['EntityByName']>
    );
}

function storedSlot(storage: MockCacheStorageProvider): CachedRunViewData | null {
    return storage.getDirect(FP, CacheCategory.RunViewCache) as unknown as CachedRunViewData | null;
}

describe('LocalCacheManager with ProcessLocalRegistry=true and SharedAcrossProcesses=false', () => {
    let storage: ProcessLocalRegistryMockStorageProvider;

    beforeEach(() => {
        resetLocalCacheManager();
        storage = new ProcessLocalRegistryMockStorageProvider();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        resetLocalCacheManager();
    });

    it('keeps __MJ_CACHE_REGISTRY__ out of persisted storage (skips both loadRegistry and persistRegistry)', async () => {
        // Pre-seed a registry entry from "another tab" — loadRegistry must ignore it.
        const foreignRegistry: CacheEntryInfo[] = [
            {
                key: 'foreign-key',
                category: CacheCategory.RunViewCache,
                sizeBytes: 128,
                cachedAt: Date.now(),
                lastAccessedAt: Date.now(),
                accessCount: 1,
                fingerprint: 'ForeignEntity|_|_|-1|0|_|_',
            },
        ];
        storage.setDirect(REGISTRY_KEY, foreignRegistry as unknown as string, CacheCategory.Metadata);

        vi.useFakeTimers();
        const manager = LocalCacheManager.Instance;
        await manager.Initialize(storage, { evictionSweepIntervalMs: 0 });

        // Foreign persisted registry was NOT loaded into this process's registry.
        expect(manager.GetAllEntries()).toEqual([]);

        // Remove the pre-seeded value so we can prove persistRegistry never writes it back.
        await storage.Remove(REGISTRY_KEY, CacheCategory.Metadata);
        useMetadata(NEW_METADATA);
        await manager.SetRunViewResult(FP, PARAMS, NEW_ROWS, '');

        // Advance well past the 1s debouncedPersistRegistry timer.
        await vi.advanceTimersByTimeAsync(2_000);

        expect(manager.GetAllEntries().length).toBeGreaterThan(0);
        expect(storage.getDirect(REGISTRY_KEY, CacheCategory.Metadata)).toBeNull();
    });

    it('immediately drops a schema-mismatched RunView slot on serving read with no write hold and writes back immediately', async () => {
        const manager = LocalCacheManager.Instance;
        await manager.Initialize(storage, { evictionSweepIntervalMs: 0 });

        // Write a slot under OLD_METADATA (simulating pre-migration IndexedDB contents).
        useMetadata(OLD_METADATA);
        await manager.SetRunViewResult(FP, PARAMS, OLD_ROWS, '2026-01-01T00:00:00Z');
        const oldHash = manager.ComputeSchemaHash(undefined, ENTITY)!;
        expect(storedSlot(storage)?.schemaHash).toBe(oldHash);

        // Migrate metadata to NEW_METADATA (simulating post-migration reload).
        useMetadata(NEW_METADATA);
        const newHash = manager.ComputeSchemaHash(undefined, ENTITY)!;
        expect(newHash).not.toBe(oldHash);
        storage.resetCallCounts();

        // First serving read misses on schema hash and immediately drops the stale slot.
        const miss = await manager.GetRunViewResult(FP);
        expect(miss).toBeNull();
        await vi.waitFor(() => expect(storedSlot(storage)).toBeNull());
        expect(storage.removeCallCount).toBe(1);

        // Immediate write-back MUST NOT be blocked by a 60s rolling-deploy write hold.
        await manager.SetRunViewResult(FP, PARAMS, NEW_ROWS, '2026-02-01T00:00:00Z');
        expect(storedSlot(storage)?.schemaHash).toBe(newHash);
        expect(storedSlot(storage)?.results).toEqual(NEW_ROWS);

        // Next read hits cache under the new schema hash.
        const hit = await manager.GetRunViewResult(FP);
        expect(hit).not.toBeNull();
        expect(hit?.results).toEqual(NEW_ROWS);
        expect(hit?.schemaHash).toBe(newHash);
    });

    it('still honors local defaultTTLMs and per-entry expiresAt expiration during eviction sweeps', async () => {
        const manager = LocalCacheManager.Instance;
        await manager.Initialize(storage, { defaultTTLMs: 1_000, evictionSweepIntervalMs: 0 });
        useMetadata(NEW_METADATA);

        await manager.SetRunViewResult(FP, PARAMS, NEW_ROWS, '');
        expect(storedSlot(storage)).not.toBeNull();

        // Age the registry entry beyond defaultTTLMs.
        const registry = (manager as unknown as {
            _registry: Map<string, { cachedAt: number; expiresAt?: number }>;
        })._registry;
        for (const entry of registry.values()) {
            entry.cachedAt = Date.now() - 60_000;
        }
        storage.resetCallCounts();

        await (manager as unknown as { runEvictionSweep(): Promise<void> }).runEvictionSweep();

        expect(storage.removeCallCount).toBe(1);
        expect(storedSlot(storage)).toBeNull();

        // Also verify per-entry expiresAt with defaultTTLMs disabled.
        manager.UpdateConfig({ defaultTTLMs: 0 });
        await manager.SetRunViewResult(FP, PARAMS, NEW_ROWS, '');
        for (const entry of registry.values()) {
            entry.expiresAt = Date.now() - 1_000;
        }
        storage.resetCallCounts();

        await (manager as unknown as { runEvictionSweep(): Promise<void> }).runEvictionSweep();

        expect(storage.removeCallCount).toBe(1);
        expect(storedSlot(storage)).toBeNull();
    });
});
