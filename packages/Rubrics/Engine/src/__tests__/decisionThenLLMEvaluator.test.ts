import { describe, expect, it } from 'vitest';
import { ApplyPlattCalibration, type ScoreAnswer } from '@memberjunction/ai';
import type { DecisionCalibrationSource } from '@memberjunction/ai-core-plus';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { DecisionThenLLMRubricEvaluator } from '../DecisionThenLLMRubricEvaluator.js';
import { CreateRubricEvaluator, ResolveRubricEvaluatorSelection } from '../evaluatorRegistry.js';
import type { RubricDecisionService, RubricEvaluatorServices, RubricEvaluatorSettings, RubricPromptRequest } from '../evaluatorServices.js';
import { FakePromptService } from './fakePromptService.js';

type DecideInput = Parameters<RubricDecisionService['Decide']>[0];

const SUBJECT_TEXT = 'The report cites the 2024 census and reads clearly.';

function version(): RubricVersionSnapshot {
    const leaf = {
        id: 'a', key: 'clarity', name: 'Clarity', nodeType: 'Criterion' as const, scaleId: 'levels',
        weight: 1, isAdvisory: false, isGate: false, evidenceRequired: false, rationaleRequired: false, sequence: 0,
    };
    return {
        id: 'version', rubricId: 'rubric', instructions: null, notApplicablePolicy: 'ExcludeAndRedistribute', passThreshold: 0.5,
        scoreDisplayMin: 0, scoreDisplayMax: 100,
        nodes: [
            leaf,
            { ...leaf, id: 'b', key: 'accuracy', name: 'Accuracy', scaleId: 'numeric', sequence: 1 },
            { ...leaf, id: 'c', key: 'sources', name: 'Sources', evidenceRequired: true, sequence: 2 },
        ],
        scales: [
            {
                id: 'levels', scaleType: 'Levels', higherIsBetter: true,
                levels: [
                    { id: 'low', label: 'Low', value: 0, normalizedValue: 0, sequence: 0 },
                    { id: 'high', label: 'High', value: 1, normalizedValue: 1, sequence: 1 },
                ],
            },
            { id: 'numeric', scaleType: 'Numeric', minValue: 0, maxValue: 4, step: 1, higherIsBetter: true, levels: [] },
        ],
        bands: [],
    };
}

const HIGH: ScoreAnswer = { Kind: 'Score', Value: 1, Probabilities: { Low: 0.1, High: 0.9 }, Confidence: 0.9 };
const UNSURE: ScoreAnswer = { Kind: 'Score', Value: 0.6, Probabilities: { Low: 0.4, High: 0.6 }, Confidence: 0.6 };
const THREE: ScoreAnswer = { Kind: 'Score', Value: 3, Probabilities: { '3': 1 }, Confidence: 1 };

function decisions(calls: DecideInput[], answers: Record<string, ScoreAnswer>): RubricDecisionService {
    return {
        async Decide(input) {
            calls.push(input);
            return { Answers: answers, PromptRunID: 'decision-run', ModelName: 'Jev', ResolvedModel: 'jev-1.13' };
        },
    };
}

/** An LLM that answers whatever it is asked, with a quote from the subject for sources. */
function llm(decisionsByKey: Record<string, object> = {}) {
    return FakePromptService(async (input: RubricPromptRequest) => ({
        Text: JSON.stringify({
            decisions: input.Data.Criteria.map(criterion => decisionsByKey[criterion.Key] ?? {
                key: criterion.Key,
                ...(criterion.Scale?.Type === 'Numeric' ? { value: 2 } : { level: 'High' }),
                rationale: `LLM on ${criterion.Key}`, evidence: [{ quote: 'cites the 2024 census' }], confidence: 0.8,
            }),
        }),
        PromptRunID: `llm-run-${input.Data.Criteria.map(c => c.Key).join('+')}`,
    }));
}

function calibrations(fits: Record<string, { A: number; B: number }>): DecisionCalibrationSource {
    return {
        GetDecisionCalibrations: (model: string) => model !== 'Jev' ? [] : Object.entries(fits).map(([question, fit]) => ({
            Use: 'rubric-evaluation', Question: question, ResolvedModel: 'jev-1.13', ...fit,
        })),
    };
}

async function run(services: RubricEvaluatorServices, settings: RubricEvaluatorSettings = {}, tree = version()) {
    return new DecisionThenLLMRubricEvaluator().EvaluateRubric({
        Version: tree, Content: { text: SUBJECT_TEXT }, Subject: { entityName: 'MJ: Documents', recordId: '1' }, Settings: settings, Services: services,
    });
}

function withoutEvidence(): RubricVersionSnapshot {
    const tree = version();
    tree.nodes = tree.nodes.filter(node => node.key !== 'sources');
    return tree;
}

describe('DecisionThenLLMRubricEvaluator', () => {
    it('makes no LLM call when the decision settles every criterion', async () => {
        const calls: DecideInput[] = [];
        const prompts = llm();
        const output = await run(
            { Decisions: decisions(calls, { clarity: HIGH, accuracy: THREE }), Prompts: prompts },
            { DecisionPromptName: 'Rubric Decision', DecisionModelID: 'jev', PromptID: 'judge', ModelID: 'gpt' },
            withoutEvidence(),
        );
        expect(calls).toHaveLength(1);
        expect(calls[0].Prompt).toEqual({ Name: 'Rubric Decision' });
        expect(calls[0].ModelID).toBe('jev');
        expect(prompts.Requests).toHaveLength(0);
        expect(output.answers).toEqual([
            expect.objectContaining({ criterionId: 'a', scaleLevelId: 'high' }),
            expect.objectContaining({ criterionId: 'b', rawValue: 3 }),
        ]);
        expect(output.aiPromptRunId).toBe('decision-run');
        expect(output.metadata).toMatchObject({ AnsweredBy: 'Decision', DecisionCriteria: ['clarity', 'accuracy'], LLMCriteria: [], PromptRunIDs: ['decision-run'] });
    });

    it('sends evidence-required and unanswered criteria to the LLM in one call and merges the answers', async () => {
        const calls: DecideInput[] = [];
        const prompts = llm();
        const output = await run({ Decisions: decisions(calls, { clarity: HIGH }), Prompts: prompts }, { PromptID: 'judge' });
        expect(Object.keys(calls[0].Questions)).toEqual(['clarity', 'accuracy']);
        expect(prompts.Requests).toHaveLength(1);
        expect(prompts.Requests[0].Data.Criteria.map(criterion => criterion.Key)).toEqual(['accuracy', 'sources']);
        expect(prompts.Requests[0].Judge).toEqual({ ID: 'judge' });
        expect(output.answers.map(answer => answer.criterionId)).toEqual(['a', 'b', 'c']);
        expect(output.answers[0].rationale).toContain('Decision model chose High');
        expect(output.answers[2]).toMatchObject({ scaleLevelId: 'high', evidence: [{ ref: 'cites the 2024 census', quote: 'cites the 2024 census' }] });
        expect(output.aiPromptRunId).toBeNull();
        expect(output.metadata).toMatchObject({
            AnsweredBy: 'DecisionThenLLM',
            DecisionCriteria: ['clarity'],
            LLMCriteria: [{ Key: 'sources', Reason: 'EvidenceRequired' }, { Key: 'accuracy', Reason: 'Unanswered' }],
            PromptRunIDs: ['decision-run', 'llm-run-accuracy+sources'],
            JudgePrompt: 'judge',
        });
    });

    it('sends a criterion whose calibrated confidence is under the threshold to the LLM, and keeps an uncalibrated one', async () => {
        const prompts = llm();
        const output = await run(
            { Decisions: decisions([], { clarity: UNSURE, accuracy: THREE }), Prompts: prompts, Calibrations: calibrations({ clarity: { A: 1, B: -1 } }) },
            {},
            withoutEvidence(),
        );
        expect(ApplyPlattCalibration(0.6, { A: 1, B: -1 })).toBeLessThan(0.7);
        expect(prompts.Requests[0].Data.Criteria.map(criterion => criterion.Key)).toEqual(['clarity']);
        expect(output.answers[0]).toMatchObject({ criterionId: 'a', rationale: 'LLM on clarity', confidence: 0.8 });
        expect(output.metadata).toMatchObject({ LLMCriteria: [{ Key: 'clarity', Reason: 'LowConfidence' }], CalibratedCriteria: ['clarity'], ConfidenceThreshold: 0.7 });

        const raw = await run({ Decisions: decisions([], { clarity: UNSURE, accuracy: THREE }), Prompts: llm() }, {}, withoutEvidence());
        expect(raw.metadata).toMatchObject({ AnsweredBy: 'Decision', CalibratedCriteria: [] });
        expect(raw.answers[0].confidence).toBe(0.6);
    });

    it('keeps a calibrated answer at or above the threshold, which is configurable', async () => {
        const services = { Decisions: decisions([], { clarity: UNSURE, accuracy: THREE }), Prompts: llm(), Calibrations: calibrations({ clarity: { A: 1, B: -1 } }) };
        const output = await run(services, { DecisionConfidenceThreshold: 0.2 }, withoutEvidence());
        expect(output.metadata).toMatchObject({ AnsweredBy: 'Decision', ConfidenceThreshold: 0.2 });
        expect(output.answers[0].confidence).toBeCloseTo(ApplyPlattCalibration(0.6, { A: 1, B: -1 }));
    });

    it('keeps the decision answer for a low-confidence criterion the LLM leaves out, and drops answers it was not asked for', async () => {
        const prompts = FakePromptService(async () => ({
            Text: JSON.stringify({ decisions: [{ key: 'accuracy', value: 1, rationale: 'not asked' }] }),
            PromptRunID: 'llm-run',
        }));
        const output = await run(
            { Decisions: decisions([], { clarity: UNSURE, accuracy: THREE }), Prompts: prompts, Calibrations: calibrations({ clarity: { A: 1, B: -1 } }) },
            {},
            withoutEvidence(),
        );
        expect(output.answers).toEqual([
            expect.objectContaining({ criterionId: 'a', scaleLevelId: 'high' }),
            expect.objectContaining({ criterionId: 'b', rawValue: 3 }),
        ]);
        expect(output.metadata).toMatchObject({ KeptDecisionAnswers: ['clarity'], DecisionCriteria: ['accuracy', 'clarity'], DroppedUnknownKeys: 1 });
    });

    it('scores the whole rubric with the LLM when the decision throws', async () => {
        const failing: RubricDecisionService = { async Decide() { throw new Error('Jev is down'); } };
        const prompts = llm();
        const output = await run({ Decisions: failing, Prompts: prompts }, { PromptName: 'Rubric Judge - Sage' });
        expect(prompts.Requests).toHaveLength(1);
        expect(prompts.Requests[0].Data.Criteria.map(criterion => criterion.Key)).toEqual(['clarity', 'accuracy', 'sources']);
        expect(prompts.Requests[0].Judge).toEqual({ Name: 'Rubric Judge - Sage' });
        expect(output.answers).toHaveLength(3);
        expect(output.metadata).toMatchObject({ AnsweredBy: 'LLM', FallbackReason: 'Jev is down', JudgePrompt: 'Rubric Judge - Sage' });
    });

    it('falls back to the LLM when there is no decision service, nothing can be asked, or an answer cannot be read', async () => {
        const noService = await run({ Prompts: llm() });
        expect(noService.metadata).toMatchObject({ AnsweredBy: 'LLM', FallbackReason: 'no decision service is available' });

        const onlyEvidence = version();
        onlyEvidence.nodes = onlyEvidence.nodes.filter(node => node.key === 'sources');
        const nothingAskable = await run({ Decisions: decisions([], {}), Prompts: llm() }, {}, onlyEvidence);
        expect(nothingAskable.metadata).toMatchObject({ AnsweredBy: 'LLM', FallbackReason: 'No criterion in this rubric can be asked as a Score question.' });

        const broken: DecisionCalibrationSource = { GetDecisionCalibrations: () => { throw new Error('calibrations unreadable'); } };
        const unreadable = await run({ Decisions: decisions([], { clarity: HIGH, accuracy: THREE }), Prompts: llm(), Calibrations: broken }, {}, withoutEvidence());
        expect(unreadable.metadata).toMatchObject({ AnsweredBy: 'LLM', FallbackReason: 'calibrations unreadable' });
        expect(unreadable.answers).toHaveLength(2);
    });

    it('lets an LLM failure fail the evaluation, as the LLM evaluator would', async () => {
        const failing: RubricDecisionService = { async Decide() { throw new Error('Jev is down'); } };
        await expect(run({ Decisions: failing, Prompts: FakePromptService() })).rejects.toThrow('This test does not expect a model call.');
        await expect(run({})).rejects.toThrow('A DecisionThenLLM evaluation requires a prompt service.');
    });
});

describe('selecting DecisionThenLLM', () => {
    it('is registered under its name and the hybrid alias', () => {
        expect(CreateRubricEvaluator('DecisionThenLLM')).toBeInstanceOf(DecisionThenLLMRubricEvaluator);
        expect(CreateRubricEvaluator('hybrid').EvaluatorName).toBe('DecisionThenLLM');
    });

    it('reads its settings from an agent rubric link EvaluatorConfig', () => {
        expect(ResolveRubricEvaluatorSelection({
            EvaluatorType: 'AIPrompt', EvaluatorName: 'DecisionThenLLM', DecisionPromptName: 'Default Decision', DecisionModelID: 'jev',
            DecisionConfidenceThreshold: 0.8, PromptName: 'Rubric Judge - Sage',
        })).toEqual({
            Name: 'DecisionThenLLM',
            Settings: { DecisionPromptName: 'Default Decision', DecisionModelID: 'jev', DecisionConfidenceThreshold: 0.8, PromptName: 'Rubric Judge - Sage' },
        });
        expect(() => ResolveRubricEvaluatorSelection({ EvaluatorName: 'DecisionThenLLM', DecisionConfidenceThreshold: 2 }))
            .toThrow('DecisionConfidenceThreshold must be a number from 0 to 1, not 2.');
    });
});
