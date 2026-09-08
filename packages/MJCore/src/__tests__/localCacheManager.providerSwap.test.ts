/**
 * Freeze-on-write must follow the storage provider ACROSS a swap (PR #3425 review, finding M4).
 *
 * MJAPI does not have one storage provider for its lifetime. `LocalCacheManager` is initialized
 * early, during engine loading, with the in-memory provider; if `REDIS_URL` is set, MJServer then
 * calls `SetStorageProvider(redis)` after Redis connects (`MJServer/src/index.ts`). So a Redis
 * deployment passes through TWO providers with OPPOSITE reference semantics, in that order.
 *
 * The freeze decision is therefore not a startup constant. Resolving it once at `Initialize` and
 * caching it leaves a Redis deployment freezing rows it must not freeze: Redis serializes, so the
 * cache hands every reader a private copy and the freeze lands only on the WRITER's own array —
 * all of the hazard (callers that legitimately mutate their own result rows now throw), none of
 * the protection. The reverse swap is worse: protection silently lost.
 *
 * These tests pin the decision to the ACTIVE provider, for both declared semantics
 * (`ILocalStorageProvider.SharesReferences`) and the empirical probe used when a provider does
 * not declare one.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import { RunViewParams } from '../views/runView';
import { ILocalStorageProvider } from '../generic/interfaces';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';

function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    delete g['___SINGLETON__LocalCacheManager'];
}

/** Base Map-backed store. Subclasses vary ONLY in how they declare/behave on isolation. */
class MapStore implements ILocalStorageProvider {
    protected store = new Map<string, unknown>();
    private k(key: string, category?: string): string {
        return `${category ?? 'default'}::${key}`;
    }
    public async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> {
        const v = this.store.get(this.k(key, category));
        return v === undefined ? null : (v as T);
    }
    public async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> {
        const out = new Map<string, T | null>();
        for (const key of new Set(keys)) out.set(key, await this.GetItem<T>(key, category));
        return out;
    }
    public async SetItem<T>(key: string, value: T, category?: string): Promise<void> {
        this.store.set(this.k(key, category), value);
    }
    public async Remove(key: string, category?: string): Promise<void> {
        this.store.delete(this.k(key, category));
    }
    public async ClearCategory(category: string): Promise<void> {
        for (const k of Array.from(this.store.keys())) {
            if (k.startsWith(`${category}::`)) this.store.delete(k);
        }
    }
    public async GetCategoryKeys(category: string): Promise<string[]> {
        return Array.from(this.store.keys())
            .filter(k => k.startsWith(`${category}::`))
            .map(k => k.substring(category.length + 2));
    }
}

/** Stands in for Redis/IndexedDB: declares that it isolates. */
class DeclaredIsolatingStore extends MapStore {
    public readonly SharesReferences = false;
}

/** Stands in for the in-memory provider: declares that it shares. */
class DeclaredSharingStore extends MapStore {
    public readonly SharesReferences = true;
}

/**
 * Declares NOTHING — the backward-compatibility case the optional property exists for. The
 * cache must MEASURE it. This one genuinely serializes, so the probe must observe isolation.
 */
class UndeclaredSerializingStore extends MapStore {
    public override async SetItem<T>(key: string, value: T, category?: string): Promise<void> {
        await super.SetItem(key, JSON.parse(JSON.stringify(value)) as T, category);
    }
}

/** Declares nothing and genuinely shares references — the probe must observe sharing. */
class UndeclaredSharingStore extends MapStore {}

const PARAMS: RunViewParams = { EntityName: 'Swap Entity' };

function makeRows(): Record<string, unknown>[] {
    return [
        { ID: 'row-1', Name: 'First', __mj_UpdatedAt: '2026-01-02T00:00:00.000Z' },
        { ID: 'row-2', Name: 'Second', __mj_UpdatedAt: '2026-01-03T00:00:00.000Z' },
    ];
}

async function initCache(storage: ILocalStorageProvider): Promise<LocalCacheManager> {
    resetLocalCacheManager();
    const mgr = LocalCacheManager.Instance;
    await mgr.Initialize(storage, {
        enabled: true,
        maxSizeBytes: 50 * 1024 * 1024,
        defaultTTLMs: 5 * 60 * 1000,
        evictionPolicy: 'lru',
    });
    return mgr;
}

/** Writes a fresh row set and reports whether the cache froze the caller's own array. */
async function writeAndReportFrozen(mgr: LocalCacheManager, fingerprint: string): Promise<boolean> {
    const rows = makeRows();
    await mgr.SetRunViewResult(fingerprint, PARAMS, rows, '2026-01-03T00:00:00.000Z');
    return Object.isFrozen(rows);
}

describe('LocalCacheManager — freeze decision follows the active storage provider', () => {
    beforeEach(() => {
        resetLocalCacheManager();
    });

    describe('declared semantics', () => {
        test('sharing → isolating (the MJAPI Redis swap): stops freezing after the swap', async () => {
            const mgr = await initCache(new DeclaredSharingStore());
            expect(await writeAndReportFrozen(mgr, 'fp-before')).toBe(true);

            await mgr.SetStorageProvider(new DeclaredIsolatingStore());

            // Redis isolates — freezing here immobilizes the caller's own rows for no benefit.
            expect(await writeAndReportFrozen(mgr, 'fp-after')).toBe(false);
        });

        test('isolating → sharing: starts freezing after the swap', async () => {
            const mgr = await initCache(new DeclaredIsolatingStore());
            expect(await writeAndReportFrozen(mgr, 'fp-before')).toBe(false);

            await mgr.SetStorageProvider(new DeclaredSharingStore());

            // Now readers share objects again — losing the freeze here loses the protection.
            expect(await writeAndReportFrozen(mgr, 'fp-after')).toBe(true);
        });

        test('the real in-memory mock provider swapped out for a serializing one stops freezing', async () => {
            const mgr = await initCache(new MockCacheStorageProvider());
            expect(await writeAndReportFrozen(mgr, 'fp-before')).toBe(true);

            await mgr.SetStorageProvider(new DeclaredIsolatingStore());
            expect(await writeAndReportFrozen(mgr, 'fp-after')).toBe(false);
        });
    });

    describe('undeclared providers — the probe must re-run on swap', () => {
        test('sharing → undeclared-serializing: probe observes isolation, freeze stops', async () => {
            const mgr = await initCache(new DeclaredSharingStore());
            expect(await writeAndReportFrozen(mgr, 'fp-before')).toBe(true);

            await mgr.SetStorageProvider(new UndeclaredSerializingStore());
            expect(await writeAndReportFrozen(mgr, 'fp-after')).toBe(false);
        });

        test('isolating → undeclared-sharing: probe observes sharing, freeze starts', async () => {
            const mgr = await initCache(new DeclaredIsolatingStore());
            expect(await writeAndReportFrozen(mgr, 'fp-before')).toBe(false);

            await mgr.SetStorageProvider(new UndeclaredSharingStore());
            expect(await writeAndReportFrozen(mgr, 'fp-after')).toBe(true);
        });

        test('the probe leaves no residue in the new provider', async () => {
            const mgr = await initCache(new DeclaredSharingStore());
            const target = new UndeclaredSharingStore();
            await mgr.SetStorageProvider(target);

            const leftovers = await target.GetCategoryKeys('default');
            expect(leftovers.filter(k => k.includes('sharesreferences'))).toHaveLength(0);
        });
    });

    test('a swap preserves already-cached entries (migration is not regressed by re-resolution)', async () => {
        const mgr = await initCache(new DeclaredSharingStore());
        await mgr.SetRunViewResult('fp-migrate', PARAMS, makeRows(), '2026-01-03T00:00:00.000Z');

        await mgr.SetStorageProvider(new DeclaredIsolatingStore());

        const cached = await mgr.GetRunViewResult('fp-migrate');
        expect(cached).not.toBeNull();
        expect(cached!.results).toHaveLength(2);
    });
});
