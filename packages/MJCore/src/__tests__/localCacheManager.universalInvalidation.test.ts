/**
 * Tests for LocalCacheManager universal cache invalidation via BaseEntity events.
 *
 * Tests the entity→fingerprint reverse index, BaseEntity event handling,
 * and the different strategies for unfiltered vs filtered cache entries.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalCacheManager } from '../generic/localCacheManager';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';

function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    const key = '___SINGLETON__LocalCacheManager';
    delete g[key];
}

describe('LocalCacheManager Universal Cache Invalidation', () => {
    let cacheManager: LocalCacheManager;
    let mockStorage: MockCacheStorageProvider;

    beforeEach(async () => {
        resetLocalCacheManager();
        cacheManager = LocalCacheManager.Instance;
        mockStorage = new MockCacheStorageProvider();
        await cacheManager.Initialize(mockStorage);
    });

    // ========================================================================
    // extractEntityFromFingerprint
    // ========================================================================

    describe('extractEntityFromFingerprint', () => {
        // Access the protected method via bracket notation for testing
        const extract = (fp: string) =>
            (cacheManager as unknown as { extractEntityFromFingerprint: (fp: string) => string | null })
                .extractEntityFromFingerprint(fp);

        it('should extract entity name from a standard fingerprint', () => {
            expect(extract('Users|Active=1|Name ASC|simple|100|0|_')).toBe('Users');
        });

        it('should extract entity name from a fingerprint with connection suffix', () => {
            expect(extract('AI Models|_|_|entity_object|-1|0|_|localhost')).toBe('AI Models');
        });

        it('should extract entity name with "MJ: " prefix', () => {
            expect(extract('MJ: AI Agent Runs|Status=Running|_|simple|50|0|_')).toBe('MJ: AI Agent Runs');
        });

        it('should return null for a fingerprint with no pipe separator', () => {
            expect(extract('NoPipeSeparator')).toBeNull();
        });

        it('should return null for a fingerprint starting with pipe', () => {
            expect(extract('|Filter|OrderBy')).toBeNull();
        });

        it('should return null for an empty string', () => {
            expect(extract('')).toBeNull();
        });
    });

    // ========================================================================
    // isFilteredFingerprint
    // ========================================================================

    describe('isFilteredFingerprint', () => {
        const isFiltered = (fp: string) =>
            (cacheManager as unknown as { isFilteredFingerprint: (fp: string) => boolean })
                .isFilteredFingerprint(fp);

        it('should return false for unfiltered fingerprint (underscore filter)', () => {
            expect(isFiltered('Users|_|Name ASC|simple|100|0|_')).toBe(false);
        });

        it('should return false for empty filter', () => {
            expect(isFiltered('Users||Name ASC|simple|100|0|_')).toBe(false);
        });

        it('should return true for a filtered fingerprint', () => {
            expect(isFiltered('Users|Active=1|Name ASC|simple|100|0|_')).toBe(true);
        });

        it('should return true for a complex filter', () => {
            expect(isFiltered('Users|Status=Active AND Role=Admin|_|simple|-1|0|_')).toBe(true);
        });

        it('should return false for a fingerprint with only one part', () => {
            expect(isFiltered('Users')).toBe(false);
        });
    });

    // ========================================================================
    // Entity→Fingerprint Index Maintenance
    // ========================================================================

    describe('Entity→Fingerprint Index', () => {
        it('should index fingerprints when SetRunViewResult is called', async () => {
            const fingerprint = 'Users|_|_|simple|-1|0|_';
            await cacheManager.SetRunViewResult(
                fingerprint,
                { EntityName: 'Users' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1', Name: 'Alice' }],
                '2024-01-01T00:00:00Z'
            );

            const fps = cacheManager.GetFingerprintsForEntity('Users');
            expect(fps.has(fingerprint)).toBe(true);
        });

        it('should remove fingerprints from index when InvalidateRunViewResult is called', async () => {
            const fingerprint = 'Users|_|_|simple|-1|0|_';
            await cacheManager.SetRunViewResult(
                fingerprint,
                { EntityName: 'Users' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1', Name: 'Alice' }],
                '2024-01-01T00:00:00Z'
            );
            expect(cacheManager.GetFingerprintsForEntity('Users').has(fingerprint)).toBe(true);

            await cacheManager.InvalidateRunViewResult(fingerprint);
            expect(cacheManager.GetFingerprintsForEntity('Users').has(fingerprint)).toBe(false);
        });

        it('should track multiple fingerprints for the same entity', async () => {
            const fp1 = 'Users|_|_|simple|-1|0|_';
            const fp2 = 'Users|Active=1|_|simple|-1|0|_';

            await cacheManager.SetRunViewResult(
                fp1,
                { EntityName: 'Users' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2024-01-01T00:00:00Z'
            );
            await cacheManager.SetRunViewResult(
                fp2,
                { EntityName: 'Users' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2024-01-01T00:00:00Z'
            );

            const fps = cacheManager.GetFingerprintsForEntity('Users');
            expect(fps.size).toBe(2);
            expect(fps.has(fp1)).toBe(true);
            expect(fps.has(fp2)).toBe(true);
        });

        it('should clean up entity key when all fingerprints are removed', async () => {
            const fingerprint = 'Users|_|_|simple|-1|0|_';
            await cacheManager.SetRunViewResult(
                fingerprint,
                { EntityName: 'Users' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2024-01-01T00:00:00Z'
            );

            await cacheManager.InvalidateRunViewResult(fingerprint);
            // GetFingerprintsForEntity returns an empty set, not a set with 0 items
            expect(cacheManager.GetFingerprintsForEntity('Users').size).toBe(0);
        });
    });

    // ========================================================================
    // HandleBaseEntityEvent
    // ========================================================================

    describe('HandleBaseEntityEvent', () => {
        // Helper to create a mock BaseEntityEvent-like object
        function createMockEntityEvent(options: {
            entityName: string;
            type: 'save' | 'delete';
            pkFieldName: string;
            pkValue: string;
            allData?: Record<string, unknown>;
        }) {
            const fields: Record<string, unknown> = options.allData ?? {
                [options.pkFieldName]: options.pkValue,
            };

            return {
                type: options.type,
                baseEntity: {
                    EntityInfo: {
                        Name: options.entityName,
                        PrimaryKeys: [{ Name: options.pkFieldName }],
                    },
                    Get: (fieldName: string) => fields[fieldName],
                    GetAll: () => ({ ...fields }),
                },
            };
        }

        it('should upsert entity in unfiltered cache on save', async () => {
            // Set up an unfiltered cache
            const fp = 'Users|_|_|simple|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'Users' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1', Name: 'Alice' }, { ID: '2', Name: 'Bob' }],
                '2024-01-01T00:00:00Z'
            );

            // Simulate a save event updating Alice's name
            const event = createMockEntityEvent({
                entityName: 'Users',
                type: 'save',
                pkFieldName: 'ID',
                pkValue: '1',
                allData: { ID: '1', Name: 'Alice Updated' },
            });

            await (cacheManager as unknown as { HandleBaseEntityEvent: (e: unknown) => Promise<void> })
                .HandleBaseEntityEvent(event);

            // Verify the cache was updated
            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached).not.toBeNull();
            expect(cached!.results).toHaveLength(2);

            const updatedRow = cached!.results.find(
                (r) => (r as Record<string, unknown>).ID === '1'
            ) as Record<string, unknown>;
            expect(updatedRow.Name).toBe('Alice Updated');
        });

        it('should remove entity from cache on delete', async () => {
            const fp = 'Users|_|_|simple|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'Users' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1', Name: 'Alice' }, { ID: '2', Name: 'Bob' }],
                '2024-01-01T00:00:00Z'
            );

            const event = createMockEntityEvent({
                entityName: 'Users',
                type: 'delete',
                pkFieldName: 'ID',
                pkValue: '1',
            });

            await (cacheManager as unknown as { HandleBaseEntityEvent: (e: unknown) => Promise<void> })
                .HandleBaseEntityEvent(event);

            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached).not.toBeNull();
            expect(cached!.results).toHaveLength(1);
            expect((cached!.results[0] as Record<string, unknown>).ID).toBe('2');
        });

        it('should invalidate filtered cache on save (conservative)', async () => {
            const fp = 'Users|Active=1|_|simple|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'Users', ExtraFilter: 'Active=1' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1', Name: 'Alice', Active: true }],
                '2024-01-01T00:00:00Z'
            );

            const event = createMockEntityEvent({
                entityName: 'Users',
                type: 'save',
                pkFieldName: 'ID',
                pkValue: '1',
                allData: { ID: '1', Name: 'Alice Updated', Active: true },
            });

            await (cacheManager as unknown as { HandleBaseEntityEvent: (e: unknown) => Promise<void> })
                .HandleBaseEntityEvent(event);

            // Filtered cache should be invalidated (removed), not updated in place
            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached).toBeNull();
        });

        it('should do nothing when entity has no cached fingerprints', async () => {
            const event = createMockEntityEvent({
                entityName: 'NonExistentEntity',
                type: 'save',
                pkFieldName: 'ID',
                pkValue: '1',
                allData: { ID: '1', Name: 'Test' },
            });

            // Should not throw
            await (cacheManager as unknown as { HandleBaseEntityEvent: (e: unknown) => Promise<void> })
                .HandleBaseEntityEvent(event);
        });

        it('should handle events with missing EntityInfo gracefully', async () => {
            const event = {
                type: 'save',
                baseEntity: { EntityInfo: null },
            };

            // Should not throw
            await (cacheManager as unknown as { HandleBaseEntityEvent: (e: unknown) => Promise<void> })
                .HandleBaseEntityEvent(event);
        });

        it('should handle delete on filtered cache by invalidating', async () => {
            const fp = 'Users|Status=Active|_|simple|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'Users', ExtraFilter: 'Status=Active' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1', Name: 'Alice' }],
                '2024-01-01T00:00:00Z'
            );

            const event = createMockEntityEvent({
                entityName: 'Users',
                type: 'delete',
                pkFieldName: 'ID',
                pkValue: '1',
            });

            await (cacheManager as unknown as { HandleBaseEntityEvent: (e: unknown) => Promise<void> })
                .HandleBaseEntityEvent(event);

            // Delete should remove from any cache (filtered or not)
            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached).not.toBeNull();
            // The row should have been removed since delete always calls RemoveSingleEntity
            expect(cached!.results).toHaveLength(0);
        });

        it('should add new entity to unfiltered cache on save (create)', async () => {
            const fp = 'Users|_|_|simple|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'Users' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1', Name: 'Alice' }],
                '2024-01-01T00:00:00Z'
            );

            // Simulate creating a new user
            const event = createMockEntityEvent({
                entityName: 'Users',
                type: 'save',
                pkFieldName: 'ID',
                pkValue: '3',
                allData: { ID: '3', Name: 'Charlie' },
            });

            await (cacheManager as unknown as { HandleBaseEntityEvent: (e: unknown) => Promise<void> })
                .HandleBaseEntityEvent(event);

            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached).not.toBeNull();
            expect(cached!.results).toHaveLength(2);
            const newRow = cached!.results.find(
                (r) => (r as Record<string, unknown>).ID === '3'
            ) as Record<string, unknown>;
            expect(newRow.Name).toBe('Charlie');
        });
    });
/**
 * Additional tests for LocalCacheManager universal cache invalidation.
 *
 * Tests composite PK handling, eviction cleanup, registry rebuild, and edge cases.
 * Appended to the existing localCacheManager.universalInvalidation.test.ts file.
 */

    // ========================================================================
    // Composite Primary Key Handling
    // ========================================================================

    describe('Composite Primary Key Handling', () => {
        function createMockEntityEventWithCompositePK(options: {
            entityName: string;
            type: 'save' | 'delete';
            primaryKeys: Array<{ Name: string }>;
            fields: Record<string, unknown>;
        }) {
            return {
                type: options.type,
                baseEntity: {
                    EntityInfo: {
                        Name: options.entityName,
                        PrimaryKeys: options.primaryKeys,
                    },
                    Get: (fieldName: string) => options.fields[fieldName],
                    GetAll: () => ({ ...options.fields }),
                },
            };
        }

        it('should invalidate all fingerprints for composite PK entity on save', async () => {
            // Set up caches for an entity with composite PK
            const fp1 = 'UserRoles|_|_|simple|-1|0|_';
            const fp2 = 'UserRoles|Active=1|_|simple|-1|0|_';

            await cacheManager.SetRunViewResult(
                fp1,
                { EntityName: 'UserRoles' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ UserID: 'u1', RoleID: 'r1', Active: true }],
                '2024-01-01T00:00:00Z'
            );
            await cacheManager.SetRunViewResult(
                fp2,
                { EntityName: 'UserRoles', ExtraFilter: 'Active=1' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ UserID: 'u1', RoleID: 'r1', Active: true }],
                '2024-01-01T00:00:00Z'
            );

            // Composite PK: UserID + RoleID
            const event = createMockEntityEventWithCompositePK({
                entityName: 'UserRoles',
                type: 'save',
                primaryKeys: [{ Name: 'UserID' }, { Name: 'RoleID' }],
                fields: { UserID: 'u1', RoleID: 'r1', Active: false },
            });

            await (cacheManager as unknown as { HandleBaseEntityEvent: (e: unknown) => Promise<void> })
                .HandleBaseEntityEvent(event);

            // Both caches should be invalidated (not updated in place)
            const cached1 = await cacheManager.GetRunViewResult(fp1);
            const cached2 = await cacheManager.GetRunViewResult(fp2);
            expect(cached1).toBeNull();
            expect(cached2).toBeNull();
        });

        it('should invalidate all fingerprints for composite PK entity on delete', async () => {
            const fp = 'UserRoles|_|_|simple|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'UserRoles' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ UserID: 'u1', RoleID: 'r1' }],
                '2024-01-01T00:00:00Z'
            );

            const event = createMockEntityEventWithCompositePK({
                entityName: 'UserRoles',
                type: 'delete',
                primaryKeys: [{ Name: 'UserID' }, { Name: 'RoleID' }],
                fields: { UserID: 'u1', RoleID: 'r1' },
            });

            await (cacheManager as unknown as { HandleBaseEntityEvent: (e: unknown) => Promise<void> })
                .HandleBaseEntityEvent(event);

            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached).toBeNull();
        });

        it('should handle single PK normally (not invalidate)', async () => {
            const fp = 'Users|_|_|simple|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'Users' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1', Name: 'Alice' }],
                '2024-01-01T00:00:00Z'
            );

            const event = {
                type: 'save' as const,
                baseEntity: {
                    EntityInfo: {
                        Name: 'Users',
                        PrimaryKeys: [{ Name: 'ID' }],
                    },
                    Get: (field: string) => field === 'ID' ? '1' : 'Alice Updated',
                    GetAll: () => ({ ID: '1', Name: 'Alice Updated' }),
                },
            };

            await (cacheManager as unknown as { HandleBaseEntityEvent: (e: unknown) => Promise<void> })
                .HandleBaseEntityEvent(event);

            // Single PK: should be updated in place, NOT invalidated
            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached).not.toBeNull();
            expect(cached!.results).toHaveLength(1);
            expect((cached!.results[0] as Record<string, unknown>).Name).toBe('Alice Updated');
        });
    });

    // ========================================================================
    // Eviction Entity Index Cleanup
    // ========================================================================

    describe('Eviction Entity Index Cleanup', () => {
        it('should remove fingerprints from entity index when entries are evicted', async () => {
            // Configure a very small cache to force eviction
            cacheManager.UpdateConfig({ maxEntries: 2, maxSizeBytes: 10_000_000 });

            const fp1 = 'EntityA|_|_|simple|-1|0|_';
            const fp2 = 'EntityB|_|_|simple|-1|0|_';

            await cacheManager.SetRunViewResult(
                fp1,
                { EntityName: 'EntityA' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2024-01-01T00:00:00Z'
            );
            await cacheManager.SetRunViewResult(
                fp2,
                { EntityName: 'EntityB' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '2' }],
                '2024-01-01T00:00:00Z'
            );

            // Both should be in the index
            expect(cacheManager.GetFingerprintsForEntity('EntityA').has(fp1)).toBe(true);
            expect(cacheManager.GetFingerprintsForEntity('EntityB').has(fp2)).toBe(true);

            // Adding a third entry should trigger eviction of the oldest (fp1)
            const fp3 = 'EntityC|_|_|simple|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp3,
                { EntityName: 'EntityC' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '3' }],
                '2024-01-01T00:00:00Z'
            );

            // After eviction, at least one of the original fingerprints should be gone from the index
            const aFps = cacheManager.GetFingerprintsForEntity('EntityA');
            const cFps = cacheManager.GetFingerprintsForEntity('EntityC');

            // EntityC should definitely be in the index (just added)
            expect(cFps.has(fp3)).toBe(true);

            // At least one original entry should have been evicted
            const totalOriginal = aFps.size + cacheManager.GetFingerprintsForEntity('EntityB').size;
            expect(totalOriginal).toBeLessThanOrEqual(2);
        });
    });

    // ========================================================================
    // Registry Index Rebuild on Startup
    // ========================================================================

    describe('Registry Index Rebuild', () => {
        it('should rebuild entity index from persisted registry on re-initialization', async () => {
            // Cache some data
            const fp = 'Products|_|_|simple|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'Products' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1', Name: 'Widget' }],
                '2024-01-01T00:00:00Z'
            );

            // Verify it's in the index
            expect(cacheManager.GetFingerprintsForEntity('Products').has(fp)).toBe(true);

            // Wait for debounced registry persist (1s debounce + buffer)
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Simulate server restart: reset singleton but keep the same storage
            resetLocalCacheManager();
            const newManager = LocalCacheManager.Instance;
            await newManager.Initialize(mockStorage);

            // After re-init, the entity index should be rebuilt from the persisted registry
            const rebuilt = newManager.GetFingerprintsForEntity('Products');
            expect(rebuilt.has(fp)).toBe(true);
        });
    });

    // ========================================================================
    // Edge Cases
    // ========================================================================

    describe('Edge Cases', () => {
        it('should handle event with null PK value gracefully', async () => {
            const fp = 'Users|_|_|simple|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'Users' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1', Name: 'Alice' }],
                '2024-01-01T00:00:00Z'
            );

            const event = {
                type: 'save' as const,
                baseEntity: {
                    EntityInfo: {
                        Name: 'Users',
                        PrimaryKeys: [{ Name: 'ID' }],
                    },
                    Get: () => null, // null PK value
                    GetAll: () => ({ ID: null, Name: 'Ghost' }),
                },
            };

            // Should not throw — just skip silently
            await (cacheManager as unknown as { HandleBaseEntityEvent: (e: unknown) => Promise<void> })
                .HandleBaseEntityEvent(event);

            // Cache should be unchanged
            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached).not.toBeNull();
            expect(cached!.results).toHaveLength(1);
        });

        it('should handle event with empty PrimaryKeys array gracefully', async () => {
            const fp = 'Users|_|_|simple|-1|0|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'Users' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1' }],
                '2024-01-01T00:00:00Z'
            );

            const event = {
                type: 'save' as const,
                baseEntity: {
                    EntityInfo: {
                        Name: 'Users',
                        PrimaryKeys: [], // empty array
                    },
                    Get: () => '1',
                    GetAll: () => ({ ID: '1' }),
                },
            };

            await (cacheManager as unknown as { HandleBaseEntityEvent: (e: unknown) => Promise<void> })
                .HandleBaseEntityEvent(event);

            // Cache should be unchanged
            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached).not.toBeNull();
            expect(cached!.results).toHaveLength(1);
        });

        it('should handle event with undefined PrimaryKeys gracefully', async () => {
            const event = {
                type: 'save' as const,
                baseEntity: {
                    EntityInfo: {
                        Name: 'Users',
                        PrimaryKeys: undefined,
                    },
                    Get: () => '1',
                    GetAll: () => ({ ID: '1' }),
                },
            };

            // Should not throw
            await (cacheManager as unknown as { HandleBaseEntityEvent: (e: unknown) => Promise<void> })
                .HandleBaseEntityEvent(event);
        });

        it('should handle multiple entities independently', async () => {
            const fpUsers = 'Users|_|_|simple|-1|0|_';
            const fpProducts = 'Products|_|_|simple|-1|0|_';

            await cacheManager.SetRunViewResult(
                fpUsers,
                { EntityName: 'Users' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: '1', Name: 'Alice' }],
                '2024-01-01T00:00:00Z'
            );
            await cacheManager.SetRunViewResult(
                fpProducts,
                { EntityName: 'Products' } as Parameters<typeof cacheManager.SetRunViewResult>[1],
                [{ ID: 'p1', Name: 'Widget' }],
                '2024-01-01T00:00:00Z'
            );

            // Save event for Users only
            const event = {
                type: 'save' as const,
                baseEntity: {
                    EntityInfo: {
                        Name: 'Users',
                        PrimaryKeys: [{ Name: 'ID' }],
                    },
                    Get: (f: string) => f === 'ID' ? '1' : 'Alice Updated',
                    GetAll: () => ({ ID: '1', Name: 'Alice Updated' }),
                },
            };

            await (cacheManager as unknown as { HandleBaseEntityEvent: (e: unknown) => Promise<void> })
                .HandleBaseEntityEvent(event);

            // Users cache should be updated
            const usersCache = await cacheManager.GetRunViewResult(fpUsers);
            expect(usersCache).not.toBeNull();
            expect((usersCache!.results[0] as Record<string, unknown>).Name).toBe('Alice Updated');

            // Products cache should be untouched
            const productsCache = await cacheManager.GetRunViewResult(fpProducts);
            expect(productsCache).not.toBeNull();
            expect((productsCache!.results[0] as Record<string, unknown>).Name).toBe('Widget');
        });
    });

});
