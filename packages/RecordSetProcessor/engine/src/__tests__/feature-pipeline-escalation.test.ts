import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { createHash } from 'node:crypto';
import { CompositeKey, EntityInfo, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    KnowledgeHubMetadataEngine,
    type MJFeaturePipelineTypeEntity,
    type MJAIPromptModelEntity,
    type MJFeatureValueCacheEntity,
    type MJRecordProcessEntity,
} from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import type { ParameterFidelity } from '@memberjunction/ai';
import type { AIDecisionRunner, AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type { RecordProcessorContext, RecordRef, RecordResult } from '@memberjunction/record-set-processor-base';
import {
    DECISION_FEATURE_PIPELINE_CAPABILITIES,
    FeatureValueCacheService,
    LLM_FEATURE_PIPELINE_CAPABILITIES,
    RenderConstraintBlock,
    type DataFeatureOutput,
    type DataFeatureSpec,
    type EntityInfoLike,
    type FeaturePipelineDriverCapabilities,
    type FeatureValueOutputItem,
    type CacheStoreParams,
    type RecordFeatureValuesParams,
    type RecordFeatureValuesOutcome,
} from '@memberjunction/feature-pipelines';
import { InferProcessor, type FeatureValueWriteParams } from '../processors/InferProcessor';
import { WriteBackProcessor } from '../processors/WriteBackProcessor';
import type { WriteBackRunPayload } from '@memberjunction/record-set-processor-base';
import {
    BaseFeaturePipelineDriver,
    type FeaturePipelineComputeRequest,
    type FeaturePipelineComputeResult,
} from '../feature-pipeline-drivers/BaseFeaturePipelineDriver';
import { DecisionFeaturePipelineDriver } from '../feature-pipeline-drivers/DecisionFeaturePipelineDriver';
import {
    BuildEscalationNote,
    DescribeBelowFloor,
    FeaturePipelineEscalator,
} from '../processors/FeaturePipelineEscalation';
import { FeaturePipelineVersionService, FindEscalationTargetSpecProblem } from '@memberjunction/feature-pipelines';

// ---------------------------------------------------------------------------
// Stub drivers, registered as the catalog's DriverClass values
// ---------------------------------------------------------------------------

/** What the decision model answers for one record. */
interface DecisionFixture {
    RawResult: Record<string, unknown>;
    Confidence: Record<string, number>;
}

/** The decision model's answers, by record ID; records without one get DEFAULT_DECISION. */
const decisionAnswers = new Map<string, DecisionFixture>();
/** The LLM's results, by record ID; records without one get an LLM answer of Executive / VIP. */
const llmResults = new Map<string, FeaturePipelineComputeResult>();
/** The records each driver computed, in order. */
const decisionCalls: string[] = [];
const llmCalls: string[] = [];

const DEFAULT_DECISION: DecisionFixture = {
    RawResult: { seniority: 'Manager', isVip: false },
    Confidence: { Seniority: 0.92, IsVIP: 0.95 },
};

/** Stands in for the Decision driver: answers from `decisionAnswers`, with a confidence per output. */
class DecisionStubDriver extends BaseFeaturePipelineDriver {
    public get Capabilities(): FeaturePipelineDriverCapabilities {
        return DECISION_FEATURE_PIPELINE_CAPABILITIES;
    }
    public async ComputeOutputs(request: FeaturePipelineComputeRequest): Promise<FeaturePipelineComputeResult> {
        const id = request.Record.RecordID;
        decisionCalls.push(id);
        const answer = decisionAnswers.get(id) ?? DEFAULT_DECISION;
        return { Success: true, RawResult: { ...answer.RawResult }, Confidence: { ...answer.Confidence }, AIPromptRunID: `DEC-RUN-${id}` };
    }
}
RegisterClass(BaseFeaturePipelineDriver, 'EscalationTest_DecisionStub')(DecisionStubDriver);

/** Stands in for the LLM driver: returns `llmResults`, or a successful answer. */
class LLMStubDriver extends BaseFeaturePipelineDriver {
    public get Capabilities(): FeaturePipelineDriverCapabilities {
        return LLM_FEATURE_PIPELINE_CAPABILITIES;
    }
    public async ComputeOutputs(request: FeaturePipelineComputeRequest): Promise<FeaturePipelineComputeResult> {
        const id = request.Record.RecordID;
        llmCalls.push(id);
        return llmResults.get(id) ?? { Success: true, RawResult: { seniority: 'Executive', isVip: true }, AIPromptRunID: `LLM-RUN-${id}` };
    }
}
RegisterClass(BaseFeaturePipelineDriver, 'EscalationTest_LLMStub')(LLMStubDriver);

/** The decision runner's results, one per call, in call order. */
const decisionRunnerResults: AIDecisionRunResult[] = [];

/**
 * The real Decision driver, with its decision runner replaced by one returning `decisionRunnerResults`.
 * The prompt is taken as a Decision prompt: the driver's own tests cover that check, and these fixtures
 * carry no model types.
 */
class MockedRunnerDecisionDriver extends DecisionFeaturePipelineDriver {
    protected override IsDecisionPrompt(): boolean {
        return true;
    }

    protected override CreateDecisionRunner(): AIDecisionRunner {
        const runner: Pick<AIDecisionRunner, 'ExecuteDecision'> = {
            ExecuteDecision: async () => {
                const next = decisionRunnerResults.shift();
                return next ?? { success: false, errorMessage: 'no decision fixture left', Answers: {} };
            },
        };
        return runner as AIDecisionRunner;
    }
}
RegisterClass(BaseFeaturePipelineDriver, 'EscalationTest_MockedRunnerDecision')(MockedRunnerDecisionDriver);

/** Exposes the protected prompt version hash. */
class HashProbe extends InferProcessor {
    public Hash(prompt: MJAIPromptEntityExtended, spec?: DataFeatureSpec): string {
        return this.computePromptVersionHash(prompt, spec);
    }
}

/** Exposes the protected history recording. */
class HistoryProbe extends InferProcessor {
    public RecordHistory(params: FeatureValueWriteParams): Promise<RecordFeatureValuesOutcome | null> {
        return this.UpsertFeatureValues(params);
    }
}

// ---------------------------------------------------------------------------
// Typed doubles: each is a Pick of the real type, and one seam cast widens it
// ---------------------------------------------------------------------------

type PromptDouble = Pick<MJAIPromptEntityExtended, 'ID' | 'Name' | 'TemplateText'>;
type PipelineTypeDouble = Pick<MJFeaturePipelineTypeEntity, 'ID' | 'Name' | 'DriverClass' | 'Status'>;
type CacheEntryDouble = Pick<MJFeatureValueCacheEntity, 'ID' | 'OutputsJSON' | 'Reasoning' | 'AIPromptRunID'>;
type TargetRowDouble = Pick<
    MJRecordProcessEntity,
    'ID' | 'Name' | 'WorkType' | 'Status' | 'EntityID' | 'Entity' | 'PromptID' | 'Configuration' | 'InputMapping' | 'Load' | 'InnerLoad' | 'Get'
>;
type ProviderDouble = Pick<IMetadataProvider, 'GetEntityObject' | 'EntityByID' | 'EntityByName'>;
type PromptModelDouble = Pick<MJAIPromptModelEntity, 'PromptID' | 'ModelID' | 'Priority' | 'Status' | 'EffortLevel' | 'ModelParameters'>;

const asPrompt = (p: PromptDouble): MJAIPromptEntityExtended => p as MJAIPromptEntityExtended;
const asPromptModel = (m: PromptModelDouble): MJAIPromptModelEntity => m as MJAIPromptModelEntity;
const asPipelineType = (t: PipelineTypeDouble): MJFeaturePipelineTypeEntity => t as MJFeaturePipelineTypeEntity;
const asCacheEntry = (e: Pick<MJFeatureValueCacheEntity, 'ID'> | CacheEntryDouble): MJFeatureValueCacheEntity => e as MJFeatureValueCacheEntity;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ENTITY_ID = 'ENT-1';
const DECISION_PIPELINE_ID = 'DEC-PIPE-1';
const LLM_PIPELINE_ID = 'LLM-PIPE-1';
const DECISION_PROMPT: PromptDouble = { ID: 'DEC-PROMPT', Name: 'Classify seniority (decision)', TemplateText: 'Decide the seniority of {{record.Title}}' };
const LLM_PROMPT: PromptDouble = { ID: 'LLM-PROMPT', Name: 'Classify seniority', TemplateText: 'Classify the seniority of {{record.Title}}\n{{ ConstraintBlock }}' };

const CONTACTS: EntityInfoLike = {
    ID: ENTITY_ID,
    Name: 'Contacts',
    Fields: [
        { Name: 'ID', TSType: 'string', IsPrimaryKey: true, IsVirtual: false },
        { Name: 'Title', TSType: 'string', Type: 'nvarchar', Length: 200, IsVirtual: false },
        { Name: 'Seniority', TSType: 'string', Type: 'nvarchar', Length: 50, IsVirtual: false },
        { Name: 'IsVIP', TSType: 'boolean', Type: 'bit', IsVirtual: false },
        { Name: 'IsPriority', TSType: 'boolean', Type: 'bit', IsVirtual: false },
    ],
};

function outputs(refs: { Seniority: string; IsVIP: string } = { Seniority: '$.seniority', IsVIP: '$.isVip' }): DataFeatureOutput[] {
    return [
        {
            Name: 'Seniority',
            Ref: refs.Seniority,
            Constraint: {
                Type: 'enum',
                Values: ['Executive', 'Manager', 'Staff'],
                ValueDescriptions: { Executive: 'Runs the organization', Manager: 'Manages a team', Staff: 'An individual contributor' },
                OnViolation: 'fail',
            },
            Target: { Mode: 'field', EntityFieldName: 'Seniority' },
        },
        {
            Name: 'IsVIP',
            Ref: refs.IsVIP,
            Constraint: { Type: 'boolean', OnViolation: 'fail' },
            Target: { Mode: 'field', EntityFieldName: 'IsVIP' },
        },
    ];
}

function decisionSpec(overrides: Partial<DataFeatureSpec> = {}): DataFeatureSpec {
    return {
        Name: 'Seniority (Decision)',
        Description: 'Classifies seniority on a decision model',
        PromptID: DECISION_PROMPT.ID,
        PipelineType: 'Decision',
        Context: { Fields: ['Title'] },
        Outputs: outputs(),
        Caching: { Cacheable: false },
        Escalation: { PipelineID: LLM_PIPELINE_ID, BelowConfidence: 0.7 },
        ...overrides,
    };
}

function llmSpec(overrides: Partial<DataFeatureSpec> = {}): DataFeatureSpec {
    return {
        Name: 'Seniority (LLM)',
        Description: 'Classifies seniority with an LLM',
        PromptID: LLM_PROMPT.ID,
        Context: { Fields: ['Title'] },
        Outputs: outputs(),
        Caching: { Cacheable: false },
        ...overrides,
    };
}

const makeRecord = (id: string, title = `Title of ${id}`): RecordRef => ({ EntityID: ENTITY_ID, RecordID: id, Record: { ID: id, Title: title } });

/** A decision answer whose IsVIP confidence is below the 0.7 floor. */
const BELOW_FLOOR: DecisionFixture = { RawResult: { seniority: 'Manager', isVip: false }, Confidence: { Seniority: 0.91, IsVIP: 0.4 } };

describe('Decision pipeline escalation', () => {
    let targetRow: TargetRowDouble;
    let getEntityObject: ReturnType<typeof vi.fn>;
    let loadTarget: ReturnType<typeof vi.fn>;
    let context: RecordProcessorContext;
    let historyCalls: RecordFeatureValuesParams[];
    let store: MockInstance<FeatureValueCacheService['Store']>;
    let batchLookup: MockInstance<FeatureValueCacheService['BatchLookup']>;
    /** Captures the escalation summary that InferProcessor reports through LogStatus. */
    let consoleLog: MockInstance<typeof console.log>;

    beforeEach(() => {
        consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        decisionAnswers.clear();
        llmResults.clear();
        decisionRunnerResults.length = 0;
        decisionCalls.length = 0;
        llmCalls.length = 0;

        vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([asPrompt(DECISION_PROMPT), asPrompt(LLM_PROMPT)]);
        vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'FeaturePipelineTypes', 'get').mockReturnValue([
            asPipelineType({ ID: 'FPT-LLM', Name: 'LLM', DriverClass: 'EscalationTest_LLMStub', Status: 'Active' }),
            asPipelineType({ ID: 'FPT-DEC', Name: 'Decision', DriverClass: 'EscalationTest_DecisionStub', Status: 'Active' }),
        ]);

        historyCalls = [];
        vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockImplementation(async (params) => {
            historyCalls.push(params);
            return { Upserted: params.outputs.length, Unchanged: 0, Previous: {} };
        });
        batchLookup = vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
        store = vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockImplementation(async (params) =>
            asCacheEntry({ ID: `CACHE-${params.promptID}-${params.keyDisplay}` })
        );

        loadTarget = vi.fn().mockResolvedValue(true);
        targetRow = {
            ID: LLM_PIPELINE_ID,
            Name: 'Seniority (LLM)',
            WorkType: 'Infer',
            Status: 'Active',
            EntityID: ENTITY_ID,
            Entity: 'Contacts',
            PromptID: LLM_PROMPT.ID,
            Configuration: JSON.stringify(llmSpec()),
            InputMapping: null,
            Load: loadTarget,
            // the dry-run write-back also loads the processed record through this double, to compare its fields
            InnerLoad: vi.fn().mockResolvedValue(true),
            Get: () => undefined,
        };
        getEntityObject = vi.fn().mockImplementation(async () => targetRow);
        const provider: ProviderDouble = {
            GetEntityObject: getEntityObject,
            EntityByID: vi.fn().mockImplementation((id: string) => (id === ENTITY_ID ? CONTACTS : undefined)),
            EntityByName: vi.fn().mockImplementation((name: string) => (name === 'Contacts' ? CONTACTS : undefined)),
        };
        context = {
            contextUser: { ID: 'user-1' } as UserInfo,
            provider: provider as IMetadataProvider,
            recordProcessID: DECISION_PIPELINE_ID,
            entityID: ENTITY_ID,
            processRunID: 'RUN-1',
        };
    });

    /** A pipeline's constraint hash once its run resolved its constraints, as the processor that ran it reports it. */
    const resolvedConstraintHash = async (prompt: PromptDouble, spec: DataFeatureSpec): Promise<string> => {
        const probe = new InferProcessor(prompt.ID, undefined, spec, null);
        await probe.ResolvePin(asPrompt(prompt), context);
        return probe.ConstraintHash;
    };
    const historyFor = (recordID: string): RecordFeatureValuesParams[] => historyCalls.filter((h) => h.recordID === recordID);
    /** Whether a history row records a decision an escalation superseded (its reasoning says so). */
    const isSuperseded = (h: RecordFeatureValuesParams): boolean => h.outputs.some((o) => o.reasoning?.startsWith('Superseded:') ?? false);
    /** A record's answer rows: its history without the superseded decision's row. */
    const answersFor = (recordID: string): RecordFeatureValuesParams[] => historyFor(recordID).filter((h) => !isSuperseded(h));
    /** A record's superseded-decision rows. */
    const supersededFor = (recordID: string): RecordFeatureValuesParams[] => historyFor(recordID).filter(isSuperseded);
    const valuesOf = (h: RecordFeatureValuesParams): Record<string, unknown> =>
        Object.fromEntries(h.outputs.map((o: FeatureValueOutputItem) => [o.featureName, o.value]));

    // ================================================================
    // Which records escalate
    // ================================================================

    describe('the Decision pipeline\'s confidence floors hold for an escalated answer', () => {
        /** The decision spec with a floor on Seniority, read from the escalated answer's `seniorityConfidence`. */
        const flooredDecision = (policy: 'null' | 'fail'): DataFeatureSpec => decisionSpec({
            Outputs: outputs().map((o) => (o.Name === 'Seniority' ? { ...o, ConfidenceRef: '$.seniorityConfidence', MinConfidence: 0.8, OnLowConfidence: policy } : o)),
        });

        it('withholds a below-floor escalated output under a null floor', async () => {
            decisionAnswers.set('r1', BELOW_FLOOR);
            llmResults.set('r1', { Success: true, RawResult: { seniority: 'Executive', isVip: true, seniorityConfidence: 0.3 }, AIPromptRunID: 'LLM-RUN-r1' });
            const result = await new InferProcessor(DECISION_PROMPT.ID, undefined, flooredDecision('null'), null).ProcessRecord(makeRecord('r1'), context);
            expect(result.Status).toBe('Succeeded');
            expect(result.BelowConfidenceOutputs).toEqual(['Seniority']);
            expect(result.ResultPayload).toMatchObject({ seniority: null, isVip: true });
        });

        it('fails the record as BelowConfidence under a fail floor, naming the escalation', async () => {
            decisionAnswers.set('r1', BELOW_FLOOR);
            llmResults.set('r1', { Success: true, RawResult: { seniority: 'Executive', isVip: true, seniorityConfidence: 0.3 }, AIPromptRunID: 'LLM-RUN-r1' });
            const result = await new InferProcessor(DECISION_PROMPT.ID, undefined, flooredDecision('fail'), null).ProcessRecord(makeRecord('r1'), context);
            expect(result).toMatchObject({ Status: 'Failed', FailureKind: 'BelowConfidence', BelowConfidenceOutputs: ['Seniority'] });
            expect(result.ErrorMessage).toMatch(/escalation to LLM pipeline 'Seniority \(LLM\)' failed: Answer below its confidence floor: 'Seniority' confidence 0.3 < 0.8/);
        });

        it('keeps an escalated answer at or above the floor', async () => {
            decisionAnswers.set('r1', BELOW_FLOOR);
            llmResults.set('r1', { Success: true, RawResult: { seniority: 'Executive', isVip: true, seniorityConfidence: 0.9 }, AIPromptRunID: 'LLM-RUN-r1' });
            const result = await new InferProcessor(DECISION_PROMPT.ID, undefined, flooredDecision('fail'), null).ProcessRecord(makeRecord('r1'), context);
            expect(result.Status).toBe('Succeeded');
            expect(result.BelowConfidenceOutputs).toBeUndefined();
        });
    });

    describe('which records escalate', () => {
        it('does not escalate a record whose every output is at or above the floor', async () => {
            decisionAnswers.set('r1', { RawResult: { seniority: 'Staff', isVip: true }, Confidence: { Seniority: 0.7, IsVIP: 0.99 } });
            const processor = new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null);
            const result = await processor.ProcessRecord(makeRecord('r1'), context);

            expect(result.Status).toBe('Succeeded');
            expect(result.ResultPayload).toEqual({ seniority: 'Staff', isVip: true, [InferProcessor.DRIVER_CONFIDENCE_KEY]: { Seniority: 0.7, IsVIP: 0.99 } });
            expect(result.AIPromptRunID).toBe('DEC-RUN-r1');
            expect(result.Confidence).toEqual({ Seniority: 0.7, IsVIP: 0.99 });
            expect(llmCalls).toEqual([]);
            // the target's row is read once, for the Decision pipeline's pin, which covers the target's; its model is not called
            expect(getEntityObject).toHaveBeenCalledTimes(1);
            expect(processor.EscalatedRecordCount).toBe(0);
            expect(historyFor('r1')[0].promptID).toBe(DECISION_PROMPT.ID);
        });

        it('does not escalate a confident "no" from the real Decision mapping: P(yes) 0.03 writes false, with confidence 0.97', async () => {
            vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'FeaturePipelineTypes', 'get').mockReturnValue([
                asPipelineType({ ID: 'FPT-LLM', Name: 'LLM', DriverClass: 'EscalationTest_LLMStub', Status: 'Active' }),
                asPipelineType({ ID: 'FPT-DEC', Name: 'Decision', DriverClass: 'EscalationTest_MockedRunnerDecision', Status: 'Active' }),
            ]);
            decisionRunnerResults.push({
                success: true,
                Answers: {
                    Seniority: { Kind: 'Choice', Value: 'Manager', Probabilities: { Executive: 0.02, Manager: 0.95, Staff: 0.03 }, Confidence: 0.95 },
                    IsVIP: { Kind: 'Likelihood', Probability: 0.03 },
                },
            });
            const processor = new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null);
            const result = await processor.ProcessRecord(makeRecord('r1'), context);

            expect(result.Status).toBe('Succeeded');
            expect(result.ResultPayload).toMatchObject({ seniority: 'Manager', isVip: false });
            expect(result.Confidence?.IsVIP).toBeCloseTo(0.97);
            expect(decisionRunnerResults).toHaveLength(0);
            expect(llmCalls).toEqual([]);
            // the target's row is read once, for the Decision pipeline's pin, which covers the target's; its model is not called
            expect(getEntityObject).toHaveBeenCalledTimes(1);
            expect(processor.EscalatedRecordCount).toBe(0);
        });

        it('escalates the whole record when one output is below the floor, and the LLM outputs are written back', async () => {
            decisionAnswers.set('r1', BELOW_FLOOR);
            const processor = new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null);
            const writeBack = new WriteBackProcessor(processor, { fields: { Seniority: '$.seniority', IsVIP: '$.isVip' } }, true);
            const result = await writeBack.ProcessRecord(makeRecord('r1'), context);

            expect(result.Status).toBe('Succeeded');
            expect(llmCalls).toEqual(['r1']);
            expect(result.AIPromptRunID).toBe('LLM-RUN-r1');
            expect(result.Confidence).toBeUndefined();
            const { output, writeBack: applied } = result.ResultPayload as WriteBackRunPayload;
            expect(output).toEqual({ seniority: 'Executive', isVip: true });
            expect(applied?.previewFields).toEqual({ Seniority: 'Executive', IsVIP: true });
            expect(processor.EscalatedRecordCount).toBe(1);
            expect(consoleLog).toHaveBeenCalledWith(
                "InferProcessor: escalated 1 record(s) whose decision confidence was below 0.7 to Feature Pipeline 'LLM-PIPE-1' (0 failed); 1 escalated in this run."
            );
        });

        it('fails every escalating record when the target is gated and its version has no passing golden-set result, registering nothing', async () => {
            targetRow.Configuration = JSON.stringify(llmSpec({ Activation: { GoldenSetTestID: 'T-9', Metric: 'accuracy', Threshold: 0.9 } }));
            // the target pipeline has no version rows yet
            vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' });
            const register = vi.spyOn(FeaturePipelineVersionService.Instance, 'RegisterCandidate');
            const resolve = vi.spyOn(FeaturePipelineVersionService.Instance, 'ResolveForRun');
            decisionAnswers.set('r2', BELOW_FLOOR);
            decisionAnswers.set('r3', BELOW_FLOOR);
            const results = await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ProcessBatch([makeRecord('r1'), makeRecord('r2'), makeRecord('r3')], context);

            expect(results.get('r1')?.Status).toBe('Succeeded');
            for (const id of ['r2', 'r3']) {
                expect(results.get(id)?.Status).toBe('Failed');
                expect(results.get(id)?.ErrorMessage).toContain('Decision confidence below 0.7 (IsVIP 0.4); ');
                expect(results.get(id)?.ErrorMessage).toContain('run its golden-set test (MJ: Tests ID T-9)');
            }
            expect(llmCalls).toEqual([]);
            expect(register).not.toHaveBeenCalled();
            expect(resolve).not.toHaveBeenCalled();
        });

        it('runs the target without resolving a version of the target pipeline: the Decision pipeline writes the answers', async () => {
            const resolve = vi.spyOn(FeaturePipelineVersionService.Instance, 'ResolveForRun').mockResolvedValue({ Version: 3, Status: 'Active' });
            decisionAnswers.set('r1', BELOW_FLOOR);
            const result = await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ProcessRecord(makeRecord('r1'), context);
            expect(result.Status).toBe('Succeeded');
            expect(llmCalls).toEqual(['r1']);
            expect(resolve).not.toHaveBeenCalled();
        });

        it('gives write-back one run\'s provenance: an escalated record\'s $run names the LLM prompt with its run and hash', async () => {
            decisionAnswers.set('r1', BELOW_FLOOR);
            const spec = decisionSpec();
            const provenance = { Title: '$run.PromptID', Seniority: '$run.AIPromptRunID' };
            const run = { RecordProcessID: DECISION_PIPELINE_ID, PromptID: DECISION_PROMPT.ID };
            const single = new WriteBackProcessor(new InferProcessor(DECISION_PROMPT.ID, undefined, spec, null), { fields: provenance }, true, run);
            const batch = new WriteBackProcessor(new InferProcessor(DECISION_PROMPT.ID, undefined, spec, null), { fields: provenance }, true, run);

            const escalated = await single.ProcessRecord(makeRecord('r1'), context);
            const results = await batch.ProcessBatch([makeRecord('r1'), makeRecord('r2')], context);

            const escalatedPreview = { writeBack: { previewFields: { Title: LLM_PROMPT.ID, Seniority: 'LLM-RUN-r1' } } };
            expect(escalated).toMatchObject({ PromptID: LLM_PROMPT.ID, ResultPayload: escalatedPreview });
            expect(results.get('r1')).toMatchObject({ PromptID: LLM_PROMPT.ID, ResultPayload: escalatedPreview });
            // A decision that stands keeps the process's own prompt
            expect(results.get('r2')?.PromptID).toBeUndefined();
            expect(results.get('r2')).toMatchObject({ ResultPayload: { writeBack: { previewFields: { Title: DECISION_PROMPT.ID, Seniority: 'DEC-RUN-r2' } } } });
        });

        it('writes nothing on a dry run: no cache row or Feature Value for the decision, its target, or the superseded decision', async () => {
            decisionAnswers.set('r1', BELOW_FLOOR);
            // A cacheable target, so its own Dedup Cache store is one of the writes a dry run must skip
            targetRow.Configuration = JSON.stringify({ ...llmSpec(), Caching: { Cacheable: true, KeyFields: ['Title'], Scope: 'pipeline' } });
            const processor = new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null);
            const result = await processor.ProcessRecord(makeRecord('r1'), { ...context, DryRun: true });

            expect(result).toMatchObject({ Status: 'Succeeded', AIPromptRunID: 'LLM-RUN-r1', DryRun: true });
            expect(llmCalls).toEqual(['r1']);
            expect(historyCalls).toEqual([]);
            expect(store).not.toHaveBeenCalled();
        });

        it('escalates a record when an output has no confidence', async () => {
            decisionAnswers.set('r1', { RawResult: { seniority: 'Manager', isVip: false }, Confidence: { Seniority: 0.99 } });
            const result = await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ProcessRecord(makeRecord('r1'), context);

            expect(llmCalls).toEqual(['r1']);
            expect(result.ResultPayload).toEqual({ seniority: 'Executive', isVip: true });
            expect(answersFor('r1')[0].outputs[0].reasoning).toContain('IsVIP none');
        });

        it('records the LLM call\'s parameter fidelity on the escalated record', async () => {
            const sent: ParameterFidelity = { Status: 'sent-unchanged', Sent: { VendorModelName: 'gemini-3.1-flash-lite', Temperature: 0, MaxTokens: null, Seed: 42 } };
            decisionAnswers.set('r1', BELOW_FLOOR);
            llmResults.set('r1', { Success: true, RawResult: { seniority: 'Executive', isVip: true }, AIPromptRunID: 'LLM-RUN-r1', ParameterFidelity: sent });
            const result = await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ProcessRecord(makeRecord('r1'), context);

            expect(result.Status).toBe('Succeeded');
            expect(result.ParameterFidelity).toEqual(sent);
        });

        it('lists every output below the floor or without a finite confidence', () => {
            const escalator = new FeaturePipelineEscalator({ PipelineID: LLM_PIPELINE_ID, BelowConfidence: 0.7 }, outputs(), () => {
                throw new Error('not built in this test');
            });
            expect(escalator.BelowFloor(undefined)).toEqual([{ OutputName: 'Seniority' }, { OutputName: 'IsVIP' }]);
            expect(escalator.BelowFloor({ Seniority: Number.NaN, IsVIP: 0.69 })).toEqual([
                { OutputName: 'Seniority' },
                { OutputName: 'IsVIP', Confidence: 0.69 },
            ]);
            expect(escalator.BelowFloor({ Seniority: 0.7, IsVIP: 1 })).toEqual([]);
        });
    });

    // ================================================================
    // Failures
    // ================================================================

    describe('when the escalation fails', () => {
        it('fails the record when the target reports success without a Feature Value key', async () => {
            decisionAnswers.set('r1', BELOW_FLOOR);
            vi.spyOn(InferProcessor.prototype, 'FeatureValueKeyOf').mockReturnValue(undefined);
            const result = await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ProcessRecord(makeRecord('r1'), context);
            expect(result.Status).toBe('Failed');
            expect(result.ErrorMessage).toContain('it returned no Feature Value key');
            expect(answersFor('r1')).toHaveLength(0);
        });

        it('keeps the LLM call\'s parameter fidelity when the target reports success without a Feature Value key', async () => {
            const sent: ParameterFidelity = { Status: 'sent-unchanged', Sent: { VendorModelName: 'gemini-3.1-flash-lite', Temperature: 0, MaxTokens: null, Seed: 42 } };
            decisionAnswers.set('r1', BELOW_FLOOR);
            llmResults.set('r1', { Success: true, RawResult: { seniority: 'Executive', isVip: true }, AIPromptRunID: 'LLM-RUN-r1', ParameterFidelity: sent });
            vi.spyOn(InferProcessor.prototype, 'FeatureValueKeyOf').mockReturnValue(undefined);
            const result = await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ProcessRecord(makeRecord('r1'), context);

            expect(result).toMatchObject({ Status: 'Failed', ParameterFidelity: sent });
        });

        it('links the decision\'s prompt run when the failed escalation names an empty one', async () => {
            decisionAnswers.set('r1', BELOW_FLOOR);
            llmResults.set('r1', { Success: false, ErrorMessage: 'model unavailable', AIPromptRunID: '' });
            const result = await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ProcessRecord(makeRecord('r1'), context);

            expect(result).toMatchObject({ Status: 'Failed', AIPromptRunID: 'DEC-RUN-r1' });
        });

        it('links the decision\'s prompt run when a rejected escalated answer names an empty one', async () => {
            const [seniorityOutput, isVip] = outputs();
            targetRow.Configuration = JSON.stringify(llmSpec({ Outputs: [{ ...seniorityOutput, Constraint: { Type: 'enum', Values: ['Executive', 'Director', 'Manager', 'Staff'], OnViolation: 'fail' } }, isVip] }));
            llmResults.set('r1', { Success: true, RawResult: { seniority: 'Director', isVip: true }, AIPromptRunID: '' });
            decisionAnswers.set('r1', BELOW_FLOOR);
            const result = await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ProcessRecord(makeRecord('r1'), context);

            expect(result).toMatchObject({ Status: 'Failed', FailureKind: 'RejectedInvalid', AIPromptRunID: 'DEC-RUN-r1' });
        });

        it('fails the record with both reasons, and writes none of the decision answers', async () => {
            decisionAnswers.set('r1', BELOW_FLOOR);
            llmResults.set('r1', { Success: false, ErrorMessage: 'model unavailable', AIPromptRunID: 'LLM-RUN-FAILED' });
            const processor = new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec({ Caching: { Cacheable: true, KeyFields: ['Title'] } }), null);
            // On the pipeline itself, not through a write-back: without one its writes are immediate, so a stray write shows.
            const result = await processor.ProcessRecord(makeRecord('r1'), context);

            expect(result).toEqual({
                Status: 'Failed',
                ErrorMessage: "Decision confidence below 0.7 (IsVIP 0.4); escalation to LLM pipeline 'Seniority (LLM)' failed: model unavailable",
                AIPromptRunID: 'LLM-RUN-FAILED',
            });
            expect(historyCalls).toEqual([]);
            expect(store).not.toHaveBeenCalled();
            expect(processor.EscalatedRecordCount).toBe(1);
        });

        it('fails the record when the LLM answer violates the LLM pipeline\'s own constraints', async () => {
            decisionAnswers.set('r1', BELOW_FLOOR);
            llmResults.set('r1', { Success: true, RawResult: { seniority: 'Wizard', isVip: true }, AIPromptRunID: 'LLM-RUN-r1' });
            const result = await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ProcessRecord(makeRecord('r1'), context);

            expect(result.Status).toBe('Failed');
            expect(result.ErrorMessage).toContain('Decision confidence below 0.7 (IsVIP 0.4)');
            expect(result.ErrorMessage).toContain("Constraint violation for 'Seniority'");
            expect(historyCalls).toEqual([]);
        });

        it('keeps the LLM call\'s refused parameter fidelity on the failed record', async () => {
            const configured = { VendorModelName: 'gemini-3.1-flash-lite', Temperature: 0, MaxTokens: null, Seed: 42 };
            const refused: Extract<ParameterFidelity, { Status: 'refused' }> = { Status: 'refused', Configured: configured, WouldSend: { ...configured, Seed: null } };
            decisionAnswers.set('r1', BELOW_FLOOR);
            llmResults.set('r1', { Success: false, ErrorMessage: 'refused', AIPromptRunID: 'LLM-RUN-FAILED', ParameterFidelity: refused });
            const result = await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ProcessRecord(makeRecord('r1'), context);

            expect(result.Status).toBe('Failed');
            expect(result.ParameterFidelity).toEqual(refused);
        });

        it('keeps the LLM call\'s parameter fidelity when its answer is outside the Decision pipeline\'s enum', async () => {
            const sent: ParameterFidelity = { Status: 'sent-unchanged', Sent: { VendorModelName: 'gemini-3.1-flash-lite', Temperature: 0, MaxTokens: null, Seed: 42 } };
            const [seniorityOutput, isVip] = outputs();
            targetRow.Configuration = JSON.stringify(llmSpec({ Outputs: [{ ...seniorityOutput, Constraint: { Type: 'enum', Values: ['Executive', 'Director', 'Manager', 'Staff'], OnViolation: 'fail' } }, isVip] }));
            llmResults.set('r1', { Success: true, RawResult: { seniority: 'Director', isVip: true }, AIPromptRunID: 'LLM-RUN-r1', ParameterFidelity: sent });
            decisionAnswers.set('r1', BELOW_FLOOR);
            const result = await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ProcessRecord(makeRecord('r1'), context);

            expect(result).toMatchObject({ Status: 'Failed', FailureKind: 'RejectedInvalid', ParameterFidelity: sent });
        });

        it('keeps the LLM call\'s parameter fidelity when the superseded decision\'s row cannot be written', async () => {
            const sent: ParameterFidelity = { Status: 'sent-unchanged', Sent: { VendorModelName: 'gemini-3.1-flash-lite', Temperature: 0, MaxTokens: null, Seed: 42 } };
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockRejectedValue(new Error('FK_FeatureValue_AIPromptRun'));
            llmResults.set('r1', { Success: true, RawResult: { seniority: 'Executive', isVip: true }, AIPromptRunID: 'LLM-RUN-r1', ParameterFidelity: sent });
            decisionAnswers.set('r1', BELOW_FLOOR);
            const result = await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ProcessRecord(makeRecord('r1'), context);

            expect(result).toMatchObject({ Status: 'Failed', ErrorMessage: 'Feature Value write failed: FK_FeatureValue_AIPromptRun', ParameterFidelity: sent });
        });

        it('fails the record when the LLM driver throws', async () => {
            decisionAnswers.set('r1', BELOW_FLOOR);
            vi.spyOn(LLMStubDriver.prototype, 'ComputeOutputs').mockRejectedValue(new Error('socket hang up'));
            const result = await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ProcessRecord(makeRecord('r1'), context);

            expect(result.Status).toBe('Failed');
            expect(result.ErrorMessage).toBe("Decision confidence below 0.7 (IsVIP 0.4); escalation to LLM pipeline 'Seniority (LLM)' failed: socket hang up");
            expect(result.AIPromptRunID).toBe('DEC-RUN-r1');
        });
    });

    // ================================================================
    // The Decision pipeline's own constraints
    // ================================================================

    describe('the Decision pipeline\'s own constraints', () => {
        /** The LLM pipeline's outputs, with Seniority unconstrained or a wider enum that allows Director. */
        const looserTargets: Array<{ name: string; seniority: DataFeatureOutput['Constraint'] }> = [
            { name: 'no constraint', seniority: undefined },
            { name: 'a wider enum', seniority: { Type: 'enum', Values: ['Executive', 'Director', 'Manager', 'Staff'], OnViolation: 'fail' } },
        ];

        /** Points the escalation at an LLM pipeline whose Seniority output has the given constraint, and has it answer Director. */
        function escalateToDirector(seniority: DataFeatureOutput['Constraint']): void {
            const [seniorityOutput, isVip] = outputs();
            targetRow.Configuration = JSON.stringify(llmSpec({ Outputs: [{ ...seniorityOutput, Constraint: seniority }, isVip] }));
            llmResults.set('r1', { Success: true, RawResult: { seniority: 'Director', isVip: true }, AIPromptRunID: 'LLM-RUN-r1' });
            decisionAnswers.set('r1', BELOW_FLOOR);
        }

        for (const target of looserTargets) {
            it(`fails the record when the LLM, with ${target.name}, answers outside the Decision pipeline's enum, and writes nothing`, async () => {
                escalateToDirector(target.seniority);
                const log = vi.spyOn(console, 'log');
                const processor = new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null);
                // On the pipeline itself, not through a write-back: without one its writes are immediate, so a stray write shows.
                const result = await processor.ProcessRecord(makeRecord('r1'), context);

                expect(result).toEqual({
                    Status: 'Failed',
                    FailureKind: 'RejectedInvalid',
                    ErrorMessage:
                        "Decision confidence below 0.7 (IsVIP 0.4); escalation to LLM pipeline 'Seniority (LLM)' failed: " +
                        "its answer is outside this Decision pipeline's own constraints: Constraint violation for 'Seniority': " +
                        "Value 'Director' is not in the allowed vocabulary: [Executive, Manager, Staff].",
                    AIPromptRunID: 'LLM-RUN-r1',
                });
                expect(llmCalls).toEqual(['r1']);
                expect(historyCalls).toEqual([]);
                expect(store).not.toHaveBeenCalled();
                expect(processor.EscalatedRecordCount).toBe(1);
                expect(log).toHaveBeenCalledWith(expect.stringContaining("to Feature Pipeline 'LLM-PIPE-1' (1 failed)"));
            });
        }

        it('applies the Decision pipeline\'s null policy to an escalated value outside its enum', async () => {
            escalateToDirector(undefined);
            const [seniority, isVip] = outputs();
            const seniorityConstraint = seniority.Constraint;
            if (seniorityConstraint?.Type !== 'enum') throw new Error('the Seniority fixture output is an enum');
            const spec = decisionSpec({ Outputs: [{ ...seniority, Constraint: { ...seniorityConstraint, OnViolation: 'null' } }, isVip] });
            const result = await new InferProcessor(DECISION_PROMPT.ID, undefined, spec, null).ProcessRecord(makeRecord('r1'), context);

            expect(result.Status).toBe('Succeeded');
            expect(result.ResultPayload).toMatchObject({ seniority: null, isVip: true });
            expect(result.ResultPayload).toHaveProperty('_violations', [
                { outputName: 'Seniority', violationMessage: "Value 'Director' is not in the allowed vocabulary: [Executive, Manager, Staff].", policy: 'null' },
            ]);
            expect(valuesOf(answersFor('r1')[0])).toEqual({ Seniority: null, IsVIP: true });
        });

        it('keeps an escalated value inside the Decision pipeline\'s enum, in the enum\'s casing', async () => {
            escalateToDirector(undefined);
            llmResults.set('r1', { Success: true, RawResult: { seniority: 'manager', isVip: true }, AIPromptRunID: 'LLM-RUN-r1' });
            const result = await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ProcessRecord(makeRecord('r1'), context);

            expect(result).toMatchObject({ Status: 'Succeeded', ResultPayload: { seniority: 'Manager', isVip: true } });
            expect(valuesOf(answersFor('r1')[0])).toEqual({ Seniority: 'Manager', IsVIP: true });
        });
    });

    // ================================================================
    // The escalation target
    // ================================================================

    describe('the escalation target', () => {
        const cases: Array<{ name: string; arrange: () => void; reason: string }> = [
            {
                name: 'is not found',
                arrange: () => loadTarget.mockResolvedValue(false),
                reason: `Escalation pipeline '${LLM_PIPELINE_ID}' was not found in MJ: Record Processes.`,
            },
            {
                name: 'is not an Infer pipeline',
                arrange: () => { targetRow.WorkType = 'Action'; },
                reason: `Escalation pipeline 'Seniority (LLM)' (${LLM_PIPELINE_ID}) has WorkType 'Action'; only an Infer Feature Pipeline can be escalated to.`,
            },
            {
                name: 'is not Active',
                arrange: () => { targetRow.Status = 'Disabled'; },
                reason: `Escalation pipeline 'Seniority (LLM)' (${LLM_PIPELINE_ID}) is Disabled; only an Active pipeline can be escalated to.`,
            },
            {
                name: 'is on another entity',
                arrange: () => { targetRow = { ...targetRow, EntityID: 'ENT-2', Entity: 'Accounts' }; },
                reason: `Escalation pipeline 'Seniority (LLM)' (${LLM_PIPELINE_ID}) is on entity 'Accounts' (ENT-2), not the Decision pipeline's entity (${ENTITY_ID}).`,
            },
            {
                name: 'is not an LLM pipeline',
                arrange: () => { targetRow.Configuration = JSON.stringify(llmSpec({ PipelineType: 'Decision' })); },
                reason: `Escalation pipeline 'Seniority (LLM)' (${LLM_PIPELINE_ID}) is a 'Decision' pipeline; only an LLM pipeline can be escalated to.`,
            },
            {
                name: 'is missing an output',
                arrange: () => { targetRow.Configuration = JSON.stringify(llmSpec({ Outputs: [outputs()[0]] })); },
                reason: `Escalation pipeline 'Seniority (LLM)' (${LLM_PIPELINE_ID}) does not produce every output of the Decision pipeline: it has no output named 'IsVIP'.`,
            },
            {
                name: 'writes an output to another field',
                arrange: () => {
                    const [seniority, isVip] = outputs();
                    targetRow.Configuration = JSON.stringify(llmSpec({ Outputs: [seniority, { ...isVip, Target: { Mode: 'field', EntityFieldName: 'IsPriority' } }] }));
                },
                reason: `does not produce every output of the Decision pipeline: its output 'IsVIP' targets field 'IsPriority', not field 'IsVIP'.`,
            },
            {
                name: 'has a prompt template that does not render its output constraints',
                arrange: () => {
                    vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([
                        asPrompt(DECISION_PROMPT),
                        asPrompt({ ...LLM_PROMPT, TemplateText: 'Classify the seniority of {{record.Title}}' }),
                    ]);
                },
                reason: `Escalation pipeline 'Seniority (LLM)' (${LLM_PIPELINE_ID}) cannot run: Feature Pipeline prompt 'Classify seniority' does not render its output constraints.`,
            },
            {
                name: 'cannot be built',
                arrange: () => { targetRow.Configuration = '{ not json'; },
                reason: `Escalation pipeline 'Seniority (LLM)' (${LLM_PIPELINE_ID}) could not be built: Record Process 'Seniority (LLM)': Configuration is invalid JSON`,
            },
        ];

        for (const c of cases) {
            it(`fails only the records that would escalate when the target ${c.name}`, async () => {
                c.arrange();
                decisionAnswers.set('r2', BELOW_FLOOR);
                const processor = new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null);
                const results = await processor.ProcessBatch([makeRecord('r1'), makeRecord('r2')], context);

                expect(results.get('r1')).toMatchObject({ Status: 'Succeeded', ResultPayload: { seniority: 'Manager', isVip: false } });
                const failed = results.get('r2');
                expect(failed?.Status).toBe('Failed');
                expect(failed?.ErrorMessage).toContain('Decision confidence below 0.7 (IsVIP 0.4); ');
                expect(failed?.ErrorMessage).toContain(c.reason);
                expect(llmCalls).toEqual([]);
                expect(historyFor('r2')).toEqual([]);
            });
        }

        it('is loaded and checked once per run, even when it cannot be used', async () => {
            for (const usable of [true, false]) {
                getEntityObject.mockClear();
                loadTarget.mockResolvedValue(usable);
                const processor = new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null);
                for (const id of ['r1', 'r2', 'r3', 'r4', 'r5']) {
                    decisionAnswers.set(id, BELOW_FLOOR);
                }
                await processor.ProcessBatch([makeRecord('r1'), makeRecord('r2')], context);
                await processor.ProcessBatch([makeRecord('r3'), makeRecord('r4')], context);
                await processor.ProcessRecord(makeRecord('r5'), context);

                expect(getEntityObject).toHaveBeenCalledTimes(1);
                expect(getEntityObject).toHaveBeenCalledWith('MJ: Record Processes', context.contextUser);
                expect(processor.EscalatedRecordCount).toBe(5);
            }
            expect(loadTarget).toHaveBeenCalledWith(LLM_PIPELINE_ID);
        });

        it('maps the LLM answer onto the Decision pipeline\'s Refs when the two pipelines name them differently', async () => {
            targetRow.Configuration = JSON.stringify(llmSpec({ Outputs: outputs({ Seniority: '$.level', IsVIP: '$.flags.vip' }) }));
            llmResults.set('r1', { Success: true, RawResult: { level: 'Staff', flags: { vip: true } }, AIPromptRunID: 'LLM-RUN-r1' });
            decisionAnswers.set('r1', BELOW_FLOOR);
            const processor = new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null);
            const writeBack = new WriteBackProcessor(processor, { fields: { Seniority: '$.seniority', IsVIP: '$.isVip' } }, true);
            const result = await writeBack.ProcessRecord(makeRecord('r1'), context);

            const { writeBack: applied } = result.ResultPayload as WriteBackRunPayload;
            expect(applied?.previewFields).toEqual({ Seniority: 'Staff', IsVIP: true });
            // A dry-run write-back writes no Feature Value: the pipeline's values commit only with a real write-back.
            expect(answersFor('r1')).toEqual([]);
            await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ProcessRecord(makeRecord('r1'), context);
            expect(valuesOf(answersFor('r1')[0])).toEqual({ Seniority: 'Staff', IsVIP: true });
        });
    });

    // ================================================================
    // The batch path
    // ================================================================

    describe('the Decision pipeline\'s version covers its escalation target', () => {
        const decisionPin = () => new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ResolveRunPin(context);

        it('changes the Decision pin when the target\'s prompt template changes, and keeps it otherwise', async () => {
            const processor = new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null);
            const before = await processor.ResolveRunPin(context);
            expect(await decisionPin()).toEqual(before);
            vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([
                asPrompt(DECISION_PROMPT),
                asPrompt({ ...LLM_PROMPT, TemplateText: `${LLM_PROMPT.TemplateText}\nAnswer briefly.` }),
            ]);
            // the same processor sees the edit on its next record (its pin is fingerprinted with the target's)
            const after = await processor.ResolveRunPin(context);
            expect(after.SpecHash).not.toBe(before.SpecHash);
            expect(after.PromptVersionHash).toBe(before.PromptVersionHash); // the Decision's own prompt is unchanged
        });

        it('asks the version registry for the composed pin at Preflight', async () => {
            const resolve = vi.spyOn(FeaturePipelineVersionService.Instance, 'ResolveForRun').mockResolvedValue({ Version: 4, Status: 'Active' });
            await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).Preflight(context);
            expect(resolve.mock.calls[0][0]).toMatchObject({ RecordProcessID: DECISION_PIPELINE_ID, Pin: await decisionPin() });
        });

        it('rethrows a failure to load the target instead of hashing without it (a transient error is not a new version)', async () => {
            loadTarget.mockRejectedValue(new Error('connection reset while loading the target'));
            await expect(decisionPin()).rejects.toThrow('connection reset while loading the target');
        });

        it('keeps the Decision pin of a target that cannot be built apart from a working target\'s', async () => {
            const working = await decisionPin();
            loadTarget.mockResolvedValue(false);
            expect((await decisionPin()).SpecHash).not.toBe(working.SpecHash);
        });
    });

    describe('the batch path', () => {
        it('escalates only the below-floor records of an uncached batch, together, in one pass through the target', async () => {
            decisionAnswers.set('r2', BELOW_FLOOR);
            decisionAnswers.set('r4', { RawResult: { seniority: 'Staff', isVip: false }, Confidence: { Seniority: 0.2, IsVIP: 0.9 } });
            const processBatch = vi.spyOn(InferProcessor.prototype, 'ProcessBatch');
            const processor = new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null);
            const records = ['r1', 'r2', 'r3', 'r4'].map((id) => makeRecord(id));
            const results = await processor.ProcessBatch(records, context);

            expect(decisionCalls).toEqual(['r1', 'r2', 'r3', 'r4']);
            expect(llmCalls).toEqual(['r2', 'r4']);
            const batches = processBatch.mock.calls.map(([batch]) => batch.map((r: RecordRef) => r.RecordID));
            expect(batches).toEqual([['r1', 'r2', 'r3', 'r4'], ['r2', 'r4']]);
            expect(processBatch.mock.contexts[1]).not.toBe(processor);

            const confident = { seniority: 'Manager', isVip: false, [InferProcessor.DRIVER_CONFIDENCE_KEY]: { Seniority: 0.92, IsVIP: 0.95 } };
            expect(results.get('r1')?.ResultPayload).toEqual(confident);
            expect(results.get('r3')?.ResultPayload).toEqual(confident);
            expect(results.get('r2')).toMatchObject({ Status: 'Succeeded', ResultPayload: { seniority: 'Executive', isVip: true }, AIPromptRunID: 'LLM-RUN-r2' });
            expect(results.get('r4')).toMatchObject({ Status: 'Succeeded', AIPromptRunID: 'LLM-RUN-r4' });
            // One answer row per record, and one superseded-decision row per escalated record
            expect(historyCalls.filter((h) => !isSuperseded(h)).map((h) => h.recordID)).toEqual(['r1', 'r2', 'r3', 'r4']);
            expect(historyCalls.filter(isSuperseded).map((h) => [h.recordID, h.aiPromptRunID])).toEqual([['r2', 'DEC-RUN-r2'], ['r4', 'DEC-RUN-r4']]);
            expect(processor.EscalatedRecordCount).toBe(2);
        });

        it('escalates a cached batch\'s below-floor keys together, and fans each escalated answer out to its key\'s records', async () => {
            decisionAnswers.set('r2', BELOW_FLOOR);
            const spec = decisionSpec({ Caching: { Cacheable: true, KeyFields: ['Title'] } });
            const processBatch = vi.spyOn(InferProcessor.prototype, 'ProcessBatch');
            const processor = new InferProcessor(DECISION_PROMPT.ID, undefined, spec, null);
            const records = [makeRecord('r1', 'CEO'), makeRecord('r2', 'Analyst'), makeRecord('r3', 'Analyst'), makeRecord('r4', 'Clerk')];
            const results = await processor.ProcessBatch(records, context);

            expect(decisionCalls).toEqual(['r1', 'r2', 'r4']);
            expect(llmCalls).toEqual(['r2']);
            expect(processBatch.mock.calls.map(([batch]) => batch.map((r: RecordRef) => r.RecordID))).toEqual([['r1', 'r2', 'r3', 'r4'], ['r2']]);
            for (const id of ['r2', 'r3']) {
                expect(results.get(id)).toMatchObject({ Status: 'Succeeded', ResultPayload: { seniority: 'Executive', isVip: true }, AIPromptRunID: 'LLM-RUN-r2' });
                expect(answersFor(id)).toHaveLength(1);
                expect(answersFor(id)[0]).toMatchObject({ promptID: LLM_PROMPT.ID, aiPromptRunID: 'LLM-RUN-r2' });
            }
            // The decision ran once for the key, so its prompt run is recorded once, on the record it ran for
            expect(supersededFor('r2').map((h) => h.aiPromptRunID)).toEqual(['DEC-RUN-r2']);
            expect(supersededFor('r3')).toEqual([]);
            expect(results.get('r1')?.AIPromptRunID).toBe('DEC-RUN-r1');
            expect(results.get('r4')?.AIPromptRunID).toBe('DEC-RUN-r4');
            expect(processor.EscalatedRecordCount).toBe(2);
            // Only the confident decisions are cached; the escalated key is not
            expect(store.mock.calls.map(([params]) => [params.promptID, params.keyDisplay])).toEqual([
                [DECISION_PROMPT.ID, 'CEO'],
                [DECISION_PROMPT.ID, 'Clerk'],
            ]);
        });

        it('uses the target\'s own batching: escalated records sharing its cache key are computed once', async () => {
            targetRow.Configuration = JSON.stringify(llmSpec({ Caching: { Cacheable: true, KeyFields: ['Title'] } }));
            decisionAnswers.set('r1', BELOW_FLOOR);
            decisionAnswers.set('r2', BELOW_FLOOR);
            const processor = new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null);
            const results = await processor.ProcessBatch([makeRecord('r1', 'Analyst'), makeRecord('r2', 'Analyst')], context);

            expect(decisionCalls).toEqual(['r1', 'r2']);
            expect(llmCalls).toEqual(['r1']);
            expect(results.get('r2')).toMatchObject({ Status: 'Succeeded', ResultPayload: { seniority: 'Executive', isVip: true }, AIPromptRunID: 'LLM-RUN-r1' });
            expect(batchLookup).toHaveBeenCalledWith(expect.objectContaining({ recordProcessID: LLM_PIPELINE_ID, promptID: LLM_PROMPT.ID }));
            // The target's history is off: each record has exactly one answer row, written by the Decision pipeline,
            // and the row of its superseded decision
            expect(answersFor('r1')).toHaveLength(1);
            expect(answersFor('r2')).toHaveLength(1);
            expect(supersededFor('r1').map((h) => h.aiPromptRunID)).toEqual(['DEC-RUN-r1']);
            expect(supersededFor('r2').map((h) => h.aiPromptRunID)).toEqual(['DEC-RUN-r2']);
        });
    });

    // ================================================================
    // History and cache
    // ================================================================

    describe('history', () => {
        it('through a real write-back, writes the superseded row, then the answer, then the field; the guard compares with the value from before both', async () => {
            const order: string[] = [];
            const empty = { ValueText: null, ValueNumeric: null, ValueBoolean: null, ValueDate: null, ValueJSON: null };
            // What each write replaced: the superseded row replaced the pipeline's earlier Manager; the answer replaced the superseded (null) row.
            vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockImplementation(async (params) => {
                historyCalls.push(params);
                const superseded = isSuperseded(params);
                order.push(superseded ? 'fv:superseded' : 'fv:answer');
                return { Upserted: params.outputs.length, Unchanged: 0, Previous: { Seniority: superseded ? { ...empty, ValueText: 'Manager' } : empty } };
            });
            vi.spyOn(FeatureValueCacheService.Instance, 'GetLatestValue').mockResolvedValue(null);
            const recordHuman = vi.spyOn(FeatureValueCacheService.Instance, 'RecordHumanValue').mockResolvedValue();
            llmResults.set('r1', { Success: true, RawResult: { seniority: 'Staff', isVip: true }, AIPromptRunID: 'LLM-RUN-r1' });
            decisionAnswers.set('r1', BELOW_FLOOR);

            // The contact's Seniority holds Manager, what the pipeline last wrote: no person changed it.
            const contacts = new EntityInfo({ ...CONTACTS });
            const contact = {
                Values: { Seniority: 'Manager' } as Record<string, unknown>, LatestResult: null, PrimaryKey: CompositeKey.FromKeyValuePair('ID', 'r1'),
                Get(f: string) { return this.Values[f]; },
                Set(f: string, v: unknown) { this.Values[f] = v; },
                async InnerLoad() { return true; },
                async Save() { order.push('field'); return true; },
            };
            const provider: ProviderDouble = {
                GetEntityObject: vi.fn().mockImplementation(async (name: string) => (name === 'Contacts' ? contact : targetRow)),
                EntityByID: vi.fn().mockImplementation((id: string) => (id === ENTITY_ID ? contacts : undefined)),
                EntityByName: vi.fn().mockImplementation((name: string) => (name === 'Contacts' ? contacts : undefined)),
            };
            const realContext: RecordProcessorContext = { ...context, provider: provider as IMetadataProvider };
            const processor = new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null);
            const result = await new WriteBackProcessor(processor, { fields: { Seniority: '$.seniority' } }).ProcessRecord(makeRecord('r1'), realContext);

            expect(result.Status).toBe('Succeeded');
            expect(order).toEqual(['fv:superseded', 'fv:answer', 'field']);
            expect(historyFor('r1').every((h) => h.provider === realContext.provider)).toBe(true); // the unit's provider (a client provider runs it on itself)
            // The guard compared Manager with Manager (the first write's capture), not with the superseded null row.
            expect(result.HumanValuesPreserved).toBe(0);
            expect(contact.Values.Seniority).toBe('Staff');
            expect(recordHuman).not.toHaveBeenCalled();
        });

        it('names the LLM prompt, its prompt run and its hashes, and notes the escalation and its confidence', async () => {
            // The target's constraints differ from the Decision pipeline's, so the two constraint hashes differ
            const [seniority, isVip] = outputs();
            const targetSpec = llmSpec({ Outputs: [seniority, { ...isVip, Constraint: { Type: 'boolean', OnViolation: 'null' } }] });
            targetRow.Configuration = JSON.stringify(targetSpec);
            decisionAnswers.set('r1', BELOW_FLOOR);
            const result = await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ProcessRecord(makeRecord('r1'), context);

            const targetVersionHash = new HashProbe(LLM_PROMPT.ID, undefined, undefined, null).Hash(asPrompt(LLM_PROMPT), targetSpec);
            // The constraint hash covers the resolved allowed values, so each probe resolves its run first
            const targetConstraintHash = await resolvedConstraintHash(LLM_PROMPT, targetSpec);
            expect(targetConstraintHash).not.toBe(await resolvedConstraintHash(DECISION_PROMPT, decisionSpec()));
            expect(answersFor('r1')).toHaveLength(1);
            const [history] = answersFor('r1');
            expect(history).toMatchObject({
                recordProcessID: DECISION_PIPELINE_ID,
                recordID: 'r1',
                promptID: LLM_PROMPT.ID,
                promptVersionHash: targetVersionHash,
                constraintHash: targetConstraintHash,
                aiPromptRunID: 'LLM-RUN-r1',
                processRunID: 'RUN-1',
            });
            expect(result.PromptVersionHash).toBe(targetVersionHash);
            expect(valuesOf(history)).toEqual({ Seniority: 'Executive', IsVIP: true });
            const note = "Escalated to LLM pipeline 'Seniority (LLM)': decision confidence below 0.7 (IsVIP 0.4).";
            expect(history.outputs.map((o) => o.reasoning)).toEqual([note, note]);
            expect(history.outputs.map((o) => o.confidence)).toEqual([undefined, undefined]);
        });

        it('keys the answer under the target\'s pin and input hash, and the superseded row under the Decision pipeline\'s', async () => {
            vi.spyOn(AIEngine.Instance, 'PromptModels', 'get').mockReturnValue([
                asPromptModel({ PromptID: DECISION_PROMPT.ID, ModelID: 'DEC-MODEL', Priority: 1, Status: 'Active', EffortLevel: null, ModelParameters: null }),
                asPromptModel({ PromptID: LLM_PROMPT.ID, ModelID: 'LLM-MODEL', Priority: 1, Status: 'Active', EffortLevel: 3, ModelParameters: null }),
            ]);
            // The target keys its input on more fields than the Decision pipeline, so the two input hashes differ
            const targetSpec = llmSpec({ Context: { Fields: ['Title', 'ID'] } });
            targetRow.Configuration = JSON.stringify(targetSpec);
            decisionAnswers.set('r1', BELOW_FLOOR);
            const record = makeRecord('r1');
            const result = await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ProcessRecord(record, context);

            const target = new InferProcessor(LLM_PROMPT.ID, undefined, targetSpec, null);
            const targetPin = await target.ResolvePin(asPrompt(LLM_PROMPT), context);
            const decisionPin = await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ResolvePin(asPrompt(DECISION_PROMPT), context);
            const targetInput = await FeatureValueCacheService.Instance.ComputeCacheKey({ keyFields: ['Title', 'ID'], recordData: { ID: 'r1', Title: 'Title of r1' } });
            const decisionInput = await FeatureValueCacheService.Instance.ComputeCacheKey({ keyFields: ['Title'], recordData: { ID: 'r1', Title: 'Title of r1' } });
            expect(targetInput.keyHash).not.toBe(decisionInput.keyHash);
            expect(targetPin.ParametersHash).not.toBe(decisionPin.ParametersHash);

            expect(result.Status).toBe('Succeeded');
            expect(answersFor('r1')[0]).toMatchObject({
                aiModelID: 'LLM-MODEL',
                parametersHash: targetPin.ParametersHash,
                promptVersionHash: targetPin.PromptVersionHash,
                inputHash: targetInput.keyHash,
            });
            expect(supersededFor('r1')[0]).toMatchObject({
                aiModelID: 'DEC-MODEL',
                parametersHash: decisionPin.ParametersHash,
                inputHash: decisionInput.keyHash,
            });
        });

        it('writes the superseded decision\'s row as history and the answer\'s row as the current value', async () => {
            decisionAnswers.set('r1', BELOW_FLOOR);
            await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ProcessRecord(makeRecord('r1'), context);
            // a history row never takes the latest value back, so an unchanged re-run of the record saves nothing
            expect(supersededFor('r1')[0].historyOnly).toBe(true);
            expect(answersFor('r1')[0].historyOnly).toBe(false);
        });

        it('keeps the values from before the run: the first write\'s capture, not the answer row\'s', async () => {
            const typed = (v: string | null) => (v === null ? null : { ValueText: v, ValueNumeric: null, ValueBoolean: null, ValueDate: null, ValueJSON: null });
            vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockImplementation(async (params) => {
                historyCalls.push(params);
                // The answer's write would capture the superseded row this run wrote (null values) as the latest
                const previous = isSuperseded(params) ? { Seniority: typed('Staff'), IsVIP: null } : { Seniority: typed(null), IsVIP: typed('x') };
                return { Upserted: params.outputs.length, Unchanged: 0, Previous: previous };
            });
            decisionAnswers.set('r1', BELOW_FLOOR);
            const processor = new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null);
            await processor.ProcessRecord(makeRecord('r1'), context);
            expect(processor.PreviousFeatureValues('r1')).toEqual({ Seniority: typed('Staff'), IsVIP: null });
        });

        it('fails the escalated record when its superseded decision\'s row cannot be written', async () => {
            const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockImplementation(async (params) => {
                if (isSuperseded(params)) {
                    throw new Error('FK_FeatureValue_AIPromptRun');
                }
                historyCalls.push(params);
                return { Upserted: params.outputs.length, Unchanged: 0, Previous: {} };
            });
            decisionAnswers.set('r1', BELOW_FLOOR);
            const result = await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ProcessRecord(makeRecord('r1'), context);

            expect(result).toMatchObject({ Status: 'Failed', ErrorMessage: 'Feature Value write failed: FK_FeatureValue_AIPromptRun', AIPromptRunID: 'LLM-RUN-r1' });
            expect(answersFor('r1')).toHaveLength(0);
            expect(logged.mock.calls.flat().join(' ')).toContain("(record 'r1')");
        });

        it('fails the escalated record, and the group\'s other records, when the answer\'s row cannot be written', async () => {
            const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockImplementation(async (params) => {
                historyCalls.push(params);
                if (!isSuperseded(params)) {
                    throw new Error('FK_FeatureValue_Entity');
                }
                return { Upserted: params.outputs.length, Unchanged: 0, Previous: {} };
            });
            decisionAnswers.set('r1', BELOW_FLOOR);
            decisionAnswers.set('r2', BELOW_FLOOR);
            const processor = new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec({ Caching: { Cacheable: true, KeyFields: ['Title'] } }), null);
            const results = await processor.ProcessBatch([makeRecord('r1', 'Analyst'), makeRecord('r2', 'Analyst')], context);

            expect(results.get('r1')).toMatchObject({ Status: 'Failed', ErrorMessage: 'Feature Value write failed: FK_FeatureValue_Entity' });
            expect(results.get('r2')).toMatchObject({ Status: 'Failed', ErrorMessage: 'Feature Value write failed: FK_FeatureValue_Entity' });
            // The failed answer is not fanned out: r2 gets no row of its own
            expect(answersFor('r2')).toHaveLength(0);
            expect(logged).toHaveBeenCalled();
        });

        it('links both model calls to the process run: the superseded decision\'s prompt run first, then the LLM\'s', async () => {
            decisionAnswers.set('r1', BELOW_FLOOR);
            const spec = decisionSpec();
            await new InferProcessor(DECISION_PROMPT.ID, undefined, spec, null).ProcessRecord(makeRecord('r1'), context);

            expect(historyCalls.map((h) => [h.aiPromptRunID, h.processRunID])).toEqual([
                ['DEC-RUN-r1', 'RUN-1'],
                ['LLM-RUN-r1', 'RUN-1'],
            ]);
            const [superseded] = historyCalls;
            expect(superseded).toMatchObject({
                recordProcessID: DECISION_PIPELINE_ID,
                recordID: 'r1',
                promptID: DECISION_PROMPT.ID,
                promptVersionHash: new HashProbe(DECISION_PROMPT.ID, undefined, undefined, null).Hash(asPrompt(DECISION_PROMPT), spec),
                constraintHash: await resolvedConstraintHash(DECISION_PROMPT, spec),
            });
            expect(superseded.featureValueCacheID).toBeUndefined();
            // The low-confidence answer is never recorded as a value; its confidence and the reason are
            expect(valuesOf(superseded)).toEqual({ Seniority: null, IsVIP: null });
            expect(superseded.outputs.map((o) => o.confidence)).toEqual([0.91, 0.4]);
            const note =
                "Superseded: decision confidence below 0.7 (IsVIP 0.4), so the record escalated to LLM pipeline 'Seniority (LLM)', " +
                "whose answer is the record's value. This row records the decision model's prompt run.";
            expect(superseded.outputs.map((o) => o.reasoning)).toEqual([note, note]);
        });

        it('records no superseded row when the decision has no prompt run to link', async () => {
            vi.spyOn(DecisionStubDriver.prototype, 'ComputeOutputs').mockResolvedValue({
                Success: true,
                RawResult: { ...BELOW_FLOOR.RawResult },
                Confidence: { ...BELOW_FLOOR.Confidence },
            });
            const result = await new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec(), null).ProcessRecord(makeRecord('r1'), context);

            expect(result).toMatchObject({ Status: 'Succeeded', AIPromptRunID: 'LLM-RUN-r1' });
            expect(historyCalls.map((h) => h.aiPromptRunID)).toEqual(['LLM-RUN-r1']);
        });

        it('records every value as null when asked to, whatever the payload and the Refs hold', async () => {
            const spec = decisionSpec({ Outputs: outputs({ Seniority: 'seniority', IsVIP: '$.isVip' }) });
            await new HistoryProbe(DECISION_PROMPT.ID, undefined, spec, null).RecordHistory({
                Record: makeRecord('r1'),
                Context: context,
                Payload: { seniority: 'Manager', isVip: true },
                OmitValues: true,
                InputHash: null,
                Pin: { PromptID: DECISION_PROMPT.ID, PromptVersionHash: 'pv', AIModelID: null, ParametersHash: 'ph', SpecHash: 'sh' },
            });

            expect(valuesOf(historyCalls[0])).toEqual({ Seniority: null, IsVIP: null });
        });

        it('keeps the LLM\'s own reasoning after the note', () => {
            const note = BuildEscalationNote('Seniority (LLM)', 0.7, [{ OutputName: 'IsVIP', Confidence: 0.123456 }], { reasoning: 'The title says VP.' });
            expect(note).toBe("Escalated to LLM pipeline 'Seniority (LLM)': decision confidence below 0.7 (IsVIP 0.1235).\n\nThe title says VP.");
            expect(DescribeBelowFloor([{ OutputName: 'Seniority' }, { OutputName: 'IsVIP', Confidence: 0.5 }])).toBe('Seniority none, IsVIP 0.5');
        });

        it('keeps the LLM\'s reasoning whatever the case of its key', () => {
            const note = BuildEscalationNote('Seniority (LLM)', 0.7, [{ OutputName: 'IsVIP', Confidence: 0.4 }], { Reasoning: 'The title says VP.' });
            expect(note).toBe("Escalated to LLM pipeline 'Seniority (LLM)': decision confidence below 0.7 (IsVIP 0.4).\n\nThe title says VP.");
        });
    });

    describe('the Dedup Cache', () => {
        const probe = new HashProbe(DECISION_PROMPT.ID, undefined, undefined, null);
        const prompt = asPrompt(DECISION_PROMPT);

        it('changes the key when the escalation settings change', () => {
            const base = probe.Hash(prompt, decisionSpec());
            expect(probe.Hash(prompt, decisionSpec({ Escalation: { PipelineID: LLM_PIPELINE_ID, BelowConfidence: 0.8 } }))).not.toBe(base);
            expect(probe.Hash(prompt, decisionSpec({ Escalation: { PipelineID: 'LLM-PIPE-2', BelowConfidence: 0.7 } }))).not.toBe(base);
            expect(probe.Hash(prompt, decisionSpec({ Escalation: undefined }))).not.toBe(base);
            expect(probe.Hash(prompt, decisionSpec({ Escalation: { PipelineID: ' llm-pipe-1 ', BelowConfidence: 0.7 } }))).toBe(base);
        });

        it('keeps the key of a pipeline without Escalation', () => {
            const spec = decisionSpec({ Escalation: undefined });
            const basis = `${DECISION_PROMPT.ID}::${DECISION_PROMPT.TemplateText}::${JSON.stringify(spec.Outputs)}::${RenderConstraintBlock(spec.Outputs)}::PipelineType=decision`;
            expect(probe.Hash(prompt, spec)).toBe(createHash('sha256').update(basis).digest('hex'));
        });

        /** Backs Store and BatchLookup with an in-memory cache keyed as the service keys it (pipeline scope). */
        function useInMemoryCache(): void {
            const entries: Array<{ Params: CacheStoreParams; Entry: MJFeatureValueCacheEntity }> = [];
            store.mockImplementation(async (params) => {
                const entry = asCacheEntry({
                    ID: `CACHE-${entries.length + 1}`,
                    OutputsJSON: params.outputsJSON,
                    Reasoning: params.reasoning ?? null,
                    AIPromptRunID: params.aiPromptRunID ?? null,
                });
                entries.push({ Params: params, Entry: entry });
                return entry;
            });
            batchLookup.mockImplementation(async (params) => {
                const hits = entries.filter((e) =>
                    e.Params.recordProcessID === params.recordProcessID &&
                    e.Params.promptID === params.promptID &&
                    e.Params.promptVersionHash === params.promptVersionHash &&
                    e.Params.constraintHash === params.constraintHash &&
                    params.keyHashes.includes(e.Params.keyHash)
                );
                return new Map(hits.map((e): [string, MJFeatureValueCacheEntity] => [e.Params.keyHash, e.Entry]));
            });
        }

        it('never writes an escalated answer to the Decision pipeline\'s cache, so a later run asks the decision again', async () => {
            useInMemoryCache();
            decisionAnswers.set('r1', BELOW_FLOOR);
            const spec = decisionSpec({ Caching: { Cacheable: true, KeyFields: ['Title'] } });
            const processor = new InferProcessor(DECISION_PROMPT.ID, undefined, spec, null);
            const escalated = await processor.ProcessRecord(makeRecord('r1', 'Analyst'), context);
            const confident = await processor.ProcessRecord(makeRecord('r2', 'CEO'), context);

            expect(escalated).toMatchObject({ Status: 'Succeeded', AIPromptRunID: 'LLM-RUN-r1' });
            expect(escalated.FeatureValueCacheID).toBeUndefined();
            expect(answersFor('r1')[0].featureValueCacheID).toBeUndefined();
            expect(confident.FeatureValueCacheID).toBe('CACHE-1');
            expect(store).toHaveBeenCalledTimes(1);
            expect(store.mock.calls[0][0]).toMatchObject({ recordProcessID: DECISION_PIPELINE_ID, promptID: DECISION_PROMPT.ID, keyDisplay: 'CEO' });

            // The next run: the escalated record misses the Decision cache and escalates again; the confident one is served
            decisionCalls.length = 0;
            llmCalls.length = 0;
            const next = new InferProcessor(DECISION_PROMPT.ID, undefined, spec, null);
            await next.ProcessRecord(makeRecord('r1', 'Analyst'), context);
            const served: RecordResult = await next.ProcessRecord(makeRecord('r2', 'CEO'), context);
            expect(decisionCalls).toEqual(['r1']);
            expect(llmCalls).toEqual(['r1']);
            expect(served).toMatchObject({ Status: 'Succeeded', ResultPayload: { seniority: 'Manager', isVip: false }, FeatureValueCacheID: 'CACHE-1' });
        });

        it('keys the target\'s cache by the target pipeline\'s own ID, prompt and hashes', async () => {
            useInMemoryCache();
            const targetSpec = llmSpec({ Caching: { Cacheable: true, KeyFields: ['Title'] } });
            targetRow.Configuration = JSON.stringify(targetSpec);
            decisionAnswers.set('r1', BELOW_FLOOR);
            decisionAnswers.set('r2', BELOW_FLOOR);
            const spec = decisionSpec({ Caching: { Cacheable: true, KeyFields: ['Title'] } });
            const first = await new InferProcessor(DECISION_PROMPT.ID, undefined, spec, null).ProcessRecord(makeRecord('r1', 'Analyst'), context);

            const targetVersionHash = new HashProbe(LLM_PROMPT.ID, undefined, undefined, null).Hash(asPrompt(LLM_PROMPT), targetSpec);
            expect(store).toHaveBeenCalledTimes(1);
            expect(store.mock.calls[0][0]).toMatchObject({
                recordProcessID: LLM_PIPELINE_ID,
                promptID: LLM_PROMPT.ID,
                promptVersionHash: targetVersionHash,
                aiPromptRunID: 'LLM-RUN-r1',
            });
            expect(batchLookup.mock.calls.map(([params]) => [params.recordProcessID, params.promptID])).toEqual([
                [DECISION_PIPELINE_ID, DECISION_PROMPT.ID],
                [LLM_PIPELINE_ID, LLM_PROMPT.ID],
            ]);
            expect(first.FeatureValueCacheID).toBe('CACHE-1');
            expect(answersFor('r1')[0].featureValueCacheID).toBe('CACHE-1');

            // The next run asks the decision again and escalates again, and the target answers from its own cache
            llmCalls.length = 0;
            const second = await new InferProcessor(DECISION_PROMPT.ID, undefined, spec, null).ProcessRecord(makeRecord('r2', 'Analyst'), context);
            expect(decisionCalls).toEqual(['r1', 'r2']);
            expect(llmCalls).toEqual([]);
            expect(second).toMatchObject({
                Status: 'Succeeded',
                ResultPayload: { seniority: 'Executive', isVip: true },
                AIPromptRunID: 'LLM-RUN-r1',
                FeatureValueCacheID: 'CACHE-1',
            });
        });
    });

    // ================================================================
    // Without Escalation
    // ================================================================

    describe('a pipeline without Escalation', () => {
        it('keeps a low-confidence decision, as before', async () => {
            decisionAnswers.set('r1', BELOW_FLOOR);
            const processRecord = vi.spyOn(InferProcessor.prototype, 'ProcessRecord');
            const processor = new InferProcessor(DECISION_PROMPT.ID, undefined, decisionSpec({ Escalation: undefined }), null);
            const results = await processor.ProcessBatch([makeRecord('r1'), makeRecord('r2')], context);

            expect(results.get('r1')).toMatchObject({
                Status: 'Succeeded',
                ResultPayload: { seniority: 'Manager', isVip: false },
                AIPromptRunID: 'DEC-RUN-r1',
                Confidence: { Seniority: 0.91, IsVIP: 0.4 },
            });
            expect(processRecord).toHaveBeenCalledTimes(2);
            expect(llmCalls).toEqual([]);
            expect(getEntityObject).not.toHaveBeenCalled();
            expect(historyFor('r1')[0].outputs.map((o) => o.confidence)).toEqual([0.91, 0.4]);
            expect(processor.EscalatedRecordCount).toBe(0);
        });
    });

    describe('a pipeline that is not a Decision pipeline', () => {
        it('never escalates, even when a spec built without ValidateSpec carries Escalation', async () => {
            const spec = llmSpec({ Escalation: { PipelineID: LLM_PIPELINE_ID, BelowConfidence: 0.7 } });
            const processor = new InferProcessor(LLM_PROMPT.ID, undefined, spec, null);
            const results = await processor.ProcessBatch([makeRecord('r1'), makeRecord('r2')], context);

            expect(results.get('r1')).toMatchObject({ Status: 'Succeeded', ResultPayload: { seniority: 'Executive', isVip: true }, AIPromptRunID: 'LLM-RUN-r1' });
            expect(llmCalls).toEqual(['r1', 'r2']);
            expect(getEntityObject).not.toHaveBeenCalled();
            expect(processor.EscalatedRecordCount).toBe(0);
        });
    });

    describe('FindEscalationTargetSpecProblem', () => {
        it('treats a target without a spec as producing no outputs', () => {
            expect(FindEscalationTargetSpecProblem(undefined, outputs())).toBe(
                "does not produce every output of the Decision pipeline: it has no output named 'Seniority'; it has no output named 'IsVIP'"
            );
        });

        it('matches output names case-insensitively, and accepts a spec naming LLM', () => {
            const renamed = outputs().map((o) => ({ ...o, Name: o.Name.toUpperCase() }));
            expect(FindEscalationTargetSpecProblem(llmSpec({ PipelineType: 'llm', Outputs: renamed }), outputs())).toBeNull();
        });
    });
});
