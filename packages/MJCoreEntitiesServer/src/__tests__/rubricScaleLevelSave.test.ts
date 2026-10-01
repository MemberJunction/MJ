import { describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/core-entities', () => {
    class MJRubricScaleLevelEntity {
        public ID = 'level-1';
        public ScaleID = 'scale-1';
        public Label = 'High';
        public Description: string | null = 'wording';
        public Value = 1;
        public NormalizedValue = 1;
        public ProviderToUse: { RunView: (params: { EntityName: string }) => Promise<{ Success: boolean; Results: unknown[] }> } | null = null;
        public ContextCurrentUser = { ID: 'user-1' };
        public async ValidateAsync(): Promise<{ Success: boolean; Errors: { Message?: string }[] }> {
            return { Success: true, Errors: [] };
        }
    }
    return { MJRubricScaleLevelEntity };
});

import { MJRubricScaleLevelEntityServer } from '../custom/MJRubricScaleLevelEntityServer.server.js';

function provider() {
    return {
        async RunView(params: { EntityName: string }) {
            if (params.EntityName === 'MJ: Rubric Criteria') return { Success: true, Results: [{ RubricVersionID: 'version-1' }] };
            if (params.EntityName === 'MJ: Rubric Versions') return { Success: true, Results: [{ ID: 'version-1', Status: 'Published' }] };
            if (params.EntityName === 'MJ: Rubric Scale Levels') {
            const filter = (params as { ExtraFilter?: string }).ExtraFilter ?? '';
            if (filter.includes("ID=''")) return { Success: true, Results: [] };
            return { Success: true, Results: [{ ID: 'level-1', Value: 1, NormalizedValue: 1, Label: 'High', Description: 'wording' }] };
        }
            if (params.EntityName === 'MJ: Rubric Scales') return { Success: true, Results: [{ ID: 'scale-1', ScaleType: 'Levels', HigherIsBetter: true }] };
            return { Success: true, Results: [] };
        },
    };
}

describe('MJRubricScaleLevelEntityServer.ValidateAsync', () => {
    it('refuses a normalized-value edit and allows a description edit', async () => {
        const changed = new MJRubricScaleLevelEntityServer();
        const valueHost = changed as unknown as { NormalizedValue: number; ProviderToUse: ReturnType<typeof provider> };
        valueHost.ProviderToUse = provider();
        valueHost.NormalizedValue = 0.4;
        const refused = await changed.ValidateAsync();
        expect(refused.Success).toBe(false);

        const described = new MJRubricScaleLevelEntityServer();
        const descriptionHost = described as unknown as { Description: string; ProviderToUse: ReturnType<typeof provider> };
        descriptionHost.ProviderToUse = provider();
        descriptionHost.Description = 'clearer';
        const allowed = await described.ValidateAsync();
        expect(allowed.Success).toBe(true);
    });

    it('refuses a new level on a scale a published version uses', async () => {
        const created = new MJRubricScaleLevelEntityServer();
        const host = created as unknown as { ID: string; ProviderToUse: ReturnType<typeof provider> };
        host.ID = '';
        host.ProviderToUse = provider();
        const refused = await created.ValidateAsync();
        expect(refused.Success).toBe(false);
    });
});
