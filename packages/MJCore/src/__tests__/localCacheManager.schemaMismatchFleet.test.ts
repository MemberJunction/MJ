/**
 * Schema-hash mismatches on a cache shared by several processes.
 *
 * Processes that loaded metadata on either side of a migration compute different schema hashes for
 * the changed entity. On a shared store a mismatch must not delete the slot (a delete is published to
 * every peer, whose engines reload and rewrite it under their own hash). A process that has seen a
 * slot written under newer metadata stops writing that entity's slots; one that has seen any other
 * mismatched slot writes them at most once per interval. Process-local stores and slot-maintenance
 * reads keep deleting a mismatched slot.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalCacheManager, CachedRunViewData, CacheCategory } from '../generic/localCacheManager';
import { CompositeKey } from '../generic/compositeKey';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { Metadata } from '../generic/metadata';
import { RunViewParams } from '../views/runView';
import * as logging from '../generic/logging';
import { GetGlobalObjectStore } from '@memberjunction/global';

/** The mock store, declared as shared across processes the way the Redis provider is. */
class SharedMockCacheStorageProvider extends MockCacheStorageProvider {
    public readonly SharedAcrossProcesses = true;
}

const ENTITY = 'TestEntity';
const FP = `${ENTITY}|_|_|-1|0|_|_`;
const PARAMS = { EntityName: ENTITY } as RunViewParams;
const ROWS = [{ ID: '1', Name: 'Alice' }];

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

/** A fresh, independent manager instance (the class is a singleton, so the global slot is cleared first). */
async function newManager(storage: MockCacheStorageProvider): Promise<LocalCacheManager> {
    resetLocalCacheManager();
    const manager = LocalCacheManager.Instance;
    await manager.Initialize(storage);
    return manager;
}

/** Makes every metadata lookup in the cache manager resolve the entity to `metadata`. */
function useMetadata(metadata: EntityMetadata): void {
    vi.spyOn(Metadata.prototype, 'EntityByName').mockReturnValue(
        { ...metadata, AllowCaching: true } as unknown as ReturnType<Metadata['EntityByName']>
    );
}

function storedSlot(storage: MockCacheStorageProvider): CachedRunViewData | null {
    return storage.getDirect(FP, CacheCategory.RunViewCache) as unknown as CachedRunViewData | null;
}

function hashOf(manager: LocalCacheManager, metadata: EntityMetadata): string {
    useMetadata(metadata);
    return manager.ComputeSchemaHash(undefined, ENTITY)!;
}

const INTERVAL = LocalCacheManager.SCHEMA_MISMATCH_WRITE_INTERVAL_MS;
let now = 0;

/** Pins Date.now to a clock the test advances. */
function useClock(): void {
    now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
}

/** One read by `manager` under `metadata`, writing back on a miss the way the RunView fill path does. */
async function readThrough(manager: LocalCacheManager, metadata: EntityMetadata): Promise<void> {
    useMetadata(metadata);
    if (!(await manager.GetRunViewResult(FP))) {
        await manager.SetRunViewResult(FP, PARAMS, ROWS, '');
    }
}

describe('LocalCacheManager schema mismatch on a shared store', () => {
    let storage: SharedMockCacheStorageProvider;

    beforeEach(() => {
        storage = new SharedMockCacheStorageProvider();
        useClock();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        resetLocalCacheManager();
    });

    it('stores the schema stamp alongside the hash', async () => {
        const manager = await newManager(storage);
        useMetadata(NEW_METADATA);

        await manager.SetRunViewResult(FP, PARAMS, ROWS, '');

        expect(storedSlot(storage)?.schemaHash).toBe(hashOf(manager, NEW_METADATA));
        expect(storedSlot(storage)?.schemaStamp).toBe('2026-02-01T00:00:00.000Z');
    });

    it('does not delete a slot written under newer metadata, and stops overwriting the entity', async () => {
        const newer = await newManager(storage);
        useMetadata(NEW_METADATA);
        await newer.SetRunViewResult(FP, PARAMS, ROWS, '');
        const newerHash = storedSlot(storage)!.schemaHash;

        const older = await newManager(storage);
        useMetadata(OLD_METADATA);
        storage.resetCallCounts();

        expect(await older.GetRunViewResult(FP)).toBeNull();
        await older.SetRunViewResult(FP, PARAMS, ROWS, '');

        expect(storage.removeCallCount).toBe(0);
        expect(storage.setCallCount).toBe(0);
        expect(storedSlot(storage)?.schemaHash).toBe(newerHash);
    });

    it('resumes writing once the older process loads the newer metadata', async () => {
        const newer = await newManager(storage);
        useMetadata(NEW_METADATA);
        await newer.SetRunViewResult(FP, PARAMS, ROWS, '');

        const older = await newManager(storage);
        useMetadata(OLD_METADATA);
        expect(await older.GetRunViewResult(FP)).toBeNull();

        useMetadata(NEW_METADATA);
        expect(await older.GetRunViewResult(FP)).not.toBeNull();
        await older.SetRunViewResult(FP, PARAMS, [{ ID: '2', Name: 'Bob' }], '');
        expect(storedSlot(storage)?.results).toEqual([{ ID: '2', Name: 'Bob' }]);
    });

    it('replaces a slot written under older metadata after the write interval, without deleting it', async () => {
        const older = await newManager(storage);
        useMetadata(OLD_METADATA);
        await older.SetRunViewResult(FP, PARAMS, ROWS, '');

        const newer = await newManager(storage);
        useMetadata(NEW_METADATA);
        storage.resetCallCounts();

        expect(await newer.GetRunViewResult(FP)).toBeNull();
        await newer.SetRunViewResult(FP, PARAMS, ROWS, '');
        expect(storedSlot(storage)?.schemaHash).toBe(hashOf(newer, OLD_METADATA));

        now += INTERVAL;
        await readThrough(newer, NEW_METADATA);

        expect(storage.removeCallCount).toBe(0);
        expect(storedSlot(storage)?.schemaHash).toBe(hashOf(newer, NEW_METADATA));
    });

    it('treats a slot with no schema stamp as written under older metadata', async () => {
        const manager = await newManager(storage);
        const legacy: CachedRunViewData = { results: ROWS, maxUpdatedAt: '', schemaHash: hashOf(manager, OLD_METADATA) };
        storage.setDirect(FP, legacy as unknown as string, CacheCategory.RunViewCache);

        await readThrough(manager, NEW_METADATA);
        now += INTERVAL;
        await readThrough(manager, NEW_METADATA);

        expect(storage.removeCallCount).toBe(0);
        expect(storedSlot(storage)?.schemaHash).toBe(hashOf(manager, NEW_METADATA));
    });

    it('ends a two-process exchange instead of evicting back and forth', async () => {
        const older = await newManager(storage);
        const newer = await newManager(storage);
        storage.resetCallCounts();

        // Each round, both processes read the slot and write back what they read from the database
        // on a miss: the pattern that held Redis at full load when a miss also deleted the slot.
        for (let round = 0; round < 10; round++) {
            await readThrough(older, OLD_METADATA);
            await readThrough(newer, NEW_METADATA);
            now += INTERVAL / 4;
        }

        expect(storage.removeCallCount).toBe(0);
        // The older process fills the empty slot; the newer one replaces it once its interval is up;
        // the older one then finds a newer slot and stops writing, and the newer one hits.
        expect(storage.setCallCount).toBe(2);
        expect(storedSlot(storage)?.schemaHash).toBe(hashOf(newer, NEW_METADATA));
    });

    it('writes at most once per interval against a peer that deletes mismatched slots', async () => {
        const fixed = await newManager(storage);
        const oldHash = hashOf(fixed, OLD_METADATA);
        let peerDeletes = 0;
        /** A process on a release that deleted any slot whose hash differed from its own, then refilled it. */
        const deletingPeerRead = async (): Promise<void> => {
            const slot = storedSlot(storage);
            if (slot && slot.schemaHash !== oldHash) {
                peerDeletes++;
                await storage.Remove(FP, CacheCategory.RunViewCache);
            }
            if (!storedSlot(storage)) {
                storage.setDirect(FP, { results: ROWS, maxUpdatedAt: '', schemaHash: oldHash } as unknown as string, CacheCategory.RunViewCache);
            }
        };

        const rounds = 40;
        const step = 5_000;
        for (let round = 0; round < rounds; round++) {
            await deletingPeerRead();
            await readThrough(fixed, NEW_METADATA);
            now += step;
        }

        const intervals = Math.ceil((rounds * step) / INTERVAL);
        expect(peerDeletes).toBeGreaterThan(0);
        expect(peerDeletes).toBeLessThanOrEqual(intervals);
    });

    it('lifts the write hold after an interval with no mismatch', async () => {
        const older = await newManager(storage);
        useMetadata(OLD_METADATA);
        await older.SetRunViewResult(FP, PARAMS, ROWS, '');

        const newer = await newManager(storage);
        await readThrough(newer, NEW_METADATA);
        now += INTERVAL;
        await readThrough(newer, NEW_METADATA);
        expect(storedSlot(storage)?.schemaHash).toBe(hashOf(newer, NEW_METADATA));

        now += INTERVAL + 1;
        await readThrough(newer, NEW_METADATA);
        const otherFP = `${ENTITY}|Name='x'|_|-1|0|_|_`;
        await newer.SetRunViewResult(otherFP, PARAMS, ROWS, '');
        await newer.SetRunViewResult(otherFP, PARAMS, [{ ID: '2', Name: 'Bob' }], '');

        expect((storage.getDirect(otherFP, CacheCategory.RunViewCache) as unknown as CachedRunViewData).results)
            .toEqual([{ ID: '2', Name: 'Bob' }]);
    });

    it('still deletes a mismatched slot when a row change needs to rewrite it', async () => {
        const newer = await newManager(storage);
        useMetadata(NEW_METADATA);
        await newer.SetRunViewResult(FP, PARAMS, ROWS, '');

        const older = await newManager(storage);
        useMetadata(OLD_METADATA);
        storage.resetCallCounts();

        const applied = await older.UpsertSingleEntity(FP, { ID: '1', Name: 'Changed' }, CompositeKey.FromID('1'), '');

        expect(applied).toBe(false);
        // The delete is fire-and-forget inside the read; let it land.
        await vi.waitFor(() => expect(storedSlot(storage)).toBeNull());
    });

    it('carries the schema stamp through an in-place row change', async () => {
        const manager = await newManager(storage);
        useMetadata(NEW_METADATA);
        await manager.SetRunViewResult(FP, PARAMS, ROWS, '');

        const applied = await manager.UpsertSingleEntity(FP, { ID: '2', Name: 'Bob' }, CompositeKey.FromID('2'), '');

        expect(applied).toBe(true);
        expect(storedSlot(storage)?.results).toHaveLength(2);
        expect(storedSlot(storage)?.schemaStamp).toBe('2026-02-01T00:00:00.000Z');
    });

    it('logs a given mismatch once per process', async () => {
        const newer = await newManager(storage);
        useMetadata(NEW_METADATA);
        await newer.SetRunViewResult(FP, PARAMS, ROWS, '');

        const older = await newManager(storage);
        useMetadata(OLD_METADATA);
        const status = vi.spyOn(logging, 'LogStatusEx');

        for (let i = 0; i < 5; i++) {
            await older.GetRunViewResult(FP);
        }

        const staleWarnings = status.mock.calls.filter(([options]) => String(options.message).includes('[CACHE-SCHEMA-STALE]'));
        expect(staleWarnings).toHaveLength(1);
        expect(String(staleWarnings[0][0].message)).toContain('restart it');
    });
});

describe('LocalCacheManager schema mismatch on a process-local store', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        resetLocalCacheManager();
    });

    it('deletes the mismatched slot on a serving read', async () => {
        const storage = new MockCacheStorageProvider();
        const manager = await newManager(storage);
        useMetadata(NEW_METADATA);
        await manager.SetRunViewResult(FP, PARAMS, ROWS, '');

        useMetadata(OLD_METADATA);
        expect(await manager.GetRunViewResult(FP)).toBeNull();

        await vi.waitFor(() => expect(storedSlot(storage)).toBeNull());
        // No write gate on a local store: the caller's write-back lands.
        await manager.SetRunViewResult(FP, PARAMS, ROWS, '');
        expect(storedSlot(storage)?.schemaHash).toBe(hashOf(manager, OLD_METADATA));
    });
});
