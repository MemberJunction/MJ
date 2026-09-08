/**
 * Freeze-on-write edge cases: payloads `Object.freeze` cannot handle.
 *
 * Written RED-FIRST for the PR #3425 review findings (plans/pr-3425-review.md); the fixes
 * land separately. Two hazards:
 *
 * C1 — BINARY PAYLOADS. `Object.freeze` on a non-empty TypedArray throws
 * `TypeError: Cannot freeze array buffer views with elements`, and the mssql driver returns
 * `varbinary` columns as `Buffer` (a `Uint8Array` subclass) — `MJ: AI Result Cache.PromptEmbedding`
 * is one such column on a stock install with `AllowCaching = 1`. The freeze runs after the write
 * gates and outside the storage try/catch, so today a binary-bearing row REJECTS the write path
 * (and `RunView` itself on the server, which is documented to never throw). Contract pinned here:
 * binary values are skipped (left unfrozen — an accepted residual, like Date internal slots),
 * everything around them still freezes, and no funnel throws.
 *
 * M2 — CYCLES. `deepFreezeCacheValue` freezes post-order, so its isFrozen short-circuit does NOT
 * terminate a cycle (nothing is frozen when the cycle re-enters) — the comment's claimed property
 * requires freeze-first-then-recurse. Contract pinned here: a self-referencing value terminates
 * and freezes.
 *
 * Plus defense in depth: whatever exotic value makes `Object.freeze` throw NEXT must degrade to a
 * logged, unfrozen write — a defensive mechanism must never take down the read path it defends.
 */

import { LocalCacheManager } from '../generic/localCacheManager';
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

const FINGERPRINT = 'Test Entity|||||||';
const PARAMS: RunViewParams = { EntityName: 'Test Entity' };
const MAX_UPDATED = '2026-01-04T00:00:00.000Z';

/** Rows shaped like cached RunView output, including a nested value the deep-freeze must reach. */
function makeRowsWithNested(): Record<string, unknown>[] {
    return [
        { ID: 'row-1', Name: 'First', Settings: { Theme: 'dark' }, __mj_UpdatedAt: MAX_UPDATED },
        { ID: 'row-2', Name: 'Second', Settings: { Theme: 'light' }, __mj_UpdatedAt: MAX_UPDATED },
    ];
}

describe('LocalCacheManager freeze-on-write edge cases', () => {
    let cacheManager: LocalCacheManager;
    let mockStorage: MockCacheStorageProvider;

    beforeEach(async () => {
        mockStorage = new MockCacheStorageProvider();
        cacheManager = await initCache(mockStorage);
    });

    afterEach(() => {
        mockStorage.clearAll();
    });

    describe('binary payloads (varbinary columns arrive as Buffer / TypedArray)', () => {
        test('SetRunViewResult does not throw when a row carries a Buffer value', async () => {
            const rows: Record<string, unknown>[] = [
                { ID: 'r1', Name: 'plain', __mj_UpdatedAt: MAX_UPDATED },
                { ID: 'r2', Name: 'binary', PromptEmbedding: Buffer.from([1, 2, 3]), __mj_UpdatedAt: MAX_UPDATED },
            ];

            await expect(
                cacheManager.SetRunViewResult(FINGERPRINT, PARAMS, rows, MAX_UPDATED)
            ).resolves.toBeUndefined();

            // The write went through and the freeze covered everything EXCEPT the binary value.
            const cached = await cacheManager.GetRunViewResult(FINGERPRINT);
            expect(cached).not.toBeNull();
            expect(Object.isFrozen(cached!.results)).toBe(true);
            for (const row of cached!.results) {
                expect(Object.isFrozen(row)).toBe(true);
            }
            const binaryRow = cached!.results.find(r => (r as Record<string, unknown>)['ID'] === 'r2') as Record<string, unknown>;
            // Non-empty views are unfreezable by the JS spec — skipped, not attempted.
            expect(Object.isFrozen(binaryRow['PromptEmbedding'])).toBe(false);

            // No partial freeze either way: the caller's array froze as a unit.
            expect(Object.isFrozen(rows)).toBe(true);
            expect(rows.every(r => Object.isFrozen(r))).toBe(true);
        });

        test('Uint8Array values (browser-parity, no Node Buffer) are tolerated too', async () => {
            const rows = [{ ID: 'u1', Blob: new Uint8Array([9, 8, 7]), __mj_UpdatedAt: MAX_UPDATED }];

            await expect(
                cacheManager.SetRunViewResult(FINGERPRINT, PARAMS, rows, MAX_UPDATED)
            ).resolves.toBeUndefined();

            const cached = await cacheManager.GetRunViewResult(FINGERPRINT);
            expect(Object.isFrozen(cached!.results[0])).toBe(true);
            expect(Object.isFrozen((cached!.results[0] as Record<string, unknown>)['Blob'])).toBe(false);
        });

        test('binary values NESTED inside an object column are tolerated', async () => {
            const rows = [{
                ID: 'n1',
                Settings: { Theme: 'dark', Signature: new Uint8Array([1]) },
                __mj_UpdatedAt: MAX_UPDATED,
            }];

            await expect(
                cacheManager.SetRunViewResult(FINGERPRINT, PARAMS, rows, MAX_UPDATED)
            ).resolves.toBeUndefined();

            const cached = await cacheManager.GetRunViewResult(FINGERPRINT);
            const settings = (cached!.results[0] as Record<string, unknown>)['Settings'] as Record<string, unknown>;
            expect(Object.isFrozen(settings)).toBe(true);
            expect(Object.isFrozen(settings['Signature'])).toBe(false);
        });

        test('SetRunQueryResult (the RunQuery funnel) tolerates binary values', async () => {
            const rows = [{ ID: 'q1', Vector: Buffer.from([4, 5, 6]) }];

            await expect(
                cacheManager.SetRunQueryResult('query-binary-fp', 'Binary Query', rows, MAX_UPDATED)
            ).resolves.toBeUndefined();

            const cached = await cacheManager.GetRunQueryResult('query-binary-fp');
            expect(cached).not.toBeNull();
            expect(Object.isFrozen(cached!.results[0])).toBe(true);
            expect(Object.isFrozen((cached!.results[0] as Record<string, unknown>)['Vector'])).toBe(false);
        });

        test('UpsertSingleEntity (the storeCachedResults funnel) succeeds when the upserted row carries a Buffer', async () => {
            // Seed a binary-free slot first, then maintain it in place with a binary-bearing row.
            await cacheManager.SetRunViewResult(
                FINGERPRINT, PARAMS,
                [{ ID: 'row-1', Name: 'First', __mj_UpdatedAt: MAX_UPDATED }],
                MAX_UPDATED
            );

            const key = CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', 'row-2')]);
            const added = { ID: 'row-2', Name: 'Binary', PromptEmbedding: Buffer.from([7]), __mj_UpdatedAt: '2026-02-01T00:00:00.000Z' };

            // Pre-fix this returns FALSE: the freeze throws inside storeCachedResults and
            // UpsertSingleEntity's catch converts it to a failed (skipped) maintenance write.
            const ok = await cacheManager.UpsertSingleEntity(FINGERPRINT, added, key, '2026-02-01T00:00:00.000Z');
            expect(ok).toBe(true);

            const cached = await cacheManager.GetRunViewResult(FINGERPRINT);
            expect(cached!.results.length).toBe(2);
            const row = cached!.results.find(r => (r as Record<string, unknown>)['ID'] === 'row-2') as Record<string, unknown>;
            expect(Object.isFrozen(row)).toBe(true);
            expect(Object.isFrozen(row['PromptEmbedding'])).toBe(false);
        });
    });

    describe('freeze-hostile values (defense in depth)', () => {
        test('a value whose [[PreventExtensions]] throws must not reject the write path', async () => {
            // Stand-in for "whatever exotic value makes Object.freeze throw next". The guard for
            // known cases (TypedArrays) is separate; this pins that an UNKNOWN freeze failure
            // degrades to a logged, unfrozen write instead of rejecting SetRunViewResult — and,
            // on the server, RunView with it.
            const hostile = new Proxy({}, {
                preventExtensions() { throw new Error('hostile value refuses to freeze'); },
            });
            const rows = [{ ID: 'h1', Payload: hostile, __mj_UpdatedAt: MAX_UPDATED }];

            await expect(
                cacheManager.SetRunViewResult(FINGERPRINT, PARAMS, rows, MAX_UPDATED)
            ).resolves.toBeUndefined();

            // The slot must remain readable (entry or null — but never a rejection) no matter
            // how the write path handled the failure.
            await expect(cacheManager.GetRunViewResult(FINGERPRINT)).resolves.toBeDefined();
        });
    });

    describe('providers that do not declare SharesReferences are MEASURED, not assumed', () => {
        // `ILocalStorageProvider.SharesReferences` is optional so that adding the contract does
        // not break existing external implementations at compile time. That optionality must not
        // become a silent way to lose the freeze: when the property is absent, LocalCacheManager
        // probes the provider at init (store a sentinel, read it back, compare identity) instead
        // of falling through a falsy default. These two providers are byte-identical apart from
        // whether they serialize, and neither declares the property.

        /** Reference-sharing, undeclared: a plain Map, exactly like the in-memory providers. */
        class UndeclaredSharingProvider implements ILocalStorageProvider {
            private store = new Map<string, unknown>();
            private k(key: string, category?: string) { return `${category ?? 'default'}::${key}`; }
            public async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> {
                const v = this.store.get(this.k(key, category));
                return v === undefined ? null : (v as T);
            }
            public async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> {
                const out = new Map<string, T | null>();
                for (const key of keys) out.set(key, await this.GetItem<T>(key, category));
                return out;
            }
            public async SetItem<T>(key: string, value: T, category?: string): Promise<void> {
                this.store.set(this.k(key, category), value);
            }
            public async Remove(key: string, category?: string): Promise<void> {
                this.store.delete(this.k(key, category));
            }
            public async ClearCategory(category: string): Promise<void> {
                for (const k of Array.from(this.store.keys())) if (k.startsWith(`${category}::`)) this.store.delete(k);
            }
            public async GetCategoryKeys(category: string): Promise<string[]> {
                return Array.from(this.store.keys()).filter(k => k.startsWith(`${category}::`));
            }
        }

        /** Isolating, undeclared: JSON round-trip, like localStorage / Redis / MMKV. */
        class UndeclaredSerializingProvider extends UndeclaredSharingProvider {
            private json = new Map<string, string>();
            public override async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> {
                const raw = this.json.get(`${category ?? 'default'}::${key}`);
                return raw === undefined ? null : (JSON.parse(raw) as T);
            }
            public override async SetItem<T>(key: string, value: T, category?: string): Promise<void> {
                this.json.set(`${category ?? 'default'}::${key}`, JSON.stringify(value));
            }
            public override async Remove(key: string, category?: string): Promise<void> {
                this.json.delete(`${category ?? 'default'}::${key}`);
            }
        }

        test('an undeclared reference-sharing provider still gets the freeze', async () => {
            const provider = new UndeclaredSharingProvider();
            expect(provider.SharesReferences).toBeUndefined();   // genuinely undeclared
            const mgr = await initCache(provider);

            const rows = makeRowsWithNested();
            await mgr.SetRunViewResult(FINGERPRINT, PARAMS, rows, MAX_UPDATED);

            // Probed as sharing ⇒ protection armed exactly as if it had declared true.
            expect(Object.isFrozen(rows)).toBe(true);
            expect(Object.isFrozen(rows[0])).toBe(true);
            const cached = await mgr.GetRunViewResult(FINGERPRINT);
            expect(Object.isFrozen(cached!.results)).toBe(true);
        });

        test('an undeclared serializing provider is left alone', async () => {
            const provider = new UndeclaredSerializingProvider();
            expect(provider.SharesReferences).toBeUndefined();
            const mgr = await initCache(provider);

            const rows = makeRowsWithNested();
            await mgr.SetRunViewResult(FINGERPRINT, PARAMS, rows, MAX_UPDATED);

            // Probed as isolating ⇒ the caller keeps ownership of its own rows.
            expect(Object.isFrozen(rows)).toBe(false);
            expect(Object.isFrozen(rows[0])).toBe(false);
        });

        test('the probe leaves no residue in the store', async () => {
            const provider = new UndeclaredSharingProvider();
            await initCache(provider);
            const keys = await provider.GetCategoryKeys('default');
            expect(keys.some(k => k.includes('sharesreferences_probe'))).toBe(false);
        });
    });

    describe('cyclic values (the isFrozen short-circuit must actually terminate a cycle)', () => {
        test('SetRunViewResult terminates and freezes a self-referencing value', async () => {
            // DB/JSON-shaped rows cannot cycle today, but the deep-freeze documents cycle
            // termination as a property — freeze-first ordering is what makes it true. Pre-fix
            // this rejects with a stack overflow (RangeError).
            const settings: Record<string, unknown> = { Theme: 'dark' };
            settings['self'] = settings;
            const rows = [{ ID: 'c1', Settings: settings, __mj_UpdatedAt: MAX_UPDATED }];

            await expect(
                cacheManager.SetRunViewResult(FINGERPRINT, PARAMS, rows, MAX_UPDATED)
            ).resolves.toBeUndefined();

            expect(Object.isFrozen(settings)).toBe(true);
            const cached = await cacheManager.GetRunViewResult(FINGERPRINT);
            expect(Object.isFrozen(cached!.results[0])).toBe(true);
        });
    });
});
