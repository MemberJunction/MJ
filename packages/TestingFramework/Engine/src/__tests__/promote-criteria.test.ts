import { describe, expect, it } from 'vitest';
import { BuildPromotedRubric, PromoteInlineCriteria, type PromoteCriteriaStore, type PromotedRubric } from '../oracles/promote-criteria.js';

const EXPECTED = {
    judgeValidationCriteria: ['Is polite', { criterion: 'Answers the question', weight: 2 }],
};

describe('BuildPromotedRubric', () => {
    it('copies inline weights into a draft and does not publish', () => {
        const plan = BuildPromotedRubric({
            testName: 'Reply check',
            testId: 'test-1',
            expectedOutcomes: EXPECTED,
            configuration: { oracles: [{ type: 'llm-judge', config: { passThreshold: 0.8 } }] },
        });
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;
        expect(plan.rubric.status).toBe('Draft');
        expect(plan.rubric.name).toBe('Reply check rubric');
        expect(plan.rubric.passThreshold).toBe(0.8);
        expect(plan.rubric.notApplicablePolicy).toBe('NotAllowed');
        expect(plan.rubric.criteria).toEqual([
            { key: 'is-polite', name: 'Is polite', weight: 1, isGate: false, gateMinimumScore: null, sequence: 0 },
            { key: 'answers-the-question', name: 'Answers the question', weight: 2, isGate: false, gateMinimumScore: null, sequence: 1 },
        ]);
    });

    it('makes every leaf a gate at 1 when the judge is strict', () => {
        const plan = BuildPromotedRubric({
            testName: 'Reply check',
            testId: 'test-1',
            expectedOutcomes: { judgeValidationCriteria: ['Accurate'] },
            configuration: { oracles: [{ type: 'llm-judge', config: { strictMode: true } }] },
        });
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;
        expect(plan.rubric.passThreshold).toBe(0.7);
        expect(plan.rubric.criteria[0].isGate).toBe(true);
        expect(plan.rubric.criteria[0].gateMinimumScore).toBe(1);
    });

    it('refuses when the test already has a rubric or has no criteria', () => {
        expect(BuildPromotedRubric({
            testName: 'Reply check',
            testId: 'test-1',
            existingRubricId: 'already',
            expectedOutcomes: EXPECTED,
            configuration: {},
        })).toEqual({ ok: false, message: 'This test already has a rubric. Promotion does not replace it.' });
        const missing = BuildPromotedRubric({
            testName: 'Reply check',
            testId: 'test-1',
            expectedOutcomes: {},
            configuration: {},
        });
        expect(missing.ok).toBe(false);
    });

    it('keeps duplicate criterion text from sharing a key', () => {
        const plan = BuildPromotedRubric({
            testName: 'Reply check',
            testId: 'test-1',
            expectedOutcomes: { judgeValidationCriteria: ['Is polite', 'Is polite'] },
            configuration: {},
        });
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;
        expect(plan.rubric.criteria.map(criterion => criterion.key)).toEqual(['is-polite', 'is-polite-2']);
    });
});

describe('PromoteInlineCriteria', () => {
    it('saves a draft version and sets the test rubric', async () => {
        const calls: string[] = [];
        let saved: PromotedRubric | undefined;
        const store: PromoteCriteriaStore = {
            async saveRubric() {
                calls.push('rubric');
                return 'rubric-1';
            },
            async ensureBinaryScale() {
                calls.push('scale');
                return 'scale-1';
            },
            async saveDraftVersion(input) {
                calls.push('version');
                saved = input;
                return 'version-1';
            },
            async setTestRubric(testId, rubricId) {
                calls.push(`test:${testId}:${rubricId}`);
            },
        };
        const plan = BuildPromotedRubric({
            testName: 'Reply check',
            testId: 'test-1',
            expectedOutcomes: EXPECTED,
            configuration: {},
        });
        if (!plan.ok) throw new Error(plan.message);
        const result = await PromoteInlineCriteria('test-1', plan.rubric, store);
        expect(result).toEqual({ rubricId: 'rubric-1', versionId: 'version-1' });
        expect(calls).toEqual(['rubric', 'scale', 'version', 'test:test-1:rubric-1']);
        expect(saved?.status).toBe('Draft');
        expect(saved?.criteria[1].weight).toBe(2);
    });
});
