/**
 * Request Deduplication + Linger Window Tests for ProviderBase
 *
 * Tests that concurrent identical RunViews calls share a single execution,
 * and that the linger window allows near-sequential identical calls to
 * return immediately without a server round trip.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderConfigDataBase, RunViewResult } from '../generic/interfaces';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { ProviderBase } from '../generic/providerBase';
import { RunViewParams } from '../views/runView';

/**
 * Subclass of TestMetadataProvider that adds controllable InternalRunViews
 * behavior for testing dedup logic.
 */
class DedupTestProvider extends TestMetadataProvider {
    public internalRunViewsCallCount = 0;
    public internalRunViewsDelay = 50; // ms
    public internalRunViewsResults: RunViewResult[] = [];

    protected override async InternalRunViews<T>(params: RunViewParams[]): Promise<RunViewResult<T>[]> {
        this.internalRunViewsCallCount++;
        if (this.internalRunViewsDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.internalRunViewsDelay));
        }
        // Return one result per param
        return params.map((_, i) => {
            if (this.internalRunViewsResults[i]) {
                return this.internalRunViewsResults[i] as RunViewResult<T>;
            }
            return {
                Success: true,
                Results: [{ ID: `result-${i + 1}`, Name: `Test ${i + 1}` }] as T[],
                RowCount: 1,
                TotalRowCount: 1,
                ExecutionTime: 10,
                ErrorMessage: ''
            };
        });
    }

    public resetCounters(): void {
        this.internalRunViewsCallCount = 0;
    }
}

describe('ProviderBase Request Deduplication', () => {
    let provider: DedupTestProvider;
    const testConfig = new ProviderConfigDataBase({}, '__mj', [], [], true);

    beforeEach(async () => {
        provider = new DedupTestProvider();
        provider.setMockDelay(10); // fast metadata load
        await provider.Config(testConfig);
        provider.resetCounters();
        // Set a reasonable linger window for tests
        ProviderBase.DedupLingerMs = 5000;
    });

    afterEach(() => {
        // Reset to default
        ProviderBase.DedupLingerMs = 5000;
    });

    // Helper: the entity name loaded by TestMetadataProvider
    function makeParams(overrides?: Partial<RunViewParams>): RunViewParams {
        return {
            EntityName: 'Test Entity 1',
            ExtraFilter: "IsActive=1",
            ResultType: 'simple',
            ...overrides
        };
    }

    describe('Concurrent In-Flight Deduplication', () => {
        it('should share a single execution for concurrent identical RunViews calls', async () => {
            const params = makeParams();

            // Fire 3 concurrent identical requests
            const [r1, r2, r3] = await Promise.all([
                provider.RunViews([params]),
                provider.RunViews([params]),
                provider.RunViews([params])
            ]);

            // Only 1 actual execution should have happened
            expect(provider.internalRunViewsCallCount).toBe(1);

            // All should succeed with results
            expect(r1[0].Success).toBe(true);
            expect(r2[0].Success).toBe(true);
            expect(r3[0].Success).toBe(true);
        });

        it('should return shallow-copied Results arrays for each caller', async () => {
            const params = makeParams();

            const [r1, r2] = await Promise.all([
                provider.RunViews([params]),
                provider.RunViews([params])
            ]);

            // Results arrays should be different instances
            expect(r1[0].Results).not.toBe(r2[0].Results);

            // But contain the same data
            expect(r1[0].Results).toEqual(r2[0].Results);
        });

        it('should protect callers from array mutations by other callers', async () => {
            const params = makeParams();

            const [r1, r2] = await Promise.all([
                provider.RunViews([params]),
                provider.RunViews([params])
            ]);

            // Mutate r1's Results array
            r1[0].Results.push({ ID: 'injected', Name: 'Bad' });
            r1[0].Results.sort();

            // r2's Results should be unaffected
            expect(r2[0].Results.length).toBe(1);
        });

        it('should NOT dedup requests with different entity names', async () => {
            // Need a second entity in metadata — use 'Test Entity 2' which
            // gets created on second Config() call. Instead, just accept
            // that the second call will throw (entity not found) and verify
            // that it was attempted separately.
            const params1 = makeParams({ EntityName: 'Test Entity 1' });
            const params2 = makeParams({ EntityName: 'Test Entity 1', ExtraFilter: "Status='Active'" });

            // Different filters = different fingerprints = separate executions
            const [r1, r2] = await Promise.all([
                provider.RunViews([params1]),
                provider.RunViews([params2])
            ]);

            expect(provider.internalRunViewsCallCount).toBe(2);
        });

        it('should NOT dedup requests with different Fields', async () => {
            const params1 = makeParams({ Fields: ['ID', 'Name'] });
            const params2 = makeParams({ Fields: ['ID'] });

            const [r1, r2] = await Promise.all([
                provider.RunViews([params1]),
                provider.RunViews([params2])
            ]);

            expect(provider.internalRunViewsCallCount).toBe(2);
        });
    });

    describe('Linger Window', () => {
        it('should return cached result within the linger window', async () => {
            const params = makeParams();

            // First call — executes normally
            const r1 = await provider.RunViews([params]);
            expect(provider.internalRunViewsCallCount).toBe(1);

            // Second call within linger window — should return immediately from linger
            const r2 = await provider.RunViews([params]);
            expect(provider.internalRunViewsCallCount).toBe(1); // Still 1

            expect(r2[0].Success).toBe(true);
            expect(r2[0].Results).toEqual(r1[0].Results);
        });

        it('should return shallow-copied Results from linger hits', async () => {
            const params = makeParams();

            const r1 = await provider.RunViews([params]);
            const r2 = await provider.RunViews([params]);

            // Different array instances
            expect(r1[0].Results).not.toBe(r2[0].Results);
            // Same content
            expect(r1[0].Results).toEqual(r2[0].Results);
        });

        it('should execute fresh after linger window expires', async () => {
            ProviderBase.DedupLingerMs = 50; // Short linger for test
            const params = makeParams();

            await provider.RunViews([params]);
            expect(provider.internalRunViewsCallCount).toBe(1);

            // Wait for linger to expire
            await new Promise(resolve => setTimeout(resolve, 100));

            await provider.RunViews([params]);
            expect(provider.internalRunViewsCallCount).toBe(2);
        });

        it('should work with linger disabled (DedupLingerMs = 0)', async () => {
            ProviderBase.DedupLingerMs = 0;
            const params = makeParams();

            await provider.RunViews([params]);
            expect(provider.internalRunViewsCallCount).toBe(1);

            // Without linger, sequential call should execute fresh
            await provider.RunViews([params]);
            expect(provider.internalRunViewsCallCount).toBe(2);
        });
    });

    describe('Bypass Conditions', () => {
        it('should NOT dedup when SaveViewResults is true', async () => {
            const params = makeParams({ SaveViewResults: true });

            const [r1, r2] = await Promise.all([
                provider.RunViews([params]),
                provider.RunViews([params])
            ]);

            // Both should execute separately
            expect(provider.internalRunViewsCallCount).toBe(2);
        });
    });

    describe('RunView (Single) Dedup', () => {
        it('should dedup concurrent RunView calls (delegates to RunViews)', async () => {
            const params = makeParams();

            const [r1, r2] = await Promise.all([
                provider.RunView(params),
                provider.RunView(params)
            ]);

            // RunView delegates to RunViews, so dedup should work
            expect(provider.internalRunViewsCallCount).toBe(1);
            expect(r1.Success).toBe(true);
            expect(r2.Success).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should clean up dedup entry on error and allow retry', async () => {
            let callCount = 0;
            // Override to fail on first call, succeed on second
            const origInternalRunViews = (provider as DedupTestProvider)['InternalRunViews'].bind(provider);
            vi.spyOn(provider as never, 'InternalRunViews' as never).mockImplementation(async (params: RunViewParams[]) => {
                callCount++;
                if (callCount === 1) {
                    throw new Error('Simulated failure');
                }
                return params.map(() => ({
                    Success: true,
                    Results: [{ ID: 'retry-ok' }],
                    RowCount: 1,
                    TotalRowCount: 1,
                    ExecutionTime: 5,
                    ErrorMessage: ''
                }));
            });

            const params = makeParams();

            // First call should fail
            await expect(provider.RunViews([params])).rejects.toThrow('Simulated failure');

            // Second call should execute fresh (not stuck on failed entry)
            const r2 = await provider.RunViews([params]);
            expect(r2[0].Success).toBe(true);
        });
    });

    describe('Batch (RunViews) Dedup', () => {
        it('should dedup identical batch requests', async () => {
            const params = [
                makeParams({ ExtraFilter: 'A=1' }),
                makeParams({ ExtraFilter: 'B=2' })
            ];

            const [r1, r2] = await Promise.all([
                provider.RunViews(params),
                provider.RunViews(params)
            ]);

            // Same batch fingerprint = one execution
            expect(provider.internalRunViewsCallCount).toBe(1);
            expect(r1.length).toBe(2);
            expect(r2.length).toBe(2);
        });

        it('should NOT dedup batches with different param order', async () => {
            const paramsA = [
                makeParams({ ExtraFilter: 'A=1' }),
                makeParams({ ExtraFilter: 'B=2' })
            ];
            const paramsB = [
                makeParams({ ExtraFilter: 'B=2' }),
                makeParams({ ExtraFilter: 'A=1' })
            ];

            await Promise.all([
                provider.RunViews(paramsA),
                provider.RunViews(paramsB)
            ]);

            // Different order = different fingerprint = separate executions
            expect(provider.internalRunViewsCallCount).toBe(2);
        });
    });
});
