/**
 * Save/delete invalidation on a storage provider shared between processes.
 *
 * A process's entity→fingerprint index holds only the slots it wrote. On a shared store a save
 * must also reach slots other processes wrote — notably an engine's unfiltered slot that this
 * process only read warm at boot — or the engines that load from those slots on its peers never
 * hear about the change. Process-local stores keep listing the category only when the local index
 * is empty.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalCacheManager, CachedRunViewData, CacheCategory } from '../generic/localCacheManager';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { RunViewParams } from '../views/runView';
import { GetGlobalObjectStore } from '@memberjunction/global';

/** The mock store, declared as shared across processes the way the Redis provider is. */
class SharedMockCacheStorageProvider extends MockCacheStorageProvider {
    public readonly SharedAcrossProcesses = true;
}

const ENTITY = 'Org Settings';
const ENGINE_FP = `${ENTITY}|_|_|-1|0|_|_`;
const FILTERED_FP = `${ENTITY}|OrgID='A'|_|-1|0|_|_`;
const OTHER_ENTITY_FP = `${ENTITY} Archive|_|_|-1|0|_|_`;
const ROWS = [{ ID: '1', Value: 'old' }, { ID: '2', Value: 'other' }];

type EventHandler = { HandleBaseEntityEvent: (e: unknown) => Promise<void> };

function resetLocalCacheManager(): void {
    delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
}

/** A fresh, independent manager instance standing in for one process on the given store. */
async function newProcess(storage: MockCacheStorageProvider): Promise<LocalCacheManager> {
    resetLocalCacheManager();
    const manager = LocalCacheManager.Instance;
    await manager.Initialize(storage);
    return manager;
}

async function writeSlot(manager: LocalCacheManager, fingerprint: string, entityName = ENTITY): Promise<void> {
    await manager.SetRunViewResult(fingerprint, { EntityName: entityName } as RunViewParams, ROWS, '2026-01-01T00:00:00Z');
}

function entityEvent(type: 'save' | 'delete', record: Record<string, unknown>) {
    return {
        type,
        payload: type === 'delete' ? { OldValues: record } : undefined,
        baseEntity: {
            EntityInfo: { Name: ENTITY, PrimaryKeys: [{ Name: 'ID' }], AllowCaching: true },
            Get: (fieldName: string) => record[fieldName],
            GetAll: () => ({ ...record }),
        },
    };
}

async function raise(manager: LocalCacheManager, event: ReturnType<typeof entityEvent>): Promise<void> {
    await (manager as unknown as EventHandler).HandleBaseEntityEvent(event);
}

function storedRows(storage: MockCacheStorageProvider, fingerprint: string): Record<string, unknown>[] | null {
    const slot = storage.getDirect(fingerprint, CacheCategory.RunViewCache) as unknown as CachedRunViewData | null;
    return slot ? (slot.results as Record<string, unknown>[]) : null;
}

/**
 * Process B fills the engine slot; process A boots on the same store, reads that slot warm (a read
 * indexes nothing), then writes its own filtered view. A's local index holds only the filtered view.
 */
async function processAWithWarmReadSlot(storage: MockCacheStorageProvider): Promise<LocalCacheManager> {
    const processB = await newProcess(storage);
    await writeSlot(processB, ENGINE_FP);

    const processA = await newProcess(storage);
    expect(await processA.GetRunViewResult(ENGINE_FP)).not.toBeNull();
    await writeSlot(processA, FILTERED_FP);
    expect([...processA.GetFingerprintsForEntity(ENTITY)]).toEqual([FILTERED_FP]);
    return processA;
}

describe('LocalCacheManager invalidation on a shared store', () => {
    let storage: SharedMockCacheStorageProvider;

    beforeEach(() => {
        storage = new SharedMockCacheStorageProvider();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        resetLocalCacheManager();
    });

    it('a save reaches both the warm-read engine slot and the indexed filtered view', async () => {
        const processA = await processAWithWarmReadSlot(storage);

        await raise(processA, entityEvent('save', { ID: '1', Value: 'new' }));

        expect(storedRows(storage, ENGINE_FP)).toEqual([{ ID: '1', Value: 'new' }, { ID: '2', Value: 'other' }]);
        expect(storedRows(storage, FILTERED_FP)).toBeNull();
    });

    it('a delete reaches both the warm-read engine slot and the indexed filtered view', async () => {
        const processA = await processAWithWarmReadSlot(storage);

        await raise(processA, entityEvent('delete', { ID: '1', Value: 'old' }));

        expect(storedRows(storage, ENGINE_FP)).toEqual([{ ID: '2', Value: 'other' }]);
        expect(storedRows(storage, FILTERED_FP)).toEqual([{ ID: '2', Value: 'other' }]);
    });

    it('lists the store on every save, so a slot a peer wrote after the first save is still reached', async () => {
        const processA = await processAWithWarmReadSlot(storage);
        await raise(processA, entityEvent('save', { ID: '1', Value: 'first' }));

        const lateFp = `${ENTITY}|OrgID='B'|_|-1|0|_|_`;
        storage.setDirect(lateFp, storage.getDirect(ENGINE_FP, CacheCategory.RunViewCache)!, CacheCategory.RunViewCache);

        await raise(processA, entityEvent('save', { ID: '2', Value: 'second' }));

        expect(storedRows(storage, lateFp)).toBeNull();
        expect(storedRows(storage, ENGINE_FP)).toEqual([{ ID: '1', Value: 'first' }, { ID: '2', Value: 'second' }]);
    });

    it('does not touch slots of an entity whose name only starts with the saved entity name', async () => {
        const processB = await newProcess(storage);
        await writeSlot(processB, OTHER_ENTITY_FP, `${ENTITY} Archive`);
        const processA = await newProcess(storage);

        await raise(processA, entityEvent('save', { ID: '1', Value: 'new' }));

        expect(storedRows(storage, OTHER_ENTITY_FP)).toEqual(ROWS);
    });
});

describe('LocalCacheManager invalidation on a process-local store', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        resetLocalCacheManager();
    });

    it('answers from a non-empty local index without listing the category', async () => {
        const storage = new MockCacheStorageProvider();
        const manager = await newProcess(storage);
        await writeSlot(manager, FILTERED_FP);
        const listSpy = vi.spyOn(storage, 'GetCategoryKeys');

        await raise(manager, entityEvent('save', { ID: '1', Value: 'new' }));

        expect(listSpy).not.toHaveBeenCalled();
        expect(storedRows(storage, FILTERED_FP)).toBeNull();
    });

    it('lists the category when the local index is empty, finding slots from an earlier session', async () => {
        const storage = new MockCacheStorageProvider();
        const earlierSession = await newProcess(storage);
        await writeSlot(earlierSession, ENGINE_FP);
        const manager = await newProcess(storage);

        await raise(manager, entityEvent('save', { ID: '1', Value: 'new' }));

        expect(storedRows(storage, ENGINE_FP)).toEqual([{ ID: '1', Value: 'new' }, { ID: '2', Value: 'other' }]);
    });
});
