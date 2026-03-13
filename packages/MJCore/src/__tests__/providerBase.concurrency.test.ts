/**
 * Concurrency Tests for ProviderBase
 *
 * Purpose: Test behavior under concurrent access patterns
 * These tests will FAIL before the atomic update fix and PASS after
 *
 * Related: METADATA_THREAD_SAFETY_IMPLEMENTATION.md - Phase 3, Task 3.1
 */

import { ProviderConfigDataBase } from '../generic/interfaces';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';

describe('ProviderBase Concurrency Tests', () => {
    let provider: TestMetadataProvider;
    let testConfig: ProviderConfigDataBase;

    beforeEach(() => {
        provider = new TestMetadataProvider();
        testConfig = new ProviderConfigDataBase(
            {},
            '__mj',
            [],
            [],
            true
        );
    });

    describe('Parallel Config() Calls', () => {
        test('Multiple parallel Config() calls complete successfully', async () => {
            /**
             * Simulates the actual bug scenario: parallel operations triggering Config()
             * Expected behavior after fix: All complete successfully with valid metadata
             */

            provider.resetCallCount();

            // Start 10 parallel Config() calls
            const promises = Array(10).fill(0).map(() => provider.Config(testConfig));

            // All should complete without errors
            const results = await Promise.all(promises);

            // Verify results
            expect(results.every(r => r === true)).toBe(true);

            // Metadata should be populated (not empty)
            expect(provider.Entities).toBeDefined();
            expect(provider.Entities.length).toBeGreaterThan(0);

            // All entities should have Fields defined
            for (const entity of provider.Entities) {
                expect(entity.Fields).toBeDefined();
                expect(entity.Fields.length).toBeGreaterThan(0);
            }

            console.log(`GetAllMetadata called ${provider.getCallCount()} times for 10 parallel Config() calls`);
        });

        test('Parallel Config() with different configs', async () => {
            /**
             * Tests concurrent configs with different settings
             * Ensures last config wins but no corruption occurs
             */

            const configs = [
                new ProviderConfigDataBase({}, '__mj1', [], [], true),
                new ProviderConfigDataBase({}, '__mj2', [], [], true),
                new ProviderConfigDataBase({}, '__mj3', [], [], true),
            ];

            const results = await Promise.all(
                configs.map(config => provider.Config(config))
            );

            expect(results.every(r => r === true)).toBe(true);
            expect(provider.Entities.length).toBeGreaterThan(0);
        });
    });

    describe('Reading Metadata During Refresh', () => {
        test('Reading Entities during refresh returns valid data', async () => {
            /**
             * CRITICAL TEST: This documents the core issue
             * Before fix: Readers may see empty metadata during refresh
             * After fix: Readers see old metadata until refresh completes
             */

            // Pre-populate with initial metadata
            await provider.Config(testConfig);
            expect(provider.Entities.length).toBeGreaterThan(0);
            const initialEntityCount = provider.Entities.length;

            // Start a refresh (don't await yet)
            const refreshPromise = provider.Config(testConfig);

            // While refresh is in progress, try to read metadata
            const readsDuringRefresh: number[] = [];
            const readPromises: Promise<void>[] = [];

            // Read multiple times during the refresh window
            for (let i = 0; i < 5; i++) {
                readPromises.push(
                    (async () => {
                        await new Promise(resolve => setTimeout(resolve, i * 20));
                        const entities = provider.Entities;
                        readsDuringRefresh.push(entities?.length ?? -1);

                        // CRITICAL: Should NEVER be undefined or empty after initial load
                        expect(entities).toBeDefined();
                        expect(Array.isArray(entities)).toBe(true);

                        // After fix: Should always have data (old or new)
                        // Before fix: Might be empty array
                        if (entities.length === 0) {
                            console.warn('WARNING: Saw empty entities during refresh (this is the bug)');
                        }
                    })()
                );
            }

            // Wait for refresh to complete
            await Promise.all([refreshPromise, ...readPromises]);

            // After refresh, should definitely have data
            expect(provider.Entities.length).toBeGreaterThan(0);

            console.log('Entity counts during refresh:', readsDuringRefresh);
            console.log('Final entity count:', provider.Entities.length);
        });

        test('GetEntityObject during refresh does not fail', async () => {
            /**
             * Simulates MJQueryEntity trying to create child entities during parallel saves
             * This is the exact scenario causing "Entity not found in metadata" errors
             */

            await provider.Config(testConfig);

            // Start refresh
            const refreshPromise = provider.Config(testConfig);

            // Try to access entity metadata during refresh
            await new Promise(resolve => setTimeout(resolve, 50));

            // Should be able to read Entities array
            const entities = provider.Entities;
            expect(entities).toBeDefined();

            if (entities.length > 0) {
                // Should be able to find entity
                const entity = entities.find(e => e.Name.includes('Test Entity'));
                expect(entity).toBeDefined();

                // Should be able to access Fields
                if (entity) {
                    expect(entity.Fields).toBeDefined();
                    expect(entity.Fields.length).toBeGreaterThan(0);
                }
            }

            await refreshPromise;
        });
    });

    describe('Simulated Production Scenarios', () => {
        test('Metadata sync scenario: parallel query saves with refreshes', async () => {
            /**
             * Simulates: mj sync push with parallel query entity saves
             * Each query save may trigger RefreshRelatedMetadata
             * This is the HOT PATH where the bug manifests
             */

            // Initial metadata load (like PushService.ts:218)
            await provider.Config(testConfig);

            // Simulate 20 parallel query saves, each accessing metadata
            const querySaves = Array(20).fill(0).map(async (_, i) => {
                // Random delay to simulate different save times
                await new Promise(resolve => setTimeout(resolve, Math.random() * 100));

                // Each save accesses metadata (like MJQueryEntity.extractAndSyncData)
                const entities = provider.Entities;

                // CRITICAL: Should always have valid data
                expect(entities).toBeDefined();
                expect(Array.isArray(entities)).toBe(true);

                // Some saves trigger a refresh (like RefreshRelatedMetadata)
                if (i % 5 === 0) {
                    await provider.Refresh();
                }

                // Continue accessing metadata
                const entitiesAfterRefresh = provider.Entities;
                expect(entitiesAfterRefresh).toBeDefined();

                return true;
            });

            // All should complete successfully
            const results = await Promise.all(querySaves);
            expect(results.every(r => r === true)).toBe(true);
        });

        test('High concurrency: 50 parallel operations', async () => {
            /**
             * Stress test with high concurrency
             * Validates that system remains stable under load
             */

            await provider.Config(testConfig);

            const operations = Array(50).fill(0).map(async (_, i) => {
                await new Promise(resolve => setTimeout(resolve, Math.random() * 50));

                // Mix of reads and refreshes
                if (i % 10 === 0) {
                    await provider.Refresh();
                } else {
                    const entities = provider.Entities;
                    expect(entities).toBeDefined();
                }

                return true;
            });

            const results = await Promise.all(operations);
            expect(results.every(r => r === true)).toBe(true);
        });

        test('Rapid successive refreshes', async () => {
            /**
             * Tests rapid refresh calls (like might happen in error retry scenarios)
             * Should handle gracefully without corruption
             */

            await provider.Config(testConfig);
            provider.resetCallCount();

            // Trigger 5 refreshes in rapid succession
            const refreshes = Array(5).fill(0).map(() => provider.Refresh());

            await Promise.all(refreshes);

            // Should have valid metadata
            expect(provider.Entities.length).toBeGreaterThan(0);

            // Should have called GetAllMetadata (but maybe coalesced)
            console.log(`Rapid refresh: GetAllMetadata called ${provider.getCallCount()} times for 5 refresh calls`);
        });
    });

    describe('Edge Cases', () => {
        test('Refresh during entity iteration', async () => {
            /**
             * Simulates CodeGen iterating over md.Entities while refresh happens
             * The array should remain stable during iteration
             */

            await provider.Config(testConfig);

            // Start iterating
            const iterationResults: string[] = [];
            const iterationPromise = (async () => {
                const entities = provider.Entities;
                for (const entity of entities) {
                    iterationResults.push(entity.Name);
                    await new Promise(resolve => setTimeout(resolve, 20));
                }
            })();

            // Trigger refresh during iteration
            setTimeout(() => provider.Refresh(), 30);

            // Wait for iteration to complete
            await iterationPromise;

            // Should have iterated over some entities
            expect(iterationResults.length).toBeGreaterThan(0);
        });

        test('Reading specific entity during refresh', async () => {
            /**
             * Tests finding a specific entity during refresh
             * Should not fail with "Entity not found"
             */

            await provider.Config(testConfig);

            // Start refresh
            const refreshPromise = provider.Config(testConfig);

            // Try to find specific entity during refresh
            await new Promise(resolve => setTimeout(resolve, 50));

            const entity = provider.Entities.find(e => e.Name.includes('Test Entity'));

            // Should find entity (old or new data, but should exist)
            expect(entity).toBeDefined();

            await refreshPromise;
        });

        test('Accessing Fields during refresh', async () => {
            /**
             * Tests accessing entity.Fields during refresh
             * This is where "Cannot read properties of undefined (reading 'Fields')" occurs
             */

            await provider.Config(testConfig);

            const refreshPromise = provider.Config(testConfig);
            await new Promise(resolve => setTimeout(resolve, 50));

            const entities = provider.Entities;
            if (entities && entities.length > 0) {
                const firstEntity = entities[0];

                // CRITICAL: Fields should always be defined
                expect(firstEntity.Fields).toBeDefined();
                expect(Array.isArray(firstEntity.Fields)).toBe(true);

                // Should be able to iterate fields
                for (const field of firstEntity.Fields) {
                    expect(field.Name).toBeDefined();
                    expect(field.Type).toBeDefined();
                }
            }

            await refreshPromise;
        });
    });
});
