import { describe, expect, it } from 'vitest';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { ChosenLevel, DecisionRubricEvaluator, ScoreQuestionForCriterion } from '../DecisionRubricEvaluator.js';
import type { RubricDecisionService } from '../evaluatorServices.js';

function version(): RubricVersionSnapshot {
    const leaf = {
        id: 'a', key: 'clarity', name: 'Clarity', guidance: 'Read the first sentence.', nodeType: 'Criterion' as const, scaleId: 'scale',
        weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: true, sequence: 0,
    };
    return {
        id: 'version',
        rubricId: 'rubric',
        instructions: 'Be strict.',
        notApplicablePolicy: 'ExcludeAndRedistribute',
        passThreshold: 0.5,
        scoreDisplayMin: 0,
        scoreDisplayMax: 100,
        nodes: [leaf, { ...leaf, id: 'b', key: 'accuracy', name: 'Accuracy', scaleId: 'numeric' }],
        scales: [
            {
                id: 'scale', scaleType: 'Levels', higherIsBetter: true,
                levels: [
                    { id: 'high', label: 'High', value: 1, normalizedValue: 1, sequence: 1 },
                    { id: 'low', label: 'Low', value: 0, normalizedValue: 0, sequence: 0 },
                ],
            },
            { id: 'numeric', scaleType: 'Numeric', minValue: 0, maxValue: 10, step: 1, higherIsBetter: true, levels: [] },
        ],
        bands: [],
    };
}

function decisions(calls: Parameters<RubricDecisionService['Decide']>[0][], answer = { Value: 0.9, Probabilities: { Low: 0.25, High: 0.75 } }): RubricDecisionService {
    return {
        async Decide(input) {
            calls.push(input);
            return { Answers: { clarity: { Kind: 'Score', Confidence: 0.75, ...answer } }, PromptRunID: 'decision-run' };
        },
    };
}

describe('DecisionRubricEvaluator', () => {
    it('asks every level-scale leaf in one call on Default Decision and scores the most probable level', async () => {
        const calls: Parameters<RubricDecisionService['Decide']>[0][] = [];
        const output = await new DecisionRubricEvaluator().EvaluateRubric({
            Version: version(), Content: { text: 'Easy to read.' }, Subject: { entityName: 'MJ: Documents', recordId: '1' },
            Settings: {}, Services: { Decisions: decisions(calls) },
        });
        expect(calls).toHaveLength(1);
        expect(calls[0].Prompt).toEqual({ Name: 'Default Decision' });
        expect(Object.keys(calls[0].Questions)).toEqual(['clarity']);
        expect(calls[0].Questions.clarity.Levels).toEqual(['Low', 'High']);
        expect(calls[0].Questions.clarity.Instructions).toContain('Be strict.');
        expect(calls[0].State).toContain('Easy to read.');
        expect(output.answers).toEqual([expect.objectContaining({ criterionId: 'a', scaleLevelId: 'high', confidence: 0.75 })]);
        expect(output.answers[0].rationale).toBe('Decision model chose High with probability 0.75.');
        expect(output.aiPromptRunId).toBe('decision-run');
        expect(output.metadata).toMatchObject({ Prompt: 'Default Decision', UnaskedCriteria: ['accuracy'] });
    });

    it('honors PromptID and ModelID', async () => {
        const calls: Parameters<RubricDecisionService['Decide']>[0][] = [];
        await new DecisionRubricEvaluator().EvaluateRubric({
            Version: version(), Content: { text: 'x' }, Subject: { entityName: 'MJ: Documents', recordId: '1' },
            Settings: { PromptID: 'decide', ModelID: 'jev' }, Services: { Decisions: decisions(calls) },
        });
        expect(calls[0].Prompt).toEqual({ ID: 'decide' });
        expect(calls[0].ModelID).toBe('jev');
    });

    it('refuses evidence-required leaves before any call, and a missing answer after one', async () => {
        const calls: Parameters<RubricDecisionService['Decide']>[0][] = [];
        const tree = version();
        tree.nodes[0].evidenceRequired = true;
        await expect(new DecisionRubricEvaluator().EvaluateRubric({
            Version: tree, Content: { text: 'x' }, Subject: { entityName: 'MJ: Documents', recordId: '1' }, Settings: {}, Services: { Decisions: decisions(calls) },
        })).rejects.toThrow('clarity require it. Use the LLM evaluator for this rubric.');
        expect(calls).toHaveLength(0);
        const silent: RubricDecisionService = { async Decide() { return { Answers: {} }; } };
        await expect(new DecisionRubricEvaluator().EvaluateRubric({
            Version: version(), Content: { text: 'x' }, Subject: { entityName: 'MJ: Documents', recordId: '1' }, Settings: {}, Services: { Decisions: silent },
        })).rejects.toThrow('The decision model did not answer clarity.');
        await expect(new DecisionRubricEvaluator().EvaluateRubric({
            Version: version(), Content: { text: 'x' }, Subject: { entityName: 'MJ: Documents', recordId: '1' }, Settings: {}, Services: {},
        })).rejects.toThrow('A Decision evaluation requires a decision service.');
    });

    it('builds no question for a numeric scale and picks the nearest level without probabilities', () => {
        const tree = version();
        expect(ScoreQuestionForCriterion(tree, tree.nodes[1])).toBeNull();
        const question = ScoreQuestionForCriterion(tree, tree.nodes[0]);
        expect(question?.Levels).toEqual(['Low', 'High']);
        expect(ChosenLevel(question!, { Kind: 'Score', Value: 0.2, Probabilities: {}, Confidence: 0.6 })).toEqual({ label: 'Low', confidence: 0.6 });
        expect(ChosenLevel(question!, { Kind: 'Score', Value: 0.2, Probabilities: { Low: 0.3, High: 0.7 }, Confidence: 0.6 })).toEqual({ label: 'High', confidence: 0.7 });
    });
});
