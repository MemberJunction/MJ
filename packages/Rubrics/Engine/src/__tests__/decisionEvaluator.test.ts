import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplyPlattCalibration, type ScoreAnswer } from '@memberjunction/ai';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import {
    ChosenLevel, DecisionRubricEvaluator, NUMERIC_SCORE_BUCKETS, NumericScoreValues, NumericValueFromAnswer, ScoreQuestionForCriterion, SnapToScale,
} from '../DecisionRubricEvaluator.js';
import type { RubricDecisionService } from '../evaluatorServices.js';
import { BuildCriteriaPromptData, type RubricScalePromptData } from '../promptData.js';
import { FakePromptService } from './fakePromptService.js';

type DecideInput = Parameters<RubricDecisionService['Decide']>[0];

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
        nodes: [leaf, { ...leaf, id: 'b', key: 'accuracy', name: 'Accuracy', scaleId: 'numeric', sequence: 1 }],
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

const clarityAnswer: ScoreAnswer = { Kind: 'Score', Value: 0.9, Probabilities: { Low: 0.25, High: 0.75 }, Confidence: 0.75 };
const accuracyAnswer: ScoreAnswer = { Kind: 'Score', Value: 7, Probabilities: { '6': 0.2, '7': 0.6, '8': 0.2 }, Confidence: 0.6 };

function decisions(calls: DecideInput[], answers: Record<string, ScoreAnswer> = { clarity: clarityAnswer, accuracy: accuracyAnswer }, extra: { ModelName?: string; ResolvedModel?: string } = {}): RubricDecisionService {
    return {
        async Decide(input) {
            calls.push(input);
            return { Answers: answers, PromptRunID: 'decision-run', ...extra };
        },
    };
}

/** Serves a Platt fit for one rubric question on Jev (jev-1.13) from the AI engine. */
function serveCalibrations(question: string): void {
    vi.spyOn(AIEngineBase.Instance, 'GetDecisionCalibrations').mockImplementation((model: string) => model === 'Jev'
        ? [{ Use: 'rubric-evaluation', Question: question, ResolvedModel: 'jev-1.13', A: 2, B: -1 }]
        : []);
}

const subject = { entityName: 'MJ: Documents', recordId: '1' };


afterEach(() => vi.restoreAllMocks());

describe('DecisionRubricEvaluator', () => {
    it('asks every level and numeric leaf in one call on Default Decision', async () => {
        const calls: DecideInput[] = [];
        const output = await new DecisionRubricEvaluator().EvaluateRubric({
            Version: version(), Content: { text: 'Easy to read.' }, Subject: subject,
            Settings: {}, Services: { Decisions: decisions(calls), Prompts: FakePromptService() },
        });
        expect(calls).toHaveLength(1);
        expect(calls[0].Prompt).toEqual({ Name: 'Default Decision' });
        expect(Object.keys(calls[0].Questions)).toEqual(['clarity', 'accuracy']);
        expect(calls[0].Questions.clarity.Levels).toEqual(['Low', 'High']);
        expect(calls[0].Questions.clarity.Instructions).toBe('Be strict.\n\nrendered clarity');
        expect(calls[0].Questions.accuracy.Levels).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
        expect(calls[0].Questions.accuracy.Instructions).toContain('Score it from 0 to 10 in steps of 1; higher is better.');
        expect(calls[0].State).toContain('Easy to read.');
        expect(output.answers).toEqual([
            expect.objectContaining({ criterionId: 'a', scaleLevelId: 'high', confidence: 0.75 }),
            expect.objectContaining({ criterionId: 'b', rawValue: 7, confidence: 0.6 }),
        ]);
        expect(output.answers[0].rationale).toBe('Decision model chose High with probability 0.75.');
        expect(output.answers[1].rationale).toBe('Decision model placed it at 7 with probability 0.60.');
        expect(output.aiPromptRunId).toBe('decision-run');
        expect(output.metadata).toMatchObject({ Prompt: 'Default Decision', CriterionPrompt: 'Rubric Criterion', UnaskedCriteria: [], CalibratedCriteria: [] });
        expect(output.result.nodes.find(node => node.key === 'accuracy')?.normalizedScore).toBeCloseTo(0.7);
    });

    it('honors PromptID and ModelID', async () => {
        const calls: DecideInput[] = [];
        await new DecisionRubricEvaluator().EvaluateRubric({
            Version: version(), Content: { text: 'x' }, Subject: subject,
            Settings: { PromptID: 'decide', ModelID: 'jev' }, Services: { Decisions: decisions(calls), Prompts: FakePromptService() },
        });
        expect(calls[0].Prompt).toEqual({ ID: 'decide' });
        expect(calls[0].ModelID).toBe('jev');
    });

    it('lists a numeric criterion with no range as unasked instead of skipping it silently', async () => {
        const calls: DecideInput[] = [];
        const tree = version();
        tree.scales[1] = { ...tree.scales[1], minValue: null };
        const output = await new DecisionRubricEvaluator().EvaluateRubric({
            Version: tree, Content: { text: 'x' }, Subject: subject, Settings: {}, Services: { Decisions: decisions(calls), Prompts: FakePromptService() },
        });
        expect(Object.keys(calls[0].Questions)).toEqual(['clarity']);
        expect(output.metadata?.UnaskedCriteria).toEqual(['accuracy']);
        expect(output.result.nodes.find(node => node.key === 'accuracy')?.normalizedScore).toBeNull();
        expect(output.result.scoredCriteriaCount).toBe(1);
    });

    it('calibrates a confidence when a fit exists for the model that answered, and keeps it raw otherwise', async () => {
        serveCalibrations('clarity');
        const calls: DecideInput[] = [];
        const output = await new DecisionRubricEvaluator().EvaluateRubric({
            Version: version(), Content: { text: 'x' }, Subject: subject, Settings: {},
            Services: {
                Decisions: decisions(calls, undefined, { ModelName: 'Jev', ResolvedModel: 'jev-1.13' }),
                Prompts: FakePromptService(),
            },
        });
        const calibrated = ApplyPlattCalibration(0.75, { A: 2, B: -1 });
        expect(calibrated).not.toBeCloseTo(0.75);
        expect(output.answers[0].confidence).toBeCloseTo(calibrated);
        expect(output.answers[0].rationale).toBe(`Decision model chose High with calibrated probability ${calibrated.toFixed(2)}.`);
        expect(output.answers[1].confidence).toBe(0.6);
        expect(output.metadata).toMatchObject({ CalibratedCriteria: ['clarity'], DecisionModel: 'Jev', ResolvedModel: 'jev-1.13' });

        const otherModel = await new DecisionRubricEvaluator().EvaluateRubric({
            Version: version(), Content: { text: 'x' }, Subject: subject, Settings: {},
            Services: {
                Decisions: decisions([], undefined, { ModelName: 'Jev', ResolvedModel: 'jev-2.0' }),
                Prompts: FakePromptService(),
            },
        });
        expect(otherModel.answers[0].confidence).toBe(0.75);
        expect(otherModel.metadata?.CalibratedCriteria).toEqual([]);
    });

    it('refuses evidence-required leaves before any call, and a missing answer after one', async () => {
        const calls: DecideInput[] = [];
        const tree = version();
        tree.nodes[0].evidenceRequired = true;
        await expect(new DecisionRubricEvaluator().EvaluateRubric({
            Version: tree, Content: { text: 'x' }, Subject: subject, Settings: {}, Services: { Decisions: decisions(calls), Prompts: FakePromptService() },
        })).rejects.toThrow('clarity require it. Use the DecisionThenLLM or LLM evaluator for this rubric.');
        expect(calls).toHaveLength(0);
        const silent: RubricDecisionService = { async Decide() { return { Answers: {} }; } };
        await expect(new DecisionRubricEvaluator().EvaluateRubric({
            Version: version(), Content: { text: 'x' }, Subject: subject, Settings: {}, Services: { Decisions: silent, Prompts: FakePromptService() },
        })).rejects.toThrow('The decision model did not answer clarity, accuracy.');
        await expect(new DecisionRubricEvaluator().EvaluateRubric({
            Version: version(), Content: { text: 'x' }, Subject: subject, Settings: {}, Services: {},
        })).rejects.toThrow('A Decision evaluation requires a decision service.');
        await expect(new DecisionRubricEvaluator().EvaluateRubric({
            Version: version(), Content: { text: 'x' }, Subject: subject, Settings: {}, Services: { Decisions: silent },
        })).rejects.toThrow('A Decision evaluation requires a prompt service to render its criteria.');
    });

    it('picks the most probable level, or the nearest one without probabilities', () => {
        const [clarity] = BuildCriteriaPromptData(version());
        const question = ScoreQuestionForCriterion(clarity);
        expect(question?.Levels).toEqual(['Low', 'High']);
        expect(question?.Instructions).toBe('Clarity');
        expect(ChosenLevel(question!, { Kind: 'Score', Value: 0.2, Probabilities: {}, Confidence: 0.6 })).toEqual({ label: 'Low', confidence: 0.6 });
        expect(ChosenLevel(question!, { Kind: 'Score', Value: 0.2, Probabilities: { Low: 0.3, High: 0.7 }, Confidence: 0.6 })).toEqual({ label: 'High', confidence: 0.7 });
    });
});

describe('numeric scales as Score questions', () => {
    const scale = (Min: number | null, Max: number | null, Step: number | null, HigherIsBetter = true): RubricScalePromptData => ({ Type: 'Numeric', Min, Max, Step, HigherIsBetter });

    it('asks one level per step when there are few steps', () => {
        expect(NumericScoreValues(scale(1, 5, 1))).toEqual([1, 2, 3, 4, 5]);
        expect(NumericScoreValues(scale(0, 1, 0.25))).toEqual([0, 0.25, 0.5, 0.75, 1]);
    });

    it('buckets a continuous or fine-grained scale into evenly spaced levels on the step', () => {
        expect(NumericScoreValues(scale(0, 1, null))).toEqual([0, 0.25, 0.5, 0.75, 1]);
        expect(NumericScoreValues(scale(0, 100, 1))).toEqual([0, 25, 50, 75, 100]);
        expect(NumericScoreValues(scale(0, 100, 3))).toHaveLength(NUMERIC_SCORE_BUCKETS);
        for (const value of NumericScoreValues(scale(0, 100, 3)) ?? []) expect(value % 3).toBe(0);
    });

    it('cannot ask a scale with no range', () => {
        expect(NumericScoreValues(scale(null, 10, 1))).toBeNull();
        expect(NumericScoreValues(scale(5, 5, 1))).toBeNull();
        expect(NumericScoreValues({ Type: 'Levels', Min: null, Max: null, Step: null, HigherIsBetter: true })).toBeNull();
    });

    it('snaps onto the scale, staying on a step when Max is not on one', () => {
        expect(SnapToScale(7.4, scale(0, 10, 1))).toBe(7);
        expect(SnapToScale(9.9, scale(0, 10, 3))).toBe(9);
        expect(SnapToScale(-2, scale(0, 10, null))).toBe(0);
        expect(SnapToScale(0.30000000000000004, scale(0, 1, 0.1))).toBe(0.3);
    });

    it('maps an answer back as the probability-weighted value, or Value read between levels', () => {
        const values = [0, 25, 50, 75, 100];
        const continuous = scale(0, 100, null);
        expect(NumericValueFromAnswer(continuous, values, { Kind: 'Score', Value: 3, Probabilities: { '50': 0.5, '75': 0.5 }, Confidence: 0.5 }))
            .toEqual({ value: 62.5, confidence: 0.5 });
        expect(NumericValueFromAnswer(continuous, values, { Kind: 'Score', Value: 2.5, Probabilities: {}, Confidence: 0.4 }))
            .toEqual({ value: 62.5, confidence: 0.4 });
        expect(NumericValueFromAnswer(scale(0, 100, 1), values, { Kind: 'Score', Value: 2.5, Probabilities: {}, Confidence: 0.4 }).value).toBe(63);
    });

    it('says when lower is better', () => {
        const [, accuracy] = BuildCriteriaPromptData(version());
        const question = ScoreQuestionForCriterion({ ...accuracy, Scale: scale(0, 4, 1, false) });
        expect(question?.Instructions).toContain('lower is better');
        expect(question?.Levels).toEqual(['0', '1', '2', '3', '4']);
    });
});
