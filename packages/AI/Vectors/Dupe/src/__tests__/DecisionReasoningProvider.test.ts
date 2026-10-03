import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AIDecisionParams, AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type { DecisionAnsweringModel, ModelInfo } from '@memberjunction/ai-core-plus';
import type { DecisionAnswer, PlattCalibration } from '@memberjunction/ai';
import { LogError, type UserInfo } from '@memberjunction/core';
import type { MJAIPromptRunEntity, MJEntityDocumentEntity } from '@memberjunction/core-entities';

// ─────────────────────────────────────────────
// Hoisted mocks: the decision runner and the AIEngine prompt cache
// ─────────────────────────────────────────────

const { mockExecuteDecision, mockEngineConfig, engineState } = vi.hoisted(() => ({
    mockExecuteDecision: vi.fn<(params: AIDecisionParams) => Promise<AIDecisionRunResult>>(),
    mockEngineConfig: vi.fn<() => Promise<void>>(),
    engineState: { Prompts: new Array<{ ID: string; Name: string }>() },
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));
vi.mock('@memberjunction/core-entities', () => ({
    MJEntityDocumentEntity: class {},
}));
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: mockEngineConfig,
            get Prompts() { return engineState.Prompts; },
        },
    },
}));
// The real decision-calibration helpers, loaded on their own: the package index needs the parts of
// @memberjunction/core this spec mocks away.
vi.mock('@memberjunction/ai-core-plus', async () => vi.importActual<typeof import('@memberjunction/ai-core-plus/dist/decision-calibration.js')>(
    '@memberjunction/ai-core-plus/dist/decision-calibration.js'
));
vi.mock('@memberjunction/ai-prompts', () => ({
    AIDecisionRunner: class { ExecuteDecision = mockExecuteDecision; },
    AIDecisionParams: class { Questions = {}; },
}));

import {
    CalibratedDuplicateProbability,
    DecisionReasoningProvider,
    DUPLICATE_DECISION_CALIBRATION,
    DuplicateDecisionResult,
} from '../reasoning/DecisionReasoningProvider';
import { DuplicateReasoningInput, DuplicateReasoningOutput } from '../reasoning/DuplicateReasoningTypes';
import { ANSWERING_MODEL, ANSWERING_RESOLVED_MODEL, AnsweredBy, RawFor } from './helpers/decisionCalibration';

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

const DECISION_PROMPT = { ID: 'prompt-decision', Name: 'Default Decision' };
const CONTEXT_USER = { ID: 'user-1' } as UserInfo;

/** Exposes the shared prompt-data helper, so the state can be checked against it. */
class ExposedDecisionProvider extends DecisionReasoningProvider {
    public PromptData(input: DuplicateReasoningInput): Record<string, unknown> {
        return this.buildPromptData(input);
    }
}

/** A source record and three candidates, with one differing field across the set. */
function input(): DuplicateReasoningInput {
    return {
        EntityName: 'Accounts',
        EntityDescription: 'Company records',
        EntityDocument: {} as MJEntityDocumentEntity,
        SourceRecord: { RecordID: 'ID|src', Label: 'Acme', Provenance: 'Local', DependentCount: 2 },
        Candidates: [
            { RecordID: 'ID|c1', Label: 'Acme Inc', VectorScore: 0.95, Provenance: 'Local', DependentCount: 2 },
            { RecordID: 'ID|c2', Label: 'Apex', VectorScore: 0.81, Provenance: 'Local', DependentCount: 2 },
            { RecordID: 'ID|c3', Label: 'Acme', VectorScore: 0.78, Provenance: 'Local', DependentCount: 2 },
        ],
        FieldDeltas: [
            { FieldName: 'Email', Values: [
                { RecordID: 'ID|src', Value: 'info@acme.com' },
                { RecordID: 'ID|c1', Value: 'sales@acme.com' },
                { RecordID: 'ID|c2', Value: 'hello@apex.io' },
                { RecordID: 'ID|c3', Value: null },
            ] },
        ],
    };
}

function runRow(id: string): MJAIPromptRunEntity {
    return { ID: id } as MJAIPromptRunEntity;
}

/** The probability for the candidate a question's instructions name, by record id. */
function probabilityNamedIn(instructions: string, probabilities: Record<string, number>): number | undefined {
    const recordID = Object.keys(probabilities).find(id => instructions.includes(`(recordId ${id})`));
    return recordID === undefined ? undefined : probabilities[recordID];
}

/**
 * Answers each question, as `model` at `resolvedModel`, with the **raw** probability of the candidate
 * it names. Unnamed candidates get no answer. A null `model` or `resolvedModel` is a run that does
 * not report it.
 */
function answerRawByRecord(
    probabilities: Record<string, number>,
    model: ModelInfo | null = ANSWERING_MODEL,
    resolvedModel: string | null = ANSWERING_RESOLVED_MODEL
): void {
    mockExecuteDecision.mockImplementation(async (params: AIDecisionParams) => {
        const answers: Record<string, DecisionAnswer> = {};
        for (const [key, question] of Object.entries(params.Questions)) {
            const probability = probabilityNamedIn(question.Instructions, probabilities);
            if (probability !== undefined) {
                answers[key] = { Kind: 'Likelihood', Probability: probability };
            }
        }
        return { success: true, Answers: answers, promptRun: runRow('decision-run-1'), ...AnsweredBy(model, resolvedModel) };
    });
}

/**
 * Answers each question, as {@link ANSWERING_MODEL}, so that the candidate it names gets the
 * **calibrated** probability given here. Unnamed candidates get no answer.
 */
function answerByRecord(calibrated: Record<string, number>): void {
    answerRawByRecord(Object.fromEntries(Object.entries(calibrated).map(([id, p]) => [id, RawFor(p)])));
}

function sentParams(): AIDecisionParams {
    expect(mockExecuteDecision).toHaveBeenCalledTimes(1);
    return mockExecuteDecision.mock.calls[0][0];
}

function verdictFor(output: DuplicateReasoningOutput, recordID: string) {
    return output.CandidateVerdicts.find(v => v.RecordID === recordID);
}

async function reason(provider: DecisionReasoningProvider = new DecisionReasoningProvider()): Promise<DuplicateReasoningOutput> {
    return provider.Reason(input(), { ContextUser: CONTEXT_USER });
}

async function decide(provider: DecisionReasoningProvider): Promise<DuplicateDecisionResult> {
    return provider.DecideCandidates(input(), { ContextUser: CONTEXT_USER });
}

describe('DecisionReasoningProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockEngineConfig.mockResolvedValue(undefined);
        engineState.Prompts = [DECISION_PROMPT];
    });

    describe('the call', () => {
        it('makes one decision call per set, with one Likelihood per candidate', async () => {
            answerByRecord({ 'ID|c1': 0.9, 'ID|c2': 0.1, 'ID|c3': 0.6 });
            await reason();

            const questions = Object.values(sentParams().Questions);
            expect(questions).toHaveLength(3);
            for (const question of questions) {
                expect(question.Kind).toBe('Likelihood');
                expect(question.Instructions).toContain('is the same real-world entity as the new record');
                expect(question.Instructions).toContain('(recordId ID|src)');
            }
            expect(questions[0].Instructions).toContain('"Acme Inc" (recordId ID|c1)');
            expect(questions[1].Instructions).toContain('"Apex" (recordId ID|c2)');
            expect(questions[2].Instructions).toContain('"Acme" (recordId ID|c3)');
        });

        it('runs the Default Decision prompt as the context user', async () => {
            answerByRecord({ 'ID|c1': 0.9, 'ID|c2': 0.1, 'ID|c3': 0.6 });
            await reason();

            const params = sentParams();
            expect(params.prompt).toBe(DECISION_PROMPT);
            expect(params.contextUser).toBe(CONTEXT_USER);
        });

        it('bounds the model call with the context\'s cancellation token and timeout', async () => {
            answerByRecord({ 'ID|c1': 0.9, 'ID|c2': 0.1, 'ID|c3': 0.6 });
            const cancellation = new AbortController();

            await new DecisionReasoningProvider().DecideCandidates(input(), {
                ContextUser: CONTEXT_USER, CancellationToken: cancellation.signal, TimeoutMS: 1234,
            });

            const params = sentParams();
            expect(params.cancellationToken).toBe(cancellation.signal);
            expect(params.timeoutMS).toBe(1234);
        });

        it('sets no bound of its own when the context carries none', async () => {
            answerByRecord({ 'ID|c1': 0.9, 'ID|c2': 0.1, 'ID|c3': 0.6 });
            await reason();

            expect(sentParams().cancellationToken).toBeUndefined();
            expect(sentParams().timeoutMS).toBeUndefined();
        });

        it('renders the state compactly from the prompt provider\'s helper', async () => {
            answerByRecord({ 'ID|c1': 0.9, 'ID|c2': 0.1, 'ID|c3': 0.6 });
            const provider = new ExposedDecisionProvider();
            await reason(provider);

            const state = sentParams().State;
            if (typeof state !== 'string') {
                throw new Error('expected the state to be a string');
            }
            expect(state).not.toContain('\n');
            expect(JSON.parse(state)).toEqual(provider.PromptData(input()));
            expect(state).toContain('sales@acme.com');
            expect(state).toContain('(empty)');
        });

        it('makes no call for a set with no candidates', async () => {
            const empty = input();
            empty.Candidates = [];
            const output = await new DecisionReasoningProvider().Reason(empty, { ContextUser: CONTEXT_USER });

            expect(mockExecuteDecision).not.toHaveBeenCalled();
            expect(output.Success).toBe(true);
            expect(output.Recommendation).toBe('NotDuplicate');
            expect(output.CandidateVerdicts).toEqual([]);
        });
    });

    describe('banding', () => {
        const THRESHOLD = DecisionReasoningProvider.DEFAULT_UNCERTAIN_ABOVE;

        // A scripted probability reaches the provider through Jev's calibration, so it can land a
        // rounding error either side of a threshold. The Reason specs stay clear of the boundary;
        // the boundary itself is banded directly below.
        it('flags a candidate above the default threshold as Uncertain and one below as NotDuplicate', async () => {
            answerByRecord({ 'ID|c1': 0.9, 'ID|c2': THRESHOLD - 0.01, 'ID|c3': THRESHOLD + 0.01 });
            const output = await reason();

            expect(verdictFor(output, 'ID|c1')?.Recommendation).toBe('Uncertain');
            expect(verdictFor(output, 'ID|c2')?.Recommendation).toBe('NotDuplicate');
            expect(verdictFor(output, 'ID|c3')?.Recommendation).toBe('Uncertain');
        });

        it.each([
            ['the default', THRESHOLD],
            ['a custom', 0.8],
        ])('flags a probability exactly at %s threshold', (_label, threshold) => {
            const verdict = new DecisionReasoningProvider(threshold).BandCandidate({ RecordID: 'ID|c1', Probability: threshold });

            expect(verdict.Recommendation).toBe('Uncertain');
        });

        it('carries each calibrated probability as that candidate\'s confidence', async () => {
            answerByRecord({ 'ID|c1': 0.9, 'ID|c2': 0.12, 'ID|c3': 0.5 });
            const output = await reason();

            expect(verdictFor(output, 'ID|c1')?.Confidence).toBeCloseTo(0.9, 10);
            expect(verdictFor(output, 'ID|c2')?.Confidence).toBeCloseTo(0.12, 10);
            expect(verdictFor(output, 'ID|c3')?.Confidence).toBeCloseTo(0.5, 10);
        });

        it('honours a custom uncertainAbove threshold', async () => {
            // c2 is above the default threshold, so only the custom one drops it.
            answerByRecord({ 'ID|c1': 0.9, 'ID|c2': 0.75, 'ID|c3': 0.85 });
            const output = await reason(new DecisionReasoningProvider(0.8));

            expect(verdictFor(output, 'ID|c1')?.Recommendation).toBe('Uncertain');
            expect(verdictFor(output, 'ID|c2')?.Recommendation).toBe('NotDuplicate');
            expect(verdictFor(output, 'ID|c3')?.Recommendation).toBe('Uncertain');
        });

        it('is Uncertain for the set when any candidate is flagged, with the highest flagged probability', async () => {
            answerByRecord({ 'ID|c1': 0.8, 'ID|c2': 0.2, 'ID|c3': 0.95 });
            const output = await reason();

            expect(output.Success).toBe(true);
            expect(output.Recommendation).toBe('Uncertain');
            expect(output.Confidence).toBeCloseTo(0.95, 10);
        });

        it('is NotDuplicate for the set when every candidate is below the threshold', async () => {
            answerByRecord({ 'ID|c1': 0.3, 'ID|c2': 0.2, 'ID|c3': 0.1 });
            const output = await reason();

            expect(output.Recommendation).toBe('NotDuplicate');
            expect(output.CandidateVerdicts.every(v => v.Recommendation === 'NotDuplicate')).toBe(true);
        });

        it('flags a candidate the decision returned no answer for, with an unknown confidence', async () => {
            answerByRecord({ 'ID|c1': 0.1, 'ID|c2': 0.2 });
            const output = await reason();

            expect(verdictFor(output, 'ID|c3')?.Recommendation).toBe('Uncertain');
            expect(verdictFor(output, 'ID|c3')?.Confidence).toBeNull();
        });

        it('records the decision\'s prompt run', async () => {
            answerByRecord({ 'ID|c1': 0.9, 'ID|c2': 0.1, 'ID|c3': 0.6 });
            const output = await reason();

            expect(output.AIPromptRunID).toBe('decision-run-1');
        });
    });

    describe('calibration', () => {
        it.each(DUPLICATE_DECISION_CALIBRATION.map(entry => [entry.ModelName, entry] as const))(
            'CalibratedDuplicateProbability applies the Platt parameters of %s at the model it was fitted on',
            (_modelName, entry) => {
                const answeredBy: DecisionAnsweringModel = { ModelName: entry.ModelName, ResolvedModel: entry.ResolvedModel };
                // At a raw 0.5 the logit is 0, so the calibrated value is sigmoid(B).
                expect(CalibratedDuplicateProbability(0.5, answeredBy)).toBeCloseTo(1 / (1 + Math.exp(-entry.Calibration.B)), 10);
                expect(CalibratedDuplicateProbability(RawFor(0.8, entry.Calibration), answeredBy)).toBeCloseTo(0.8, 10);
            }
        );

        it('CalibratedDuplicateProbability trims both names', () => {
            const calibrated = CalibratedDuplicateProbability(0.9, { ModelName: 'Jev', ResolvedModel: ANSWERING_RESOLVED_MODEL });

            expect(calibrated).not.toBeNull();
            expect(CalibratedDuplicateProbability(0.9, { ModelName: '  Jev \n', ResolvedModel: ` ${ANSWERING_RESOLVED_MODEL} ` })).toBe(calibrated);
        });

        it.each<[string, DecisionAnsweringModel]>([
            ['an unknown model', { ModelName: 'Some Other Model', ResolvedModel: 'some-vendor/other' }],
            ['Jev at another version', { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.14-20261101' }],
            ['LLM Decision answered by another chat model', { ModelName: 'LLM Decision', ResolvedModel: 'GPT 5.5 Instant' }],
            ['no resolved model', { ModelName: 'Jev' }],
            ['an empty model name', { ModelName: '', ResolvedModel: ANSWERING_RESOLVED_MODEL }],
            ['no model name', { ResolvedModel: ANSWERING_RESOLVED_MODEL }],
        ])('CalibratedDuplicateProbability returns null for %s', (_label, answeredBy) => {
            expect(CalibratedDuplicateProbability(0.9, answeredBy)).toBeNull();
        });

        it('DecideCandidates returns the calibrated Probability and the model\'s own RawProbability', async () => {
            answerByRecord({ 'ID|c1': 0.9, 'ID|c2': 0.2, 'ID|c3': 0.6 });
            const decision = await decide(new DecisionReasoningProvider());

            expect(decision.Success).toBe(true);
            expect(decision.Candidates).toEqual([
                { RecordID: 'ID|c1', Probability: expect.closeTo(0.9, 10), RawProbability: RawFor(0.9) },
                { RecordID: 'ID|c2', Probability: expect.closeTo(0.2, 10), RawProbability: RawFor(0.2) },
                { RecordID: 'ID|c3', Probability: expect.closeTo(0.6, 10), RawProbability: RawFor(0.6) },
            ]);
        });

        const uncalibratedModels: [string, ModelInfo | null, string | null, string][] = [
            ['a model with no calibration', { modelId: 'model-other', modelName: 'Some Other Model' }, 'some-vendor/other', 'Some Other Model (some-vendor/other)'],
            ['Jev at another version', ANSWERING_MODEL, 'typesafe/jev-1.14-20261101', 'Jev (typesafe/jev-1.14-20261101)'],
            ['a run that reports no resolved model', ANSWERING_MODEL, null, 'Jev (resolved model not reported)'],
            ['a model with an empty name', { modelId: 'model-other', modelName: '' }, ANSWERING_RESOLVED_MODEL, `an unnamed model (${ANSWERING_RESOLVED_MODEL})`],
            ['a run that names no model', null, ANSWERING_RESOLVED_MODEL, `an unnamed model (${ANSWERING_RESOLVED_MODEL})`],
        ];

        it.each(uncalibratedModels)(
            'gives no Probability for %s, keeps the raw one, names the model, and bands every candidate for review',
            async (_label, model, resolvedModel, named) => {
                answerRawByRecord({ 'ID|c1': 0.95, 'ID|c2': 0.05, 'ID|c3': 0.6 }, model, resolvedModel);
                const provider = new DecisionReasoningProvider();
                const decision = await decide(provider);

                expect(decision.Success).toBe(true);
                expect(decision.UncalibratedModel).toBe(named);
                expect(decision.Candidates).toEqual([
                    { RecordID: 'ID|c1', Probability: null, RawProbability: 0.95 },
                    { RecordID: 'ID|c2', Probability: null, RawProbability: 0.05 },
                    { RecordID: 'ID|c3', Probability: null, RawProbability: 0.6 },
                ]);
                // Batch Decision mode: every candidate goes to a person, and says why.
                const verdicts = provider.RecommendFromDecision(decision).CandidateVerdicts;
                expect(verdicts.map(v => v.Recommendation)).toEqual(['Uncertain', 'Uncertain', 'Uncertain']);
                expect(verdicts.map(v => v.Confidence)).toEqual([null, null, null]);
                expect(verdicts[1].Reasoning).toContain('no calibration (raw probability 0.05)');
            }
        );

        it('names no uncalibrated model when the answering model has a calibration', async () => {
            answerByRecord({ 'ID|c1': 0.9, 'ID|c2': 0.2, 'ID|c3': 0.6 });
            const decision = await decide(new DecisionReasoningProvider());

            expect(decision.UncalibratedModel).toBeUndefined();
            expect(LogError).not.toHaveBeenCalled();
        });

        it('logs a model with no calibration once, not on every decision', async () => {
            const provider = new DecisionReasoningProvider();
            answerRawByRecord({ 'ID|c1': 0.9 }, { modelId: 'model-once', modelName: 'Logged Once Model' }, 'vendor/once');
            await decide(provider);
            await decide(new DecisionReasoningProvider());

            const mentions = (name: string) => vi.mocked(LogError).mock.calls.filter(([message]) => String(message).includes(`"${name}"`));
            expect(mentions('Logged Once Model (vendor/once)')).toHaveLength(1);

            // The same MJ model at another version is another model, logged once too.
            answerRawByRecord({ 'ID|c1': 0.9 }, { modelId: 'model-once', modelName: 'Logged Once Model' }, 'vendor/once-v2');
            await decide(provider);
            await decide(provider);
            expect(mentions('Logged Once Model (vendor/once-v2)')).toHaveLength(1);
        });

        it('calibrates another model through a CalibrationFor override', async () => {
            class CalibratedForMore extends DecisionReasoningProvider {
                protected override CalibrationFor(answeredBy: DecisionAnsweringModel): PlattCalibration | null {
                    return answeredBy.ModelName === 'Some Other Model' && answeredBy.ResolvedModel === 'some-vendor/other'
                        ? { A: 1, B: 0 }
                        : super.CalibrationFor(answeredBy);
                }
            }
            answerRawByRecord({ 'ID|c1': 0.95, 'ID|c2': 0.05, 'ID|c3': 0.6 }, { modelId: 'model-other', modelName: 'Some Other Model' }, 'some-vendor/other');
            const decision = await decide(new CalibratedForMore());

            expect(decision.UncalibratedModel).toBeUndefined();
            // A = 1, B = 0 is the identity
            expect(decision.Candidates.map(c => c.Probability)).toEqual([
                expect.closeTo(0.95, 10), expect.closeTo(0.05, 10), expect.closeTo(0.6, 10),
            ]);
        });
    });

    // Literal values, not read from the constants, so a change to the shipped band, the pre-filter or
    // a model's fitted parameters fails here. They were set from the duplicate-check measurement.
    describe('the shipped settings', () => {
        it('bands at a calibrated 0.7, and pre-filters at a calibrated 0.3', () => {
            expect(DecisionReasoningProvider.DEFAULT_UNCERTAIN_ABOVE).toBe(0.7);
            expect(DecisionReasoningProvider.PRE_FILTER_UNCERTAIN_ABOVE).toBe(0.3);
            expect(new DecisionReasoningProvider().UncertainAbove).toBe(0.7);
        });

        it('ships the fitted Platt parameters for Jev and LLM Decision at the models they were fitted on, and no others', () => {
            expect(DUPLICATE_DECISION_CALIBRATION).toEqual([
                { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917', Calibration: { A: 2.5855, B: -4.4485 } },
                { ModelName: 'LLM Decision', ResolvedModel: 'GPT-OSS-120B', Calibration: { A: 0.9918, B: -1.4843 } },
            ]);
        });

        it.each([
            // model, the model behind it, raw, calibrated
            ['Jev', 'typesafe/jev-1.13-20260917', 0.5, 0.01156],
            ['Jev', 'typesafe/jev-1.13-20260917', 0.9, 0.77424],
            ['Jev', 'typesafe/jev-1.13-20260917', 0.85, 0.50908],
            ['LLM Decision', 'GPT-OSS-120B', 0.5, 0.18478],
            ['LLM Decision', 'GPT-OSS-120B', 0.9, 0.66706],
            ['LLM Decision', 'GPT-OSS-120B', 0.95, 0.80783],
        ])('calibrates %s (%s)\'s raw %s to %s', (model, resolvedModel, raw, calibrated) => {
            expect(CalibratedDuplicateProbability(raw, { ModelName: model, ResolvedModel: resolvedModel })).toBeCloseTo(calibrated, 4);
        });

        it.each([
            // raw answer from Jev, flagged at the entry band (0.7), kept by the pre-filter (0.3)
            [0.9, true, true],
            [0.89, true, true], // calibrated 0.723: the 0.7 edge is a raw 0.886
            [0.88, false, true], // calibrated 0.669
            [0.85, false, true], // calibrated 0.509
            [0.81, false, true], // calibrated 0.332: the 0.3 edge is a raw 0.801
            [0.79, false, false], // calibrated 0.264
            [0.5, false, false],
        ])('bands Jev\'s raw %s: flagged %s at entry, kept %s by the pre-filter', async (raw, flagged, kept) => {
            answerRawByRecord({ 'ID|c1': raw });
            const entry = new DecisionReasoningProvider();
            const decision = await decide(entry);
            const [answer] = decision.Candidates;

            expect(entry.BandCandidate(answer).Recommendation).toBe(flagged ? 'Uncertain' : 'NotDuplicate');
            expect(new DecisionReasoningProvider(DecisionReasoningProvider.PRE_FILTER_UNCERTAIN_ABOVE).IsPlausible(answer.Probability)).toBe(kept);
        });
    });

    describe('never merges', () => {
        const probabilitySets: Record<string, number>[] = [
            { 'ID|c1': 1, 'ID|c2': 1, 'ID|c3': 1 },
            { 'ID|c1': 0.99, 'ID|c2': 0.5, 'ID|c3': 0 },
            { 'ID|c1': 0, 'ID|c2': 0, 'ID|c3': 0 },
        ];

        it.each(probabilitySets)('emits no Merge, survivor or field map for %o', async (probabilities) => {
            answerByRecord(probabilities);
            const output = await reason();

            expect(output.Recommendation).not.toBe('Merge');
            expect(output.CandidateVerdicts.some(v => v.Recommendation === 'Merge')).toBe(false);
            expect(output.SurvivorRecordID).toBeNull();
            expect(output.FieldChoices).toEqual([]);
        });
    });

    describe('a failed decision', () => {
        /**
         * A failed decision returns no verdicts, as a failed prompt does. The detector writes no LLM
         * columns for a failed set, so no candidate is marked NotDuplicate and none is merged.
         */
        function expectFailed(output: DuplicateReasoningOutput, error: string): void {
            expect(output.Success).toBe(false);
            expect(output.ErrorMessage).toContain(error);
            expect(output.Recommendation).toBe('Uncertain');
            expect(output.Confidence).toBeNull();
            expect(output.CandidateVerdicts).toEqual([]);
            expect(output.SurvivorRecordID).toBeNull();
            expect(output.FieldChoices).toEqual([]);
        }

        it('fails with the error and the decision\'s run id when the runner fails', async () => {
            mockExecuteDecision.mockResolvedValue({
                success: false, errorMessage: 'model overloaded', Answers: {}, promptRun: runRow('decision-run-9'),
            });
            const output = await reason();

            expectFailed(output, 'model overloaded');
            expect(output.AIPromptRunID).toBe('decision-run-9');
        });

        it('fails when the runner throws', async () => {
            mockExecuteDecision.mockRejectedValue(new Error('socket hang up'));
            expectFailed(await reason(), 'socket hang up');
        });

        it('fails without a call when the decision prompt is missing', async () => {
            engineState.Prompts = [];
            const output = await reason();

            expectFailed(output, 'Default Decision');
            expect(mockExecuteDecision).not.toHaveBeenCalled();
        });

        it('fails when the AIEngine cannot load', async () => {
            mockEngineConfig.mockRejectedValue(new Error('engine offline'));
            expectFailed(await reason(), 'engine offline');
        });
    });
});
