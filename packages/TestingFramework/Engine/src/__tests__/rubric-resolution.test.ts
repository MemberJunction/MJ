import { describe, expect, it, vi } from 'vitest';

const evaluateRecord = vi.hoisted(() => vi.fn(async () => ({
    evaluationId: 'eval-1', score: 0.75, displayScore: 75, outcome: 'Passed', criteria: [],
})));
vi.mock('@memberjunction/rubrics', () => ({
    providerRubricEngine: () => ({ EvaluateRecord: evaluateRecord, evaluateRecord }),
}));

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PublishedVersionPin, EnsureImplicitRubricOracle, OraclesWithNamedRubric, ResolveRubric, WeightsForImplicitRubric } from '../oracles/rubric-resolution.js';
import { RubricOracle } from '../oracles/RubricOracle.js';

const suites = [
    { Id: 'child', ParentId: 'parent', RubricId: null },
    { Id: 'parent', ParentId: null, RubricId: 'suite-rubric' },
];

describe('rubric resolution', () => {
    it('honors a test rubric and a run override on the drivers that score a test run', () => {
        expect(OraclesWithNamedRubric([{ type: 'trace-no-errors', weight: 1 }], { testRubricId: 'from-test' })).toEqual([
            { type: 'trace-no-errors', weight: 1 },
            { type: 'rubric', config: { rubricId: 'from-test' } },
        ]);
        expect(OraclesWithNamedRubric([], { runRubricId: 'from-flag', runVersionId: 'v9' })).toEqual([
            { type: 'rubric', config: { rubricId: 'from-flag', rubricVersionId: 'v9' } },
        ]);
        const directory = dirname(fileURLToPath(import.meta.url));
        for (const file of ['../drivers/PromptEvalDriver.ts', '../drivers/DecisionEvalDriver.ts']) {
            const source = readFileSync(join(directory, file), 'utf8');
            expect(source).toMatch(/OraclesWithNamedRubric/);
            expect(source).toMatch(/testRunId: context\.testRun\.ID/);
        }
        const computerUse = readFileSync(join(directory, '../../../../AI/MJComputerUse/src/test-driver/ComputerUseTestDriver.ts'), 'utf8');
        expect(computerUse).toMatch(/OraclesWithNamedRubric/);
        expect(computerUse).toMatch(/testRunId: context\.testRun\.ID/);
    });

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
        const overwritten = EnsureImplicitRubricOracle(
            [{ type: 'rubric', config: { rubricId: 'named', rubricVersionId: 'stale', versionLabel: 'old', note: 'keep' } }],
            choice,
            'v1',
            '1.0.0',
        );
        expect(overwritten[0].config).toEqual({ rubricId: 'rubric', rubricVersionId: 'v1', versionLabel: '1.0.0', note: 'keep' });
        expect(WeightsForImplicitRubric(undefined, true)).toEqual({ rubric: 1 });
        expect(WeightsForImplicitRubric({ trace: 1 }, true)).toEqual({ trace: 1 });
    });

    it('lets an llm-judge skip only the agent rubric', () => {
        const inline = [{ type: 'llm-judge', config: { criteria: ['Accurate'] } }, { type: 'trace-no-errors' }];
        const agent = ResolveRubric({ agentRubricId: 'agent' });
        expect(EnsureImplicitRubricOracle(inline, agent, 'v1', '1.0.0')).toEqual(inline);
        for (const choice of [
            ResolveRubric({ run: { rubricId: 'run' } }),
            ResolveRubric({ testRubricId: 'test' }),
            ResolveRubric({ suites, suiteId: 'child' }),
            ResolveRubric({ oracle: { rubricId: 'promoted' } }),
        ]) {
            const pinned = EnsureImplicitRubricOracle(inline, choice, 'v1', '1.0.0');
            expect(pinned.map(oracle => oracle.type)).toEqual(['llm-judge', 'trace-no-errors', 'rubric']);
            expect(pinned.at(-1)?.config).toMatchObject({ rubricId: choice.RubricId, rubricVersionId: 'v1' });
        }
        const unnamed = EnsureImplicitRubricOracle(inline, ResolveRubric({ testRubricId: 'draft-rubric' }));
        expect(unnamed.at(-1)).toEqual({ type: 'rubric', config: { rubricId: 'draft-rubric' } });
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
        expect(seen[0]).toMatchObject({
            rubricId: 'rubric',
            subjectEntityName: 'MJ: Test Runs',
            subjectRecordId: 'run-1',
            contextEntityName: 'MJ: Tests',
            contextRecordId: 'test-1',
            versionId: 'v1',
            passThreshold: null,
            evaluator: 'LLM',
        });
        const refused = await oracle.evaluate(
            { test: { ID: 'test-1' } as never, contextUser: {} as never },
            { rubricId: 'rubric' } as never,
        );
        expect(refused.passed).toBe(false);
        expect(refused.message).toBe('subject not found or not readable');
        expect(seen).toHaveLength(1);
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
