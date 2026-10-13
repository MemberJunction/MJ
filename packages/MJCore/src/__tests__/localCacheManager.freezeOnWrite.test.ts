/**
 * Freeze-on-write tests for LocalCacheManager.
 *
 * Under a storage provider that shares references (`ILocalStorageProvider.SharesReferences`
 * — the in-memory providers, which is what MJAPI uses by default), the rows a caller holds
 * ARE the cached rows, in both directions: a cache hit returns the stored array, and a cache
 * miss stored the caller's own array. Any in-place mutation therefore edits process-wide
 * state.
 *
 * That is not hypothetical — it shipped as a P1: a GraphQL resolver renamed `__mj_CreatedAt`
 * to its transport alias `_mj__CreatedAt` in place, rewriting the live cache so that every
 * later read served rows `BaseEntity.SetMany` rejects, until the process restarted.
 *
 * These tests pin the defense: cached payloads are deep-frozen at write time, so a mutation
 * throws at the offender's own line instead of silently corrupting the cache — and the
 * internal slot-maintenance paths still work against frozen entries.
 */

import { LocalCacheManager, CacheCategory } from '../generic/localCacheManager';
import { CompositeKey, KeyValuePair } from '../generic/compositeKey';
import { RunViewParams } from '../views/runView';
import { ILocalStorageProvider } from '../generic/interfaces';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';

/** Reset the LocalCacheManager singleton between tests. */
function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    delete g['___SINGLETON__LocalCacheManager'];
}

/**
 * A serializing provider stand-in: reports `SharesReferences: false` so the cache must NOT
 * freeze. Mirrors how IndexedDB / Redis / MMKV behave for isolation purposes. Storage is a
 * plain Map because what is under test is the freeze decision, not the medium.
 */
class IsolatingStorageProvider implements ILocalStorageProvider {
    public readonly SharesReferences = false;
    private store = new Map<string, unknown>();

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

const FINGERPRINT = 'Test Entity|||||||';
const PARAMS: RunViewParams = { EntityName: 'Test Entity' };

/** Rows shaped like real cached RunView output, including a nested value. */
function makeRows(): Record<string, unknown>[] {
    return [
        {
            ID: 'row-1',
            Name: 'First',
            __mj_CreatedAt: '2026-01-01T00:00:00.000Z',
            __mj_UpdatedAt: '2026-01-02T00:00:00.000Z',
            Settings: { Theme: 'dark', Tags: ['a', 'b'] },
        },
        {
            ID: 'row-2',
            Name: 'Second',
            __mj_CreatedAt: '2026-01-03T00:00:00.000Z',
            __mj_UpdatedAt: '2026-01-04T00:00:00.000Z',
            Settings: { Theme: 'light', Tags: ['c'] },
        },
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

describe('LocalCacheManager freeze-on-write', () => {
    describe('reference-sharing provider — payloads are frozen', () => {
        let cacheManager: LocalCacheManager;
        let mockStorage: MockCacheStorageProvider;

        beforeEach(async () => {
            mockStorage = new MockCacheStorageProvider();
            cacheManager = await initCache(mockStorage);
        });

        afterEach(() => {
            mockStorage.clearAll();
        });

        test('freezes the rows AND the array handed back on a cache read', async () => {
            await cacheManager.SetRunViewResult(FINGERPRINT, PARAMS, makeRows(), '2026-01-04T00:00:00.000Z');

            const cached = await cacheManager.GetRunViewResult(FINGERPRINT);
            expect(cached).not.toBeNull();
            expect(Object.isFrozen(cached!.results)).toBe(true);
            for (const row of cached!.results) {
                expect(Object.isFrozen(row)).toBe(true);
            }
        });

        test('freezes the caller\'s own array on the MISS path, not just on reads', async () => {
            // The write path stores the array the caller still holds — copy-on-read designs
            // never close this half of the hazard.
            const callerRows = makeRows();
            await cacheManager.SetRunViewResult(FINGERPRINT, PARAMS, callerRows, '2026-01-04T00:00:00.000Z');

            expect(Object.isFrozen(callerRows)).toBe(true);
            expect(Object.isFrozen(callerRows[0])).toBe(true);
        });

        test('rejects the exact P1 mutation: renaming __mj_ keys in place', async () => {
            await cacheManager.SetRunViewResult(FINGERPRINT, PARAMS, makeRows(), '2026-01-04T00:00:00.000Z');
            const cached = await cacheManager.GetRunViewResult(FINGERPRINT);
            const row = cached!.results[0] as Record<string, unknown>;

            // This is precisely what FieldMapper.MapFields does in place.
            expect(() => {
                row['_mj__CreatedAt'] = row['__mj_CreatedAt'];
            }).toThrow(TypeError);
            expect(() => {
                delete row['__mj_CreatedAt'];
            }).toThrow(TypeError);

            // The cached shape survived intact for every later reader.
            const reread = await cacheManager.GetRunViewResult(FINGERPRINT);
            expect((reread!.results[0] as Record<string, unknown>)['__mj_CreatedAt']).toBe('2026-01-01T00:00:00.000Z');
            expect((reread!.results[0] as Record<string, unknown>)['_mj__CreatedAt']).toBeUndefined();
        });

        test('rejects plain field mutation on a cached row', async () => {
            await cacheManager.SetRunViewResult(FINGERPRINT, PARAMS, makeRows(), '2026-01-04T00:00:00.000Z');
            const cached = await cacheManager.GetRunViewResult(FINGERPRINT);
            const row = cached!.results[0] as Record<string, unknown>;

            expect(() => {
                row['Name'] = 'mutated';
            }).toThrow(TypeError);
        });

        test('rejects array-identity mutation (sort / push / splice) on the cached array', async () => {
            // The array itself is shared state — an in-place sort reorders the cached slot
            // for every later reader, and push/splice change its membership.
            await cacheManager.SetRunViewResult(FINGERPRINT, PARAMS, makeRows(), '2026-01-04T00:00:00.000Z');
            const cached = await cacheManager.GetRunViewResult(FINGERPRINT);
            const rows = cached!.results as Record<string, unknown>[];

            expect(() => rows.push({ ID: 'row-3' })).toThrow(TypeError);
            expect(() => rows.splice(0, 1)).toThrow(TypeError);
            expect(() => rows.reverse()).toThrow(TypeError);
        });

        test('freezes NESTED values — the gap a shallow copy cannot close', async () => {
            await cacheManager.SetRunViewResult(FINGERPRINT, PARAMS, makeRows(), '2026-01-04T00:00:00.000Z');
            const cached = await cacheManager.GetRunViewResult(FINGERPRINT);
            const settings = (cached!.results[0] as Record<string, unknown>)['Settings'] as Record<string, unknown>;

            expect(Object.isFrozen(settings)).toBe(true);
            expect(() => {
                settings['Theme'] = 'hacked';
            }).toThrow(TypeError);

            const tags = settings['Tags'] as string[];
            expect(Object.isFrozen(tags)).toBe(true);
            expect(() => tags.push('injected')).toThrow(TypeError);
        });

        test('freezes cached aggregate results', async () => {
            await cacheManager.SetRunViewResult(
                FINGERPRINT,
                PARAMS,
                makeRows(),
                '2026-01-04T00:00:00.000Z',
                [{ expression: 'COUNT(*)', alias: 'Total', value: 2 }]
            );

            const cached = await cacheManager.GetRunViewResult(FINGERPRINT);
            expect(cached!.aggregateResults).toBeDefined();
            expect(Object.isFrozen(cached!.aggregateResults)).toBe(true);
            expect(Object.isFrozen(cached!.aggregateResults![0])).toBe(true);
        });

        test('freezes RunQuery results too', async () => {
            const rows = makeRows();
            await cacheManager.SetRunQueryResult('query-fp', 'Test Query', rows, '2026-01-04T00:00:00.000Z');

            const cached = await cacheManager.GetRunQueryResult('query-fp');
            expect(cached).not.toBeNull();
            expect(Object.isFrozen(cached!.results)).toBe(true);
            expect(Object.isFrozen(cached!.results[0])).toBe(true);
        });
    });

    describe('internal slot maintenance still works against frozen entries', () => {
        let cacheManager: LocalCacheManager;
        let mockStorage: MockCacheStorageProvider;

        beforeEach(async () => {
            mockStorage = new MockCacheStorageProvider();
            cacheManager = await initCache(mockStorage);
            await cacheManager.SetRunViewResult(FINGERPRINT, PARAMS, makeRows(), '2026-01-04T00:00:00.000Z');
        });

        afterEach(() => {
            mockStorage.clearAll();
        });

        test('UpsertSingleEntity replaces a row and re-freezes the new array', async () => {
            const key = CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', 'row-1')]);
            const updated = { ID: 'row-1', Name: 'Renamed', __mj_UpdatedAt: '2026-02-01T00:00:00.000Z' };

            const ok = await cacheManager.UpsertSingleEntity(FINGERPRINT, updated, key, '2026-02-01T00:00:00.000Z');
            expect(ok).toBe(true);

            const cached = await cacheManager.GetRunViewResult(FINGERPRINT);
            expect(cached!.results.length).toBe(2);
            expect(Object.isFrozen(cached!.results)).toBe(true);
            // The freshly upserted row must be frozen too — it did not exist at first write.
            const row = cached!.results.find(r => (r as Record<string, unknown>)['ID'] === 'row-1');
            expect((row as Record<string, unknown>)['Name']).toBe('Renamed');
            expect(Object.isFrozen(row)).toBe(true);
        });

        test('UpsertSingleEntity adds a brand-new row and freezes it', async () => {
            const key = CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', 'row-3')]);
            const added = { ID: 'row-3', Name: 'Third', __mj_UpdatedAt: '2026-02-02T00:00:00.000Z' };

            expect(await cacheManager.UpsertSingleEntity(FINGERPRINT, added, key, '2026-02-02T00:00:00.000Z')).toBe(true);

            const cached = await cacheManager.GetRunViewResult(FINGERPRINT);
            expect(cached!.results.length).toBe(3);
            const row = cached!.results.find(r => (r as Record<string, unknown>)['ID'] === 'row-3');
            expect(Object.isFrozen(row)).toBe(true);
        });

        test('RemoveSingleEntity removes from a frozen slot', async () => {
            const key = CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', 'row-1')]);

            expect(await cacheManager.RemoveSingleEntity(FINGERPRINT, key, '2026-02-03T00:00:00.000Z')).toBe(true);

            const cached = await cacheManager.GetRunViewResult(FINGERPRINT);
            expect(cached!.results.length).toBe(1);
            expect((cached!.results[0] as Record<string, unknown>)['ID']).toBe('row-2');
            expect(Object.isFrozen(cached!.results)).toBe(true);
        });

        test('ApplyDifferentialUpdate merges into a frozen slot', async () => {
            const merged = await cacheManager.ApplyDifferentialUpdate(
                FINGERPRINT,
                PARAMS,
                [{ ID: 'row-3', Name: 'Third', __mj_UpdatedAt: '2026-02-04T00:00:00.000Z' }],
                [],
                'ID',
                '2026-02-04T00:00:00.000Z',
                3
            );

            expect(merged).not.toBeNull();
            expect(merged!.results.length).toBe(3);

            const cached = await cacheManager.GetRunViewResult(FINGERPRINT);
            expect(cached!.results.length).toBe(3);
            expect(Object.isFrozen(cached!.results)).toBe(true);
        });
    });

    describe('ProviderInternalScaffolding — the metadata-bootstrap exemption', () => {
        // Regression guard. `GetDatasetByName` caches each dataset item through this cache, and
        // `PostProcessEntityMetadata` then hydrates a graph by sorting that row array IN PLACE
        // and attaching child collections onto each entity/field row. Freezing those rows made
        // GetAllMetadata() throw "Cannot assign to read only property '0'" and the process
        // booted with ZERO metadata — every entity lookup failing. The exemption keeps
        // provider-internal scaffolding writable; these tests pin it in both directions.
        let cacheManager: LocalCacheManager;
        let mockStorage: MockCacheStorageProvider;

        beforeEach(async () => {
            mockStorage = new MockCacheStorageProvider();
            cacheManager = await initCache(mockStorage);
        });

        afterEach(() => {
            mockStorage.clearAll();
        });

        test('leaves scaffolding rows and their array mutable', async () => {
            const rows = makeRows();
            await cacheManager.SetRunViewResult(
                FINGERPRINT, PARAMS, rows, '2026-01-04T00:00:00.000Z',
                undefined, undefined, undefined, undefined, { ProviderInternalScaffolding: true }
            );

            expect(Object.isFrozen(rows)).toBe(false);
            const cached = await cacheManager.GetRunViewResult(FINGERPRINT);
            expect(Object.isFrozen(cached!.results)).toBe(false);
            expect(Object.isFrozen(cached!.results[0])).toBe(false);
        });

        test('supports the exact metadata-hydration shape: in-place sort + child attachment', async () => {
            await cacheManager.SetRunViewResult(
                FINGERPRINT, PARAMS, makeRows(), '2026-01-04T00:00:00.000Z',
                undefined, undefined, undefined, undefined, { ProviderInternalScaffolding: true }
            );
            const cached = await cacheManager.GetRunViewResult(FINGERPRINT);
            const rows = cached!.results as Record<string, unknown>[];

            // What PostProcessEntityMetadata actually does.
            expect(() => rows.sort((a, b) => String(a['Name']).localeCompare(String(b['Name'])))).not.toThrow();
            expect(() => { rows[0]['EntityFields'] = [{ Name: 'ID' }]; }).not.toThrow();
            expect(rows[0]['EntityFields']).toBeDefined();
        });

        test('carries the exemption FORWARD through in-place slot maintenance', async () => {
            // storeCachedResults is a second write funnel. Without the carry-forward, the first
            // save event touching a scaffolding slot would freeze it and break the owner on the
            // next metadata load — a latent version of the same boot failure.
            await cacheManager.SetRunViewResult(
                FINGERPRINT, PARAMS, makeRows(), '2026-01-04T00:00:00.000Z',
                undefined, undefined, undefined, undefined, { ProviderInternalScaffolding: true }
            );

            const key = CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', 'row-1')]);
            const ok = await cacheManager.UpsertSingleEntity(
                FINGERPRINT,
                { ID: 'row-1', Name: 'Renamed', __mj_UpdatedAt: '2026-02-01T00:00:00.000Z' },
                key,
                '2026-02-01T00:00:00.000Z'
            );
            expect(ok).toBe(true);

            const cached = await cacheManager.GetRunViewResult(FINGERPRINT);
            expect(cached!.providerInternalScaffolding).toBe(true);
            expect(Object.isFrozen(cached!.results)).toBe(false);
            expect(Object.isFrozen(cached!.results[0])).toBe(false);
        });

        test('defaults to FROZEN — the exemption must be opted into explicitly', async () => {
            // Same call with no options, and with the flag explicitly false.
            await cacheManager.SetRunViewResult('fp-default', PARAMS, makeRows(), '2026-01-04T00:00:00.000Z');
            const dflt = await cacheManager.GetRunViewResult('fp-default');
            expect(Object.isFrozen(dflt!.results)).toBe(true);

            await cacheManager.SetRunViewResult(
                'fp-explicit-false', PARAMS, makeRows(), '2026-01-04T00:00:00.000Z',
                undefined, undefined, undefined, undefined, { ProviderInternalScaffolding: false }
            );
            const explicitFalse = await cacheManager.GetRunViewResult('fp-explicit-false');
            expect(Object.isFrozen(explicitFalse!.results)).toBe(true);
        });
    });

    describe('serializing provider — nothing is frozen', () => {
        let cacheManager: LocalCacheManager;

        beforeEach(async () => {
            cacheManager = await initCache(new IsolatingStorageProvider());
        });

        test('leaves rows mutable, because the storage boundary already isolates them', async () => {
            const callerRows = makeRows();
            await cacheManager.SetRunViewResult(FINGERPRINT, PARAMS, callerRows, '2026-01-04T00:00:00.000Z');

            // The caller keeps ownership of its own array (client-side parity: browser
            // IndexedDB code that decorates rows must keep working).
            expect(Object.isFrozen(callerRows)).toBe(false);
            expect(Object.isFrozen(callerRows[0])).toBe(false);

            const cached = await cacheManager.GetRunViewResult(FINGERPRINT);
            expect(Object.isFrozen(cached!.results)).toBe(false);
        });
    });
});
