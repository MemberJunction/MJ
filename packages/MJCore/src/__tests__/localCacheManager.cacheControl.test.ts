/**
 * Tests for entity-level cache control: AllowCaching flag,
 * per-entity memory limit eviction, TTL sweep, and config defaults.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
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
            expect(config.defaultTTLMs).toBe(0);
            expect(config.evictionPolicy).toBe('lru');
            expect(config.maxPercentOfCachePerEntity).toBe(50);
            expect(config.evictionSweepIntervalMs).toBe(300000);
            expect(config.verboseLogging).toBe(false);
        });

        it('should merge partial config overrides with defaults', async () => {
            await cacheManager.Initialize(mockStorage, {
                maxPercentOfCachePerEntity: 25,
                verboseLogging: true,
            });

            const config = cacheManager.Config;
            expect(config.maxPercentOfCachePerEntity).toBe(25);
            expect(config.verboseLogging).toBe(true);
            // Defaults preserved
            expect(config.maxSizeBytes).toBe(150 * 1024 * 1024);
            expect(config.evictionPolicy).toBe('lru');
        });

        it('should allow runtime config updates via UpdateConfig', async () => {
            await cacheManager.Initialize(mockStorage);
            cacheManager.UpdateConfig({ maxPercentOfCachePerEntity: 30 });

            expect(cacheManager.Config.maxPercentOfCachePerEntity).toBe(30);
            // Other settings unchanged
            expect(cacheManager.Config.maxSizeBytes).toBe(150 * 1024 * 1024);
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

        it('should short-circuit when AllowCaching is undefined (treated as false)', async () => {
            const entityName = 'DefaultEntity';
            const fp = await setupCacheWithEntity(entityName);

            const event = {
                type: 'save' as const,
                baseEntity: {
                    EntityInfo: {
                        Name: entityName,
                        // AllowCaching not set — IsCachingEnabledForEntity only returns
                        // true when AllowCaching === true, so any falsy value disables caching.
                        AllowCaching: undefined,
                        PrimaryKeys: [{ Name: 'ID' }],
                    },
                    Get: (f: string) => f === 'ID' ? '1' : 'Updated',
                    GetAll: () => ({ ID: '1', Name: 'Updated' }),
                },
            };

            await (cacheManager as unknown as { HandleBaseEntityEvent: (e: unknown) => Promise<void> })
                .HandleBaseEntityEvent(event);

            // AllowCaching is falsy, so the event is short-circuited and the cache is not updated.
            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached).not.toBeNull();
            expect((cached!.results[0] as Record<string, unknown>).Name).toBe('Test');
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
    // Per-Entity Memory Limit Eviction
    // ========================================================================

    describe('enforcePerEntityMemoryLimit', () => {
        // Helper to create a large payload (~sizeKB kilobytes when JSON-stringified)
        function makeLargeRows(sizeKB: number): Record<string, unknown>[] {
            const padding = 'x'.repeat(sizeKB * 512); // ~sizeKB KB after JSON.stringify * 2 bytes
            return [{ ID: '1', Data: padding }];
        }

        it('should evict LRU entries when entity exceeds memory percentage', async () => {
            // 100KB total budget, 50% per entity = 50KB per entity
            await cacheManager.Initialize(mockStorage, {
                maxSizeBytes: 100 * 1024,
                maxPercentOfCachePerEntity: 50,
            });

            // Insert ~20KB entry
            const fp1 = 'BigEntity|A|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp1,
                { EntityName: 'BigEntity', ExtraFilter: 'A' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                makeLargeRows(20),
                '2024-01-01T00:00:00Z'
            );

            // Insert another ~20KB entry (total ~40KB, under 50KB limit)
            const fp2 = 'BigEntity|B|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp2,
                { EntityName: 'BigEntity', ExtraFilter: 'B' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                makeLargeRows(20),
                '2024-01-01T00:00:00Z'
            );

            // Both should exist (under limit)
            expect(cacheManager.GetFingerprintsForEntity('BigEntity').size).toBe(2);

            // Insert ~30KB entry (total would be ~70KB, over 50KB limit)
            const fp3 = 'BigEntity|C|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp3,
                { EntityName: 'BigEntity', ExtraFilter: 'C' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                makeLargeRows(30),
                '2024-01-01T00:00:00Z'
            );

            // Should have evicted oldest entries to get under the 50KB limit
            const remaining = cacheManager.GetFingerprintsForEntity('BigEntity');
            expect(remaining.size).toBeLessThan(3);
            // Most recent entry should survive
            expect(remaining.has(fp3)).toBe(true);
        });

        it('should evict least-recently-accessed entries first (LRU)', async () => {
            vi.useFakeTimers();

            // 60KB total, 50% per entity = 30KB per entity
            await cacheManager.Initialize(mockStorage, {
                maxSizeBytes: 60 * 1024,
                maxPercentOfCachePerEntity: 50,
            });

            // Insert ~10KB at t=0
            const fp1 = 'Users|A|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp1,
                { EntityName: 'Users', ExtraFilter: 'A' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                makeLargeRows(10),
                '2024-01-01T00:00:00Z'
            );

            // Insert ~10KB at t=1000
            vi.advanceTimersByTime(1000);
            const fp2 = 'Users|B|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp2,
                { EntityName: 'Users', ExtraFilter: 'B' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                makeLargeRows(10),
                '2024-01-01T00:00:00Z'
            );

            // Access fp1 to make it more recent than fp2
            vi.advanceTimersByTime(1000);
            await cacheManager.GetRunViewResult(fp1);

            // Insert ~15KB at t=3000 — would push over 30KB limit, fp2 is LRU
            vi.advanceTimersByTime(1000);
            const fp3 = 'Users|C|_|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp3,
                { EntityName: 'Users', ExtraFilter: 'C' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                makeLargeRows(15),
                '2024-01-01T00:00:00Z'
            );

            const remaining = cacheManager.GetFingerprintsForEntity('Users');
            // fp2 should be evicted (LRU), fp1 and fp3 should remain
            expect(remaining.has(fp2)).toBe(false);
            expect(remaining.has(fp1)).toBe(true);
            expect(remaining.has(fp3)).toBe(true);

            vi.useRealTimers();
        });

        it('should not evict entries from other entities', async () => {
            // 100KB total, 50% per entity = 50KB limit per entity
            await cacheManager.Initialize(mockStorage, {
                maxSizeBytes: 100 * 1024,
                maxPercentOfCachePerEntity: 50,
            });

            // Insert ~10KB for entity A
            await cacheManager.SetRunViewResult(
                'EntityA|_|_|-1|0|_',
                { EntityName: 'EntityA' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                makeLargeRows(10),
                '2024-01-01T00:00:00Z'
            );

            // Insert ~30KB + ~30KB for entity B (total ~60KB, over 50KB limit)
            await cacheManager.SetRunViewResult(
                'EntityB|X|_|-1|0|_',
                { EntityName: 'EntityB', ExtraFilter: 'X' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                makeLargeRows(30),
                '2024-01-01T00:00:00Z'
            );
            await cacheManager.SetRunViewResult(
                'EntityB|Y|_|-1|0|_',
                { EntityName: 'EntityB', ExtraFilter: 'Y' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                makeLargeRows(30),
                '2024-01-01T00:00:00Z'
            );

            // Entity A should be untouched
            expect(cacheManager.GetFingerprintsForEntity('EntityA').size).toBe(1);
        });

        it('should skip enforcement when maxPercentOfCachePerEntity is 0 (disabled)', async () => {
            await cacheManager.Initialize(mockStorage, {
                maxSizeBytes: 10_000_000, // 10MB — large enough that global eviction won't interfere
                maxPercentOfCachePerEntity: 0, // disabled
            });

            // Insert several entries — without per-entity limits, all should survive
            for (let i = 0; i < 5; i++) {
                await cacheManager.SetRunViewResult(
                    `Users|F${i}|_|-1|0|_`,
                    { EntityName: 'Users', ExtraFilter: `F${i}` } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                    makeLargeRows(3),
                    '2024-01-01T00:00:00Z'
                );
            }

            // All 5 should remain — per-entity limit is disabled
            expect(cacheManager.GetFingerprintsForEntity('Users').size).toBe(5);
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
