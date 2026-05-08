import { describe, it, expect, beforeEach } from 'vitest';
import { ILocalStorageProvider } from '../generic/interfaces';
import { InMemoryLocalStorageProvider } from '../generic/InMemoryLocalStorageProvider';

/**
 * Generic contract test suite for ILocalStorageProvider implementations.
 *
 * Every concrete provider — InMemory, BrowserLocal, BrowserIDB, Redis — must
 * pass this suite. Provider-specific behavior (TTL, IDB version upgrades, pub/sub)
 * lives in each provider's own test file.
 *
 * Imported and re-run by:
 *   - This file (against InMemoryLocalStorageProvider in MJCore)
 *   - `packages/GraphQLDataProvider/src/__tests__/storageProviders.indexedDB.test.ts`
 *     (against BrowserIndexedDBStorageProvider with fake-indexeddb)
 *
 * Each describe block targets one observable behavior — read/write round-trip,
 * category isolation, key listing, deletion semantics, type fidelity, edge cases.
 */
export function runStorageProviderContractTests(
    providerName: string,
    factory: () => ILocalStorageProvider | Promise<ILocalStorageProvider>
): void {
    describe(`${providerName} — ILocalStorageProvider contract`, () => {
        let provider: ILocalStorageProvider;

        beforeEach(async () => {
            provider = await factory();
        });

        // ──────────────────────────────────────────────────────────────────
        // Basic round-trip
        // ──────────────────────────────────────────────────────────────────
        describe('round-trip', () => {
            it('stores and retrieves a string value', async () => {
                await provider.SetItem('key1', 'hello');
                const out = await provider.GetItem<string>('key1');
                expect(out).toBe('hello');
            });

            it('stores and retrieves a number value', async () => {
                await provider.SetItem('key1', 42);
                const out = await provider.GetItem<number>('key1');
                expect(out).toBe(42);
            });

            it('stores and retrieves a boolean value', async () => {
                await provider.SetItem('key1', true);
                expect(await provider.GetItem<boolean>('key1')).toBe(true);
                await provider.SetItem('key2', false);
                expect(await provider.GetItem<boolean>('key2')).toBe(false);
            });

            it('stores and retrieves a plain object', async () => {
                const obj = { a: 1, b: 'two', c: { nested: [1, 2, 3] } };
                await provider.SetItem('obj', obj);
                const out = await provider.GetItem<typeof obj>('obj');
                expect(out).toEqual(obj);
            });

            it('stores and retrieves an array', async () => {
                const arr = [1, 'two', { three: 3 }, [4, 5]];
                await provider.SetItem('arr', arr);
                const out = await provider.GetItem<typeof arr>('arr');
                expect(out).toEqual(arr);
            });

            it('stores and retrieves null', async () => {
                await provider.SetItem('n', null);
                const out = await provider.GetItem('n');
                // Null stored is indistinguishable from "missing key" in this contract — both return null.
                expect(out).toBeNull();
            });

            it('overwrites existing value on second SetItem', async () => {
                await provider.SetItem('k', 'first');
                await provider.SetItem('k', 'second');
                expect(await provider.GetItem<string>('k')).toBe('second');
            });

            it('overwrites with a different type (string → object)', async () => {
                await provider.SetItem('k', 'string-value');
                await provider.SetItem('k', { now: 'an object' });
                expect(await provider.GetItem<{ now: string }>('k')).toEqual({ now: 'an object' });
            });
        });

        // ──────────────────────────────────────────────────────────────────
        // Missing keys
        // ──────────────────────────────────────────────────────────────────
        describe('missing keys', () => {
            it('returns null for a key that was never set', async () => {
                expect(await provider.GetItem('never-set')).toBeNull();
            });

            it('returns null for a key after Remove', async () => {
                await provider.SetItem('k', 'v');
                await provider.Remove('k');
                expect(await provider.GetItem('k')).toBeNull();
            });

            it('Remove of non-existent key does not throw', async () => {
                await expect(provider.Remove('does-not-exist')).resolves.toBeUndefined();
            });
        });

        // ──────────────────────────────────────────────────────────────────
        // Category isolation
        // ──────────────────────────────────────────────────────────────────
        describe('category isolation', () => {
            it('keeps same key in different categories independent', async () => {
                await provider.SetItem('shared-key', 'in-cat-A', 'CategoryA');
                await provider.SetItem('shared-key', 'in-cat-B', 'CategoryB');
                expect(await provider.GetItem<string>('shared-key', 'CategoryA')).toBe('in-cat-A');
                expect(await provider.GetItem<string>('shared-key', 'CategoryB')).toBe('in-cat-B');
            });

            it('default category is used when none provided', async () => {
                await provider.SetItem('k', 'v');  // no category
                expect(await provider.GetItem<string>('k')).toBe('v');
                // The default category should NOT collide with named categories
                expect(await provider.GetItem<string>('k', 'CategoryA')).toBeNull();
            });

            it('Remove only affects the targeted category', async () => {
                await provider.SetItem('k', 'A', 'CategoryA');
                await provider.SetItem('k', 'B', 'CategoryB');
                await provider.Remove('k', 'CategoryA');
                expect(await provider.GetItem<string>('k', 'CategoryA')).toBeNull();
                expect(await provider.GetItem<string>('k', 'CategoryB')).toBe('B');
            });
        });

        // ──────────────────────────────────────────────────────────────────
        // ClearCategory
        // ──────────────────────────────────────────────────────────────────
        describe('ClearCategory', () => {
            it('removes all keys in the targeted category', async () => {
                if (!provider.ClearCategory) return;  // optional API
                await provider.SetItem('a', 1, 'TargetCat');
                await provider.SetItem('b', 2, 'TargetCat');
                await provider.SetItem('c', 3, 'OtherCat');
                await provider.ClearCategory('TargetCat');
                expect(await provider.GetItem('a', 'TargetCat')).toBeNull();
                expect(await provider.GetItem('b', 'TargetCat')).toBeNull();
                expect(await provider.GetItem<number>('c', 'OtherCat')).toBe(3);
            });

            it('does nothing when category is empty', async () => {
                if (!provider.ClearCategory) return;
                await expect(provider.ClearCategory('NeverUsed')).resolves.toBeUndefined();
            });

            it('clears the default category when category arg is empty string', async () => {
                if (!provider.ClearCategory) return;
                await provider.SetItem('default-key', 'v');
                await provider.ClearCategory('');
                expect(await provider.GetItem('default-key')).toBeNull();
                // Note: we deliberately don't assert on isolation between the default store and
                // arbitrary "named-but-unrecognized" categories here — providers like
                // BrowserIndexedDBStorageProvider route unknown categories THROUGH the default
                // store with key prefixing, so clearing default also clears those. That's a
                // documented behavior difference, not a contract violation.
            });
        });

        // ──────────────────────────────────────────────────────────────────
        // GetCategoryKeys
        // ──────────────────────────────────────────────────────────────────
        describe('GetCategoryKeys', () => {
            it('returns keys for a populated category', async () => {
                if (!provider.GetCategoryKeys) return;
                await provider.SetItem('k1', 1, 'KeysCat');
                await provider.SetItem('k2', 2, 'KeysCat');
                await provider.SetItem('k3', 3, 'KeysCat');
                const keys = await provider.GetCategoryKeys('KeysCat');
                expect(keys.sort()).toEqual(['k1', 'k2', 'k3']);
            });

            it('returns empty array for unknown category', async () => {
                if (!provider.GetCategoryKeys) return;
                expect(await provider.GetCategoryKeys('NeverUsed')).toEqual([]);
            });

            it('does not leak keys across categories', async () => {
                if (!provider.GetCategoryKeys) return;
                await provider.SetItem('only-here', 1, 'CatA');
                await provider.SetItem('only-there', 2, 'CatB');
                expect(await provider.GetCategoryKeys('CatA')).toEqual(['only-here']);
                expect(await provider.GetCategoryKeys('CatB')).toEqual(['only-there']);
            });

            it('reflects deletions', async () => {
                if (!provider.GetCategoryKeys) return;
                await provider.SetItem('a', 1, 'CatX');
                await provider.SetItem('b', 2, 'CatX');
                await provider.Remove('a', 'CatX');
                expect(await provider.GetCategoryKeys('CatX')).toEqual(['b']);
            });
        });

        // ──────────────────────────────────────────────────────────────────
        // Type fidelity / edge cases
        // ──────────────────────────────────────────────────────────────────
        describe('type fidelity', () => {
            it('preserves nested object structure', async () => {
                const deep = {
                    level1: { level2: { level3: { value: 'deep' } } },
                };
                await provider.SetItem('deep', deep);
                expect(await provider.GetItem<typeof deep>('deep')).toEqual(deep);
            });

            it('preserves arrays of mixed types', async () => {
                const mixed: unknown[] = [1, 'two', null, true, { obj: 1 }, [1, 2]];
                await provider.SetItem('mixed', mixed);
                expect(await provider.GetItem<unknown[]>('mixed')).toEqual(mixed);
            });

            it('preserves empty object', async () => {
                await provider.SetItem('empty', {});
                expect(await provider.GetItem('empty')).toEqual({});
            });

            it('preserves empty array', async () => {
                await provider.SetItem('empty-arr', []);
                expect(await provider.GetItem('empty-arr')).toEqual([]);
            });

            it('preserves zero and empty string (which are falsy but valid)', async () => {
                await provider.SetItem('zero', 0);
                await provider.SetItem('empty-str', '');
                expect(await provider.GetItem<number>('zero')).toBe(0);
                expect(await provider.GetItem<string>('empty-str')).toBe('');
            });

            it('handles unicode keys', async () => {
                await provider.SetItem('🔑', 'value');
                expect(await provider.GetItem<string>('🔑')).toBe('value');
            });

            it('handles unicode values', async () => {
                await provider.SetItem('k', '日本語 emoji 🎉');
                expect(await provider.GetItem<string>('k')).toBe('日本語 emoji 🎉');
            });

            it('handles long keys', async () => {
                const longKey = 'k'.repeat(500);
                await provider.SetItem(longKey, 'v');
                expect(await provider.GetItem<string>(longKey)).toBe('v');
            });

            it('handles keys with special chars (colons, brackets, etc.)', async () => {
                const specialKey = '[mj]:[CategoryX]:[my-key|filter=A&order=B]';
                await provider.SetItem(specialKey, 'v');
                expect(await provider.GetItem<string>(specialKey)).toBe('v');
            });
        });

        // ──────────────────────────────────────────────────────────────────
        // Concurrent operations
        // ──────────────────────────────────────────────────────────────────
        describe('concurrent operations', () => {
            it('handles N parallel SetItem + GetItem on same key (last write wins)', async () => {
                // Sequence of writes; the final GetItem must reflect SOME valid write,
                // not a torn value.
                await Promise.all(
                    Array.from({ length: 10 }, (_, i) => provider.SetItem('k', i))
                );
                const out = await provider.GetItem<number>('k');
                expect(out).toBeGreaterThanOrEqual(0);
                expect(out).toBeLessThanOrEqual(9);
            });

            it('handles N parallel SetItem on different keys', async () => {
                await Promise.all(
                    Array.from({ length: 50 }, (_, i) => provider.SetItem(`k${i}`, i))
                );
                const reads = await Promise.all(
                    Array.from({ length: 50 }, (_, i) => provider.GetItem<number>(`k${i}`))
                );
                expect(reads).toEqual(Array.from({ length: 50 }, (_, i) => i));
            });

            it('handles parallel writes across multiple categories', async () => {
                await Promise.all([
                    provider.SetItem('k', 'A', 'CatA'),
                    provider.SetItem('k', 'B', 'CatB'),
                    provider.SetItem('k', 'C', 'CatC'),
                ]);
                expect(await provider.GetItem<string>('k', 'CatA')).toBe('A');
                expect(await provider.GetItem<string>('k', 'CatB')).toBe('B');
                expect(await provider.GetItem<string>('k', 'CatC')).toBe('C');
            });
        });

        // ──────────────────────────────────────────────────────────────────
        // Generic typing behavior (compile-time + runtime)
        // ──────────────────────────────────────────────────────────────────
        describe('generic typing', () => {
            interface UserCacheEntry {
                userId: string;
                roles: string[];
                lastLogin: string;
            }

            it('typed SetItem<T>/GetItem<T> round-trips structured data', async () => {
                const user: UserCacheEntry = {
                    userId: 'u-1',
                    roles: ['admin', 'editor'],
                    lastLogin: '2026-05-02T07:00:00Z',
                };
                await provider.SetItem<UserCacheEntry>('user:1', user, 'Users');
                const out = await provider.GetItem<UserCacheEntry>('user:1', 'Users');
                expect(out).toEqual(user);
                // Can index typed properties without casting
                expect(out!.userId).toBe('u-1');
                expect(out!.roles).toContain('admin');
            });

            it('GetItem<T> returns null for missing key (not undefined)', async () => {
                const out = await provider.GetItem<UserCacheEntry>('missing', 'Users');
                expect(out).toBeNull();
            });
        });

        // ──────────────────────────────────────────────────────────────────
        // GetItems — batched read
        // ──────────────────────────────────────────────────────────────────
        describe('GetItems (batched read)', () => {
            it('returns an empty Map for an empty input array (does not touch storage)', async () => {
                const out = await provider.GetItems<string>([]);
                expect(out).toBeInstanceOf(Map);
                expect(out.size).toBe(0);
            });

            it('returns one entry per requested key, all null when nothing is stored', async () => {
                const out = await provider.GetItems<string>(['a', 'b', 'c']);
                expect(out.size).toBe(3);
                expect(out.get('a')).toBeNull();
                expect(out.get('b')).toBeNull();
                expect(out.get('c')).toBeNull();
            });

            it('round-trips multiple keys with mixed types', async () => {
                await provider.SetItem('s', 'string-value');
                await provider.SetItem('n', 42);
                await provider.SetItem('o', { nested: { deep: true } });
                const out = await provider.GetItems<unknown>(['s', 'n', 'o']);
                expect(out.get('s')).toBe('string-value');
                expect(out.get('n')).toBe(42);
                expect(out.get('o')).toEqual({ nested: { deep: true } });
            });

            it('returns null for missing keys interleaved with hits', async () => {
                await provider.SetItem('present-1', 'v1');
                await provider.SetItem('present-2', 'v2');
                const out = await provider.GetItems<string>(['present-1', 'missing', 'present-2', 'also-missing']);
                expect(out.size).toBe(4);
                expect(out.get('present-1')).toBe('v1');
                expect(out.get('missing')).toBeNull();
                expect(out.get('present-2')).toBe('v2');
                expect(out.get('also-missing')).toBeNull();
            });

            it('respects category isolation', async () => {
                await provider.SetItem('shared', 'A', 'CatA');
                await provider.SetItem('shared', 'B', 'CatB');
                const fromA = await provider.GetItems<string>(['shared'], 'CatA');
                const fromB = await provider.GetItems<string>(['shared'], 'CatB');
                expect(fromA.get('shared')).toBe('A');
                expect(fromB.get('shared')).toBe('B');
            });

            it('deduplicates input keys (same key requested twice → one map entry)', async () => {
                await provider.SetItem('k', 'v');
                const out = await provider.GetItems<string>(['k', 'k', 'k']);
                expect(out.size).toBe(1);
                expect(out.get('k')).toBe('v');
            });

            it('preserves typed reads for complex shapes', async () => {
                interface UserCacheEntry { userId: string; roles: string[]; }
                await provider.SetItem<UserCacheEntry>('u-1', { userId: 'u-1', roles: ['admin'] }, 'Users');
                await provider.SetItem<UserCacheEntry>('u-2', { userId: 'u-2', roles: ['editor'] }, 'Users');
                const out = await provider.GetItems<UserCacheEntry>(['u-1', 'u-2', 'u-3'], 'Users');
                expect(out.get('u-1')!.roles).toContain('admin');
                expect(out.get('u-2')!.roles).toContain('editor');
                expect(out.get('u-3')).toBeNull();
            });

            it('handles a large number of keys efficiently', async () => {
                // Populate 200 keys, then batch-read all 200 + 50 missing ones.
                for (let i = 0; i < 200; i++) {
                    await provider.SetItem(`k-${i}`, i);
                }
                const requestKeys = [
                    ...Array.from({ length: 200 }, (_, i) => `k-${i}`),
                    ...Array.from({ length: 50 }, (_, i) => `missing-${i}`),
                ];
                const out = await provider.GetItems<number>(requestKeys);
                expect(out.size).toBe(250);
                for (let i = 0; i < 200; i++) {
                    expect(out.get(`k-${i}`)).toBe(i);
                }
                for (let i = 0; i < 50; i++) {
                    expect(out.get(`missing-${i}`)).toBeNull();
                }
            });

            it('handles category-prefixed keys without collisions', async () => {
                // Two categories with overlapping key names — confirms each batch read
                // only returns entries from the requested category.
                await provider.SetItem('a', 'cat-A-val', 'CategoryA');
                await provider.SetItem('a', 'cat-B-val', 'CategoryB');
                await provider.SetItem('b', 'cat-A-only', 'CategoryA');

                const fromA = await provider.GetItems<string>(['a', 'b'], 'CategoryA');
                expect(fromA.get('a')).toBe('cat-A-val');
                expect(fromA.get('b')).toBe('cat-A-only');

                const fromB = await provider.GetItems<string>(['a', 'b'], 'CategoryB');
                expect(fromB.get('a')).toBe('cat-B-val');
                expect(fromB.get('b')).toBeNull();
            });

            it('reflects writes that occurred before the batch read', async () => {
                await provider.SetItem('k1', 'first');
                await provider.SetItem('k1', 'second');  // overwrite
                const out = await provider.GetItems<string>(['k1']);
                expect(out.get('k1')).toBe('second');
            });

            it('reflects deletions before the batch read', async () => {
                await provider.SetItem('k', 'v');
                await provider.Remove('k');
                const out = await provider.GetItems<string>(['k']);
                expect(out.get('k')).toBeNull();
            });

            it('result Map iteration order matches the unique-key set from input order', async () => {
                await provider.SetItem('alpha', 1);
                await provider.SetItem('beta', 2);
                await provider.SetItem('gamma', 3);
                // Request in this order with a duplicate; the returned map should reflect
                // the unique keys in insertion order.
                const out = await provider.GetItems<number>(['gamma', 'alpha', 'beta', 'gamma']);
                expect(Array.from(out.keys())).toEqual(['gamma', 'alpha', 'beta']);
                expect(Array.from(out.values())).toEqual([3, 1, 2]);
            });
        });
    });
}

// ────────────────────────────────────────────────────────────────────────────
// Run the contract suite against InMemoryLocalStorageProvider.
// ────────────────────────────────────────────────────────────────────────────
runStorageProviderContractTests(
    'InMemoryLocalStorageProvider',
    () => new InMemoryLocalStorageProvider()
);

// ────────────────────────────────────────────────────────────────────────────
// InMemoryLocalStorageProvider-specific behavior
// ────────────────────────────────────────────────────────────────────────────
describe('InMemoryLocalStorageProvider — by-reference storage', () => {
    let provider: InMemoryLocalStorageProvider;

    beforeEach(() => {
        provider = new InMemoryLocalStorageProvider();
    });

    it('stores objects by reference (same identity returned)', async () => {
        const obj = { mutable: 1 };
        await provider.SetItem('k', obj);
        const out = await provider.GetItem<{ mutable: number }>('k');
        expect(out).toBe(obj);  // strict identity, not just equality
    });

    it('mutating the stored object reflects on subsequent reads (by-reference semantics)', async () => {
        const obj = { count: 0 };
        await provider.SetItem('k', obj);
        obj.count = 99;
        const out = await provider.GetItem<{ count: number }>('k');
        expect(out!.count).toBe(99);
    });

    it('Date instances round-trip as Date (no string conversion)', async () => {
        const d = new Date('2026-05-02T12:00:00Z');
        await provider.SetItem('d', d);
        const out = await provider.GetItem<Date>('d');
        expect(out).toBeInstanceOf(Date);
        expect(out!.getTime()).toBe(d.getTime());
    });

    it('Map instances round-trip as Map', async () => {
        const m = new Map<string, number>([['a', 1], ['b', 2]]);
        await provider.SetItem('m', m);
        const out = await provider.GetItem<Map<string, number>>('m');
        expect(out).toBeInstanceOf(Map);
        expect(out!.get('a')).toBe(1);
        expect(out!.get('b')).toBe(2);
    });

    it('Set instances round-trip as Set', async () => {
        const s = new Set<string>(['x', 'y', 'z']);
        await provider.SetItem('s', s);
        const out = await provider.GetItem<Set<string>>('s');
        expect(out).toBeInstanceOf(Set);
        expect(out!.has('y')).toBe(true);
    });
});
