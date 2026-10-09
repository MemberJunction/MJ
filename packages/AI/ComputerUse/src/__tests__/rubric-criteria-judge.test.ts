import { describe, expect, it } from 'vitest';
import { LLMJudge } from '../judge/LLMJudge.js';
import { JudgeContext, RubricJudgeCriterion } from '../types/judge.js';
import { JudgePromptResponse, type JudgePromptRequest } from '../types/controller.js';

function criterion(key: string, text: string, levels: string[]): RubricJudgeCriterion {
    const item = new RubricJudgeCriterion();
    item.Key = key;
    item.Text = text;
    item.Levels = levels;
    return item;
}

describe('LLMJudge with rubric criteria', () => {
    it('passes the criteria to the prompt and keeps key and level on each verdict', async () => {
        let seen: JudgePromptRequest | undefined;
        const judge = new LLMJudge(async request => {
            seen = request;
            const response = new JudgePromptResponse();
            response.RawResponse = JSON.stringify({ done: false, confidence: 0.5, reason: 'r', feedback: 'f', criteria: [
                { key: 'grid', criterion: 'The grid is visible', met: true, level: 'Meets', evidence: 'rows shown' },
                { key: 'filter', criterion: 'The filter is applied', met: false, level: 'Partial', evidence: 'filter open, not applied' },
            ] });
            return response;
        });
        const context = new JudgeContext();
        context.Goal = 'g';
        context.RubricCriteria = [
            criterion('grid', 'The grid is visible', ['Miss', 'Partial', 'Meets']),
            criterion('filter', 'The filter is applied', ['Miss', 'Partial', 'Meets']),
        ];
        const verdict = await judge.Evaluate(context);
        expect(seen?.RubricCriteria?.map(item => item.Key)).toEqual(['grid', 'filter']);
        expect(verdict.Done).toBe(false);
        expect(verdict.Confidence).toBe(0.5);
        expect(verdict.CriteriaVerdicts).toEqual([
            { key: 'grid', criterion: 'The grid is visible', met: true, level: 'Meets', evidence: 'rows shown' },
            { key: 'filter', criterion: 'The filter is applied', met: false, level: 'Partial', evidence: 'filter open, not applied' },
        ]);
    });
});
