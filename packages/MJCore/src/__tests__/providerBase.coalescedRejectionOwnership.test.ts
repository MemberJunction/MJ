/**
 * A rejected RunViews execution must only evict ITS OWN dedup entry.
 *
 * InvalidateRunViewDedupCache() can drop an in-flight entry while its query is still running; a newer
 * identical request then takes the same dedup key. The coalesced path's (CoalesceWindowMs > 0) failure
 * handler used to delete the key unconditionally, so the FIRST request's late rejection evicted the
 * SECOND request's live entry and later identical callers re-queried instead of joining it. The
 * uncoalesced path already checked identity; both now do.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProviderConfigDataBase, RunViewResult } from '../generic/interfaces';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { ProviderBase } from '../generic/providerBase';
import { RunViewParams } from '../views/runView';

interface Deferred {
    resolve: (results: RunViewResult[]) => void;
    reject: (error: Error) => void;
}

/** InternalRunViews that parks every call until the test settles it. */
class DeferredRunViewsProvider extends TestMetadataProvider {
    public readonly Calls: Deferred[] = [];

    protected override InternalRunViews<T>(params: RunViewParams[]): Promise<RunViewResult<T>[]> {
        return new Promise<RunViewResult<T>[]>((resolve, reject) => {
            this.Calls.push({
                resolve: (results: RunViewResult[]) => resolve(results as RunViewResult<T>[]),
                reject,
            });
        });
    }
}

const ENTITY = 'Test Entity 1';

function okResults(params: RunViewParams[], marker: string): RunViewResult[] {
    return params.map(() => ({
        Success: true,
        Results: [{ Marker: marker }],
        RowCount: 1,
        TotalRowCount: 1,
        ExecutionTime: 1,
        ErrorMessage: '',
    }));
}

async function waitFor(condition: () => boolean, timeoutMs = 1000): Promise<void> {
    const start = Date.now();
    while (!condition()) {
        if (Date.now() - start > timeoutMs) {
            throw new Error('condition not met in time');
        }
        await new Promise(resolve => setTimeout(resolve, 2));
    }
}

describe('coalesced RunViews: a late rejection never evicts a newer entry for the same key', () => {
    let provider: DeferredRunViewsProvider;
    const testConfig = new ProviderConfigDataBase({}, '__mj', [], [], true);
    const previousCoalesce = ProviderBase.CoalesceWindowMs;
    const previousLinger = ProviderBase.DedupLingerMs;

    beforeEach(async () => {
        provider = new DeferredRunViewsProvider();
        provider.setMockDelay(1);
        await provider.Config(testConfig);
        ProviderBase.CoalesceWindowMs = 5;
        ProviderBase.DedupLingerMs = 5000;
    });

    afterEach(() => {
        ProviderBase.CoalesceWindowMs = previousCoalesce;
        ProviderBase.DedupLingerMs = previousLinger;
    });

    it('keeps the second request joinable after the invalidated first request rejects', async () => {
        const params: RunViewParams[] = [{ EntityName: ENTITY, ExtraFilter: "Name='x'", ResultType: 'simple' }];

        const first = provider.RunViews(params);
        await waitFor(() => provider.Calls.length === 1);

        // A server-side write lands while the first query is in flight.
        provider.InvalidateRunViewDedupCache();

        const second = provider.RunViews(params);
        await waitFor(() => provider.Calls.length === 2);

        // The first (invalidated) execution now fails.
        provider.Calls[0].reject(new Error('first failed'));
        await expect(first).rejects.toThrow('first failed');

        // An identical caller must JOIN the second execution, not start a third.
        const third = provider.RunViews(params);
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(provider.Calls).toHaveLength(2);

        provider.Calls[1].resolve(okResults(params, 'second'));
        const [secondResults, thirdResults] = await Promise.all([second, third]);
        expect(secondResults[0].Results).toEqual([{ Marker: 'second' }]);
        expect(thirdResults[0].Results).toEqual([{ Marker: 'second' }]);
        expect(provider.Calls).toHaveLength(2);
    });

    it('still clears its own entry on rejection so a retry runs fresh', async () => {
        const params: RunViewParams[] = [{ EntityName: ENTITY, ExtraFilter: "Name='y'", ResultType: 'simple' }];

        const first = provider.RunViews(params);
        await waitFor(() => provider.Calls.length === 1);
        provider.Calls[0].reject(new Error('boom'));
        await expect(first).rejects.toThrow('boom');

        const retry = provider.RunViews(params);
        await waitFor(() => provider.Calls.length === 2);
        provider.Calls[1].resolve(okResults(params, 'retry'));
        const results = await retry;
        expect(results[0].Results).toEqual([{ Marker: 'retry' }]);
    });
});
