import { describe, expect, it, vi } from 'vitest';

const evaluateRecord = vi.hoisted(() => vi.fn(async () => ({
    evaluationId: 'eval-1', score: 0.75, displayScore: 75, outcome: 'Passed', criteria: [],
})));
vi.mock('@memberjunction/rubrics', () => ({
    providerRubricEngine: () => ({ EvaluateRecord: evaluateRecord, evaluateRecord }),
}));

import { PublishedVersionPin, EnsureImplicitRubricOracle, ResolveRubric, WeightsForImplicitRubric } from '../oracles/rubric-resolution.js';
import { RubricOracle } from '../oracles/RubricOracle.js';

const suites = [
    { Id: 'child', ParentId: 'parent', RubricId: null },
    { Id: 'parent', ParentId: null, RubricId: 'suite-rubric' },
];

describe('rubric resolution', () => {
    it('uses the first source that names a rubric', () => {
        expect(ResolveRubric({
            run: { rubricId: 'run' },
            oracle: { rubricId: 'oracle' },
            testRubricId: 'test',
            suites,
            suiteId: 'child',
            agentRubricId: 'agent',
        }).Source).toBe('run');
        expect(ResolveRubric({ oracle: { rubricVersionId: 'version-9' }, testRubricId: 'test' })).toMatchObject({ Source: 'oracle', ExplicitVersion: true });
        expect(ResolveRubric({ testRubricId: 'test', suites, suiteId: 'child' }).Source).toBe('test');
        expect(ResolveRubric({ suites, suiteId: 'child' })).toMatchObject({ RubricId: 'suite-rubric', Source: 'suite' });
        expect(ResolveRubric({ agentRubricId: 'agent' }).Source).toBe('agent');
        expect(ResolveRubric({}).Source).toBe('none');
    });

    it('pins the published version for a suite run and leaves an explicit version alone', async () => {
        const pin = new PublishedVersionPin();
        let latest = 'v1';
        const lookup = async () => latest;
        expect(await pin.remember('suite-run', 'rubric', undefined, lookup)).toBe('v1');
        latest = 'v2';
        expect(await pin.remember('suite-run', 'rubric', undefined, lookup)).toBe('v1');
        expect(await pin.remember('suite-run', 'rubric', 'v9', lookup)).toBe('v9');
        expect(await pin.remember('suite-run', 'rubric', undefined, lookup)).toBe('v1');
        expect(await pin.remember('other-run', 'rubric', undefined, lookup)).toBe('v2');
    });

    it('adds a rubric oracle only when the test did not name one', () => {
        const choice = ResolveRubric({ testRubricId: 'rubric' });
        const added = EnsureImplicitRubricOracle([{ type: 'trace-no-errors' }], choice, 'v1');
        expect(added.map(oracle => oracle.type)).toEqual(['trace-no-errors', 'rubric']);
        expect(EnsureImplicitRubricOracle([{ type: 'rubric', config: { rubricId: 'named' } }], choice).some(oracle => oracle.config?.rubricId === 'named')).toBe(true);
        expect(WeightsForImplicitRubric(undefined, true)).toEqual({ rubric: 1 });
        expect(WeightsForImplicitRubric({ trace: 1 }, true)).toEqual({ trace: 1 });
    });

    it('keeps an existing llm-judge and does not add the agent rubric', () => {
        const choice = ResolveRubric({ testRubricId: 'rubric' });
        const inline = [{ type: 'llm-judge', config: { criteria: ['Accurate'] } }, { type: 'trace-no-errors' }];
        const published = EnsureImplicitRubricOracle(inline, choice, 'v1', '1.0.0');
        expect(published).toEqual(inline);
    });

    it('calls the engine with the test run as the subject and the test as the context', async () => {
        const seen: unknown[] = [];
        const oracle = new RubricOracle({
            async EvaluateRecord(request) {
                seen.push(request);
                return { evaluationId: 'eval-1', score: 0.75, displayScore: 75, outcome: 'Passed', criteria: [{ key: 'clarity', normalizedScore: 0.75, rationale: 'Clear.' }] };
            },
        });
        const result = await oracle.evaluate(
            { test: { ID: 'test-1' } as never, testRunId: 'run-1', contextUser: {} as never },
            { rubricId: 'rubric', rubricVersionId: 'v1', versionLabel: '1.0.0' } as never,
        );
        expect(seen).toEqual([{
            rubricId: 'rubric',
            subjectEntityName: 'MJ: Test Runs',
            subjectRecordId: 'run-1',
            contextEntityName: 'MJ: Tests',
            contextRecordId: 'test-1',
            versionId: 'v1',
            passThreshold: null,
            evaluator: 'LLM',
        }]);
        expect(result.passed).toBe(true);
        expect(result.message).toBe('rubric v1.0.0: Passed (75)');
        expect(result.details).toMatchObject({ RubricEvaluationID: 'eval-1', Criteria: [{ Key: 'clarity', Rationale: 'Clear.' }] });
    });

    it('builds the engine from the input provider when none was injected', async () => {
        evaluateRecord.mockClear();
        const provider = { name: 'fake-provider' };
        const oracle = new RubricOracle();
        await oracle.evaluate(
            { test: { ID: 'test-1' } as never, testRunId: 'run-1', contextUser: {} as never, provider: provider as never },
            { rubricId: 'rubric', rubricVersionId: 'v1', versionLabel: '1.0.0' } as never,
        );
        expect(evaluateRecord).toHaveBeenCalledTimes(1);
        expect(evaluateRecord.mock.calls[0][0]).toMatchObject({ versionId: 'v1', rubricId: 'rubric' });
    });
});
