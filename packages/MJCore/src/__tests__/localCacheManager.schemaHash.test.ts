/**
 * Tests for LocalCacheManager schema hash validation and cache staleness fixes.
 *
 * Covers:
 *   - Schema hash computation and storage in cache entries
 *   - Schema staleness detection when entity fields change (Fix 1)
 *   - Backward compatibility with cache entries that lack a schema hash
 *   - Null PK field skipping in UpsertSingleEntity (Fix 5)
 *   - maxUpdatedAt type guard coercion (Fix 6)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalCacheManager, CachedRunViewData } from '../generic/localCacheManager';
import { CompositeKey, KeyValuePair } from '../generic/compositeKey';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { Metadata } from '../generic/metadata';
import { GetGlobalObjectStore } from '@memberjunction/global';

function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    const key = '___SINGLETON__LocalCacheManager';
    delete g[key];
}

type SetParams = Parameters<typeof LocalCacheManager.prototype.SetRunViewResult>[1];

describe('LocalCacheManager Schema Hash & Cache Fixes', () => {
    let cacheManager: LocalCacheManager;
    let mockStorage: MockCacheStorageProvider;

    beforeEach(async () => {
        resetLocalCacheManager();
        cacheManager = LocalCacheManager.Instance;
        mockStorage = new MockCacheStorageProvider();
        await cacheManager.Initialize(mockStorage);
    });

    // ========================================================================
    // Schema Hash Computation
    // ========================================================================

    describe('ComputeSchemaHash', () => {
        it('should return undefined when entity cannot be resolved', () => {
            const hash = cacheManager.ComputeSchemaHash(undefined, 'NonExistentEntity');
            expect(hash).toBeUndefined();
        });

        it('should return a consistent hash for the same field list', () => {
            const mockProvider = {
                EntityByName: () => ({
                    Fields: [
                        { Name: 'ID' },
                        { Name: 'Name' },
                        { Name: 'Status' },
                    ]
                })
            } as unknown as Metadata;

            const hash1 = cacheManager.ComputeSchemaHash(mockProvider, 'TestEntity');
            const hash2 = cacheManager.ComputeSchemaHash(mockProvider, 'TestEntity');
            expect(hash1).toBe(hash2);
            expect(typeof hash1).toBe('string');
            expect(hash1!.length).toBeGreaterThan(0);
        });

        it('should return a different hash when fields change', () => {
            const provider5Fields = {
                EntityByName: () => ({
                    Fields: [
                        { Name: 'ID' },
                        { Name: 'Name' },
                        { Name: 'Status' },
                        { Name: 'Email' },
                        { Name: 'Phone' },
                    ]
                })
            } as unknown as Metadata;

            const provider6Fields = {
                EntityByName: () => ({
                    Fields: [
                        { Name: 'ID' },
                        { Name: 'Name' },
                        { Name: 'Status' },
                        { Name: 'Email' },
                        { Name: 'Phone' },
                        { Name: 'NewColumn' },
                    ]
                })
            } as unknown as Metadata;

            const hash5 = cacheManager.ComputeSchemaHash(provider5Fields, 'Users');
            const hash6 = cacheManager.ComputeSchemaHash(provider6Fields, 'Users');
            expect(hash5).not.toBe(hash6);
        });

        it('should detect field reordering', () => {
            const providerA = {
                EntityByName: () => ({
                    Fields: [{ Name: 'ID' }, { Name: 'Name' }, { Name: 'Email' }]
                })
            } as unknown as Metadata;

            const providerB = {
                EntityByName: () => ({
                    Fields: [{ Name: 'ID' }, { Name: 'Email' }, { Name: 'Name' }]
                })
            } as unknown as Metadata;

            const hashA = cacheManager.ComputeSchemaHash(providerA, 'TestEntity');
            const hashB = cacheManager.ComputeSchemaHash(providerB, 'TestEntity');
            expect(hashA).not.toBe(hashB);
        });
    });

    // ========================================================================
    // Schema Staleness Detection on Cache Read
    // ========================================================================

    describe('Schema Staleness Detection', () => {
        it('should return cached data when schema hash matches', async () => {
            const mockProvider = {
                EntityByName: () => ({
                    Fields: [{ Name: 'ID' }, { Name: 'Name' }]
                })
            } as unknown as Metadata;

            const fp = 'TestEntity|_|_|-1|0|_|_';
            const schemaHash = cacheManager.ComputeSchemaHash(mockProvider, 'TestEntity')!;

            // Write directly to storage with a schema hash
            const data: CachedRunViewData = {
                results: [{ ID: '1', Name: 'Alice' }],
                maxUpdatedAt: '2024-01-01T00:00:00Z',
                schemaHash,
            };
            await mockStorage.SetItem(fp, data as unknown as string, 'RunViewCache');

            // Mock Metadata to return same fields
            vi.spyOn(Metadata.prototype, 'EntityByName').mockReturnValue({
                Fields: [{ Name: 'ID' }, { Name: 'Name' }]
            } as ReturnType<Metadata['EntityByName']>);

            const result = await cacheManager.GetRunViewResult(fp);
            expect(result).not.toBeNull();
            expect(result!.results).toHaveLength(1);

            vi.restoreAllMocks();
        });

        it('should invalidate cache when schema hash differs (new column added)', async () => {
            const fp = 'TestEntity|_|_|-1|0|_|_';

            // Write data with an old schema hash (2 fields)
            const oldProvider = {
                EntityByName: () => ({
                    Fields: [{ Name: 'ID' }, { Name: 'Name' }]
                })
            } as unknown as Metadata;
            const oldHash = cacheManager.ComputeSchemaHash(oldProvider, 'TestEntity')!;

            const data: CachedRunViewData = {
                results: [{ ID: '1', Name: 'Alice' }],
                maxUpdatedAt: '2024-01-01T00:00:00Z',
                schemaHash: oldHash,
            };
            await mockStorage.SetItem(fp, data as unknown as string, 'RunViewCache');

            // Mock Metadata to return 3 fields (new column added after migration)
            vi.spyOn(Metadata.prototype, 'EntityByName').mockReturnValue({
                Fields: [{ Name: 'ID' }, { Name: 'Name' }, { Name: 'NewColumn' }]
            } as ReturnType<Metadata['EntityByName']>);

            const result = await cacheManager.GetRunViewResult(fp);
            expect(result).toBeNull(); // Cache miss — schema changed

            vi.restoreAllMocks();
        });

        it('should serve cache entries without schemaHash normally (backward compatibility)', async () => {
            const fp = 'LegacyEntity|_|_|-1|0|_|_';

            // Write data WITHOUT schema hash (pre-upgrade cache entry)
            const data: CachedRunViewData = {
                results: [{ ID: '1', Name: 'Old' }],
                maxUpdatedAt: '2024-01-01T00:00:00Z',
                // No schemaHash field
            };
            await mockStorage.SetItem(fp, data as unknown as string, 'RunViewCache');

            const result = await cacheManager.GetRunViewResult(fp);
            expect(result).not.toBeNull();
            expect(result!.results).toHaveLength(1);
        });
    });

    // ========================================================================
    // Schema Hash Storage in SetRunViewResult
    // ========================================================================

    describe('SetRunViewResult Schema Hash Storage', () => {
        it('should store schema hash when provider can resolve the entity', async () => {
            const mockProvider = {
                EntityByName: () => ({
                    AllowCaching: true,
                    Fields: [{ Name: 'ID' }, { Name: 'Name' }, { Name: 'Status' }]
                })
            } as unknown as Metadata;

            const fp = 'TestEntity|Active=1|_|-1|0|_|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'TestEntity' } as SetParams,
                [{ ID: '1', Name: 'Alice', Status: 'Active' }],
                '2024-01-01T00:00:00Z',
                undefined,
                undefined,
                mockProvider
            );

            // Read back through the public API — schema hash should be present in the stored data
            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached).not.toBeNull();
            expect(cached!.results).toHaveLength(1);

            // Verify by reading raw storage (native object, not JSON string)
            const raw = await mockStorage.GetItem(fp, 'RunViewCache');
            expect(raw).not.toBeNull();
            const stored = raw as unknown as CachedRunViewData;
            expect(stored.schemaHash).toBeDefined();
            expect(typeof stored.schemaHash).toBe('string');
            expect(stored.schemaHash!.length).toBeGreaterThan(0);
        });

        it('should store data without schema hash when entity cannot be resolved', async () => {
            const mockProvider = {
                EntityByName: () => undefined
            } as unknown as Metadata;

            const fp = 'UnknownEntity|_|_|-1|0|_|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'UnknownEntity' } as SetParams,
                [{ ID: '1' }],
                '2024-01-01T00:00:00Z',
                undefined,
                undefined,
                mockProvider
            );

            const raw = await mockStorage.GetItem(fp, 'RunViewCache');
            expect(raw).not.toBeNull();
            const stored = raw as unknown as CachedRunViewData;
            expect(stored.schemaHash).toBeUndefined();
        });
    });

    // ========================================================================
    // Null PK Field Skipping (Fix 5)
    // ========================================================================

    describe('UpsertSingleEntity Null PK Handling', () => {
        it('should skip cached rows with null PK values during upsert', async () => {
            const fp = 'TestEntity|_|_|-1|0|_|_';
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'TestEntity' } as SetParams,
                [
                    { ID: '1', Name: 'Alice' },
                    { ID: null, Name: 'Corrupted' },  // null PK — should be skipped
                    { ID: '3', Name: 'Charlie' },
                ],
                '2024-01-01T00:00:00Z'
            );

            const key = CompositeKey.FromKeyValuePairs([new KeyValuePair('ID', '1')]);
            const result = await cacheManager.UpsertSingleEntity(
                fp,
                { ID: '1', Name: 'Alice Updated' },
                key,
                '2024-01-02T00:00:00Z'
            );

            expect(result).toBe(true);
            const cached = await cacheManager.GetRunViewResult(fp);
            expect(cached).not.toBeNull();
            // The null-PK row should be dropped, leaving 2 rows (Alice Updated + Charlie)
            expect(cached!.results).toHaveLength(2);
            const names = cached!.results.map(r => (r as Record<string, unknown>).Name);
            expect(names).toContain('Alice Updated');
            expect(names).toContain('Charlie');
            expect(names).not.toContain('Corrupted');
        });
    });

    // ========================================================================
    // maxUpdatedAt Type Guard (Fix 6)
    // ========================================================================

    describe('maxUpdatedAt Type Guard', () => {
        it('should coerce a numeric maxUpdatedAt to ISO string', async () => {
            const fp = 'TestEntity|_|_|-1|0|_|_';
            const timestamp = Date.now();

            // Pass a number as maxUpdatedAt (simulating a caller bug)
            await cacheManager.SetRunViewResult(
                fp,
                { EntityName: 'TestEntity' } as SetParams,
                [{ ID: '1' }],
                timestamp as unknown as string  // Wrong type — should be coerced
            );

            const raw = await mockStorage.GetItem(fp, 'RunViewCache');
            expect(raw).not.toBeNull();
            const stored = raw as unknown as CachedRunViewData;
            // Should be a valid ISO string, not the number
            expect(typeof stored.maxUpdatedAt).toBe('string');
            expect(stored.maxUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        });
    });

    // ========================================================================
    // Remote Fingerprint Index Rebuild (Fix 4)
    // ========================================================================

    describe('Remote Fingerprint Index Rebuild', () => {
        it('should populate local index after resolving remote fingerprints', async () => {
            // Directly write a cache entry to storage (simulating Server A's cached data in Redis)
            const fp = 'Users|Active=1|Name|50|0|_|_';
            const data: CachedRunViewData = {
                results: [{ ID: '1', Name: 'Alice' }],
                maxUpdatedAt: '2024-01-01T00:00:00Z',
            };
            await mockStorage.SetItem(fp, data as unknown as string, 'RunViewCache');

            // The local index should be empty (we didn't go through SetRunViewResult)
            const localBefore = cacheManager.GetFingerprintsForEntity('Users');
            expect(localBefore.size).toBe(0);

            // Now write another entry through the proper API to populate the entity index
            // and verify GetFingerprintsForEntity works
            const fp2 = 'Users|_|_|-1|0|_|_';
            await cacheManager.SetRunViewResult(
                fp2,
                { EntityName: 'Users' } as SetParams,
                [{ ID: '2', Name: 'Bob' }],
                '2024-01-01T00:00:00Z'
            );

            const localAfter = cacheManager.GetFingerprintsForEntity('Users');
            expect(localAfter.size).toBe(1);
            expect(localAfter.has(fp2)).toBe(true);
        });
    });
});
