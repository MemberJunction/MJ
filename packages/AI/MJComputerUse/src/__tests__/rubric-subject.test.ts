import { describe, expect, it } from 'vitest';
import { BuildRubricSubject, WithDefaultRubricEvaluator } from '../test-driver/rubric-subject.js';
import type { ComputerUseExpectedOutcomes, ComputerUseTestInput } from '../test-driver/types.js';

const input: ComputerUseTestInput = { goal: 'Open the Users list', startUrl: 'http://localhost:4200/home' };
const expected: ComputerUseExpectedOutcomes = { judgeValidationCriteria: ['The Users grid is visible'] };

function output(steps: number): Record<string, unknown> {
    return {
        success: true,
        status: 'Completed',
        totalSteps: steps,
        totalDurationMs: 1234,
        finalUrl: 'http://localhost:4200/users',
        finalScreenshot: 'A'.repeat(50_000),
        interactiveElements: [{ role: 'button', name: 'Save', selector: '#save' }],
        criteriaVerdicts: [{ criterion: 'The Users grid is visible', met: true, evidence: 'Grid with 12 rows' }],
        finalJudgeVerdict: { Done: true, Confidence: 1, Reason: 'All 1 criteria met.' },
        stepHistory: Array.from({ length: steps }, (_, i) => ({
            stepNumber: i + 1,
            url: `http://localhost:4200/page${i + 1}?tab=a`,
            reasoning: `Reason ${i + 1}`,
            actionsCount: 2,
            hadError: i === 2,
            judgeVerdict: i === steps - 1 ? { Done: true, Confidence: 1 } : undefined,
        })),
    };
}

describe('BuildRubricSubject', () => {
    it('writes a step transcript and leaves the screenshot and elements out', () => {
        const subject = BuildRubricSubject(input, expected, output(4));
        expect(subject.text).toContain('Goal: Open the Users list');
        expect(subject.text).toContain('Step 3 [/page3?tab=a]: Reason 3 -> 2 action(s) [ERROR]');
        expect(subject.text).toContain('Step 4 [/page4?tab=a]: Reason 4 -> 2 action(s) [judge: done=true]');
        expect(subject.text).toContain('Judge: done=true. All 1 criteria met.');
        expect(subject.text).not.toContain('AAAA');
        expect(subject.data).not.toHaveProperty('finalScreenshot');
        expect(subject.data).not.toHaveProperty('interactiveElements');
        expect(subject.data).not.toHaveProperty('stepHistory');
        expect(subject.data.criteriaVerdicts).toEqual([{ criterion: 'The Users grid is visible', met: true, evidence: 'Grid with 12 rows' }]);
        expect(subject.data.expectedOutcomes).toEqual({ judgeValidationCriteria: ['The Users grid is visible'] });
        expect(subject.images).toBeUndefined();
    });

    it('keeps the first and last steps of a long run inside the budget', () => {
        const subject = BuildRubricSubject(input, expected, output(120));
        expect(subject.text).toContain('Step 1 [');
        expect(subject.text).toContain('Step 120 [');
        expect(subject.text).toContain('... 80 step(s) omitted ...');
        expect(subject.text).not.toContain('Step 60 [');
        expect(subject.text.length + JSON.stringify(subject.data).length).toBeLessThan(24_000);
    });

    it('attaches the frames it is given', () => {
        const subject = BuildRubricSubject(input, expected, output(1), [{ label: 'final', mimeType: 'image/png', data: 'QUJD' }]);
        expect(subject.images).toEqual([{ label: 'final', mimeType: 'image/png', data: 'QUJD' }]);
        expect(subject.text).toContain('Frames attached: final');
    });
});

describe('WithDefaultRubricEvaluator', () => {
    it('fills the evaluator only on a rubric oracle that has none', () => {
        const judge = { EvaluatorType: 'AIPrompt', PromptName: 'Rubric Judge - Computer Use' };
        const config = { oracles: [
            { type: 'url-match' },
            { type: 'rubric', config: { rubricId: 'r1' } },
            { type: 'rubric', config: { rubricId: 'r2', evaluator: { EvaluatorName: 'Decision' } } },
        ] };
        expect(WithDefaultRubricEvaluator(config, judge).oracles).toEqual([
            { type: 'url-match' },
            { type: 'rubric', config: { rubricId: 'r1', evaluator: judge } },
            { type: 'rubric', config: { rubricId: 'r2', evaluator: { EvaluatorName: 'Decision' } } },
        ]);
    });
});
