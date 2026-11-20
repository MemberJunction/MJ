import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunView, RunViewResult, UserInfo } from '@memberjunction/core';

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: { Instance: { Config: vi.fn(), Models: [], Prompts: [] } },
}));

vi.mock('@memberjunction/ai-prompts', () => ({
    AIEmbeddingRunner: class {},
    AIPromptRunner: class {},
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
    AIPromptParams: class {},
}));

vi.mock('@memberjunction/clustering-engine', () => ({
    ClusteringEngine: class {},
    InMemoryVectorSource: class {},
}));

import { GenerateSeedTaxonomy } from '../SeedTaxonomy';

describe('GenerateSeedTaxonomy', () => {
    const contextUser = { ID: 'user-1' } as unknown as UserInfo;

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('does not put a source ID that is not a UUID into a filter', async () => {
        const empty: RunViewResult = { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
        const spy = vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue(empty);
        const marker = "' OR '1'='1";

        await GenerateSeedTaxonomy(`11111111-2222-3333-4444-555555555555${marker}`, 1, contextUser).catch(() => undefined);

        const filters = spy.mock.calls.map((c) => String(c[0].ExtraFilter ?? ''));
        expect(filters.filter((f) => f.includes(marker))).toEqual([]);
    });
});
