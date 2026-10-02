import { beforeEach, describe, expect, it, vi } from 'vitest';

const rows = new Map<string, Record<string, unknown>[]>();

vi.mock('@memberjunction/core', () => ({
    RunView: {
        FromMetadataProvider() {
            return {
                async RunView(params: { EntityName: string }) {
                    return { Success: true, Results: rows.get(params.EntityName) ?? [] };
                },
            };
        },
    },
}));

import { ProviderProductionCatalog } from '../productionSamplingCatalog.js';

describe('ProviderProductionCatalog', () => {
    beforeEach(() => rows.clear());

    it('copies EvaluatorConfig from the agent rubric row', async () => {
        rows.set('MJ: AI Agent Rubrics', [{
            AgentID: 'agent',
            RubricID: 'rubric',
            SampleRate: 1,
            Status: 'Active',
            Purpose: 'ProductionSampling',
            EvaluatorConfig: '{"EvaluatorType":"Deterministic"}',
        }]);
        const catalog = ProviderProductionCatalog({}, { ID: 'user' });
        const links = await catalog.links();
        expect(links).toEqual([{
            agentId: 'agent',
            rubricId: 'rubric',
            sampleRate: 1,
            status: 'Active',
            purpose: 'ProductionSampling',
            evaluatorConfig: '{"EvaluatorType":"Deterministic"}',
        }]);
    });
});
