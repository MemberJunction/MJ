import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AIDecisionParams, AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type { DecisionAnswer } from '@memberjunction/ai';
import type { UserInfo } from '@memberjunction/core';
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
vi.mock('@memberjunction/ai-prompts', () => ({
    AIDecisionRunner: class { ExecuteDecision = mockExecuteDecision; },
    AIDecisionParams: class { Questions = {}; },
}));

import { DecisionReasoningProvider } from '../reasoning/DecisionReasoningProvider';
import { DuplicateReasoningInput, DuplicateReasoningOutput } from '../reasoning/DuplicateReasoningTypes';

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

/** Answers each question with the probability of the candidate it names. Unnamed candidates get no answer. */
function answerByRecord(probabilities: Record<string, number>): void {
    mockExecuteDecision.mockImplementation(async (params: AIDecisionParams) => {
        const answers: Record<string, DecisionAnswer> = {};
        for (const [key, question] of Object.entries(params.Questions)) {
            const probability = probabilityNamedIn(question.Instructions, probabilities);
            if (probability !== undefined) {
                answers[key] = { Kind: 'Likelihood', Probability: probability };
            }
        }
        return { success: true, Answers: answers, promptRun: runRow('decision-run-1') };
    });
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
        it('flags a candidate at or above 0.5 as Uncertain and one below as NotDuplicate', async () => {
            answerByRecord({ 'ID|c1': 0.9, 'ID|c2': 0.49, 'ID|c3': 0.5 });
            const output = await reason();

            expect(verdictFor(output, 'ID|c1')?.Recommendation).toBe('Uncertain');
            expect(verdictFor(output, 'ID|c2')?.Recommendation).toBe('NotDuplicate');
            expect(verdictFor(output, 'ID|c3')?.Recommendation).toBe('Uncertain');
        });

        it('carries each probability as that candidate\'s confidence', async () => {
            answerByRecord({ 'ID|c1': 0.9, 'ID|c2': 0.12, 'ID|c3': 0.5 });
            const output = await reason();

            expect(verdictFor(output, 'ID|c1')?.Confidence).toBe(0.9);
            expect(verdictFor(output, 'ID|c2')?.Confidence).toBe(0.12);
            expect(verdictFor(output, 'ID|c3')?.Confidence).toBe(0.5);
        });

        it('honours a custom uncertainAbove threshold', async () => {
            answerByRecord({ 'ID|c1': 0.9, 'ID|c2': 0.7, 'ID|c3': 0.8 });
            const output = await reason(new DecisionReasoningProvider(0.8));

            expect(verdictFor(output, 'ID|c1')?.Recommendation).toBe('Uncertain');
            expect(verdictFor(output, 'ID|c2')?.Recommendation).toBe('NotDuplicate');
            expect(verdictFor(output, 'ID|c3')?.Recommendation).toBe('Uncertain');
        });

        it('is Uncertain for the set when any candidate is flagged, with the highest flagged probability', async () => {
            answerByRecord({ 'ID|c1': 0.7, 'ID|c2': 0.2, 'ID|c3': 0.95 });
            const output = await reason();

            expect(output.Success).toBe(true);
            expect(output.Recommendation).toBe('Uncertain');
            expect(output.Confidence).toBe(0.95);
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
