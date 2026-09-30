import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AIDecisionParams, AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type { AIPromptParams, AIPromptRunResult } from '@memberjunction/ai-core-plus';
import type { ChatResult, DecisionAnswer } from '@memberjunction/ai';
import type { MJAIPromptRunEntity, MJEntityDocumentEntity } from '@memberjunction/core-entities';

// ─────────────────────────────────────────────
// Hoisted mocks
// ─────────────────────────────────────────────

const { mockRunViewFn, mockExecuteDecision, mockExecutePrompt, engineState } = vi.hoisted(() => ({
    mockRunViewFn: vi.fn().mockResolvedValue({ Success: true, Results: [], RowCount: 0 }),
    mockExecuteDecision: vi.fn<(params: AIDecisionParams) => Promise<AIDecisionRunResult>>(),
    mockExecutePrompt: vi.fn<(params: AIPromptParams) => Promise<AIPromptRunResult>>(),
    engineState: { Prompts: new Array<{ ID: string; Name: string }>() },
}));

// ─────────────────────────────────────────────
// Module mocks. These mirror duplicateRecordDetectorReasoning.test.ts, except that
// @memberjunction/global is REAL here: the providers register through the real ClassFactory,
// so ResolveReasoningProvider is tested end to end.
// ─────────────────────────────────────────────

vi.mock('@memberjunction/core', () => {
    class MockRunView {
        RunView = mockRunViewFn;
    }
    return {
        Metadata: class {
            EntityByName = vi.fn();
            EntityByID = vi.fn();
        },
        RunView: MockRunView,
        BaseEntity: vi.fn(),
        BaseRemotableOperation: class {},
        KeyValuePair: class { FieldName = ''; Value = ''; },
        CompositeKey: class {
            KeyValuePairs: { FieldName: string; Value: string }[] = [];
            Values = vi.fn().mockReturnValue('key-1');
            ToString = vi.fn().mockReturnValue('key-1');
            LoadFromConcatenatedString = vi.fn();
            Equals() { return false; }
        },
        UserInfo: vi.fn(),
        EntityInfo: vi.fn(),
        PotentialDuplicateRequest: class {},
        PotentialDuplicateResponse: class {},
        PotentialDuplicateResult: class {},
        PotentialDuplicate: class {},
        RecordMergeRequest: class {},
        LogStatus: vi.fn(),
        LogError: vi.fn(),
        ComputeRRF: vi.fn(),
    };
});

// The decision provider calibrates with the real Platt scaling.
vi.mock('@memberjunction/ai', async (importOriginal) => ({
    ApplyPlattCalibration: (await importOriginal<typeof import('@memberjunction/ai')>()).ApplyPlattCalibration,
    BaseEmbeddings: vi.fn(),
    GetAIAPIKey: vi.fn().mockReturnValue('mock-api-key'),
}));

vi.mock('@memberjunction/ai-vectordb', () => ({
    VectorDBBase: vi.fn(),
    BaseResponse: vi.fn(),
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJDuplicateRunDetailEntity: vi.fn(),
    MJDuplicateRunDetailMatchEntity: vi.fn(),
    MJDuplicateRunEntity: vi.fn(),
    MJEntityDocumentEntity: vi.fn(),
    MJListDetailEntity: vi.fn(),
    MJListEntity: vi.fn(),
    RecordComparisonCompareOperation: class {},
    KnowledgeHubMetadataEngine: { Instance: { Config: vi.fn() } },
}));

vi.mock('@memberjunction/ai-vectors', () => ({
    VectorBase: class VectorBase {
        _runView = { RunView: mockRunViewFn };
        _provider = { id: 'request-provider' };
        get RunView() { return this._runView; }
    },
}));

vi.mock('@memberjunction/ai-vector-sync', () => ({
    EntityDocumentTemplateParser: { CreateInstance: vi.fn() },
    EntityVectorSyncer: class {},
    VectorizeEntityParams: class {},
}));

vi.mock('@memberjunction/templates', () => ({
    TemplateEngineServer: { Instance: {} },
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

import { DuplicateRecordDetector } from '../duplicateRecordDetector';
import { PromptReasoningProvider } from '../reasoning/PromptReasoningProvider';
import { DecisionReasoningProvider } from '../reasoning/DecisionReasoningProvider';
import { DecisionThenPromptReasoningProvider } from '../reasoning/DecisionThenPromptReasoningProvider';
import { DuplicateReasoningProvider } from '../reasoning/DuplicateReasoningProvider';
import { DuplicateReasoningOutput } from '../reasoning/DuplicateReasoningTypes';
import { ANSWERING_MODEL, RawFor } from './helpers/decisionCalibration';

// ─────────────────────────────────────────────
// Typed access to the detector's protected pipeline steps. As in the neighbouring detector
// specs, fixtures are partial doubles, so the parameters are loosely typed.
// ─────────────────────────────────────────────

/** The fields of a PotentialDuplicateResult that the reasoning and auto-merge steps read and write. */
interface ResultDouble {
    ReasoningRecommendation?: string;
    ReasoningFieldMap?: unknown;
    ReasoningText?: string;
}

/** The generated reasoning columns applyReasoningToMatch writes on a match row. */
interface MatchDouble {
    LLMRecommendation?: string | null;
    LLMProposedSurvivorRecordID?: string | null;
    LLMProposedFieldMap?: string | null;
}

type DetectorInternals = {
    ResolveReasoningProvider(entityDocument: unknown): DuplicateReasoningProvider | null;
    RunReasoningForSet(
        qr: unknown, entityInfo: unknown, entityDocument: unknown, contextUser: unknown
    ): Promise<{ Output: DuplicateReasoningOutput; FieldMap: { FieldName: string; Value: unknown }[] } | undefined>;
    applyReasoningToResult(result: ResultDouble, output: DuplicateReasoningOutput, fieldMap: { FieldName: string; Value: unknown }[]): void;
    applyReasoningToMatch(match: MatchDouble, reasoning: DuplicateReasoningOutput, candidateRecordID: string): void;
    IsAutoMergeEligible(dupe: unknown, dupeResult: ResultDouble, entityDocument: unknown, absoluteThreshold: number): boolean;
};
const internals = (d: DuplicateRecordDetector): DetectorInternals => d as unknown as DetectorInternals;

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

const ABSOLUTE_THRESHOLD = 0.9;
const CANDIDATE_IDS = ['cand-a', 'cand-b', 'cand-c'];
const ENTITY_INFO = { Name: 'Accounts', Description: null, RelatedEntities: [], Fields: [], PrimaryKeys: [] };

/** A matched set whose every candidate clears the absolute threshold on vector score alone. */
function queryResult() {
    return {
        SourceKey: { Values: () => 'src', ToString: () => 'src' },
        TemplateText: '',
        Duplicates: {
            Duplicates: CANDIDATE_IDS.map(id => ({ ProbabilityScore: 0.99, Values: () => id, VectorMetadata: { Name: id } })),
        },
    };
}

/** An entity document with reasoning on and the most permissive automation level. */
function entityDoc(mode: MJEntityDocumentEntity['ReasoningMode']) {
    return {
        EnableLLMReasoning: true,
        ReasoningThreshold: null,
        ReasoningMode: mode,
        AutomationLevel: 'AutoMergeAboveAbsolute',
        ReasoningPromptID: null,
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

describe('DuplicateRecordDetector — decision reasoning modes', () => {
    let detector: DuplicateRecordDetector;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });
        engineState.Prompts = [
            { ID: 'prompt-decision', Name: 'Default Decision' },
            { ID: 'prompt-reasoning', Name: 'Duplicate Resolution' },
        ];
        detector = new DuplicateRecordDetector();
    });

    /** Run a set through reasoning, then apply the verdict to the result as the detector does. */
    async function reasonOverSet(mode: MJEntityDocumentEntity['ReasoningMode']) {
        const ed = entityDoc(mode);
        const qr = queryResult();
        const reasoning = await internals(detector).RunReasoningForSet(qr, ENTITY_INFO, ed, undefined);
        if (!reasoning) {
            throw new Error('expected the reasoning gate to be open');
        }
        const result: ResultDouble = {};
        internals(detector).applyReasoningToResult(result, reasoning.Output, reasoning.FieldMap);
        return { ed, qr, result, output: reasoning.Output };
    }

    describe('ResolveReasoningProvider', () => {
        it('maps Decision to the DecisionReasoningProvider', () => {
            const provider = internals(detector).ResolveReasoningProvider(entityDoc('Decision'));
            expect(provider).toBeInstanceOf(DecisionReasoningProvider);
        });

        it('maps DecisionThenPrompt to the DecisionThenPromptReasoningProvider', () => {
            const provider = internals(detector).ResolveReasoningProvider(entityDoc('DecisionThenPrompt'));
            expect(provider).toBeInstanceOf(DecisionThenPromptReasoningProvider);
        });

        it('still maps Prompt to the PromptReasoningProvider', () => {
            const provider = internals(detector).ResolveReasoningProvider(entityDoc('Prompt'));
            expect(provider).toBeInstanceOf(PromptReasoningProvider);
        });
    });

    describe('Decision mode never makes a record auto-merge eligible', () => {
        const scenarios: { name: string; arrange: () => void }[] = [
            { name: 'every candidate certain', arrange: () => answerByRecord({ 'cand-a': 1, 'cand-b': 1, 'cand-c': 1 }) },
            { name: 'mixed probabilities', arrange: () => answerByRecord({ 'cand-a': 0.99, 'cand-b': 0.5, 'cand-c': 0.01 }) },
            { name: 'every candidate unlikely', arrange: () => answerByRecord({ 'cand-a': 0, 'cand-b': 0.1, 'cand-c': 0.2 }) },
            { name: 'a candidate with no answer', arrange: () => answerByRecord({ 'cand-a': 0.97 }) },
            { name: 'a failed decision', arrange: () => mockExecuteDecision.mockResolvedValue({ success: false, errorMessage: 'overloaded', Answers: {} }) },
            { name: 'a thrown decision', arrange: () => mockExecuteDecision.mockRejectedValue(new Error('socket hang up')) },
            { name: 'a missing decision prompt', arrange: () => { engineState.Prompts = []; } },
        ];

        it.each(scenarios)('is not eligible for $name', async ({ arrange }) => {
            arrange();
            const { ed, qr, result, output } = await reasonOverSet('Decision');

            expect(output.Recommendation).not.toBe('Merge');
            for (const dupe of qr.Duplicates.Duplicates) {
                expect(internals(detector).IsAutoMergeEligible(dupe, result, ed, ABSOLUTE_THRESHOLD)).toBe(false);
            }
        });

        it.each(scenarios)('writes no Merge, survivor or field map on a match row for $name', async ({ arrange }) => {
            arrange();
            const { output } = await reasonOverSet('Decision');

            for (const id of CANDIDATE_IDS) {
                const match: MatchDouble = {};
                internals(detector).applyReasoningToMatch(match, output, id);
                expect(match.LLMRecommendation).not.toBe('Merge');
                expect(match.LLMProposedSurvivorRecordID).toBeNull();
                expect(match.LLMProposedFieldMap).toBeNull();
            }
        });

        it('stamps each candidate with its own band', async () => {
            const threshold = DecisionReasoningProvider.DEFAULT_UNCERTAIN_ABOVE;
            answerByRecord({ 'cand-a': 0.8, 'cand-b': 0.3, 'cand-c': threshold + 0.01 });
            const { output } = await reasonOverSet('Decision');

            const recommendations = CANDIDATE_IDS.map(id => {
                const match: MatchDouble = {};
                internals(detector).applyReasoningToMatch(match, output, id);
                return match.LLMRecommendation;
            });
            expect(recommendations).toEqual(['Uncertain', 'NotDuplicate', 'Uncertain']);
        });
    });

    describe('DecisionThenPrompt keeps the prompt provider\'s auto-merge', () => {
        it('makes a surviving candidate eligible when the prompt recommends Merge', async () => {
            answerByRecord({ 'cand-a': 0.9, 'cand-b': 0.1, 'cand-c': 0.2 });
            mockExecutePrompt.mockResolvedValue(promptRunResult({
                candidateVerdicts: [{ recordId: 'cand-a', recommendation: 'Merge', confidence: 0.95, reasoning: 'Same company' }],
                survivorRecordId: 'src',
                reasoning: 'cand-a duplicates the source',
            }, 'prompt-run-1'));
            const { ed, qr, result } = await reasonOverSet('DecisionThenPrompt');

            expect(result.ReasoningRecommendation).toBe('Merge');
            const survivor = qr.Duplicates.Duplicates[0];
            expect(internals(detector).IsAutoMergeEligible(survivor, result, ed, ABSOLUTE_THRESHOLD)).toBe(true);
        });

        it('stamps the dropped candidates NotDuplicate on their match rows', async () => {
            answerByRecord({ 'cand-a': 0.9, 'cand-b': 0.1, 'cand-c': 0.2 });
            mockExecutePrompt.mockResolvedValue(promptRunResult({
                candidateVerdicts: [{ recordId: 'cand-a', recommendation: 'Merge', confidence: 0.95, reasoning: '' }],
            }, 'prompt-run-1'));
            const { output } = await reasonOverSet('DecisionThenPrompt');

            for (const id of ['cand-b', 'cand-c']) {
                const match: MatchDouble = {};
                internals(detector).applyReasoningToMatch(match, output, id);
                expect(match.LLMRecommendation).toBe('NotDuplicate');
            }
        });

        it('is NotDuplicate with no prompt call when no candidate survives', async () => {
            answerByRecord({ 'cand-a': 0.1, 'cand-b': 0.1, 'cand-c': 0.2 });
            const { result } = await reasonOverSet('DecisionThenPrompt');

            expect(mockExecutePrompt).not.toHaveBeenCalled();
            expect(result.ReasoningRecommendation).toBe('NotDuplicate');
        });
    });
});
