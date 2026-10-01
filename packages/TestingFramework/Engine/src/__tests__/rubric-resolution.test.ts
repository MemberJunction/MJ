import { describe, expect, it } from 'vitest';
import { PublishedVersionPin, ensureImplicitRubricOracle, resolveRubric, weightsForImplicitRubric } from '../oracles/rubric-resolution.js';
import { RubricOracle } from '../oracles/RubricOracle.js';

const suites = [
    { id: 'child', parentId: 'parent', rubricId: null },
    { id: 'parent', parentId: null, rubricId: 'suite-rubric' },
];

describe('rubric resolution', () => {
    it('uses the first source that names a rubric', () => {
        expect(resolveRubric({
            run: { rubricId: 'run' },
            oracle: { rubricId: 'oracle' },
            testRubricId: 'test',
            suites,
            suiteId: 'child',
            agentRubricId: 'agent',
        }).source).toBe('run');
        expect(resolveRubric({ oracle: { rubricVersionId: 'version-9' }, testRubricId: 'test' })).toMatchObject({ source: 'oracle', explicitVersion: true });
        expect(resolveRubric({ testRubricId: 'test', suites, suiteId: 'child' }).source).toBe('test');
        expect(resolveRubric({ suites, suiteId: 'child' })).toMatchObject({ rubricId: 'suite-rubric', source: 'suite' });
        expect(resolveRubric({ agentRubricId: 'agent' }).source).toBe('agent');
        expect(resolveRubric({}).source).toBe('none');
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
        const choice = resolveRubric({ testRubricId: 'rubric' });
        const added = ensureImplicitRubricOracle([{ type: 'trace-no-errors' }], choice, 'v1');
        expect(added.map(oracle => oracle.type)).toEqual(['trace-no-errors', 'rubric']);
        expect(ensureImplicitRubricOracle([{ type: 'rubric', config: { rubricId: 'named' } }], choice).some(oracle => oracle.config?.rubricId === 'named')).toBe(true);
        expect(weightsForImplicitRubric(undefined, true)).toEqual({ rubric: 1 });
        expect(weightsForImplicitRubric({ trace: 1 }, true)).toEqual({ trace: 1 });
    });

    it('calls the engine with the test run as the subject and the test as the context', async () => {
        const seen: unknown[] = [];
        const oracle = new RubricOracle({
            async evaluateRecord(request) {
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
});
