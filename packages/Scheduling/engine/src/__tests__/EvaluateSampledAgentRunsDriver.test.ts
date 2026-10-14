import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn(), LogStatusEx: vi.fn() };
});

// Entity classes are plain bases here; the typed doubles keep their field values in memory.
vi.mock('@memberjunction/core-entities', () => ({ MJScheduledJobEntity: class {}, MJScheduledJobRunEntity: class {} }));
vi.mock('@memberjunction/ai-agents', () => ({}));
vi.mock('@memberjunction/rubrics', () => ({
    ProviderProductionCatalog: class {},
    ProviderRubricEngine: class {},
    ProductionSamplingJob: class {}
}));

import { EvaluateSampledAgentRunsDriver } from '../drivers/EvaluateSampledAgentRunsDriver';
import { TestContext, TestScheduledJob } from './helpers/scheduling-doubles';

describe('EvaluateSampledAgentRunsDriver.FormatNotification', () => {
    const driver = new EvaluateSampledAgentRunsDriver();
    const context = TestContext(new TestScheduledJob({ Name: 'Evaluate' }));

    it('reports a numeric evaluated count', () => {
        const n = driver.FormatNotification(context, { Success: true, Details: { Evaluated: 3 } });
        expect(n.Subject).toBe('Evaluate Sampled Agent Runs: 3 run(s) evaluated');
    });

    it('treats an evaluated count that is not a number as zero', () => {
        const n = driver.FormatNotification(context, { Success: true, Details: { Evaluated: '3' } });
        expect(n.Subject).toBe('Evaluate Sampled Agent Runs: 0 run(s) evaluated');
        expect(n.Metadata).toEqual({ Evaluated: 0 });
    });
});
