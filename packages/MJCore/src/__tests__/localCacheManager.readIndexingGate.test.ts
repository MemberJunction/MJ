/**
 * Indexing a warm read is for SHARED stores only.
 *
 * On a provider with a shared per-entity index, `resolveFingerprintsForEntity` answers from that
 * index and nothing else. On a provider without one it falls back to listing the whole category —
 * but only when the local index is empty:
 *
 *     const local = this._entityFingerprintIndex.get(entityName);
 *     if (local && local.size > 0) return local;      // the scan below never runs
 *
 * So on a process-local store (a browser's IndexedDB, the in-memory provider), indexing reads would
 * make one read enough to suppress that scan — and the scan is what finds slots persisted from an
 * earlier session that this process's index does not know about. Those slots would then never be
 * invalidated, and stale rows would be served from local storage indefinitely.
 *
 * There is also nothing to gain there: a process-local store has no peers to notify, and every slot
 * in it was written by this process, so it is already indexed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalCacheManager, CacheCategory } from '../generic/localCacheManager';
import { ILocalStorageProvider } from '../generic/interfaces';
import { RunViewParams } from '../views/runView';
import { GetGlobalObjectStore } from '@memberjunction/global';

function resetLocalCacheManager(): void {
    delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
}

const SLOT_A = 'Users|_|_|-1|0|_|_';
const SLOT_B = "Users|Name LIKE 'A%'|_|-1|0|_|_";
const PARAMS = { EntityName: 'Users' } as RunViewParams;

/** A store private to this process: no index groups, so category listing is the only discovery path. */
class ProcessLocalStore implements ILocalStorageProvider {
    public readonly SharesReferences = false;
    public readonly Removed: string[] = [];
    public ScanCount = 0;
    private store = new Map<string, unknown>();

    private k(key: string, category?: string): string { return `${category ?? 'default'}::${key}`; }

    public async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> {
        const v = this.store.get(this.k(key, category));
        return v === undefined ? null : (JSON.parse(JSON.stringify(v)) as T);
    }
    public async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> {
        const out = new Map<string, T | null>();
        for (const key of new Set(keys)) out.set(key, await this.GetItem<T>(key, category));
        return out;
    }
    public async SetItem<T>(key: string, value: T, category?: string): Promise<void> {
        this.store.set(this.k(key, category), JSON.parse(JSON.stringify(value)));
    }
    public async Remove(key: string, category?: string): Promise<void> {
        this.Removed.push(key);
        this.store.delete(this.k(key, category));
    }
    public async ClearCategory(category: string): Promise<void> {
        for (const k of [...this.store.keys()]) {
            if (k.startsWith(`${category}::`)) this.store.delete(k);
        }
    }
    public async GetCategoryKeys(category: string): Promise<string[]> {
        this.ScanCount++;
        return [...this.store.keys()].filter(k => k.startsWith(`${category}::`)).map(k => k.substring(category.length + 2));
    }
}

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

describe('read-indexing is gated to shared stores', () => {
    let manager: LocalCacheManager;
    let store: ProcessLocalStore;

    beforeEach(async () => {
        resetLocalCacheManager();
        manager = LocalCacheManager.Instance;
        store = new ProcessLocalStore();
        await manager.Initialize(store);
    });

    it('a read of a process-local slot does not enter the index', async () => {
        await store.SetItem(SLOT_A, { results: [{ ID: '1', Name: 'A' }], maxUpdatedAt: '2024-01-01T00:00:00Z' },
            CacheCategory.RunViewCache);

        expect((await manager.GetRunViewResult(SLOT_A))?.results).toHaveLength(1);

        expect(manager.GetFingerprintsForEntity('Users').size).toBe(0);
    });

    it('still finds every persisted slot on a save, including ones it never read', async () => {
        // Two slots persisted by an earlier session; this process's index knows neither.
        for (const fp of [SLOT_A, SLOT_B]) {
            await store.SetItem(fp, { results: [{ ID: '1', Name: 'A' }], maxUpdatedAt: '2024-01-01T00:00:00Z' },
                CacheCategory.RunViewCache);
        }
        // It reads ONE of them. If that read populated the index, the category scan below would be
        // skipped and SLOT_B would never be discovered.
        await manager.GetRunViewResult(SLOT_A);
        store.Removed.length = 0;

        await (manager as unknown as Internals).HandleBaseEntityEvent(saveEvent('1', 'B'));

        // SLOT_B is filtered, so a save invalidates it — which only happens if the scan found it.
        expect(store.Removed).toContain(SLOT_B);
        expect(store.ScanCount).toBeGreaterThan(0);
    });
});
