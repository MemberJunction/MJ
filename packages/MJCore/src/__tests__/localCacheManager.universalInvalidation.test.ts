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
});
