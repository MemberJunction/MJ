import { describe, expect, it, vi } from 'vitest';
import { RubricScoring, type RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { AgentRubricEvaluator } from '../AgentRubricEvaluator.js';

function version(): RubricVersionSnapshot {
    return {
        id: 'version',
        rubricId: 'rubric',
        notApplicablePolicy: 'ExcludeAndRedistribute',
        passThreshold: 0.5,
        scoreDisplayMin: 0,
        scoreDisplayMax: 1,
        nodes: [{
            id: 'accuracy',
            key: 'accuracy',
            name: 'Accuracy',
            nodeType: 'Criterion',
            scaleId: 'scale',
            weight: 1,
            isAdvisory: false,
            isGate: false,
            evidenceRequired: false,
            rationaleRequired: false,
            sequence: 0,
        }],
        scales: [{
            id: 'scale',
            scaleType: 'Levels',
            higherIsBetter: true,
            levels: [{ id: 'high', label: 'High', value: 1, normalizedValue: 1, sequence: 0 }],
        }],
        bands: [],
    };
}

describe('AgentRubricEvaluator', () => {
    it('scores the High level when the quote is in the subject text', async () => {
        const spy = vi.spyOn(RubricScoring, 'Compute');
        const output = await new AgentRubricEvaluator({
            async Run() {
                return { key: 'accuracy', level: 'High', rationale: 'The answer cited the source.', evidence: [{ quote: 'cited' }] };
            },
        }).EvaluateContent(version(), { text: 'The report cited the source.' });
        expect(output.answers).toHaveLength(1);
        expect(output.answers[0].scaleLevelId).toBe('high');
        expect(output.evidence).toEqual([{ ref: 'cited', quote: 'cited' }]);
        expect(output.droppedQuotes).toBe(0);
        expect(output.normalizedScore).toBe(spy.mock.results[0].value.normalizedScore);
        spy.mockRestore();
    });

    it('drops a quote that is not in the subject text', async () => {
        const output = await new AgentRubricEvaluator({
            async Run() {
                return { key: 'accuracy', level: 'High', rationale: 'Missing quote.', evidence: [{ quote: 'not in the text' }] };
            },
        }).EvaluateContent(version(), { text: 'The report cited the source.' });
        expect(output.answers[0].scaleLevelId).toBe('high');
        expect(output.evidence).toEqual([]);
        expect(output.droppedQuotes).toBe(1);
    });
});
