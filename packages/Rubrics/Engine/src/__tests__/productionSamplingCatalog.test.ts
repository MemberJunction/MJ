import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rows = new Map<string, Record<string, unknown>[]>();
const filters: string[] = [];
const resultTypes: string[] = [];

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: {
            FromMetadataProvider() {
                return {
                    async RunView(params: { EntityName: string; ExtraFilter?: string; ResultType?: string }) {
                        filters.push(`${params.EntityName} ${params.ExtraFilter ?? ''}`);
                        resultTypes.push(params.ResultType ?? '');
                        return { Success: true, Results: rows.get(params.EntityName) ?? [] };
                    },
                };
            },
        },
    };
});

import { ProviderProductionCatalog } from '../productionSamplingCatalog.js';

describe('ProviderProductionCatalog', () => {
    beforeEach(() => {
        rows.clear();
        filters.length = 0;
        resultTypes.length = 0;
    });

    it('reads generated entity objects instead of a hand-rolled row', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../productionSamplingCatalog.ts'), 'utf8');
        expect(source).toMatch(/MJAIAgentRubricEntity/);
        expect(source).toMatch(/MJRubricVersionEntity/);
        expect(source).not.toMatch(/Record<string, unknown>/);
    });

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
        expect(resultTypes).toEqual(['entity_object']);
    });

    it('limits runs to the agent and the recency window, and looks up evaluations by run id', async () => {
        rows.set('MJ: Entities', [{ ID: '11111111-1111-4111-8111-111111111111' }]);
        const catalog = ProviderProductionCatalog({}, { ID: 'user' });
        await catalog.runs({ since: '2026-09-25T00:00:00.000Z', agentIds: ['agent'] });
        await catalog.evaluated(['run-1', 'run-2']);
        expect(filters.some(filter => filter.includes("StartedAt >= '2026-09-25T00:00:00.000Z'") && filter.includes("AgentID IN ('agent')"))).toBe(true);
        expect(filters.some(filter => filter.includes('SubjectRecordID IN') && filter.includes("'run-1'") && filter.includes("'run-2'"))).toBe(true);
    });
});
