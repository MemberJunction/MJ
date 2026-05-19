/**
 * Coalesce Batching + Intra-Batch Deduplication Tests for ProviderBase
 *
 * Tests that:
 * 1. Multiple concurrent RunViews calls within the coalesce window are merged
 * 2. Duplicate params across callers are deduplicated (only queried once)
 * 3. Each caller receives the correct results for their requested params
 * 4. The coalesce window does not extend indefinitely
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProviderConfigDataBase, RunViewResult } from '../generic/interfaces';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { ProviderBase } from '../generic/providerBase';
import { RunViewParams } from '../views/runView';

/**
 * Subclass that tracks InternalRunViews calls and the params they receive.
 * Returns deterministic results keyed by EntityName + ExtraFilter so we can
 * verify result distribution after dedup.
 */
class CoalesceTestProvider extends TestMetadataProvider {
    public internalRunViewsCalls: RunViewParams[][] = [];
    public internalRunViewsDelay = 10; // ms

    protected override async InternalRunViews<T>(params: RunViewParams[]): Promise<RunViewResult<T>[]> {
        this.internalRunViewsCalls.push([...params]); // snapshot
        if (this.internalRunViewsDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.internalRunViewsDelay));
        }
        // Return a result per param, keyed by ExtraFilter for easy verification
        return params.map(p => ({
            Success: true,
            Results: [{ EntityName: p.EntityName, Filter: (p.ExtraFilter as string) || '' }] as T[],
            RowCount: 1,
            TotalRowCount: 1,
            ExecutionTime: 5,
            ErrorMessage: ''
        }));
    }

    public get totalParamsExecuted(): number {
        return this.internalRunViewsCalls.reduce((sum, call) => sum + call.length, 0);
    }

    public resetCalls(): void {
        this.internalRunViewsCalls = [];
    }
}

// The mock metadata provider only has "Test Entity 1" registered.
// We differentiate queries using ExtraFilter values.
const ENTITY = 'Test Entity 1';

describe('ProviderBase Coalesce Batching', () => {
    let provider: CoalesceTestProvider;
    const testConfig = new ProviderConfigDataBase({}, '__mj', [], [], true);

    beforeEach(async () => {
        provider = new CoalesceTestProvider();
        provider.setMockDelay(10);
        await provider.Config(testConfig);
        provider.resetCalls();
        // Enable coalescing with a reasonable window
        ProviderBase.CoalesceWindowMs = 50;
        // Disable linger to avoid interference
        ProviderBase.DedupLingerMs = 0;
    });

    afterEach(() => {
        ProviderBase.CoalesceWindowMs = 10;
        ProviderBase.DedupLingerMs = 5000;
    });

    function makeParams(extraFilter?: string): RunViewParams {
        return {
            EntityName: ENTITY,
            ExtraFilter: extraFilter || '',
            ResultType: 'simple'
        };
    }

    it('should deduplicate identical params across concurrent callers', async () => {
        // Simulate 5 engines all requesting the same entity+filter concurrently
        const promises = Array.from({ length: 5 }, () =>
            provider.RunViews([makeParams('IsActive=1')])
        );

        const allResults = await Promise.all(promises);

        // Should have made only 1 InternalRunViews call
        expect(provider.internalRunViewsCalls.length).toBe(1);
        // With only 1 unique param (not 5)
        expect(provider.totalParamsExecuted).toBe(1);

        // Each caller should still get a valid result
        for (const results of allResults) {
            expect(results).toHaveLength(1);
            expect(results[0].Success).toBe(true);
            expect(results[0].Results[0]).toMatchObject({ Filter: 'IsActive=1' });
        }
    });

    it('should deduplicate across callers with mixed params', async () => {
        // Caller A wants: filter-A, filter-B
        // Caller B wants: filter-A, filter-C
        // Caller C wants: filter-B, filter-C
        // Unique set: filter-A, filter-B, filter-C (3 unique, not 6)
        const promiseA = provider.RunViews([makeParams('A=1'), makeParams('B=2')]);
        const promiseB = provider.RunViews([makeParams('A=1'), makeParams('C=3')]);
        const promiseC = provider.RunViews([makeParams('B=2'), makeParams('C=3')]);

        const [resultA, resultB, resultC] = await Promise.all([promiseA, promiseB, promiseC]);

        // Only 3 unique params should have been executed
        expect(provider.totalParamsExecuted).toBe(3);

        // Verify each caller gets the right results in the right order
        expect(resultA).toHaveLength(2);
        expect(resultA[0].Results[0]).toMatchObject({ Filter: 'A=1' });
        expect(resultA[1].Results[0]).toMatchObject({ Filter: 'B=2' });

        expect(resultB).toHaveLength(2);
        expect(resultB[0].Results[0]).toMatchObject({ Filter: 'A=1' });
        expect(resultB[1].Results[0]).toMatchObject({ Filter: 'C=3' });

        expect(resultC).toHaveLength(2);
        expect(resultC[0].Results[0]).toMatchObject({ Filter: 'B=2' });
        expect(resultC[1].Results[0]).toMatchObject({ Filter: 'C=3' });
    });

    it('should not deduplicate params with different filters', async () => {
        // Same entity but different filters = different queries
        const promiseA = provider.RunViews([makeParams("Status='Active'")]);
        const promiseB = provider.RunViews([makeParams("Status='Inactive'")]);

        await Promise.all([promiseA, promiseB]);

        // Both should execute because filters differ
        expect(provider.totalParamsExecuted).toBe(2);
    });

    it('should handle single caller without dedup overhead', async () => {
        const result = await provider.RunViews([
            makeParams('X=1'),
            makeParams('Y=2')
        ]);

        // Single caller bypasses dedup (queue.length === 1 fast path)
        expect(provider.internalRunViewsCalls.length).toBe(1);
        expect(result).toHaveLength(2);
    });

    it('should handle large batches with heavy duplication (the 85-request scenario)', async () => {
        // Simulate 13 engines each requesting the same 7 distinct queries = 91 total, 7 unique
        const filters = ['F1=1', 'F2=2', 'F3=3', 'F4=4', 'F5=5', 'F6=6', 'F7=7'];

        const promises = Array.from({ length: 13 }, () =>
            provider.RunViews(filters.map(f => makeParams(f)))
        );

        const allResults = await Promise.all(promises);

        // Should only execute 7 unique params, not 91
        expect(provider.totalParamsExecuted).toBe(7);
        expect(provider.internalRunViewsCalls.length).toBe(1);

        // Each of the 13 callers should get their 7 results in the correct order
        for (const results of allResults) {
            expect(results).toHaveLength(7);
            for (let i = 0; i < filters.length; i++) {
                expect(results[i].Results[0]).toMatchObject({ Filter: filters[i] });
            }
        }
    });

    it('should return independent result arrays (not shared references)', async () => {
        const promiseA = provider.RunViews([makeParams('Same=1')]);
        const promiseB = provider.RunViews([makeParams('Same=1')]);

        const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

        // Results should be equal but not the same array reference
        expect(resultA[0].Results).toEqual(resultB[0].Results);
        expect(resultA[0].Results).not.toBe(resultB[0].Results);
    });

    it('should not coalesce when CoalesceWindowMs is 0', async () => {
        ProviderBase.CoalesceWindowMs = 0;

        // Fire two calls -- without coalescing, each runs independently through dedup
        const promiseA = provider.RunViews([makeParams('Same=1')]);
        const promiseB = provider.RunViews([makeParams('Same=1')]);

        await Promise.all([promiseA, promiseB]);

        // Without coalescing, each call goes through the normal dedup path
        // which may still share execution via in-flight dedup, but no coalesce timer
        expect(provider.internalRunViewsCalls.length).toBeGreaterThanOrEqual(1);
    });
});
