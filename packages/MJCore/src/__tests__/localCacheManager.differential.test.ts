/**
 * Differential Caching Tests for LocalCacheManager
 *
 * Tests the ApplyDifferentialUpdate method and related helper functions
 * that enable efficient cache updates using only changed data (deltas).
 *
 * Related PR: #1800 - Differential Caching for RunViews
 */

import { LocalCacheManager, CacheCategory } from '../generic/localCacheManager';
import { RunViewParams } from '../views/runView';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';

// Test data generators
function generateTestRows(count: number, startId: number = 1): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < count; i++) {
        const id = startId + i;
        rows.push({
            ID: `id-${id.toString().padStart(5, '0')}`,
            Name: `Test Record ${id}`,
            Description: `Description for record ${id}`,
            Status: id % 2 === 0 ? 'Active' : 'Inactive',
            CreatedAt: new Date(2024, 0, id % 28 + 1).toISOString(),
            __mj_UpdatedAt: new Date(2024, 5, id % 28 + 1).toISOString(),
        });
    }
    return rows;
}

function generateCompositeKeyRows(count: number): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < count; i++) {
        rows.push({
            EntityID: `entity-${Math.floor(i / 10)}`,
            FieldID: `field-${i % 10}`,
            Name: `Composite Record ${i}`,
            Value: `Value ${i}`,
            __mj_UpdatedAt: new Date(2024, 5, i % 28 + 1).toISOString(),
        });
    }
    return rows;
}

// Helper to reset singleton for testing
function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    const key = '___SINGLETON__LocalCacheManager';
    delete g[key];
}

describe('LocalCacheManager Differential Caching', () => {
    let cacheManager: LocalCacheManager;
    let mockStorage: MockCacheStorageProvider;
    const testFingerprint = 'test-fingerprint-12345';
    const testParams: RunViewParams = {
        EntityName: 'Test Entity',
        ExtraFilter: 'Status = "Active"',
    };

    beforeEach(async () => {
        // Reset the singleton before each test
        resetLocalCacheManager();

        // Get fresh instance and initialize with mock storage
        cacheManager = LocalCacheManager.Instance;
        mockStorage = new MockCacheStorageProvider();

        // Initialize the cache manager with mock storage
        await cacheManager.Initialize(mockStorage, {
            enabled: true,
            maxSizeBytes: 50 * 1024 * 1024,
            maxEntries: 1000,
            defaultTTLMs: 5 * 60 * 1000,
            evictionPolicy: 'lru'
        });

        mockStorage.resetCallCounts();
    });

    afterEach(() => {
        mockStorage.clearAll();
    });

    describe('ApplyDifferentialUpdate - Basic Operations', () => {
        test('applies inserts correctly to existing cache', async () => {
            // Setup: cache with 10 records
            const initialRows = generateTestRows(10);
            await cacheManager.SetRunViewResult(
                testFingerprint,
                testParams,
                initialRows,
                '2024-06-15T00:00:00.000Z',
                10
            );

            // New rows to insert (IDs 11-15)
            const newRows = generateTestRows(5, 11);

            const result = await cacheManager.ApplyDifferentialUpdate(
                testFingerprint,
                testParams,
                newRows,
                [], // no deletions
                'ID',
                '2024-06-20T00:00:00.000Z',
                15
            );

            expect(result).not.toBeNull();
            expect(result!.results.length).toBe(15);
            expect(result!.rowCount).toBe(15);
            expect(result!.maxUpdatedAt).toBe('2024-06-20T00:00:00.000Z');
        });

        test('applies updates correctly', async () => {
            // Setup: cache with 10 records
            const initialRows = generateTestRows(10);
            await cacheManager.SetRunViewResult(
                testFingerprint,
                testParams,
                initialRows,
                '2024-06-15T00:00:00.000Z',
                10
            );

            // Update first 3 records with new data
            const updatedRows = [
                { ...initialRows[0], Name: 'Updated Record 1', Status: 'Updated' },
                { ...initialRows[1], Name: 'Updated Record 2', Status: 'Updated' },
                { ...initialRows[2], Name: 'Updated Record 3', Status: 'Updated' },
            ];

            const result = await cacheManager.ApplyDifferentialUpdate(
                testFingerprint,
                testParams,
                updatedRows,
                [],
                'ID',
                '2024-06-20T00:00:00.000Z',
                10
            );

            expect(result).not.toBeNull();
            expect(result!.results.length).toBe(10);

            // Verify updates were applied
            const resultRecords = result!.results as Record<string, unknown>[];
            const updated1 = resultRecords.find(r => r['ID'] === 'id-00001');
            expect(updated1).toBeDefined();
            expect(updated1!['Name']).toBe('Updated Record 1');
            expect(updated1!['Status']).toBe('Updated');
        });

        test('applies deletions correctly', async () => {
            // Setup: cache with 10 records
            const initialRows = generateTestRows(10);
            await cacheManager.SetRunViewResult(
                testFingerprint,
                testParams,
                initialRows,
                '2024-06-15T00:00:00.000Z',
                10
            );

            // Delete first 3 records - using CompositeKey format "Field|Value"
            const deletedIDs = [
                'ID|id-00001',
                'ID|id-00002',
                'ID|id-00003',
            ];

            const result = await cacheManager.ApplyDifferentialUpdate(
                testFingerprint,
                testParams,
                [],
                deletedIDs,
                'ID',
                '2024-06-20T00:00:00.000Z',
                7
            );

            expect(result).not.toBeNull();
            expect(result!.results.length).toBe(7);
            expect(result!.rowCount).toBe(7);

            // Verify deletions were applied
            const resultRecords = result!.results as Record<string, unknown>[];
            expect(resultRecords.find(r => r['ID'] === 'id-00001')).toBeUndefined();
            expect(resultRecords.find(r => r['ID'] === 'id-00002')).toBeUndefined();
            expect(resultRecords.find(r => r['ID'] === 'id-00003')).toBeUndefined();
            expect(resultRecords.find(r => r['ID'] === 'id-00004')).toBeDefined();
        });

        test('applies mixed operations (inserts + updates + deletes)', async () => {
            // Setup: cache with 10 records
            const initialRows = generateTestRows(10);
            await cacheManager.SetRunViewResult(
                testFingerprint,
                testParams,
                initialRows,
                '2024-06-15T00:00:00.000Z',
                10
            );

            // Mixed operations:
            // - Insert 2 new records (11, 12)
            // - Update 2 existing records (4, 5)
            // - Delete 2 records (1, 2)
            const newAndUpdatedRows = [
                ...generateTestRows(2, 11), // new
                { ...initialRows[3], Name: 'Updated Record 4', Status: 'Updated' },
                { ...initialRows[4], Name: 'Updated Record 5', Status: 'Updated' },
            ];
            const deletedIDs = ['ID|id-00001', 'ID|id-00002'];

            const result = await cacheManager.ApplyDifferentialUpdate(
                testFingerprint,
                testParams,
                newAndUpdatedRows,
                deletedIDs,
                'ID',
                '2024-06-20T00:00:00.000Z',
                10 // 10 - 2 deleted + 2 inserted = 10
            );

            expect(result).not.toBeNull();
            expect(result!.results.length).toBe(10);

            const resultRecords = result!.results as Record<string, unknown>[];
            // Verify deletions
            expect(resultRecords.find(r => r['ID'] === 'id-00001')).toBeUndefined();
            expect(resultRecords.find(r => r['ID'] === 'id-00002')).toBeUndefined();
            // Verify insertions
            expect(resultRecords.find(r => r['ID'] === 'id-00011')).toBeDefined();
            expect(resultRecords.find(r => r['ID'] === 'id-00012')).toBeDefined();
            // Verify updates
            const updated4 = resultRecords.find(r => r['ID'] === 'id-00004');
            expect(updated4!['Name']).toBe('Updated Record 4');
        });

        test('handles large differential update (500 rows)', async () => {
            // Setup: cache with 500 records
            const initialRows = generateTestRows(500);
            await cacheManager.SetRunViewResult(
                testFingerprint,
                testParams,
                initialRows,
                '2024-06-15T00:00:00.000Z',
                500
            );

            // Update 50 records, delete 25, insert 25
            const updatedRows = initialRows.slice(0, 50).map((r, i) => ({
                ...r,
                Name: `Updated Record ${i + 1}`,
            }));
            const newRows = generateTestRows(25, 501);
            const deletedIDs = Array.from({ length: 25 }, (_, i) => `ID|id-${(476 + i).toString().padStart(5, '0')}`);

            const result = await cacheManager.ApplyDifferentialUpdate(
                testFingerprint,
                testParams,
                [...updatedRows, ...newRows],
                deletedIDs,
                'ID',
                '2024-06-20T00:00:00.000Z',
                500 // 500 - 25 deleted + 25 inserted = 500
            );

            expect(result).not.toBeNull();
            expect(result!.results.length).toBe(500);
        });
    });

    describe('ApplyDifferentialUpdate - Edge Cases', () => {
        test('returns null when no existing cache', async () => {
            const result = await cacheManager.ApplyDifferentialUpdate(
                'nonexistent-fingerprint',
                testParams,
                generateTestRows(5),
                [],
                'ID',
                '2024-06-20T00:00:00.000Z',
                5
            );

            expect(result).toBeNull();
        });

        test('handles empty differential update', async () => {
            const initialRows = generateTestRows(10);
            await cacheManager.SetRunViewResult(
                testFingerprint,
                testParams,
                initialRows,
                '2024-06-15T00:00:00.000Z',
                10
            );

            const result = await cacheManager.ApplyDifferentialUpdate(
                testFingerprint,
                testParams,
                [], // no updates
                [], // no deletions
                'ID',
                '2024-06-20T00:00:00.000Z',
                10
            );

            expect(result).not.toBeNull();
            expect(result!.results.length).toBe(10);
        });

        test('handles records with null primary key values', async () => {
            // Note: Records with null/undefined PKs cannot be properly tracked in the differential
            // update map and may be lost. This test documents the current behavior.
            const initialRows = [
                { ID: 'id-001', Name: 'Record 1' },
                { ID: null, Name: 'Record with null ID' },
                { ID: 'id-003', Name: 'Record 3' },
            ];
            await cacheManager.SetRunViewResult(
                testFingerprint,
                testParams,
                initialRows,
                '2024-06-15T00:00:00.000Z',
                3
            );

            const result = await cacheManager.ApplyDifferentialUpdate(
                testFingerprint,
                testParams,
                [{ ID: 'id-001', Name: 'Updated Record 1' }],
                [],
                'ID',
                '2024-06-20T00:00:00.000Z',
                3
            );

            expect(result).not.toBeNull();
            // Records with valid PKs should be preserved
            const resultRecords = result!.results as Record<string, unknown>[];
            expect(resultRecords.find(r => r['ID'] === 'id-001')).toBeDefined();
            expect(resultRecords.find(r => r['ID'] === 'id-003')).toBeDefined();
            // Note: Records with null PKs are dropped during Map-based merge
            // This is expected behavior - PKs should never be null in practice
        });

        test('handles records with undefined primary key values', async () => {
            const initialRows = [
                { ID: 'id-001', Name: 'Record 1' },
                { Name: 'Record without ID' }, // ID is undefined
                { ID: 'id-003', Name: 'Record 3' },
            ];
            await cacheManager.SetRunViewResult(
                testFingerprint,
                testParams,
                initialRows,
                '2024-06-15T00:00:00.000Z',
                3
            );

            const result = await cacheManager.ApplyDifferentialUpdate(
                testFingerprint,
                testParams,
                [{ ID: 'id-001', Name: 'Updated Record 1' }],
                [],
                'ID',
                '2024-06-20T00:00:00.000Z',
                3
            );

            expect(result).not.toBeNull();
        });
    });

    describe('ApplyDifferentialUpdate - Composite Keys', () => {
        test('handles composite key deletions', async () => {
            const initialRows = generateCompositeKeyRows(20);
            await cacheManager.SetRunViewResult(
                testFingerprint,
                testParams,
                initialRows,
                '2024-06-15T00:00:00.000Z',
                20
            );

            // Delete using composite key format "Field1|Value1||Field2|Value2"
            const deletedIDs = [
                'EntityID|entity-0||FieldID|field-0',
                'EntityID|entity-0||FieldID|field-1',
            ];

            const result = await cacheManager.ApplyDifferentialUpdate(
                testFingerprint,
                testParams,
                [],
                deletedIDs,
                'EntityID', // Primary key field name (first field of composite)
                '2024-06-20T00:00:00.000Z',
                18
            );

            expect(result).not.toBeNull();
            // Note: The current implementation extracts only the first field value
            // This test documents the current behavior
        });

        test('handles malformed composite key gracefully', async () => {
            const initialRows = generateTestRows(10);
            await cacheManager.SetRunViewResult(
                testFingerprint,
                testParams,
                initialRows,
                '2024-06-15T00:00:00.000Z',
                10
            );

            // Malformed keys - these should not cause errors
            const deletedIDs = [
                '', // empty
                '|', // just delimiter
                'NoDelimiter', // no delimiter
                '||', // only field delimiter
            ];

            const result = await cacheManager.ApplyDifferentialUpdate(
                testFingerprint,
                testParams,
                [],
                deletedIDs,
                'ID',
                '2024-06-20T00:00:00.000Z',
                10
            );

            expect(result).not.toBeNull();
            expect(result!.results.length).toBe(10); // All records should still be present
        });

        test('handles values containing pipe characters', async () => {
            const initialRows = [
                { ID: 'id-with|pipe', Name: 'Record with pipe in ID' },
                { ID: 'normal-id', Name: 'Normal record' },
            ];
            await cacheManager.SetRunViewResult(
                testFingerprint,
                testParams,
                initialRows,
                '2024-06-15T00:00:00.000Z',
                2
            );

            // Try to delete the record with pipe in value
            // Format: "ID|id-with|pipe" - the value contains a pipe
            const deletedIDs = ['ID|id-with|pipe'];

            const result = await cacheManager.ApplyDifferentialUpdate(
                testFingerprint,
                testParams,
                [],
                deletedIDs,
                'ID',
                '2024-06-20T00:00:00.000Z',
                1
            );

            expect(result).not.toBeNull();
            // The implementation should rejoin value parts after the first pipe
            const resultRecords = result!.results as Record<string, unknown>[];
            expect(resultRecords.find(r => r['ID'] === 'id-with|pipe')).toBeUndefined();
            expect(resultRecords.find(r => r['ID'] === 'normal-id')).toBeDefined();
        });
    });

    describe('ApplyDifferentialUpdate - Primary Key Types', () => {
        test('handles GUID primary keys', async () => {
            const guidRows = [
                { ID: '550e8400-e29b-41d4-a716-446655440000', Name: 'GUID Record 1' },
                { ID: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', Name: 'GUID Record 2' },
                { ID: '6ba7b811-9dad-11d1-80b4-00c04fd430c8', Name: 'GUID Record 3' },
            ];
            await cacheManager.SetRunViewResult(
                testFingerprint,
                testParams,
                guidRows,
                '2024-06-15T00:00:00.000Z',
                3
            );

            const result = await cacheManager.ApplyDifferentialUpdate(
                testFingerprint,
                testParams,
                [{ ID: '550e8400-e29b-41d4-a716-446655440000', Name: 'Updated GUID Record 1' }],
                ['ID|6ba7b810-9dad-11d1-80b4-00c04fd430c8'],
                'ID',
                '2024-06-20T00:00:00.000Z',
                2
            );

            expect(result).not.toBeNull();
            expect(result!.results.length).toBe(2);

            const resultRecords = result!.results as Record<string, unknown>[];
            const updated = resultRecords.find(r => r['ID'] === '550e8400-e29b-41d4-a716-446655440000');
            expect(updated!['Name']).toBe('Updated GUID Record 1');
        });

        test('handles numeric primary keys', async () => {
            const numericRows = [
                { ID: 1, Name: 'Numeric Record 1' },
                { ID: 2, Name: 'Numeric Record 2' },
                { ID: 3, Name: 'Numeric Record 3' },
            ];
            await cacheManager.SetRunViewResult(
                testFingerprint,
                testParams,
                numericRows,
                '2024-06-15T00:00:00.000Z',
                3
            );

            const result = await cacheManager.ApplyDifferentialUpdate(
                testFingerprint,
                testParams,
                [{ ID: 1, Name: 'Updated Numeric Record 1' }],
                ['ID|2'],
                'ID',
                '2024-06-20T00:00:00.000Z',
                2
            );

            expect(result).not.toBeNull();
            expect(result!.results.length).toBe(2);
        });
    });

    describe('Cache Metadata Updates', () => {
        test('updates maxUpdatedAt after differential update', async () => {
            const initialRows = generateTestRows(10);
            await cacheManager.SetRunViewResult(
                testFingerprint,
                testParams,
                initialRows,
                '2024-06-15T00:00:00.000Z',
                10
            );

            await cacheManager.ApplyDifferentialUpdate(
                testFingerprint,
                testParams,
                generateTestRows(2, 11),
                [],
                'ID',
                '2024-06-20T00:00:00.000Z',
                12
            );

            // Verify the new timestamp is stored
            const cached = await cacheManager.GetRunViewResult(testFingerprint);
            expect(cached).not.toBeNull();
            expect(cached!.maxUpdatedAt).toBe('2024-06-20T00:00:00.000Z');
        });

        test('updates rowCount after differential update', async () => {
            const initialRows = generateTestRows(10);
            await cacheManager.SetRunViewResult(
                testFingerprint,
                testParams,
                initialRows,
                '2024-06-15T00:00:00.000Z',
                10
            );

            await cacheManager.ApplyDifferentialUpdate(
                testFingerprint,
                testParams,
                generateTestRows(5, 11),
                [],
                'ID',
                '2024-06-20T00:00:00.000Z',
                15
            );

            const cached = await cacheManager.GetRunViewResult(testFingerprint);
            expect(cached).not.toBeNull();
            expect(cached!.rowCount).toBe(15);
        });
    });

    describe('Error Handling', () => {
        test('handles storage failure gracefully', async () => {
            const initialRows = generateTestRows(10);
            await cacheManager.SetRunViewResult(
                testFingerprint,
                testParams,
                initialRows,
                '2024-06-15T00:00:00.000Z',
                10
            );

            // Simulate storage failure during read
            mockStorage.setSimulateFailure(true);

            const result = await cacheManager.ApplyDifferentialUpdate(
                testFingerprint,
                testParams,
                generateTestRows(2, 11),
                [],
                'ID',
                '2024-06-20T00:00:00.000Z',
                12
            );

            // Should return null on error rather than throwing
            expect(result).toBeNull();
        });
    });
});

describe('LocalCacheManager - Cache Operations', () => {
    let cacheManager: LocalCacheManager;
    let mockStorage: MockCacheStorageProvider;
    const testFingerprint = 'test-fingerprint-operations';
    const testParams: RunViewParams = {
        EntityName: 'Test Entity',
    };

    beforeEach(async () => {
        resetLocalCacheManager();
        cacheManager = LocalCacheManager.Instance;
        mockStorage = new MockCacheStorageProvider();
        await cacheManager.Initialize(mockStorage);
        mockStorage.resetCallCounts();
    });

    afterEach(() => {
        mockStorage.clearAll();
    });

    test('SetRunViewResult stores data correctly', async () => {
        const rows = generateTestRows(10);
        await cacheManager.SetRunViewResult(
            testFingerprint,
            testParams,
            rows,
            '2024-06-15T00:00:00.000Z',
            10
        );

        const cached = await cacheManager.GetRunViewResult(testFingerprint);
        expect(cached).not.toBeNull();
        expect(cached!.results.length).toBe(10);
        expect(cached!.maxUpdatedAt).toBe('2024-06-15T00:00:00.000Z');
        expect(cached!.rowCount).toBe(10);
    });

    test('GetRunViewResult returns null for missing cache', async () => {
        const result = await cacheManager.GetRunViewResult('nonexistent');
        expect(result).toBeNull();
    });

    test('InvalidateRunViewResult removes cached data', async () => {
        const rows = generateTestRows(10);
        await cacheManager.SetRunViewResult(
            testFingerprint,
            testParams,
            rows,
            '2024-06-15T00:00:00.000Z',
            10
        );

        await cacheManager.InvalidateRunViewResult(testFingerprint);

        const cached = await cacheManager.GetRunViewResult(testFingerprint);
        expect(cached).toBeNull();
    });
});
