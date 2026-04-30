/**
 * Tests for the AllowCaching write gate in LocalCacheManager.SetRunViewResult.
 *
 * Background: PR #2475 (this branch) closes the cache-write-side gap left by
 * PR #2466. Before this fix, calling RunView with `CacheLocal: true` against an
 * entity with `AllowCaching = false` would silently write into the cache, but
 * because invalidation already short-circuits on AllowCaching=false, those
 * entries lived forever and served stale data.
 *
 * The fix: SetRunViewResult now consults `IsCachingEnabledForEntity` for the
 * params.EntityName before writing. If the entity exists in metadata and is
 * non-cacheable, the write is skipped. The gate is fail-open — if Metadata
 * isn't ready (boot path) or the lookup throws, the write proceeds. That's
 * intentional: startup-time writes are for system entities expected to be
 * cacheable, and we don't want a Metadata hiccup to break cache writes for
 * legitimately cacheable entities.
 *
 * These tests cover:
 *   - The gate fires for AllowCaching=false entities
 *   - The gate doesn't fire for AllowCaching=true entities
 *   - Fail-open behavior: undefined Entities, empty Entities, missing entity,
 *     thrown errors
 *   - Boundary conditions: missing EntityName, disabled cache config,
 *     no storage provider
 *   - Side-effect verification: skipped writes don't register in the entity
 *     index and don't count toward per-entity memory budgets
 *   - The real-world Izzy bug repro
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';

function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    if (g) {
        delete g['___SINGLETON__LocalCacheManager'];
    }
}

// Suppress verbose logging in tests
vi.mock('../generic/logging', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
    LogStatusVerbose: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Test fixtures: minimal EntityInfo-shaped objects with AllowCaching set
// ---------------------------------------------------------------------------
function makeEntity(name: string, allowCaching: boolean): { Name: string; AllowCaching: boolean; PrimaryKeys: { Name: string }[] } {
    return {
        Name: name,
        AllowCaching: allowCaching,
        PrimaryKeys: [{ Name: 'ID' }],
    };
}

const CACHEABLE = makeEntity('Products', true);
const NON_CACHEABLE = makeEntity('Channel Actions', false);  // mirrors the Izzy entity that surfaced the bug

function setMetadataProvider(entities: unknown[] | undefined): () => void {
    const previous = Metadata.Provider;
    Metadata.Provider = {
        Entities: entities,
        CurrentUser: { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] },
    } as unknown as ProviderBase;
    return () => {
        Metadata.Provider = previous;
    };
}

function setMetadataProviderThatThrows(): () => void {
    const previous = Metadata.Provider;
    // Define a getter that throws when Entities is read — simulates a Metadata
    // implementation that's in a broken state.
    const obj = {
        get Entities(): unknown[] {
            throw new Error('Metadata blew up');
        },
        CurrentUser: { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] },
    };
    Metadata.Provider = obj as unknown as ProviderBase;
    return () => {
        Metadata.Provider = previous;
    };
}

// ===========================================================================
// Tests
// ===========================================================================
describe('LocalCacheManager AllowCaching write gate (PR #2475)', () => {
    let cacheManager: LocalCacheManager;
    let mockStorage: MockCacheStorageProvider;
    let restoreMetadata: () => void = () => {};

    beforeEach(async () => {
        resetLocalCacheManager();
        cacheManager = LocalCacheManager.Instance;
        mockStorage = new MockCacheStorageProvider();
        await cacheManager.Initialize(mockStorage);
    });

    afterEach(() => {
        restoreMetadata();
    });

    // -----------------------------------------------------------------------
    // Main: gate fires for AllowCaching=false entities
    // -----------------------------------------------------------------------
    describe('Gate fires when entity has AllowCaching=false', () => {
        it('Skips the write entirely — GetRunViewResult returns null after a "write"', async () => {
            restoreMetadata = setMetadataProvider([CACHEABLE, NON_CACHEABLE]);
            const fp = `${NON_CACHEABLE.Name}|_|_|-1|0|_`;

            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: NON_CACHEABLE.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1', Name: 'Channel A' }],
                '2026-01-01T00:00:00Z'
            );

            const result = await cacheManager.GetRunViewResult(fp);
            expect(result).toBeNull();
        });

        it('Skipped write does NOT touch the storage provider', async () => {
            restoreMetadata = setMetadataProvider([NON_CACHEABLE]);
            mockStorage.resetCallCounts();

            await cacheManager.SetRunViewResult(
                `${NON_CACHEABLE.Name}|fp|test`,
                { EntityName: NON_CACHEABLE.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );

            expect(mockStorage.setCallCount).toBe(0);
        });

        it('Skipped write does NOT register an entry in the cache (entity index stays clean)', async () => {
            restoreMetadata = setMetadataProvider([NON_CACHEABLE]);

            await cacheManager.SetRunViewResult(
                `${NON_CACHEABLE.Name}|fp|test`,
                { EntityName: NON_CACHEABLE.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );

            // No retrievable entry — this is the key invariant the gate provides.
            const cached = await cacheManager.GetRunViewResult(`${NON_CACHEABLE.Name}|fp|test`);
            expect(cached).toBeNull();
        });

        it('Multiple writes to the same non-cacheable entity all skip', async () => {
            restoreMetadata = setMetadataProvider([NON_CACHEABLE]);
            mockStorage.resetCallCounts();

            for (let i = 0; i < 5; i++) {
                await cacheManager.SetRunViewResult(
                    `${NON_CACHEABLE.Name}|fp|${i}`,
                    { EntityName: NON_CACHEABLE.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                    [{ ID: String(i) }],
                    '2026-01-01T00:00:00Z'
                );
            }

            expect(mockStorage.setCallCount).toBe(0);
        });

        it('Aggregate results are also discarded when the gate skips', async () => {
            restoreMetadata = setMetadataProvider([NON_CACHEABLE]);

            await cacheManager.SetRunViewResult(
                `${NON_CACHEABLE.Name}|fp|agg`,
                { EntityName: NON_CACHEABLE.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z',
                [{ expression: 'COUNT(*)', alias: 'cnt', value: 1 }],
                100
            );

            const result = await cacheManager.GetRunViewResult(`${NON_CACHEABLE.Name}|fp|agg`);
            expect(result).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // Main: gate does NOT fire for AllowCaching=true entities
    // -----------------------------------------------------------------------
    describe('Gate does NOT fire when entity has AllowCaching=true', () => {
        it('Write proceeds normally — GetRunViewResult returns the cached entry', async () => {
            restoreMetadata = setMetadataProvider([CACHEABLE]);
            const fp = `${CACHEABLE.Name}|_|_|-1|0|_`;

            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: CACHEABLE.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1', Name: 'Widget' }],
                '2026-01-01T00:00:00Z'
            );

            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached).not.toBeNull();
            expect(cached!.results).toHaveLength(1);
            expect((cached!.results[0] as Record<string, unknown>).Name).toBe('Widget');
        });

        it('Write does hit the storage provider', async () => {
            restoreMetadata = setMetadataProvider([CACHEABLE]);
            mockStorage.resetCallCounts();

            await cacheManager.SetRunViewResult(
                `${CACHEABLE.Name}|fp|test`,
                { EntityName: CACHEABLE.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );

            expect(mockStorage.setCallCount).toBe(1);
        });

        it('Mixed batch: cacheable entity writes succeed, non-cacheable skips — independently', async () => {
            restoreMetadata = setMetadataProvider([CACHEABLE, NON_CACHEABLE]);
            mockStorage.resetCallCounts();

            // Write to cacheable entity
            await cacheManager.SetRunViewResult(
                `${CACHEABLE.Name}|fp|a`,
                { EntityName: CACHEABLE.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );
            // Write to non-cacheable entity
            await cacheManager.SetRunViewResult(
                `${NON_CACHEABLE.Name}|fp|b`,
                { EntityName: NON_CACHEABLE.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '2' }],
                '2026-01-01T00:00:00Z'
            );

            // Only one storage write happened
            expect(mockStorage.setCallCount).toBe(1);
            // Cacheable entity is retrievable
            expect(await cacheManager.GetRunViewResult(`${CACHEABLE.Name}|fp|a`)).not.toBeNull();
            // Non-cacheable entity is not
            expect(await cacheManager.GetRunViewResult(`${NON_CACHEABLE.Name}|fp|b`)).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // Fail-open: when Metadata isn't ready, write proceeds
    // -----------------------------------------------------------------------
    describe('Fail-open paths (Metadata not ready or lookup fails)', () => {
        it('Metadata.Entities is undefined → falls through, write proceeds', async () => {
            restoreMetadata = setMetadataProvider(undefined);
            mockStorage.resetCallCounts();

            await cacheManager.SetRunViewResult(
                `${NON_CACHEABLE.Name}|fp|undef`,
                { EntityName: NON_CACHEABLE.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );

            // Even though the entity is non-cacheable, the gate fell through because
            // Metadata wasn't populated. This is by design — protects boot-time writes.
            expect(mockStorage.setCallCount).toBe(1);
        });

        it('Metadata.Entities is an empty array → falls through, write proceeds', async () => {
            restoreMetadata = setMetadataProvider([]);
            mockStorage.resetCallCounts();

            await cacheManager.SetRunViewResult(
                `${NON_CACHEABLE.Name}|fp|empty`,
                { EntityName: NON_CACHEABLE.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );

            expect(mockStorage.setCallCount).toBe(1);
        });

        it('EntityName not found in Metadata.Entities → falls through, write proceeds', async () => {
            // Only cacheable is registered; we'll write for a name that isn't in the list.
            restoreMetadata = setMetadataProvider([CACHEABLE]);
            mockStorage.resetCallCounts();

            await cacheManager.SetRunViewResult(
                `UnknownEntity|fp|missing`,
                { EntityName: 'UnknownEntity' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );

            // Find returns undefined → gate condition fails → write proceeds.
            // This matches the comment in the source: we don't fail-closed on unknown entities.
            expect(mockStorage.setCallCount).toBe(1);
        });

        it('Metadata.Provider.Entities getter throws → caught, write proceeds', async () => {
            restoreMetadata = setMetadataProviderThatThrows();
            mockStorage.resetCallCounts();

            await cacheManager.SetRunViewResult(
                `${NON_CACHEABLE.Name}|fp|throws`,
                { EntityName: NON_CACHEABLE.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );

            // try/catch fails open — exception in the gate doesn't block the write
            expect(mockStorage.setCallCount).toBe(1);
        });
    });

    // -----------------------------------------------------------------------
    // Boundary: params.EntityName itself is missing or falsy
    // -----------------------------------------------------------------------
    describe('Missing/falsy params.EntityName', () => {
        it('params.EntityName is undefined → gate is skipped (no name to look up), write proceeds', async () => {
            restoreMetadata = setMetadataProvider([NON_CACHEABLE]);
            mockStorage.resetCallCounts();

            await cacheManager.SetRunViewResult(
                `noEntity|fp|test`,
                { EntityName: undefined } as unknown as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );

            // No EntityName → the `if (params.EntityName)` block is skipped → write happens.
            // This matches view-based queries (ViewID/ViewName) where EntityName isn't set.
            expect(mockStorage.setCallCount).toBe(1);
        });

        it('params.EntityName is empty string → gate is skipped (falsy), write proceeds', async () => {
            restoreMetadata = setMetadataProvider([NON_CACHEABLE]);
            mockStorage.resetCallCounts();

            await cacheManager.SetRunViewResult(
                `emptyEntity|fp|test`,
                { EntityName: '' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );

            expect(mockStorage.setCallCount).toBe(1);
        });
    });

    // -----------------------------------------------------------------------
    // Existing early-exits in SetRunViewResult must still work
    // (these guard clauses run BEFORE our new gate)
    // -----------------------------------------------------------------------
    describe('Pre-existing early-exits still take precedence', () => {
        it('No storage provider initialized → returns immediately, no write attempt', async () => {
            // Reset and DON'T initialize — _storageProvider is unset
            resetLocalCacheManager();
            const uninitializedManager = LocalCacheManager.Instance;
            restoreMetadata = setMetadataProvider([CACHEABLE]);

            // Should not throw, should not write
            await uninitializedManager.SetRunViewResult(
                `${CACHEABLE.Name}|fp|noinit`,
                { EntityName: CACHEABLE.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );
            const cached = await uninitializedManager.GetRunViewResult(`${CACHEABLE.Name}|fp|noinit`);
            expect(cached).toBeNull();
        });

        it('Cache disabled in config → returns immediately, no write', async () => {
            resetLocalCacheManager();
            const disabledManager = LocalCacheManager.Instance;
            await disabledManager.Initialize(mockStorage, { enabled: false });
            restoreMetadata = setMetadataProvider([CACHEABLE]);
            mockStorage.resetCallCounts();

            await disabledManager.SetRunViewResult(
                `${CACHEABLE.Name}|fp|disabled`,
                { EntityName: CACHEABLE.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );

            expect(mockStorage.setCallCount).toBe(0);
        });
    });

    // -----------------------------------------------------------------------
    // The actual bug repro from the PR: Izzy Channel Actions
    // -----------------------------------------------------------------------
    describe('Izzy bug repro — Channel Actions never invalidates without the gate', () => {
        // Each describe block here documents one of the three known Izzy entities
        // that surfaced this bug. The fix should silence the cache for all three.
        const izzyEntities = [
            'Channel Actions',
            'Organization Actions',
            'Channel Type Actions',
        ];

        for (const entityName of izzyEntities) {
            it(`Izzy entity "${entityName}" (AllowCaching=0) is never written into cache, even with CacheLocal=true`, async () => {
                const izzyEntity = makeEntity(entityName, false);
                restoreMetadata = setMetadataProvider([izzyEntity]);
                mockStorage.resetCallCounts();

                // Simulate IzzyMetadataEngine.Config() pre-loading with CacheLocal: true
                const fp = `${entityName}|_|_|-1|0|_`;
                await cacheManager.SetRunViewResult(
                    fp,
                    {
                        EntityName: entityName,
                        CacheLocal: true,
                    } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                    [{ ID: '1', Name: 'Initial' }],
                    '2026-01-01T00:00:00Z'
                );

                // Without this fix: storage.setCallCount would be 1 and a stale entry would
                // exist that no future invalidation would clear. With this fix:
                expect(mockStorage.setCallCount).toBe(0);
                expect(await cacheManager.GetRunViewResult(fp)).toBeNull();
            });
        }
    });

    // -----------------------------------------------------------------------
    // Defensive: ensure the gate uses the entity's actual AllowCaching flag,
    // not some other heuristic.
    // -----------------------------------------------------------------------
    describe('Gate decision is driven by the AllowCaching flag specifically', () => {
        it('Same entity name registered with AllowCaching=true → write succeeds (proves gate read the flag)', async () => {
            // Create an "alternate" entity definition for the SAME name where AllowCaching is true.
            // This proves the gate isn't using the name as a heuristic — it's reading the actual flag.
            restoreMetadata = setMetadataProvider([makeEntity('Channel Actions', true)]);
            mockStorage.resetCallCounts();

            await cacheManager.SetRunViewResult(
                `Channel Actions|fp|flipped`,
                { EntityName: 'Channel Actions' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );

            // The gate honors the live metadata flag, not the entity name. With AllowCaching=true,
            // the same entity name ("Channel Actions") that was non-cacheable in the Izzy repro
            // tests above is now cacheable, and the write proceeds.
            expect(mockStorage.setCallCount).toBe(1);
        });

        it('Two entities, one cacheable + one not, both with same name in different runs (independent state)', async () => {
            // First run — flag=false, write skipped
            restoreMetadata = setMetadataProvider([makeEntity('FlipFlop', false)]);
            mockStorage.resetCallCounts();
            await cacheManager.SetRunViewResult(
                `FlipFlop|fp|run1`,
                { EntityName: 'FlipFlop' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );
            expect(mockStorage.setCallCount).toBe(0);

            // Restore and re-set with AllowCaching=true
            restoreMetadata();
            restoreMetadata = setMetadataProvider([makeEntity('FlipFlop', true)]);
            await cacheManager.SetRunViewResult(
                `FlipFlop|fp|run2`,
                { EntityName: 'FlipFlop' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '2' }],
                '2026-01-01T00:00:00Z'
            );
            expect(mockStorage.setCallCount).toBe(1);
        });
    });

    // -----------------------------------------------------------------------
    // Behavioral edges: name matching is case-insensitive and trim-handling
    // (gate uses Metadata.EntityByName per code review feedback)
    // -----------------------------------------------------------------------
    describe('Entity name matching is case-insensitive and trim-handling (via EntityByName)', () => {
        it('Mismatched casing still resolves the same entity → gate fires → write skipped', async () => {
            // The gate uses Metadata.EntityByName which lowercases and trims internally.
            // Caller passing 'channel actions' resolves to the same entity registered as
            // 'Channel Actions', so the gate correctly identifies AllowCaching=false and
            // skips the write.
            restoreMetadata = setMetadataProvider([makeEntity('Channel Actions', false)]);
            mockStorage.resetCallCounts();

            await cacheManager.SetRunViewResult(
                `channel actions|fp|case`,
                { EntityName: 'channel actions' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );

            expect(mockStorage.setCallCount).toBe(0);
        });

        it('ALL-CAPS EntityName resolves the same registered entity → gate fires → write skipped', async () => {
            restoreMetadata = setMetadataProvider([makeEntity('Channel Actions', false)]);
            mockStorage.resetCallCounts();

            await cacheManager.SetRunViewResult(
                `CHANNEL ACTIONS|fp|case2`,
                { EntityName: 'CHANNEL ACTIONS' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );

            expect(mockStorage.setCallCount).toBe(0);
        });

        it('Leading/trailing whitespace in EntityName is trimmed → gate fires → write skipped', async () => {
            restoreMetadata = setMetadataProvider([makeEntity('Channel Actions', false)]);
            mockStorage.resetCallCounts();

            await cacheManager.SetRunViewResult(
                ` Channel Actions |fp|ws`,
                { EntityName: ' Channel Actions ' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );

            expect(mockStorage.setCallCount).toBe(0);
        });

        it('Combined casing + whitespace differences still resolve to the same entity', async () => {
            restoreMetadata = setMetadataProvider([makeEntity('Channel Actions', false)]);
            mockStorage.resetCallCounts();

            await cacheManager.SetRunViewResult(
                `weird|fp|combined`,
                { EntityName: '  channel actions  ' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );

            expect(mockStorage.setCallCount).toBe(0);
        });

        it('Whitespace-only EntityName → EntityByName throws → caught by try/catch → write proceeds (fail-open)', async () => {
            // EntityByName throws on empty/whitespace-only input. The wrapping try/catch
            // catches it and we fall open. Document this so future changes don't regress.
            restoreMetadata = setMetadataProvider([makeEntity('Channel Actions', false)]);
            mockStorage.resetCallCounts();

            await cacheManager.SetRunViewResult(
                `   |fp|wsonly`,
                { EntityName: '   ' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );

            // Whitespace-only is truthy → enters the gate → EntityByName throws →
            // caught → fall-open → write proceeds.
            expect(mockStorage.setCallCount).toBe(1);
        });
    });

    // -----------------------------------------------------------------------
    // Distinct fail-open paths beyond what the main block covered
    // -----------------------------------------------------------------------
    describe('Additional fail-open paths', () => {
        it('Metadata.Provider is null → caught by try/catch, write proceeds', async () => {
            // Setting Provider to null causes `new Metadata().Entities` to throw at the
            // static getter (line 53: "No global object store" — actually that's a different
            // path; null Provider means Metadata.Provider returns undefined which then
            // accessing .Entities on undefined throws).
            const previous = Metadata.Provider;
            Metadata.Provider = null as unknown as ProviderBase;
            restoreMetadata = () => { Metadata.Provider = previous; };
            mockStorage.resetCallCounts();

            await cacheManager.SetRunViewResult(
                `${NON_CACHEABLE.Name}|fp|nullprov`,
                { EntityName: NON_CACHEABLE.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );

            // Try/catch caught the access exception → write proceeded
            expect(mockStorage.setCallCount).toBe(1);
        });

        it('Empty results array on a non-cacheable entity → still gated (skipped)', async () => {
            // An empty result set is still a result — the gate should skip the write
            // regardless of how many rows are in the payload.
            restoreMetadata = setMetadataProvider([NON_CACHEABLE]);
            mockStorage.resetCallCounts();

            await cacheManager.SetRunViewResult(
                `${NON_CACHEABLE.Name}|fp|empty-results`,
                { EntityName: NON_CACHEABLE.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [],
                '2026-01-01T00:00:00Z'
            );

            expect(mockStorage.setCallCount).toBe(0);
            expect(await cacheManager.GetRunViewResult(`${NON_CACHEABLE.Name}|fp|empty-results`)).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // Side-effect: the entity-fingerprint reverse index must NOT contain a
    // zombie pointer to the skipped fingerprint. The index drives universal
    // cache invalidation; a stale entry there would cause real bugs.
    // -----------------------------------------------------------------------
    describe('Skipped writes do not pollute the entity→fingerprint reverse index', () => {
        it('Non-cacheable entity skipped write → GetFingerprintsForEntity returns empty set', async () => {
            restoreMetadata = setMetadataProvider([NON_CACHEABLE]);

            const fp = `${NON_CACHEABLE.Name}|fp|index-test`;
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: NON_CACHEABLE.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );

            // The index drives universal invalidation. If we'd registered a fingerprint
            // here, future BaseEntity events for "Channel Actions" would try to invalidate
            // a non-existent entry — annoying but not catastrophic. With the gate, the
            // index stays clean.
            const fps = cacheManager.GetFingerprintsForEntity(NON_CACHEABLE.Name);
            expect(fps.size).toBe(0);
            expect(fps.has(fp)).toBe(false);
        });

        it('Cacheable entity write DOES register in the index (sanity check)', async () => {
            restoreMetadata = setMetadataProvider([CACHEABLE]);

            const fp = `${CACHEABLE.Name}|fp|index-yes`;
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: CACHEABLE.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2026-01-01T00:00:00Z'
            );

            const fps = cacheManager.GetFingerprintsForEntity(CACHEABLE.Name);
            expect(fps.has(fp)).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Side-effect: skipped writes must NOT trigger global eviction.
    // Without the gate, a write for a non-cacheable entity would push
    // total cache size up, potentially evicting LRU entries from OTHER
    // (legitimately cacheable) entities to make room.
    // -----------------------------------------------------------------------
    describe('Skipped writes do not affect global memory budget / evict other entities', () => {
        it('Non-cacheable write does not evict an existing cacheable entity entry', async () => {
            // Configure a tight global budget so any unguarded write would force eviction.
            // 2KB total, ~1KB per write means a second write would evict the first.
            resetLocalCacheManager();
            const tightCache = LocalCacheManager.Instance;
            await tightCache.Initialize(mockStorage, { maxSizeBytes: 2 * 1024 });
            restoreMetadata = setMetadataProvider([CACHEABLE, NON_CACHEABLE]);

            // Step 1: write a cacheable entry with a sizeable payload.
            const cacheablePayload = Array.from({ length: 50 }, (_, i) => ({
                ID: `c-${i}`,
                Name: `Widget ${i}`.padEnd(20, '*'),
            }));
            const cacheableFp = `${CACHEABLE.Name}|fp|tight`;
            await tightCache.SetRunViewResult(
                cacheableFp,
                { EntityName: CACHEABLE.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                cacheablePayload,
                '2026-01-01T00:00:00Z'
            );
            // Verify it landed.
            expect(await tightCache.GetRunViewResult(cacheableFp)).not.toBeNull();

            // Step 2: write a similarly large non-cacheable entry. Without the gate, this
            // would (a) get stored, (b) push total size above 2KB, (c) trigger
            // evictIfNeeded which would evict the LRU cacheable entry from step 1.
            const nonCacheablePayload = Array.from({ length: 50 }, (_, i) => ({
                ID: `nc-${i}`,
                Name: `Action ${i}`.padEnd(20, '*'),
            }));
            await tightCache.SetRunViewResult(
                `${NON_CACHEABLE.Name}|fp|tight`,
                { EntityName: NON_CACHEABLE.Name } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                nonCacheablePayload,
                '2026-01-01T00:00:00Z'
            );

            // With the gate, the non-cacheable write was skipped before evictIfNeeded ran,
            // so the cacheable entry is still there.
            const stillCached = await tightCache.GetRunViewResult(cacheableFp);
            expect(stillCached).not.toBeNull();
            expect(stillCached!.results).toHaveLength(50);
        });
    });
});
