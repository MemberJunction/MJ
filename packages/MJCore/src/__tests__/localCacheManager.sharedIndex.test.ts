/**
 * LocalCacheManager on a storage provider shared between processes (plan N3, item 1.2).
 *
 * Every RunView slot write names its entity as the storage index group, so a shared provider
 * (Redis) can tell any process which slots exist for an entity. On a save, the manager reads that
 * index even when its own in-memory index already knows some slots: otherwise a slot written by
 * another server after this one booted is never invalidated by this server's saves.
 *
 * Writes also carry the time left on a slot's own expiry (external-data-source entities), so a
 * rewrite does not extend it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalCacheManager, CacheCategory } from '../generic/localCacheManager';
import { ILocalStorageProvider, LocalStorageWriteOptions } from '../generic/interfaces';
import { RunViewParams } from '../views/runView';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';

function resetLocalCacheManager(): void {
    delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
}

interface WriteRecord {
    key: string;
    category?: string;
    options?: LocalStorageWriteOptions;
}

/** Map-backed stand-in for a shared provider: keeps index groups and records every write. */
class SharedIndexStore implements ILocalStorageProvider {
    public readonly SharesReferences = false;
    public readonly Writes: WriteRecord[] = [];
    private store = new Map<string, unknown>();
    private groups = new Map<string, Set<string>>();

    private k(key: string, category?: string): string {
        return `${category ?? 'default'}::${key}`;
    }
    public async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> {
        const v = this.store.get(this.k(key, category));
        return v === undefined ? null : (JSON.parse(JSON.stringify(v)) as T);
    }
    public async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> {
        const out = new Map<string, T | null>();
        for (const key of new Set(keys)) out.set(key, await this.GetItem<T>(key, category));
        return out;
    }
    public async SetItem<T>(key: string, value: T, category?: string, options?: LocalStorageWriteOptions): Promise<void> {
        this.Writes.push({ key, category, options });
        this.store.set(this.k(key, category), JSON.parse(JSON.stringify(value)));
        if (options?.IndexGroup) {
            const g = `${category}::${options.IndexGroup}`;
            if (!this.groups.has(g)) this.groups.set(g, new Set());
            this.groups.get(g)!.add(key);
        }
    }
    public readonly Removed: string[] = [];
    public async Remove(key: string, category?: string): Promise<void> {
        this.Removed.push(key);
        this.store.delete(this.k(key, category));
    }
    public GetCategoryKeys = vi.fn(async (category: string): Promise<string[]> =>
        [...this.store.keys()].filter(k => k.startsWith(`${category}::`)).map(k => k.substring(category.length + 2)));
    public async GetIndexGroupKeys(category: string, group: string): Promise<string[]> {
        const members = this.groups.get(`${category}::${group}`) ?? new Set<string>();
        return [...members].filter(m => this.store.has(this.k(m, category)));
    }
    public Has(key: string, category: string): boolean {
        return this.store.has(this.k(key, category));
    }
}

const UNFILTERED = 'Users|_|_|-1|0|_|_';
const PEER_FILTERED = "Users|Name LIKE 'A%'|_|-1|0|_|_";
const PARAMS = { EntityName: 'Users' } as RunViewParams;

type Internals = { HandleBaseEntityEvent(e: unknown): Promise<void> };

function saveEvent(id: string, name: string): unknown {
    const fields: Record<string, unknown> = { ID: id, Name: name };
    return {
        type: 'save',
        baseEntity: {
            EntityInfo: { Name: 'Users', PrimaryKeys: [{ Name: 'ID' }], AllowCaching: true },
            Get: (f: string) => fields[f],
            GetAll: () => ({ ...fields }),
        },
    };
}

describe('LocalCacheManager — shared per-entity index', () => {
    let manager: LocalCacheManager;
    let store: SharedIndexStore;

    beforeEach(async () => {
        resetLocalCacheManager();
        manager = LocalCacheManager.Instance;
        store = new SharedIndexStore();
        await manager.Initialize(store);
    });

    it('indexes a RunView slot under its entity name', async () => {
        await manager.SetRunViewResult(UNFILTERED, PARAMS, [{ ID: '1' }], '2024-01-01T00:00:00Z');
        const write = store.Writes.find(w => w.key === UNFILTERED);
        expect(write?.category).toBe(CacheCategory.RunViewCache);
        expect(write?.options?.IndexGroup).toBe('Users');
        expect(write?.options?.TTLSeconds).toBeUndefined();
    });

    it('passes an external slot\'s TTL through to storage', async () => {
        await manager.SetRunViewResult(UNFILTERED, PARAMS, [{ ID: '1' }], '2024-01-01T00:00:00Z',
            undefined, undefined, undefined, 90_000);
        expect(store.Writes.find(w => w.key === UNFILTERED)?.options?.TTLSeconds).toBe(90);
    });

    it('indexes the slot again when a save rewrites it, without extending its expiry', async () => {
        await manager.SetRunViewResult(UNFILTERED, PARAMS, [{ ID: '1', Name: 'A' }], '2024-01-01T00:00:00Z',
            undefined, undefined, undefined, 90_000);
        store.Writes.length = 0;

        await (manager as unknown as Internals).HandleBaseEntityEvent(saveEvent('1', 'B'));

        const rewrite = store.Writes.find(w => w.key === UNFILTERED);
        expect(rewrite?.options?.IndexGroup).toBe('Users');
        expect(rewrite?.options?.TTLSeconds).toBeGreaterThan(0);
        expect(rewrite?.options?.TTLSeconds).toBeLessThanOrEqual(90);
    });

    it('finds a slot another process wrote even when its own index already knows one', async () => {
        await manager.SetRunViewResult(UNFILTERED, PARAMS, [{ ID: '1', Name: 'A' }], '2024-01-01T00:00:00Z');
        // A peer wrote a filtered slot for the same entity after this process built its index.
        await store.SetItem(PEER_FILTERED, { results: [{ ID: '1', Name: 'A' }], maxUpdatedAt: '2024-01-01T00:00:00Z' },
            CacheCategory.RunViewCache, { IndexGroup: 'Users' });
        expect(manager.GetFingerprintsForEntity('Users').has(PEER_FILTERED)).toBe(false);

        await (manager as unknown as Internals).HandleBaseEntityEvent(saveEvent('1', 'Z'));

        // The filtered peer slot cannot be maintained in place, so the save must drop it.
        expect(store.Has(PEER_FILTERED, CacheCategory.RunViewCache)).toBe(false);
        const own = await manager.GetRunViewResult(UNFILTERED);
        expect((own?.results[0] as Record<string, unknown>).Name).toBe('Z');
    });

    it('invalidates an indexed slot that expired, so peers holding it in memory reload', async () => {
        await manager.SetRunViewResult(UNFILTERED, PARAMS, [{ ID: '1', Name: 'A' }], '2024-01-01T00:00:00Z');
        await store.Remove(UNFILTERED, CacheCategory.RunViewCache);   // expired in shared storage
        const removeSpy = vi.spyOn(store, 'Remove');

        await (manager as unknown as Internals).HandleBaseEntityEvent(saveEvent('1', 'B'));

        // On Redis, Remove is what publishes the 'removed' event peer engines reload on.
        expect(removeSpy).toHaveBeenCalledWith(UNFILTERED, CacheCategory.RunViewCache);
        expect(manager.GetFingerprintsForEntity('Users').has(UNFILTERED)).toBe(false);
    });

    it('does not list the whole category on a save when the provider has an index', async () => {
        await manager.SetRunViewResult(UNFILTERED, PARAMS, [{ ID: '1' }], '2024-01-01T00:00:00Z');
        await (manager as unknown as Internals).HandleBaseEntityEvent(saveEvent('1', 'B'));
        expect(store.GetCategoryKeys).not.toHaveBeenCalled();
    });

    it('indexes RunView slots when they are migrated to a new provider at the swap', async () => {
        resetLocalCacheManager();
        manager = LocalCacheManager.Instance;
        await manager.Initialize(new MockCacheStorageProvider());
        await manager.SetRunViewResult(UNFILTERED, PARAMS, [{ ID: '1' }], '2024-01-01T00:00:00Z');

        const target = new SharedIndexStore();
        await manager.SetStorageProvider(target);

        expect(target.Writes.find(w => w.key === UNFILTERED)?.options?.IndexGroup).toBe('Users');
        expect(await target.GetIndexGroupKeys(CacheCategory.RunViewCache, 'Users')).toEqual([UNFILTERED]);
    });
});

describe('LocalCacheManager — provider without a shared index', () => {
    it('keeps using its own index and lists the category only when that index is empty', async () => {
        resetLocalCacheManager();
        const manager = LocalCacheManager.Instance;
        const store = new MockCacheStorageProvider();
        const listSpy = vi.spyOn(store, 'GetCategoryKeys');
        await manager.Initialize(store);

        await manager.SetRunViewResult(UNFILTERED, PARAMS, [{ ID: '1', Name: 'A' }], '2024-01-01T00:00:00Z');
        await (manager as unknown as Internals).HandleBaseEntityEvent(saveEvent('1', 'B'));

        expect(listSpy).not.toHaveBeenCalled();
        const own = await manager.GetRunViewResult(UNFILTERED);
        expect((own?.results[0] as Record<string, unknown>).Name).toBe('B');
    });
});

describe('LocalCacheManager registry on a store shared across processes (plan N2, item 2.2)', () => {
    /** Shared store: records every key written, and can hold a registry another server left behind. */
    class SharedStore extends SharedIndexStore {
        public readonly SharedAcrossProcesses = true;
    }

    it('neither loads nor writes the registry', async () => {
        resetLocalCacheManager();
        const store = new SharedStore();
        // A registry persisted by another server (or an older version of this one).
        await store.SetItem('__MJ_CACHE_REGISTRY__', [{ key: 'Peers|x', type: 'runview', name: 'Peers', fingerprint: 'Peers|x',
            cachedAt: 0, lastAccessedAt: 0, accessCount: 0, sizeBytes: 5, maxUpdatedAt: '' }], CacheCategory.Metadata);
        store.Writes.length = 0;

        const manager = LocalCacheManager.Instance;
        await manager.Initialize(store);
        expect(manager.GetAllEntries()).toEqual([]);
        expect(manager.GetFingerprintsForEntity('Peers').size).toBe(0);

        await manager.SetRunViewResult(UNFILTERED, PARAMS, [{ ID: '1' }], '2024-01-01T00:00:00Z');
        await manager.InvalidateEntityCaches('Users');   // persists the registry immediately on other stores
        expect(store.Writes.filter(w => w.key === '__MJ_CACHE_REGISTRY__')).toHaveLength(0);
    });

    it('does not write the registry when a process swaps onto the shared store', async () => {
        resetLocalCacheManager();
        const manager = LocalCacheManager.Instance;
        await manager.Initialize(new MockCacheStorageProvider());
        await manager.SetRunViewResult(UNFILTERED, PARAMS, [{ ID: '1' }], '2024-01-01T00:00:00Z');

        const shared = new SharedStore();
        await manager.SetStorageProvider(shared);

        expect(shared.Writes.map(w => w.key)).toEqual([UNFILTERED]);
        expect(manager.GetAllEntries()).toHaveLength(1);   // the process still accounts for its own slots
    });

    it('still persists the registry on a store that is not shared (IndexedDB, in-memory)', async () => {
        resetLocalCacheManager();
        const store = new SharedIndexStore();   // not SharedAcrossProcesses
        const manager = LocalCacheManager.Instance;
        await manager.Initialize(store);
        await manager.SetRunViewResult(UNFILTERED, PARAMS, [{ ID: '1' }], '2024-01-01T00:00:00Z');
        await manager.InvalidateEntityCaches('Users');
        expect(store.Writes.some(w => w.key === '__MJ_CACHE_REGISTRY__')).toBe(true);
    });
});

describe('LocalCacheManager.SetStorageProvider with the provider already in use (plan N1)', () => {
    it('does not migrate or rewrite anything', async () => {
        resetLocalCacheManager();
        const store = new SharedIndexStore();
        const manager = LocalCacheManager.Instance;
        await manager.Initialize(store);
        await manager.SetRunViewResult(UNFILTERED, PARAMS, [{ ID: '1' }], '2024-01-01T00:00:00Z');
        store.Writes.length = 0;

        await manager.SetStorageProvider(store);

        expect(store.Writes).toHaveLength(0);
    });
});


describe('LocalCacheManager — cross-process lock for in-place rewrites (plan N7)', () => {
    class LockingStore extends SharedIndexStore {
        public Locked: string[] = [];
        public FailLock = false;
        public async WithKeyLock<T>(key: string, category: string, work: () => Promise<T>): Promise<T> {
            if (this.FailLock) {
                throw new Error('timed out waiting for another process');
            }
            this.Locked.push(`${category}:${key}`);
            return work();
        }
    }

    it('takes the shared lock around a save-driven rewrite', async () => {
        resetLocalCacheManager();
        const store = new LockingStore();
        const manager = LocalCacheManager.Instance;
        await manager.Initialize(store);
        await manager.SetRunViewResult(UNFILTERED, PARAMS, [{ ID: '1', Name: 'A' }], '2024-01-01T00:00:00Z');

        await (manager as unknown as Internals).HandleBaseEntityEvent(saveEvent('1', 'B'));

        expect(store.Locked).toEqual([`RunViewCache:${UNFILTERED}`]);
        expect(((await manager.GetRunViewResult(UNFILTERED))?.results[0] as Record<string, unknown>).Name).toBe('B');
    });

    it('invalidates the slot when the lock cannot be acquired, instead of rewriting it unlocked', async () => {
        resetLocalCacheManager();
        const store = new LockingStore();
        const manager = LocalCacheManager.Instance;
        await manager.Initialize(store);
        await manager.SetRunViewResult(UNFILTERED, PARAMS, [{ ID: '1', Name: 'A' }], '2024-01-01T00:00:00Z');
        store.FailLock = true;
        store.Writes.length = 0;
        const removeSpy = vi.spyOn(store, 'Remove');
        const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await (manager as unknown as Internals).HandleBaseEntityEvent(saveEvent('1', 'B'));
        warn.mockRestore();

        expect(store.Writes.filter(w => w.key === UNFILTERED)).toHaveLength(0);
        expect(removeSpy).toHaveBeenCalledWith(UNFILTERED, CacheCategory.RunViewCache);
    });
});

/**
 * F9, the half that only held for whichever process FILLED the slot.
 *
 * An engine loads its rows once and never reads its slot again — by design. The slot is a boot
 * shortcut and a propagation channel, not a read-through cache. Correctness comes from events.
 *
 * Giving slots a finite TTL (this branch) created a window the events cannot cross. When a slot
 * expires under running replicas, a later save finds nothing to rewrite and publishes nothing, so
 * every peer engine keeps serving what it loaded. F9's fix was to invalidate a slot that cannot be
 * maintained, which publishes `removed` and makes peers reload — but that only fires if the saving
 * process still has the fingerprint in its index, and a process only had it there if it WROTE the
 * slot. A server that booted warm read the slot instead, and a read indexed nothing. Behind a load
 * balancer, which server takes the save is arbitrary.
 *
 * So the warm read is indexed too: it is the only trace a process has of a slot it did not write.
 */
describe('F9 — a warm read is enough to notify peers later', () => {
    let manager: LocalCacheManager;
    let store: SharedIndexStore;

    beforeEach(async () => {
        resetLocalCacheManager();
        manager = LocalCacheManager.Instance;
        store = new SharedIndexStore();
        await manager.Initialize(store);
    });

    /** A slot written by another process, which this one has never seen. */
    async function peerWroteSlot(): Promise<void> {
        await store.SetItem(UNFILTERED, { results: [{ ID: '1', Name: 'A' }], maxUpdatedAt: '2024-01-01T00:00:00Z' },
            CacheCategory.RunViewCache, { IndexGroup: 'Users' });
    }

    it('indexes a slot this process read but did not write', async () => {
        await peerWroteSlot();
        expect(manager.GetFingerprintsForEntity('Users').has(UNFILTERED)).toBe(false);

        const hit = await manager.GetRunViewResult(UNFILTERED);

        expect(hit?.results).toHaveLength(1);
        expect(manager.GetFingerprintsForEntity('Users').has(UNFILTERED)).toBe(true);
    });

    it('invalidates the expired slot on a later save, so peers holding its rows reload', async () => {
        // The warm-boot sequence: a peer filled the slot, this process read it at boot and holds
        // the rows in memory.
        await peerWroteSlot();
        await manager.GetRunViewResult(UNFILTERED);

        // The slot's TTL elapses. The shared group drops it too (members whose key is gone are
        // pruned on read), so the group can no longer tell anyone the slot existed.
        await store.Remove(UNFILTERED, CacheCategory.RunViewCache);
        store.Removed.length = 0;
        expect(await store.GetIndexGroupKeys(CacheCategory.RunViewCache, 'Users')).toEqual([]);

        // A row is saved on THIS process — the one that read the slot rather than filling it.
        await (manager as unknown as Internals).HandleBaseEntityEvent(saveEvent('1', 'B'));

        // The slot could not be maintained, so it is invalidated — and on a real shared provider
        // that Remove publishes `removed`, which is what the peers reload on.
        expect(store.Removed).toContain(UNFILTERED);
        // Invalidation forgets the fingerprint, so the notice costs one message per slot, once.
        expect(manager.GetFingerprintsForEntity('Users').has(UNFILTERED)).toBe(false);
    });

    it('does not index a miss', async () => {
        expect(await manager.GetRunViewResult(UNFILTERED)).toBeNull();
        expect(manager.GetFingerprintsForEntity('Users').size).toBe(0);
    });
});
