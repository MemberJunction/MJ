import { describe, expect, it } from 'vitest';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { createRubricDraft, evaluateRecordAgainstRubric, getRubric, getRubricConsensus, type RubricActionEngine } from '../actions.js';

const tree = { id: 'version', rubricId: 'rubric', nodes: [], scales: [], bands: [], notApplicablePolicy: 'ExcludeAndRedistribute', scoreDisplayMin: 0, scoreDisplayMax: 100 } as RubricVersionSnapshot;

function fakeEngine(): RubricActionEngine & { publishCalls: number; evaluateInput?: unknown } {
    return {
        publishCalls: 0,
        async evaluate(input) {
            this.evaluateInput = input;
            return {
                evaluationId: 'eval-1',
                result: { normalizedScore: 0.75, outcome: 'Passed', nodes: [{ key: 'clarity', normalizedScore: 0.75 }] },
            };
        },
        async consensus(input) {
            return { method: input.method ?? 'Mean', overall: 0.5, stdDev: 0, range: 0, sampleSize: input.scores.length };
        },
        async getRubric() { return tree; },
        async createDraft() { return { id: 'draft-1', status: 'Draft' }; },
    };
}

describe('rubric actions', () => {
    it('evaluates through the engine and returns the id, score, and outcome', async () => {
        const engine = fakeEngine();
        const result = await evaluateRecordAgainstRubric(engine, {
            rubricId: 'rubric',
            subjectEntityName: 'MJ: Documents',
            subjectRecordId: 'record-1',
            evaluator: 'Deterministic',
            passThreshold: 0.6,
        });
        expect(engine.evaluateInput).toMatchObject({ rubricId: 'rubric', subjectRecordId: 'record-1', passThreshold: 0.6 });
        expect(result).toEqual({
            evaluationId: 'eval-1',
            score: 0.75,
            outcome: 'Passed',
            criteria: [{ key: 'clarity', normalizedScore: 0.75 }],
        });
    });

    it('asks the engine for consensus and for the tree', async () => {
        const engine = fakeEngine();
        const stats = await getRubricConsensus(engine, { rubricName: 'Writing', subjectRecordId: 'record-1', method: 'Median', scores: [0.2, 0.8] });
        expect(stats.method).toBe('Median');
        expect(stats.sampleSize).toBe(2);
        expect(await getRubric(engine, { rubricName: 'Writing' })).toBe(tree);
    });

    it('creates a draft and never publishes', async () => {
        const engine = fakeEngine();
        const draft = await createRubricDraft(engine, { rubricId: 'rubric', nodes: [] });
        expect(draft).toEqual({ id: 'draft-1', status: 'Draft' });
        expect(engine.publishCalls).toBe(0);
    });
});
