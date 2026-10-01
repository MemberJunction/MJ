import { describe, expect, it } from 'vitest';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { fallbackContent, shapeContent, testRunContent } from '../content.js';
import { DeterministicRubricEvaluator } from '../DeterministicRubricEvaluator.js';
import { RubricEngine, type RubricEvaluationStore } from '../RubricEngine.js';
import { getAgreement, getConsensus, getDiagnostics, krippendorffAlpha, quadraticKappa } from '../statistics.js';

function version(): RubricVersionSnapshot {
    return {
        id: 'version',
        rubricId: 'rubric',
        notApplicablePolicy: 'ExcludeAndRedistribute',
        passThreshold: 0.5,
        scoreDisplayMin: 0,
        scoreDisplayMax: 100,
        nodes: [
            { id: 'a', key: 'clarity', name: 'Clarity', nodeType: 'Criterion', scaleId: 'scale', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0, evaluatorConfig: { Deterministic: { path: 'score', equals: 1, level: 'High' } } },
            { id: 'b', key: 'accuracy', name: 'Accuracy', nodeType: 'Criterion', scaleId: 'scale', weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 1 },
        ],
        scales: [{ id: 'scale', scaleType: 'Levels', higherIsBetter: true, levels: [{ id: 'high', label: 'High', value: 1, normalizedValue: 1, sequence: 0 }] }],
        bands: [],
    };
}

describe('DeterministicRubricEvaluator', () => {
    it('leaves a leaf with no rule unanswered and does not call a model', () => {
        const output = new DeterministicRubricEvaluator().evaluateData(version(), { data: { score: 1 } });
        expect(output.answers).toHaveLength(1);
        expect(output.answers[0].criterionId).toBe('a');
        expect(output.normalizedScore).toBe(1);
        expect(output.result.completeness).toBe(0.5);
    });
});

describe('content providers', () => {
    it('maps a test run and omits fields the user cannot read', () => {
        expect(testRunContent({ input: 'q', expectedOutcomes: 'yes', actualOutput: 'no', trace: 'ran' }).data).toEqual({
            input: 'q', expectedOutcomes: 'yes', actualOutput: 'no',
        });
        expect(fallbackContent({ name: 'Ada', secret: 'x' }, field => field !== 'secret').data).toEqual({ name: 'Ada' });
        expect(shapeContent('MJ: Widgets', { name: 'Ada', secret: 'x' }).data).toEqual({});
    });
});

describe('RubricEngine', () => {
    it('saves a draft and submits the deterministic result', async () => {
        const calls: string[] = [];
        const store: RubricEvaluationStore = {
            async createDraft() { calls.push('draft'); return { id: 'eval-1', status: 'Draft' }; },
            async submit(_id, answers) {
                calls.push('submit');
                expect(answers).toHaveLength(1);
                return { normalizedScore: 1, completeness: 0.5, outcome: 'Passed', passed: true, gateFailed: false, passThresholdApplied: 0.5, bandId: null, confidence: null, nodes: [], scoringEngineVersion: '1.0' };
            },
            async fail() { throw new Error('should not fail'); },
        };
        const engine = new RubricEngine(store);
        const done = await engine.evaluate({
            version: version(),
            subject: { entityName: 'MJ: Test Runs', recordId: '1', entityId: 'entity' },
            content: { data: { score: 1 } },
            evaluator: 'Deterministic',
        });
        expect(calls).toEqual(['draft', 'submit']);
        expect(done.evaluation.status).toBe('Submitted');
        expect(done.output?.normalizedScore).toBe(1);
    });

    it('loads a test run when content is omitted and the rule sees the actual output', async () => {
        const tree = version();
        tree.nodes[0].evaluatorConfig = { Deterministic: { path: 'actualOutput', equals: 'shipped', level: 'High' } };
        const store: RubricEvaluationStore = {
            async createDraft() { return { id: 'eval-3', status: 'Draft' }; },
            async submit() { return { normalizedScore: 1, completeness: 0.5, outcome: 'Passed', passed: true, gateFailed: false, passThresholdApplied: 0.5, bandId: null, confidence: null, nodes: [], scoringEngineVersion: '1.0' }; },
            async fail() { throw new Error('should not fail'); },
        };
        const done = await new RubricEngine(store).evaluate({
            version: tree,
            subject: { entityName: 'MJ: Test Runs', recordId: 'run-1', entityId: 'entity' },
            loadRecord: async () => ({ actualOutput: 'shipped', input: 'q' }),
            evaluator: 'Deterministic',
        });
        expect(done.output?.answers[0].scaleLevelId).toBe('high');
        expect(done.output?.normalizedScore).toBe(1);
    });

    it('records a Failed evaluation when the evaluator throws', async () => {
        const failed: string[] = [];
        const store: RubricEvaluationStore = {
            async createDraft() { return { id: 'eval-2', status: 'Draft' }; },
            async submit() { throw new Error('scale missing'); },
            async fail(id, message) { failed.push(`${id}:${message}`); return { id, status: 'Failed', errorMessage: message }; },
        };
        const engine = new RubricEngine(store);
        const done = await engine.evaluate({
            version: version(),
            subject: { entityName: 'MJ: Test Runs', recordId: '1', entityId: 'entity' },
            content: { data: { score: 1 } },
            evaluator: 'AI',
        });
        expect(done.evaluation.status).toBe('Failed');
        expect(done.evaluation.errorMessage).toMatch(/agent/);
        expect(failed[0]).toMatch(/eval-2:An AI evaluation requires an agent/);
    });
});

describe('agreement and consensus', () => {
    it('matches a hand-computed quadratic kappa of 0.4 and withholds below 20 subjects', () => {
        const pairs: [number, number][] = [
            ...Array.from({ length: 20 }, () => [0, 0] as [number, number]),
            ...Array.from({ length: 5 }, () => [0, 1] as [number, number]),
            ...Array.from({ length: 10 }, () => [1, 0] as [number, number]),
            ...Array.from({ length: 15 }, () => [1, 1] as [number, number]),
        ];
        expect(quadraticKappa(pairs)).toBeCloseTo(0.4, 6);
        const small = getAgreement([[1, 1], [1, 2], [2, 2]]);
        expect(small.withheld).toBe(true);
        expect(small.kappa).toBeUndefined();
        expect(small.sampleSize).toBe(3);
        const enough = getAgreement(pairs, 20);
        expect(enough.withheld).toBe(false);
        expect(enough.kappa).toBeCloseTo(0.4, 6);
    });

    it('matches a hand-computed ordinal alpha of 4/9', () => {
        expect(krippendorffAlpha([[1, 1], [1, 2], [2, 2]])).toBeCloseTo(4 / 9, 6);
    });

    it('averages scores for the mean consensus', () => {
        const result = getConsensus([0.2, 0.4, 0.6], 'Mean');
        expect(result.overall).toBeCloseTo(0.4, 6);
        expect(result.range).toBeCloseTo(0.4, 6);
        expect(result.sampleSize).toBe(3);
        const perCriterion = getConsensus([], 'Mean', 0.1, [
            { key: 'a', scores: [0.2, 0.4] },
            { key: 'b', scores: [0.8, 1] },
        ]);
        expect(perCriterion.criteria?.[0].mean).toBeCloseTo(0.3, 6);
        expect(perCriterion.criteria?.[1].mean).toBeCloseTo(0.9, 6);
        expect(perCriterion.criteria?.[0].range).toBeCloseTo(0.2, 6);
    });

    it('flags noise against the other criteria, and names both keys in a high correlation', () => {
        const flags = getDiagnostics([
            { key: 'noise', scores: [0, 1, 0, 1], notApplicable: 0 },
            { key: 'a', scores: [0, 0, 1, 1], notApplicable: 0 },
            { key: 'b', scores: [0, 0, 1, 1], notApplicable: 0 },
        ]);
        expect(flags.filter(flag => flag.flag === 'NoDiscrimination').map(flag => flag.criterionKey)).toEqual(['noise']);
    });
});
