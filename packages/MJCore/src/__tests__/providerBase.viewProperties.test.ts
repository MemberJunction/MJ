/**
 * In the browser, a run carrying view properties goes to the server as it is: it is never merged
 * with other callers' runs (a merged batch with a CacheLocal member takes the cache-check transport,
 * which carries dynamic runs only and would drop the view and its properties), never cached in the
 * browser, and never shares a dedup slot with a run that has different property values.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProviderConfigDataBase, RunViewResult } from '../generic/interfaces';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { ProviderBase } from '../generic/providerBase';
import { RunViewParams } from '../views/runView';

class PropertiesClientProvider extends TestMetadataProvider {
    public Calls: RunViewParams[][] = [];

    protected override async InternalRunViews<T>(params: RunViewParams[]): Promise<RunViewResult<T>[]> {
        this.Calls.push([...params]);
        await new Promise(resolve => setTimeout(resolve, 5));
        return params.map(() => ({ Success: true, Results: [] as T[], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' }));
    }

    public IsCacheEligible(params: RunViewParams): boolean {
        return this.runViewCacheEligible(params);
    }
}

const ENTITY = 'Test Entity 1';
const CHAPTER_A = '11111111-1111-4111-8111-111111111111';
const CHAPTER_B = '22222222-2222-4222-8222-222222222222';

describe('ProviderBase (browser) with view properties', () => {
    let provider: PropertiesClientProvider;

    beforeEach(async () => {
        provider = new PropertiesClientProvider();
        provider.setMockDelay(0);
        await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));
        provider.Calls = [];
        ProviderBase.CoalesceWindowMs = 50;
        ProviderBase.DedupLingerMs = 0;
    });

    afterEach(() => {
        ProviderBase.CoalesceWindowMs = 10;
        ProviderBase.DedupLingerMs = 5000;
    });

    it('never merges a run carrying properties with a concurrent run', async () => {
        await Promise.all([
            provider.RunViews([{ EntityName: ENTITY, ExtraFilter: 'A=1' }]),
            provider.RunViews([{ ViewID: 'v1', EntityName: ENTITY, Properties: { Chapter: CHAPTER_A } }]),
        ]);
        expect(provider.Calls).toHaveLength(2);
        expect(provider.Calls.find(c => c[0].ViewID === 'v1')).toEqual([expect.objectContaining({ Properties: { Chapter: CHAPTER_A } })]);
    });

    it('still merges runs without properties', async () => {
        await Promise.all([
            provider.RunViews([{ EntityName: ENTITY, ExtraFilter: 'A=1' }]),
            provider.RunViews([{ EntityName: ENTITY, ExtraFilter: 'B=1' }]),
        ]);
        expect(provider.Calls).toHaveLength(1);
    });

    it('never caches a run carrying properties in the browser, even an empty map', () => {
        expect(provider.IsCacheEligible({ ViewID: 'v1', CacheLocal: true })).toBe(true);
        expect(provider.IsCacheEligible({ ViewID: 'v1', CacheLocal: true, Properties: {} })).toBe(false);
        expect(provider.IsCacheEligible({ ViewID: 'v1', CacheLocal: true, Properties: { Chapter: CHAPTER_A } })).toBe(false);
    });

    it('keys the dedup window on property values, so one chapter never answers another', async () => {
        ProviderBase.DedupLingerMs = 5000;
        const run = (chapter: string) => provider.RunViews([{ ViewID: 'v1', EntityName: ENTITY, Properties: { Chapter: chapter } }]);
        await run(CHAPTER_A);
        await run(CHAPTER_A);
        expect(provider.Calls).toHaveLength(1);
        await run(CHAPTER_B);
        expect(provider.Calls).toHaveLength(2);
        expect(provider.Calls[1][0].Properties).toEqual({ Chapter: CHAPTER_B });
    });
});
