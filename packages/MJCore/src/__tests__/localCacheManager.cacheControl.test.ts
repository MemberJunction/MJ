/**
 * Tests for entity-level cache control: AllowCaching flag,
 * per-entity cap eviction, TTL sweep, and config defaults.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalCacheManager, LocalCacheManagerConfig } from '../generic/localCacheManager';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';

function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    const key = '___SINGLETON__LocalCacheManager';
    delete g[key];
}

// Suppress verbose logging in tests
vi.mock('../generic/logging', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
}));

describe('LocalCacheManager Cache Control', () => {
    let cacheManager: LocalCacheManager;
    let mockStorage: MockCacheStorageProvider;

    beforeEach(async () => {
        resetLocalCacheManager();
        vi.useRealTimers();
        cacheManager = LocalCacheManager.Instance;
        mockStorage = new MockCacheStorageProvider();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // ========================================================================
    // Config Defaults
    // ========================================================================

    describe('Config defaults', () => {
        it('should apply default config when no overrides are provided', async () => {
            await cacheManager.Initialize(mockStorage);
            const config = cacheManager.Config;

            expect(config.enabled).toBe(true);
            expect(config.maxSizeBytes).toBe(150 * 1024 * 1024);
            expect(config.maxEntries).toBe(5000);
            expect(config.defaultTTLMs).toBe(0);
            expect(config.evictionPolicy).toBe('lru');
            expect(config.maxEntriesPerEntity).toBe(50);
            expect(config.evictionSweepIntervalMs).toBe(300000);
            expect(config.verboseLogging).toBe(false);
        });

        it('should merge partial config overrides with defaults', async () => {
            await cacheManager.Initialize(mockStorage, {
                maxEntriesPerEntity: 10,
                verboseLogging: true,
            });

            const config = cacheManager.Config;
            expect(config.maxEntriesPerEntity).toBe(10);
            expect(config.verboseLogging).toBe(true);
            // Defaults preserved
            expect(config.maxEntries).toBe(5000);
            expect(config.evictionPolicy).toBe('lru');
        });

        it('should allow runtime config updates via UpdateConfig', async () => {
            await cacheManager.Initialize(mockStorage);
            cacheManager.UpdateConfig({ maxEntriesPerEntity: 25 });

            expect(cacheManager.Config.maxEntriesPerEntity).toBe(25);
            // Other settings unchanged
            expect(cacheManager.Config.maxEntries).toBe(5000);
        });
    });

    // ========================================================================
    // HandleBaseEntityEvent — AllowCaching short-circuit
    // ========================================================================

    describe('HandleBaseEntityEvent AllowCaching short-circuit', () => {
        async function setupCacheWithEntity(entityName: string): Promise<string> {
            await cacheManager.Initialize(mockStorage);
            const fp = `${entityName}|_|_|-1|0|_`;
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: entityName } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1', Name: 'Test' }],
                '2024-01-01T00:00:00Z'
            );
            return fp;
        }

        it('should skip processing when AllowCaching is false', async () => {
            const entityName = 'SensitiveLogs';
            const fp = await setupCacheWithEntity(entityName);

            const event = {
                type: 'save' as const,
                baseEntity: {
                    EntityInfo: {
                        Name: entityName,
                        AllowCaching: false,
                        PrimaryKeys: [{ Name: 'ID' }],
                    },
                    Get: (f: string) => f === 'ID' ? '1' : 'Updated',
                    GetAll: () => ({ ID: '1', Name: 'Updated' }),
                },
            };

            await (cacheManager as unknown as { HandleBaseEntityEvent: (e: unknown) => Promise<void> })
                .HandleBaseEntityEvent(event);

            // Cache should be untouched — AllowCaching=false short-circuits before fingerprint scan
            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached).not.toBeNull();
            expect((cached!.results[0] as Record<string, unknown>).Name).toBe('Test');
        });

        it('should process events normally when AllowCaching is true', async () => {
            const entityName = 'NormalEntity';
            const fp = await setupCacheWithEntity(entityName);

            const event = {
                type: 'save' as const,
                baseEntity: {
                    EntityInfo: {
                        Name: entityName,
                        AllowCaching: true,
                        PrimaryKeys: [{ Name: 'ID' }],
                    },
                    Get: (f: string) => f === 'ID' ? '1' : 'Updated',
                    GetAll: () => ({ ID: '1', Name: 'Updated' }),
                },
            };

            await (cacheManager as unknown as { HandleBaseEntityEvent: (e: unknown) => Promise<void> })
                .HandleBaseEntityEvent(event);

            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached).not.toBeNull();
            expect((cached!.results[0] as Record<string, unknown>).Name).toBe('Updated');
        });

        it('should process events normally when AllowCaching is undefined (default)', async () => {
            const entityName = 'DefaultEntity';
            const fp = await setupCacheWithEntity(entityName);

            const event = {
                type: 'save' as const,
                baseEntity: {
                    EntityInfo: {
                        Name: entityName,
                        // AllowCaching not set — defaults to false in EntityInfo,
                        // but the short-circuit checks for strict `=== false`
                        AllowCaching: undefined,
                        PrimaryKeys: [{ Name: 'ID' }],
                    },
                    Get: (f: string) => f === 'ID' ? '1' : 'Updated',
                    GetAll: () => ({ ID: '1', Name: 'Updated' }),
                },
            };

            await (cacheManager as unknown as { HandleBaseEntityEvent: (e: unknown) => Promise<void> })
                .HandleBaseEntityEvent(event);

            // With AllowCaching undefined, the `=== false` check should NOT short-circuit,
            // but the entity won't have fingerprints since AllowCaching default is false
            // and the cache check in ProviderBase would have skipped caching.
            // For this test we manually cached, so we verify the short-circuit behavior:
            // undefined !== false, so it proceeds to fingerprint scan.
            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached).not.toBeNull();
            expect((cached!.results[0] as Record<string, unknown>).Name).toBe('Updated');
        });
    });

    // ========================================================================
    // HandleRemoteInvalidateEvent — AllowCaching short-circuit
    // ========================================================================

    describe('HandleRemoteInvalidateEvent AllowCaching short-circuit', () => {
        it('should skip processing when entity has AllowCaching=false in metadata', async () => {
            await cacheManager.Initialize(mockStorage);

            // Manually seed a fingerprint in the entity index
            const entityName = 'AuditLogs';
            const fp = `${entityName}|_|_|-1|0|_`;
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: entityName } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1', Action: 'Login' }],
                '2024-01-01T00:00:00Z'
            );

            // Mock Metadata to return entity with AllowCaching = false
            const Metadata = (await import('../generic/metadata')).Metadata;
            const originalEntityByName = Metadata.prototype.EntityByName;
            Metadata.prototype.EntityByName = vi.fn().mockReturnValue({
                Name: entityName,
                AllowCaching: false,
                PrimaryKeys: [{ Name: 'ID' }],
            });

            try {
                const event = {
                    type: 'remote-invalidate' as const,
                    entityName,
                    payload: {
                        action: 'save' as const,
                        recordData: JSON.stringify({ ID: '1', Action: 'Updated' }),
                    },
                };

                await (cacheManager as unknown as { HandleRemoteInvalidateEvent: (e: unknown) => Promise<void> })
                    .HandleRemoteInvalidateEvent(event);

                // Cache should be untouched — AllowCaching=false short-circuit
                const cached = await cacheManager.GetRunViewResult(fp);
                expect(cached).not.toBeNull();
                expect((cached!.results[0] as Record<string, unknown>).Action).toBe('Login');
            } finally {
                Metadata.prototype.EntityByName = originalEntityByName;
            }
        });

        it('should process remote-invalidate when entity has AllowCaching=true', async () => {
            await cacheManager.Initialize(mockStorage);

            const entityName = 'Products';
            const fp = `${entityName}|_|_|-1|0|_`;
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: entityName } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1', Name: 'Widget' }],
                '2024-01-01T00:00:00Z'
            );

            const Metadata = (await import('../generic/metadata')).Metadata;
            const originalEntityByName = Metadata.prototype.EntityByName;
            Metadata.prototype.EntityByName = vi.fn().mockReturnValue({
                Name: entityName,
                AllowCaching: true,
                PrimaryKeys: [{ Name: 'ID' }],
            });

            try {
                const event = {
                    type: 'remote-invalidate' as const,
                    entityName,
                    payload: {
                        action: 'save' as const,
                        recordData: JSON.stringify({ ID: '1', Name: 'Widget Pro' }),
                    },
                };

                await (cacheManager as unknown as { HandleRemoteInvalidateEvent: (e: unknown) => Promise<void> })
                    .HandleRemoteInvalidateEvent(event);

                // Cache should be updated
                const cached = await cacheManager.GetRunViewResult(fp);
                expect(cached).not.toBeNull();
                expect((cached!.results[0] as Record<string, unknown>).Name).toBe('Widget Pro');
            } finally {
                Metadata.prototype.EntityByName = originalEntityByName;
            }
        });
    });

    // ========================================================================
    // Per-Entity Cap Eviction
    // ========================================================================

    describe('enforcePerEntityCap', () => {
        it('should evict oldest entries for an entity when over the cap', async () => {
            await cacheManager.Initialize(mockStorage, {
                maxEntriesPerEntity: 3,
                maxEntries: 100,
                maxSizeBytes: 10_000_000,
            });

            // Insert 4 entries for the same entity with distinct fingerprints
            const fps: string[] = [];
            for (let i = 0; i < 4; i++) {
                const fp = `Users|Filter${i}|_|-1|0|_`;
                fps.push(fp);
                await cacheManager.SetRunViewResult(
                    fp,
                    { EntityName: 'Users', ExtraFilter: `Filter${i}` } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                    [{ ID: `${i}`, Name: `User ${i}` }],
                    '2024-01-01T00:00:00Z'
                );
            }

            // After inserting the 4th, only 3 should remain for 'Users'
            const remaining = cacheManager.GetFingerprintsForEntity('Users');
            expect(remaining.size).toBeLessThanOrEqual(3);
        });

        it('should evict least-recently-accessed entries (LRU)', async () => {
            vi.useFakeTimers();

            await cacheManager.Initialize(mockStorage, {
                maxEntriesPerEntity: 2,
                maxEntries: 100,
                maxSizeBytes: 10_000_000,
            });

            // Insert entry 1 at t=0
            const fp1 = 'Users|A|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp1,
                { EntityName: 'Users', ExtraFilter: 'A' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2024-01-01T00:00:00Z'
            );

            // Insert entry 2 at t=1000 — entry 1 is now LRU
            vi.advanceTimersByTime(1000);
            const fp2 = 'Users|B|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp2,
                { EntityName: 'Users', ExtraFilter: 'B' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '2' }],
                '2024-01-01T00:00:00Z'
            );

            // Access entry 1 to make it more recent than entry 2
            vi.advanceTimersByTime(1000);
            await cacheManager.GetRunViewResult(fp1);

            // Insert entry 3 at t=3000 — entry 2 should be evicted (LRU)
            vi.advanceTimersByTime(1000);
            const fp3 = 'Users|C|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp3,
                { EntityName: 'Users', ExtraFilter: 'C' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '3' }],
                '2024-01-01T00:00:00Z'
            );

            // fp1 was accessed most recently, fp3 just added — fp2 should be evicted
            const remaining = cacheManager.GetFingerprintsForEntity('Users');
            expect(remaining.has(fp2)).toBe(false);
            expect(remaining.has(fp1)).toBe(true);
            expect(remaining.has(fp3)).toBe(true);

            vi.useRealTimers();
        });

        it('should not evict entries from other entities', async () => {
            await cacheManager.Initialize(mockStorage, {
                maxEntriesPerEntity: 1,
                maxEntries: 100,
                maxSizeBytes: 10_000_000,
            });

            // Insert for entity A
            await cacheManager.SetRunViewResult(
                'EntityA|_|_|-1|0|_',
                { EntityName: 'EntityA' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2024-01-01T00:00:00Z'
            );

            // Insert 2 entries for entity B (cap is 1)
            await cacheManager.SetRunViewResult(
                'EntityB|X|_|-1|0|_',
                { EntityName: 'EntityB', ExtraFilter: 'X' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2024-01-01T00:00:00Z'
            );
            await cacheManager.SetRunViewResult(
                'EntityB|Y|_|-1|0|_',
                { EntityName: 'EntityB', ExtraFilter: 'Y' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '2' }],
                '2024-01-01T00:00:00Z'
            );

            // Entity A should be untouched
            const aFps = cacheManager.GetFingerprintsForEntity('EntityA');
            expect(aFps.size).toBe(1);

            // Entity B should be capped at 1
            const bFps = cacheManager.GetFingerprintsForEntity('EntityB');
            expect(bFps.size).toBeLessThanOrEqual(1);
        });

        it('should skip cap enforcement when maxEntriesPerEntity is 0 (unlimited)', async () => {
            await cacheManager.Initialize(mockStorage, {
                maxEntriesPerEntity: 0,
                maxEntries: 100,
                maxSizeBytes: 10_000_000,
            });

            for (let i = 0; i < 10; i++) {
                await cacheManager.SetRunViewResult(
                    `Users|F${i}|_|-1|0|_`,
                    { EntityName: 'Users', ExtraFilter: `F${i}` } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                    [{ ID: `${i}` }],
                    '2024-01-01T00:00:00Z'
                );
            }

            // All 10 should remain — cap is disabled
            expect(cacheManager.GetFingerprintsForEntity('Users').size).toBe(10);
        });
    });

    // ========================================================================
    // TTL Eviction Sweep
    // ========================================================================

    describe('runEvictionSweep TTL eviction', () => {
        it('should evict entries older than defaultTTLMs', async () => {
            vi.useFakeTimers();

            await cacheManager.Initialize(mockStorage, {
                defaultTTLMs: 5000, // 5 second TTL
                evictionSweepIntervalMs: 0, // Disable automatic sweep — we'll trigger manually
                maxEntries: 100,
                maxSizeBytes: 10_000_000,
            });

            // Cache an entry at t=0
            const fp = 'Users|_|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'Users' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1', Name: 'Alice' }],
                '2024-01-01T00:00:00Z'
            );

            // Entry should still be present before TTL expires
            let cached = await cacheManager.GetRunViewResult(fp);
            expect(cached).not.toBeNull();

            // Advance past TTL
            vi.advanceTimersByTime(6000);

            // Run sweep manually
            await (cacheManager as unknown as { runEvictionSweep: () => Promise<void> }).runEvictionSweep();

            // Entry should be evicted
            cached = await cacheManager.GetRunViewResult(fp);
            expect(cached).toBeNull();

            vi.useRealTimers();
        });

        it('should not evict entries that have not expired', async () => {
            vi.useFakeTimers();

            await cacheManager.Initialize(mockStorage, {
                defaultTTLMs: 10000, // 10 second TTL
                evictionSweepIntervalMs: 0,
                maxEntries: 100,
                maxSizeBytes: 10_000_000,
            });

            const fp = 'Users|_|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'Users' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2024-01-01T00:00:00Z'
            );

            // Advance 5 seconds — only halfway through TTL
            vi.advanceTimersByTime(5000);

            await (cacheManager as unknown as { runEvictionSweep: () => Promise<void> }).runEvictionSweep();

            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached).not.toBeNull();

            vi.useRealTimers();
        });

        it('should evict entries with individual expiresAt set', async () => {
            vi.useFakeTimers();

            await cacheManager.Initialize(mockStorage, {
                defaultTTLMs: 0, // No global TTL
                evictionSweepIntervalMs: 0,
                maxEntries: 100,
                maxSizeBytes: 10_000_000,
            });

            // SetRunQueryResult supports individual TTL via ttlMs
            const fp = 'GetStats|query-123|_|conn';
            await cacheManager.SetRunQueryResult(
                fp,
                'GetStats',
                [{ Count: 42 }],
                '2024-01-01T00:00:00Z',
                undefined, // rowCount
                'query-123',
                3000 // 3 second individual TTL
            );

            // Before expiry — should be present
            let cached = await cacheManager.GetRunQueryResult(fp);
            expect(cached).not.toBeNull();

            // Advance past the 3s TTL
            vi.advanceTimersByTime(4000);

            await (cacheManager as unknown as { runEvictionSweep: () => Promise<void> }).runEvictionSweep();

            cached = await cacheManager.GetRunQueryResult(fp);
            expect(cached).toBeNull();

            vi.useRealTimers();
        });

        it('should clean up entity fingerprint index when evicting TTL-expired entries', async () => {
            vi.useFakeTimers();

            await cacheManager.Initialize(mockStorage, {
                defaultTTLMs: 2000,
                evictionSweepIntervalMs: 0,
                maxEntries: 100,
                maxSizeBytes: 10_000_000,
            });

            const fp = 'Products|_|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'Products' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2024-01-01T00:00:00Z'
            );

            expect(cacheManager.GetFingerprintsForEntity('Products').has(fp)).toBe(true);

            vi.advanceTimersByTime(3000);
            await (cacheManager as unknown as { runEvictionSweep: () => Promise<void> }).runEvictionSweep();

            // Fingerprint index should be cleaned up
            expect(cacheManager.GetFingerprintsForEntity('Products').has(fp)).toBe(false);

            vi.useRealTimers();
        });
    });
});
