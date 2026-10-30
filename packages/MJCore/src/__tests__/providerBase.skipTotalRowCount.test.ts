/**
 * The `TotalRowCount` contract on ProviderBase's ways out.
 *
 * A caller that passed `SkipTotalRowCount` gets `undefined`, whichever stage produced the result:
 * a cache hit, a database read, or a batch. Each of those stages has its own reason to fill in a
 * row count (a cached slot written before this contract, a GraphQL `null`, a provider's fallback),
 * so these tests feed each one a number and assert that it does not survive. A caller that did not
 * pass the flag keeps the number it was given, and `count_only` always keeps its count.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderConfigDataBase, RunViewResult } from '../generic/interfaces';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { ProviderBase } from '../generic/providerBase';
import { RunViewParams } from '../views/runView';

const TOTAL_FROM_STAGE = 77;

function resultWithTotal<T>(): RunViewResult<T> {
    return { Success: true, Results: [] as T[], RowCount: 0, TotalRowCount: TOTAL_FROM_STAGE, ExecutionTime: 1, ErrorMessage: '' };
}

class CountContractProvider extends TestMetadataProvider {
    public TrustCache = false;
    public ServeFromCache = false;

    public override get TrustLocalCacheCompletely(): boolean { return this.TrustCache; }

    /** No entity metadata is seeded; these tests are about the result, not entity status. */
    protected override async EntityStatusCheck(): Promise<void> {}

    protected override async InternalRunView<T>(): Promise<RunViewResult<T>> {
        return resultWithTotal<T>();
    }

    protected override async InternalRunViews<T>(params: RunViewParams[]): Promise<RunViewResult<T>[]> {
        return params.map(() => resultWithTotal<T>());
    }

    protected override async PreRunView(params: RunViewParams): ReturnType<ProviderBase['PreRunView']> {
        const pre = await super.PreRunView(params);
        return this.ServeFromCache ? { ...pre, cachedResult: resultWithTotal() } : { ...pre, cachedResult: undefined };
    }
}

describe('ProviderBase — the TotalRowCount contract', () => {
    let provider: CountContractProvider;
    const view: RunViewParams = { EntityName: 'Widgets', BypassCache: true, MaxRows: 1 };

    beforeEach(async () => {
        ProviderBase.DedupLingerMs = 0;
        ProviderBase.CoalesceWindowMs = 0;
        provider = new CountContractProvider();
        provider.setMockDelay(0);
        await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));
    });

    it('a RunView that passed the flag gets undefined, not the number the stage produced', async () => {
        const result = await provider.RunView({ ...view, SkipTotalRowCount: true });
        expect(result.TotalRowCount).toBeUndefined();
    });

    it('a RunView that did not pass the flag keeps its number', async () => {
        const result = await provider.RunView(view);
        expect(result.TotalRowCount).toBe(TOTAL_FROM_STAGE);
    });

    it('count_only ignores the flag', async () => {
        const result = await provider.RunView({ ...view, ResultType: 'count_only', SkipTotalRowCount: true });
        expect(result.TotalRowCount).toBe(TOTAL_FROM_STAGE);
    });

    it('applies per view in a mixed RunViews batch', async () => {
        const results = await provider.RunViews([
            { ...view, ExtraFilter: 'a=1', SkipTotalRowCount: true },
            { ...view, ExtraFilter: 'a=2' },
            { ...view, ExtraFilter: 'a=3', ResultType: 'count_only', SkipTotalRowCount: true },
        ]);
        expect(results.map(r => r.TotalRowCount)).toEqual([undefined, TOTAL_FROM_STAGE, TOTAL_FROM_STAGE]);
    });

    describe('the direct path a trusted cache takes', () => {
        const cacheable: RunViewParams = { EntityName: 'Widgets', MaxRows: 1 };

        beforeEach(() => {
            provider.TrustCache = true;
        });

        it('a cache hit with the flag does not return the number stored in the slot', async () => {
            provider.ServeFromCache = true;
            const result = await provider.RunView({ ...cacheable, SkipTotalRowCount: true });
            expect(result.TotalRowCount).toBeUndefined();
        });

        it('a cache hit without the flag keeps it', async () => {
            provider.ServeFromCache = true;
            const result = await provider.RunView(cacheable);
            expect(result.TotalRowCount).toBe(TOTAL_FROM_STAGE);
        });

        it('a cache miss with the flag gets undefined', async () => {
            const result = await provider.RunView({ ...cacheable, SkipTotalRowCount: true });
            expect(result.TotalRowCount).toBeUndefined();
        });
    });
});
