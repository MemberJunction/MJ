import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AIDecisionParams, AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type { AIPromptParams, AIPromptRunResult } from '@memberjunction/ai-core-plus';
import type { ChatResult, DecisionAnswer } from '@memberjunction/ai';
import type { UserInfo } from '@memberjunction/core';
import type { MJAIPromptRunEntity, MJEntityDocumentEntity } from '@memberjunction/core-entities';

// ─────────────────────────────────────────────
// Hoisted mocks: the decision runner, the prompt runner and the AIEngine prompt cache
// ─────────────────────────────────────────────

const { mockExecuteDecision, mockExecutePrompt, mockPromptStageReason, engineState } = vi.hoisted(() => ({
    mockExecuteDecision: vi.fn<(params: AIDecisionParams) => Promise<AIDecisionRunResult>>(),
    mockExecutePrompt: vi.fn<(params: AIPromptParams) => Promise<AIPromptRunResult>>(),
    mockPromptStageReason: vi.fn<(input: DuplicateReasoningInput, context: DuplicateReasoningContext) => Promise<DuplicateReasoningOutput>>(),
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
            Config: vi.fn().mockResolvedValue(undefined),
            get Prompts() { return engineState.Prompts; },
        },
    },
}));
vi.mock('@memberjunction/ai-prompts', () => ({
    AIDecisionRunner: class { ExecuteDecision = mockExecuteDecision; },
    AIDecisionParams: class { Questions = {}; },
    AIPromptRunner: class { ExecutePrompt = mockExecutePrompt; },
}));
vi.mock('@memberjunction/ai-core-plus', () => ({
    AIPromptParams: class {},
}));

import { DecisionThenPromptReasoningProvider } from '../reasoning/DecisionThenPromptReasoningProvider';
import { DecisionReasoningProvider } from '../reasoning/DecisionReasoningProvider';
import { DuplicateReasoningProvider } from '../reasoning/DuplicateReasoningProvider';
import {
    DuplicateReasoningInput,
    DuplicateReasoningOutput,
    DuplicateReasoningContext,
} from '../reasoning/DuplicateReasoningTypes';
import { ANSWERING_MODEL, RawFor } from './helpers/decisionCalibration';

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

/** The decision stage's survival threshold, on calibrated probabilities. */
const PRE_FILTER = DecisionReasoningProvider.PRE_FILTER_UNCERTAIN_ABOVE;

const DECISION_PROMPT = { ID: 'prompt-decision', Name: 'Default Decision' };
const REASONING_PROMPT = { ID: 'prompt-reasoning', Name: 'Duplicate Resolution' };
const CONTEXT: DuplicateReasoningContext = { ContextUser: { ID: 'user-1' } as UserInfo };

/** A prompt stage whose reasoning the test controls and inspects. */
class StubPromptStage extends DuplicateReasoningProvider {
    public async Reason(input: DuplicateReasoningInput, context: DuplicateReasoningContext): Promise<DuplicateReasoningOutput> {
        return mockPromptStageReason(input, context);
    }
}

/**
 * A source record and three candidates. Email differs across all four records; Phone differs only
 * because of candidate c2.
 */
function input(): DuplicateReasoningInput {
    return {
        EntityName: 'Accounts',
        EntityDescription: null,
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
                { RecordID: 'ID|c3', Value: 'ops@acme.com' },
            ] },
            { FieldName: 'Phone', Values: [
                { RecordID: 'ID|src', Value: '555-0100' },
                { RecordID: 'ID|c1', Value: '555-0100' },
                { RecordID: 'ID|c2', Value: '555-9999' },
                { RecordID: 'ID|c3', Value: '555-0100' },
            ] },
        ],
    };
}

function runRow(id: string): MJAIPromptRunEntity {
    return { ID: id } as MJAIPromptRunEntity;
}

/** A successful prompt run. The prompt provider reads only success, result and promptRun. */
function promptRunResult(result: Record<string, unknown>, runID: string): AIPromptRunResult {
    return { success: true, result, promptRun: runRow(runID), chatResult: {} as ChatResult };
}

/**
 * Answers each question, as {@link ANSWERING_MODEL}, so that the candidate its instructions name
 * gets the **calibrated** probability given here.
 */
function answerByRecord(probabilities: Record<string, number>): void {
    mockExecuteDecision.mockImplementation(async (params: AIDecisionParams) => {
        const answers: Record<string, DecisionAnswer> = {};
        for (const [key, question] of Object.entries(params.Questions)) {
            const recordID = Object.keys(probabilities).find(id => question.Instructions.includes(`(recordId ${id})`));
            if (recordID !== undefined) {
                answers[key] = { Kind: 'Likelihood', Probability: RawFor(probabilities[recordID]) };
            }
        }
        return { success: true, Answers: answers, promptRun: runRow('decision-run-1'), modelInfo: ANSWERING_MODEL };
    });
}

/** The prompt stage's verdict: c1 is a confident Merge that survives the field map. */
function promptMergesC1(): DuplicateReasoningOutput {
    return {
        Success: true,
        Recommendation: 'Merge',
        Confidence: 0.93,
        Reasoning: 'c1 is the same company',
        CandidateVerdicts: [
            { RecordID: 'ID|c1', Recommendation: 'Merge', Confidence: 0.93, Reasoning: 'Same company' },
            { RecordID: 'ID|c3', Recommendation: 'NotDuplicate', Confidence: 0.8, Reasoning: 'Different office' },
        ],
        SurvivorRecordID: 'ID|src',
        FieldChoices: [{ FieldName: 'Email', SourceRecordID: 'ID|c1' }],
        AIPromptRunID: 'prompt-run-1',
    };
}

/** The shipped decision stage, at the pre-filter threshold, chained to a prompt stage the test controls. */
function chainedWithStub(): DecisionThenPromptReasoningProvider {
    return new DecisionThenPromptReasoningProvider(undefined, new StubPromptStage());
}

function promptStageInput(): DuplicateReasoningInput {
    expect(mockPromptStageReason).toHaveBeenCalledTimes(1);
    return mockPromptStageReason.mock.calls[0][0];
}

describe('DecisionThenPromptReasoningProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        engineState.Prompts = [DECISION_PROMPT, REASONING_PROMPT];
        mockPromptStageReason.mockResolvedValue(promptMergesC1());
    });

    describe('survivors', () => {
        it('passes only the candidates at or above the pre-filter threshold to the prompt provider', async () => {
            // c3 is below the Decision mode's flagging threshold, but the pre-filter keeps it.
            answerByRecord({ 'ID|c1': 0.9, 'ID|c2': 0.2, 'ID|c3': 0.5 });
            await chainedWithStub().Reason(input(), CONTEXT);

            const narrowed = promptStageInput();
            expect(narrowed.Candidates.map(c => c.RecordID)).toEqual(['ID|c1', 'ID|c3']);
            expect(narrowed.SourceRecord.RecordID).toBe('ID|src');
        });

        it('removes dropped candidates from the field deltas, and drops fields that no longer differ', async () => {
            answerByRecord({ 'ID|c1': 0.9, 'ID|c2': 0.2, 'ID|c3': 0.5 });
            await chainedWithStub().Reason(input(), CONTEXT);

            const deltas = promptStageInput().FieldDeltas;
            expect(deltas.map(d => d.FieldName)).toEqual(['Email']);
            expect(deltas[0].Values.map(v => v.RecordID)).toEqual(['ID|src', 'ID|c1', 'ID|c3']);
        });

        it('keeps a candidate the decision returned no answer for', async () => {
            answerByRecord({ 'ID|c1': 0.1, 'ID|c2': 0.2 });
            await chainedWithStub().Reason(input(), CONTEXT);

            expect(promptStageInput().Candidates.map(c => c.RecordID)).toEqual(['ID|c3']);
        });

        it('keeps the prompt\'s Merge, survivor and field map, so auto-merge still works', async () => {
            answerByRecord({ 'ID|c1': 0.9, 'ID|c2': 0.2, 'ID|c3': 0.5 });
            const output = await chainedWithStub().Reason(input(), CONTEXT);

            expect(output.Success).toBe(true);
            expect(output.Recommendation).toBe('Merge');
            expect(output.SurvivorRecordID).toBe('ID|src');
            expect(output.FieldChoices).toEqual([{ FieldName: 'Email', SourceRecordID: 'ID|c1' }]);
            expect(output.AIPromptRunID).toBe('prompt-run-1');
        });

        it('gives each dropped candidate a NotDuplicate verdict carrying its probability', async () => {
            answerByRecord({ 'ID|c1': 0.9, 'ID|c2': 0.2, 'ID|c3': 0.5 });
            const output = await chainedWithStub().Reason(input(), CONTEXT);

            expect(output.CandidateVerdicts.map(v => v.RecordID)).toEqual(['ID|c1', 'ID|c3', 'ID|c2']);
            const dropped = output.CandidateVerdicts.find(v => v.RecordID === 'ID|c2');
            expect(dropped?.Recommendation).toBe('NotDuplicate');
            expect(dropped?.Confidence).toBeCloseTo(0.2, 10);
        });
    });

    describe('no survivors', () => {
        it('is NotDuplicate, from the decision alone, without calling the prompt provider', async () => {
            answerByRecord({ 'ID|c1': PRE_FILTER - 0.05, 'ID|c2': 0.2, 'ID|c3': 0.1 });
            const output = await chainedWithStub().Reason(input(), CONTEXT);

            expect(mockPromptStageReason).not.toHaveBeenCalled();
            expect(output.Success).toBe(true);
            expect(output.Recommendation).toBe('NotDuplicate');
            expect(output.CandidateVerdicts.every(v => v.Recommendation === 'NotDuplicate')).toBe(true);
            expect(output.SurvivorRecordID).toBeNull();
            expect(output.FieldChoices).toEqual([]);
            expect(output.AIPromptRunID).toBe('decision-run-1');
        });

        it('makes no LLM prompt call with the default prompt stage', async () => {
            answerByRecord({ 'ID|c1': PRE_FILTER - 0.05, 'ID|c2': 0.2, 'ID|c3': 0.1 });
            const output = await new DecisionThenPromptReasoningProvider().Reason(input(), CONTEXT);

            expect(mockExecuteDecision).toHaveBeenCalledTimes(1);
            expect(mockExecutePrompt).not.toHaveBeenCalled();
            expect(output.Recommendation).toBe('NotDuplicate');
        });
    });

    describe('a decision model with no calibration', () => {
        it('passes every candidate to the prompt provider, which reasons over them as in Prompt mode', async () => {
            // Raw answers that would drop two candidates, from a model whose answers can't be banded
            mockExecuteDecision.mockResolvedValue({
                success: true,
                Answers: {
                    candidate_1: { Kind: 'Likelihood', Probability: 0.95 },
                    candidate_2: { Kind: 'Likelihood', Probability: 0.01 },
                    candidate_3: { Kind: 'Likelihood', Probability: 0.01 },
                },
                modelInfo: { modelId: 'model-new', modelName: 'Some New Decision Model' },
            });
            await chainedWithStub().Reason(input(), CONTEXT);

            expect(promptStageInput().Candidates.map(c => c.RecordID)).toEqual(['ID|c1', 'ID|c2', 'ID|c3']);
        });
    });

    describe('a failed decision', () => {
        it('passes every candidate to the prompt provider when the runner fails', async () => {
            mockExecuteDecision.mockResolvedValue({ success: false, errorMessage: 'model overloaded', Answers: {} });
            const original = input();
            const output = await chainedWithStub().Reason(original, CONTEXT);

            expect(promptStageInput()).toBe(original);
            expect(output).toEqual(promptMergesC1());
        });

        it('passes every candidate to the prompt provider when the runner throws', async () => {
            mockExecuteDecision.mockRejectedValue(new Error('socket hang up'));
            await chainedWithStub().Reason(input(), CONTEXT);

            expect(promptStageInput().Candidates.map(c => c.RecordID)).toEqual(['ID|c1', 'ID|c2', 'ID|c3']);
            expect(promptStageInput().FieldDeltas).toEqual(input().FieldDeltas);
        });

        it('reaches the prompt runner with every candidate with the default prompt stage', async () => {
            mockExecuteDecision.mockResolvedValue({ success: false, errorMessage: 'model overloaded', Answers: {} });
            mockExecutePrompt.mockResolvedValue(promptRunResult({ recommendation: 'Uncertain' }, 'prompt-run-2'));
            const output = await new DecisionThenPromptReasoningProvider().Reason(input(), CONTEXT);

            expect(mockExecutePrompt).toHaveBeenCalledTimes(1);
            const promptData = mockExecutePrompt.mock.calls[0][0].data;
            expect(promptData?.['candidateCount']).toBe(3);
            expect(output.AIPromptRunID).toBe('prompt-run-2');
        });
    });
});
