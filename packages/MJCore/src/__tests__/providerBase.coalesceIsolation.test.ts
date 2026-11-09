/**
 * One failing RunViews caller must not fail the callers coalesced with it (#6278, #6061).
 *
 * The client coalescer merges concurrent RunViews from unrelated callers into one batch. A caller
 * naming an unknown entity, or any failure of the merged batch, used to reject every caller in the
 * window with that one error.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProviderConfigDataBase, RunViewResult } from '../generic/interfaces';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { ProviderBase } from '../generic/providerBase';
import { RunViewParams } from '../views/runView';

const ENTITY = 'Test Entity 1';
const POISON_FILTER = 'Poison=1';

/** Records each InternalRunViews batch; any batch holding the poison filter fails as a whole. */
class IsolationTestProvider extends TestMetadataProvider {
    public Batches: RunViewParams[][] = [];

    protected override async InternalRunViews<T>(params: RunViewParams[]): Promise<RunViewResult<T>[]> {
        this.Batches.push([...params]);
        if (params.some(p => p.ExtraFilter === POISON_FILTER)) {
            throw new Error('batch failed');
        }
        return params.map(p => ({
            Success: true,
            Results: [{ Filter: (p.ExtraFilter as string) || '' }] as T[],
            RowCount: 1,
            TotalRowCount: 1,
            ExecutionTime: 1,
            ErrorMessage: '',
        }));
    }
}

function makeParams(extraFilter: string, entityName: string = ENTITY): RunViewParams {
    return { EntityName: entityName, ExtraFilter: extraFilter, ResultType: 'simple' };
}

describe('coalesced RunViews: one failing caller does not fail the others', () => {
    let provider: IsolationTestProvider;
    const testConfig = new ProviderConfigDataBase({}, '__mj', [], [], true);
    const previousCoalesce = ProviderBase.CoalesceWindowMs;
    const previousLinger = ProviderBase.DedupLingerMs;

    beforeEach(async () => {
        provider = new IsolationTestProvider();
        provider.setMockDelay(1);
        await provider.Config(testConfig);
        provider.Batches = [];
        ProviderBase.CoalesceWindowMs = 20;
        ProviderBase.DedupLingerMs = 0;
    });

    afterEach(() => {
        ProviderBase.CoalesceWindowMs = previousCoalesce;
        ProviderBase.DedupLingerMs = previousLinger;
    });

    it('a caller naming an unknown entity fails alone; the other caller resolves', async () => {
        const good = provider.RunViews([makeParams('A=1')]);
        const bad = provider.RunViews([makeParams('B=2', 'No Such Entity')]);

        const [goodResult, badResult] = await Promise.allSettled([good, bad]);

        expect(goodResult.status).toBe('fulfilled');
        if (goodResult.status === 'fulfilled') {
            expect(goodResult.value[0].Results[0]).toMatchObject({ Filter: 'A=1' });
        }
        expect(badResult.status).toBe('rejected');
        if (badResult.status === 'rejected') {
            expect(String(badResult.reason)).toContain('No Such Entity');
        }
        // The unknown-entity caller never joined the merged batch.
        expect(provider.Batches.some(b => b.some(p => p.EntityName === 'No Such Entity'))).toBe(false);
    });

    it('two good callers still merge when a third names an unknown entity', async () => {
        const a = provider.RunViews([makeParams('A=1')]);
        const b = provider.RunViews([makeParams('B=2')]);
        const bad = provider.RunViews([makeParams('C=3', 'No Such Entity')]);

        const [aResult, bResult, badResult] = await Promise.allSettled([a, b, bad]);

        expect(aResult.status).toBe('fulfilled');
        expect(bResult.status).toBe('fulfilled');
        expect(badResult.status).toBe('rejected');
        expect(provider.Batches).toHaveLength(1);
        expect(provider.Batches[0].map(p => p.ExtraFilter)).toEqual(['A=1', 'B=2']);
    });

    it('a failed merged batch re-runs each caller on its own', async () => {
        const good = provider.RunViews([makeParams('A=1')]);
        const poisoned = provider.RunViews([makeParams(POISON_FILTER)]);

        const [goodResult, poisonedResult] = await Promise.allSettled([good, poisoned]);

        expect(goodResult.status).toBe('fulfilled');
        if (goodResult.status === 'fulfilled') {
            expect(goodResult.value[0].Results[0]).toMatchObject({ Filter: 'A=1' });
        }
        expect(poisonedResult.status).toBe('rejected');
        if (poisonedResult.status === 'rejected') {
            expect(String(poisonedResult.reason)).toContain('batch failed');
        }
        // One merged attempt, then one batch per caller.
        expect(provider.Batches).toHaveLength(3);
        expect(provider.Batches[0]).toHaveLength(2);
        expect(provider.Batches.slice(1).map(b => b.length)).toEqual([1, 1]);
    });

    it('the success path still issues one merged batch', async () => {
        const results = await Promise.all([
            provider.RunViews([makeParams('A=1')]),
            provider.RunViews([makeParams('B=2')]),
        ]);

        expect(provider.Batches).toHaveLength(1);
        expect(results[0][0].Results[0]).toMatchObject({ Filter: 'A=1' });
        expect(results[1][0].Results[0]).toMatchObject({ Filter: 'B=2' });
    });

    it('a single caller asking for an unknown entity still fails its own call', async () => {
        await expect(
            provider.RunViews([makeParams('A=1'), makeParams('B=2', 'No Such Entity')])
        ).rejects.toThrow('No Such Entity');
    });
});
