import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AIDecisionParams, AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type { AIPromptParams, AIPromptRunResult } from '@memberjunction/ai-core-plus';
import type { ChatResult, DecisionAnswer } from '@memberjunction/ai';
import type {
    CompositeKey,
    EntityFieldInfo,
    EntityInfo,
    EntityRelationshipInfo,
    PotentialDuplicate,
    PotentialDuplicateResult,
} from '@memberjunction/core';
import type {
    MJAIPromptRunEntity,
    MJDuplicateRunDetailMatchEntity,
    MJEntityDocumentEntity,
} from '@memberjunction/core-entities';

// ─────────────────────────────────────────────
// Hoisted mocks
// ─────────────────────────────────────────────

const { mockRunViewFn, mockGetEntityObject, mockExecuteDecision, mockExecutePrompt, engineState } = vi.hoisted(() => ({
    mockRunViewFn: vi.fn().mockResolvedValue({ Success: true, Results: [], RowCount: 0 }),
    // A fresh, empty match row per call. The detector sets its columns and saves it.
    mockGetEntityObject: vi.fn(async () => ({ NewRecord: () => true })),
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
vi.mock('@memberjunction/ai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai')>();
    return {
        ApplyPlattCalibration: actual.ApplyPlattCalibration,
        DecisionResult: actual.DecisionResult,
        BaseEmbeddings: vi.fn(),
        GetAIAPIKey: vi.fn().mockReturnValue('mock-api-key'),
    };
});

vi.mock('@memberjunction/ai-vectordb', async () => ({
    ProviderIndexName: (await vi.importActual<typeof import('@memberjunction/ai-vectordb')>('@memberjunction/ai-vectordb')).ProviderIndexName,
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
        get Metadata() { return { GetEntityObject: mockGetEntityObject }; }
        SaveEntity = vi.fn().mockResolvedValue(true);
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

// The real decision-calibration helpers, loaded on their own: the package index extends entity
// classes these specs mock.
vi.mock('@memberjunction/ai-core-plus', async () => ({
    ...(await vi.importActual<typeof import('@memberjunction/ai-core-plus/dist/decision-calibration.js')>(
        '@memberjunction/ai-core-plus/dist/decision-calibration.js'
    )),
    AIPromptParams: class {},
}));

import { DuplicateRecordDetector } from '../duplicateRecordDetector';
import { PromptReasoningProvider } from '../reasoning/PromptReasoningProvider';
import { DecisionReasoningProvider } from '../reasoning/DecisionReasoningProvider';
import { DecisionThenPromptReasoningProvider } from '../reasoning/DecisionThenPromptReasoningProvider';
import { DuplicateReasoningProvider } from '../reasoning/DuplicateReasoningProvider';
import { DuplicateReasoningOutput } from '../reasoning/DuplicateReasoningTypes';
import { AnsweredBy, RawFor } from './helpers/decisionCalibration';

// ─────────────────────────────────────────────
// Fixtures. Each is a partial double of the type the detector reads, holding only the members
// the reasoning and auto-merge steps touch.
// ─────────────────────────────────────────────

const ABSOLUTE_THRESHOLD = 0.9;
const CANDIDATE_IDS = ['cand-a', 'cand-b', 'cand-c'];
const ENTITY_INFO = {
    Name: 'Accounts',
    Description: '',
    RelatedEntities: new Array<EntityRelationshipInfo>(),
    Fields: new Array<EntityFieldInfo>(),
    PrimaryKeys: new Array<EntityFieldInfo>(),
} as EntityInfo;

/** Structural twin of the detector's module-private `RecordQueryResult`. */
interface QueryResult {
    SourceKey: CompositeKey;
    TemplateText: string;
    Duplicates: PotentialDuplicateResult;
}

/** Exposes the protected pipeline steps under test. */
class TestableDetector extends DuplicateRecordDetector {
    public Resolve(entityDocument: MJEntityDocumentEntity): DuplicateReasoningProvider | null {
        return this.ResolveReasoningProvider(entityDocument);
    }
    public ReasonOver(qr: QueryResult, entityDocument: MJEntityDocumentEntity) {
        return this.RunReasoningForSet(qr, ENTITY_INFO, entityDocument, undefined);
    }
    public ApplyToResult(result: PotentialDuplicateResult, output: DuplicateReasoningOutput, fieldMap: { FieldName: string; Value: unknown }[]): void {
        this.applyReasoningToResult(result, output, fieldMap);
    }
    public ApplyToMatch(match: MJDuplicateRunDetailMatchEntity, output: DuplicateReasoningOutput, candidateRecordID: string): void {
        this.applyReasoningToMatch(match, output, candidateRecordID);
    }
    public Eligible(dupe: PotentialDuplicate, result: PotentialDuplicateResult, entityDocument: MJEntityDocumentEntity): boolean {
        return this.IsAutoMergeEligible(dupe, result, entityDocument, ABSOLUTE_THRESHOLD);
    }
    public SaveRows(result: PotentialDuplicateResult, output: DuplicateReasoningOutput): Promise<MJDuplicateRunDetailMatchEntity[]> {
        return this.CreateMatchRecordsForDetail('detail-1', result, output);
    }
}

function candidate(id: string): PotentialDuplicate {
    const dupe: Pick<PotentialDuplicate, 'ProbabilityScore' | 'Values' | 'ToURLSegment' | 'VectorMetadata'> = {
        ProbabilityScore: 0.99,
        Values: () => id,
        ToURLSegment: () => `ID|${id}`,
        VectorMetadata: { Name: id },
    };
    return dupe as PotentialDuplicate;
}

/** A matched set whose every candidate clears the absolute threshold on vector score alone. */
function queryResult(): QueryResult {
    return {
        SourceKey: { Values: () => 'src', ToString: () => 'src' } as CompositeKey,
        TemplateText: '',
        Duplicates: { Duplicates: CANDIDATE_IDS.map(candidate) } as PotentialDuplicateResult,
    };
}

/** An entity document with reasoning on and the most permissive automation level. */
function entityDoc(mode: MJEntityDocumentEntity['ReasoningMode']): MJEntityDocumentEntity {
    return {
        EnableLLMReasoning: true,
        ReasoningThreshold: null,
        ReasoningMode: mode,
        AutomationLevel: 'AutoMergeAboveAbsolute',
        ReasoningPromptID: null,
    } as MJEntityDocumentEntity;
}

/** An empty match row for applyReasoningToMatch to stamp. */
function matchRow(): MJDuplicateRunDetailMatchEntity {
    return {} as MJDuplicateRunDetailMatchEntity;
}

function runRow(id: string): MJAIPromptRunEntity {
    return { ID: id } as MJAIPromptRunEntity;
}

/** A successful prompt run. The prompt provider reads only success, result and promptRun. */
function promptRunResult(result: Record<string, unknown>, runID: string): AIPromptRunResult {
    return { success: true, result, promptRun: runRow(runID), chatResult: {} as ChatResult };
}

/** The prompt judges each listed candidate as given. */
function promptVerdicts(verdicts: Record<string, string>): void {
    const candidateVerdicts = Object.entries(verdicts).map(([recordId, recommendation]) => ({
        recordId, recommendation, confidence: 0.9, reasoning: '',
    }));
    mockExecutePrompt.mockResolvedValue(promptRunResult({ candidateVerdicts, survivorRecordId: 'src' }, 'prompt-run-1'));
}

/**
 * Answers each question, as the calibrated Jev ({@link AnsweredBy}), so that the candidate its instructions name
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
        return { success: true, Answers: answers, promptRun: runRow('decision-run-1'), ...AnsweredBy() };
    });
}

describe('DuplicateRecordDetector — decision reasoning modes', () => {
    let detector: TestableDetector;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });
        engineState.Prompts = [
            { ID: 'prompt-decision', Name: 'Default Decision' },
            { ID: 'prompt-reasoning', Name: 'Duplicate Resolution' },
        ];
        detector = new TestableDetector();
    });

    /** Run a set through reasoning, then apply the verdict to the result as the detector does. */
    async function reasonOverSet(mode: MJEntityDocumentEntity['ReasoningMode']) {
        const ed = entityDoc(mode);
        const qr = queryResult();
        const reasoning = await detector.ReasonOver(qr, ed);
        if (!reasoning) {
            throw new Error('expected the reasoning gate to be open');
        }
        detector.ApplyToResult(qr.Duplicates, reasoning.Output, reasoning.FieldMap);
        return { ed, result: qr.Duplicates, output: reasoning.Output };
    }

    /** Whether each candidate, in set order, is auto-merge eligible. */
    function eligibility(result: PotentialDuplicateResult, ed: MJEntityDocumentEntity): boolean[] {
        return result.Duplicates.map(dupe => detector.Eligible(dupe, result, ed));
    }

    describe('ResolveReasoningProvider', () => {
        it('maps Decision to the DecisionReasoningProvider', () => {
            expect(detector.Resolve(entityDoc('Decision'))).toBeInstanceOf(DecisionReasoningProvider);
        });

        it('maps DecisionThenPrompt to the DecisionThenPromptReasoningProvider', () => {
            expect(detector.Resolve(entityDoc('DecisionThenPrompt'))).toBeInstanceOf(DecisionThenPromptReasoningProvider);
        });

        it('still maps Prompt to the PromptReasoningProvider', () => {
            expect(detector.Resolve(entityDoc('Prompt'))).toBeInstanceOf(PromptReasoningProvider);
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
            const { ed, result, output } = await reasonOverSet('Decision');

            expect(output.Recommendation).not.toBe('Merge');
            expect(eligibility(result, ed)).toEqual([false, false, false]);
        });

        it.each(scenarios)('writes no Merge, survivor or field map on a match row for $name', async ({ arrange }) => {
            arrange();
            const { output } = await reasonOverSet('Decision');

            for (const id of CANDIDATE_IDS) {
                const match = matchRow();
                detector.ApplyToMatch(match, output, id);
                expect(match.LLMRecommendation).not.toBe('Merge');
                expect(match.LLMProposedSurvivorRecordID).toBeNull();
                expect(match.LLMProposedFieldMap).toBeNull();
            }
        });

        it('saves a failed decision\'s rows Pending, with no verdict and no run id', async () => {
            mockExecuteDecision.mockResolvedValue({ success: false, errorMessage: 'overloaded', Answers: {}, promptRun: runRow('decision-run-9') });
            const { result, output } = await reasonOverSet('Decision');

            expect(output.Success).toBe(false);
            expect(output.AIPromptRunID).toBe('decision-run-9');
            const rows = await detector.SaveRows(result, output);
            expect(rows).toHaveLength(3);
            for (const row of rows) {
                expect(row.ApprovalStatus).toBe('Pending');
                expect(row.LLMRecommendation).toBeUndefined();
                expect(row.AIPromptRunID).toBeUndefined();
            }
            expect(result.ReasoningRecommendation).toBeUndefined();
        });

        it('saves a successful decision\'s rows with each candidate\'s band and the decision run', async () => {
            const threshold = DecisionReasoningProvider.DEFAULT_UNCERTAIN_ABOVE;
            answerByRecord({ 'cand-a': 0.8, 'cand-b': 0.3, 'cand-c': threshold + 0.01 });
            const { result, output } = await reasonOverSet('Decision');

            const rows = await detector.SaveRows(result, output);
            expect(rows.map(r => r.LLMRecommendation)).toEqual(['Uncertain', 'NotDuplicate', 'Uncertain']);
            expect(rows.map(r => r.AIPromptRunID)).toEqual(['decision-run-1', 'decision-run-1', 'decision-run-1']);
        });

        it('stamps each candidate with its own band', async () => {
            const threshold = DecisionReasoningProvider.DEFAULT_UNCERTAIN_ABOVE;
            answerByRecord({ 'cand-a': 0.8, 'cand-b': 0.3, 'cand-c': threshold + 0.01 });
            const { output } = await reasonOverSet('Decision');

            const recommendations = CANDIDATE_IDS.map(id => {
                const match = matchRow();
                detector.ApplyToMatch(match, output, id);
                return match.LLMRecommendation;
            });
            expect(recommendations).toEqual(['Uncertain', 'NotDuplicate', 'Uncertain']);
        });
    });

    describe('DecisionThenPrompt keeps the prompt provider\'s auto-merge, for survivors only', () => {
        it('makes a surviving candidate eligible when the prompt recommends Merge', async () => {
            answerByRecord({ 'cand-a': 0.9, 'cand-b': 0.1, 'cand-c': 0.2 });
            promptVerdicts({ 'cand-a': 'Merge' });
            const { ed, result } = await reasonOverSet('DecisionThenPrompt');

            expect(result.ReasoningRecommendation).toBe('Merge');
            expect(detector.Eligible(result.Duplicates[0], result, ed)).toBe(true);
        });

        it('never merges a candidate the decision dropped, though its vector score clears the absolute threshold', async () => {
            answerByRecord({ 'cand-a': 0.9, 'cand-b': 0.1, 'cand-c': 0.2 });
            promptVerdicts({ 'cand-a': 'Merge' });
            const { ed, result } = await reasonOverSet('DecisionThenPrompt');

            expect(mockExecutePrompt.mock.calls[0][0].data?.['candidateCount']).toBe(1);
            expect(result.ReasoningRecommendation).toBe('Merge');
            expect(result.Duplicates.map(d => d.ReasoningRecommendation)).toEqual(['Merge', 'NotDuplicate', 'NotDuplicate']);
            expect(eligibility(result, ed)).toEqual([true, false, false]);
        });

        it('stamps the dropped candidates NotDuplicate on their match rows', async () => {
            answerByRecord({ 'cand-a': 0.9, 'cand-b': 0.1, 'cand-c': 0.2 });
            promptVerdicts({ 'cand-a': 'Merge' });
            const { output } = await reasonOverSet('DecisionThenPrompt');

            for (const id of ['cand-b', 'cand-c']) {
                const match = matchRow();
                detector.ApplyToMatch(match, output, id);
                expect(match.LLMRecommendation).toBe('NotDuplicate');
            }
        });

        it('points each match row at the run that produced its verdict', async () => {
            answerByRecord({ 'cand-a': 0.9, 'cand-b': 0.1, 'cand-c': 0.2 });
            promptVerdicts({ 'cand-a': 'Merge' });
            const { output } = await reasonOverSet('DecisionThenPrompt');

            const rows = CANDIDATE_IDS.map(id => {
                const match = matchRow();
                detector.ApplyToMatch(match, output, id);
                return [match.AIPromptRunID, match.AIAgentRunID];
            });
            expect(rows).toEqual([['prompt-run-1', null], ['decision-run-1', null], ['decision-run-1', null]]);
        });

        it('is NotDuplicate with no prompt call when no candidate survives', async () => {
            answerByRecord({ 'cand-a': 0.1, 'cand-b': 0.1, 'cand-c': 0.2 });
            const { ed, result } = await reasonOverSet('DecisionThenPrompt');

            expect(mockExecutePrompt).not.toHaveBeenCalled();
            expect(result.ReasoningRecommendation).toBe('NotDuplicate');
            expect(eligibility(result, ed)).toEqual([false, false, false]);
        });
    });

    describe('Prompt mode merges only the candidates the prompt judged Merge', () => {
        it('leaves a NotDuplicate or Uncertain candidate out of a set-level Merge', async () => {
            promptVerdicts({ 'cand-a': 'Merge', 'cand-b': 'NotDuplicate', 'cand-c': 'Uncertain' });
            const { ed, result } = await reasonOverSet('Prompt');

            expect(result.ReasoningRecommendation).toBe('Merge');
            expect(eligibility(result, ed)).toEqual([true, false, false]);
        });

        it('never merges a candidate the prompt returned no verdict for', async () => {
            promptVerdicts({ 'cand-a': 'Merge' });
            const { ed, result } = await reasonOverSet('Prompt');

            expect(result.Duplicates.map(d => d.ReasoningRecommendation)).toEqual(['Merge', undefined, undefined]);
            expect(eligibility(result, ed)).toEqual([true, false, false]);
        });
    });
});
