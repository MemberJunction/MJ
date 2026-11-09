import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { EntityInfo, UserInfo, type RunViewResult } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import type { AIPromptParams, AIPromptRunResult, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { ChatResult } from '@memberjunction/ai';
import type { RecordProcessorContext, RecordRef } from '@memberjunction/record-set-processor-base';
import { ConstraintBlockMissingError, FeaturePipelineVersionService, FeatureValueCacheService, LookupConstraintValues, OutputConstraintResolver, RenderConstraintBlock, type DataFeatureSpec, type FeatureValueOutputItem, type LookupValueRow } from '@memberjunction/feature-pipelines';
import { KnowledgeHubMetadataEngine, type MJFeatureValueCacheEntity } from '@memberjunction/core-entities';
import { InferProcessor } from '../processors/InferProcessor';
import { HistoryStoreDouble } from './history-store-double';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import { CacheEntry } from './helpers/cache-entry';
import { createHash } from 'node:crypto';
import { Canonicalize } from '@memberjunction/global';

type PromptDouble = Pick<MJAIPromptEntityExtended, 'ID' | 'Name' | 'TemplateText' | 'ValidationBehavior'>;
const asPrompt = (p: PromptDouble): MJAIPromptEntityExtended => p as MJAIPromptEntityExtended;
const UPSERTED = { Upserted: 2, Unchanged: 0, Previous: {} };

const USER = new UserInfo();
const record: RecordRef = { EntityID: 'ENT-P', RecordID: 'p-1', Record: { ID: 'p-1', CurrentJobTitle: 'Chief Cheese Whisperer' } };
const PEOPLE = new EntityInfo({ ID: 'ENT-P', Name: 'People', Fields: [{ Name: 'SeniorityLevelID', TSType: 'string', RelatedEntity: 'Seniority Levels' }] });
const provider = new EntitiesOnlyProvider([PEOPLE]);
const context: RecordProcessorContext = { ContextUser: USER, RecordProcessID: 'rp-1', EntityID: 'ENT-P', ProcessRunID: 'run-1', Provider: provider };
const spec: DataFeatureSpec = {
    Name: 'JT', Description: 'jt', PromptID: 'PROMPT-1', Context: { Fields: ['CurrentJobTitle'] },
    Caching: { Cacheable: true, KeyFields: ['CurrentJobTitle'], Scope: 'pipeline' },
    Outputs: [
        { Name: 'SeniorityLevel', Ref: '$.SeniorityLevel', Constraint: { Type: 'lookup', Entity: 'Seniority Levels', MatchField: 'Name', OnViolation: 'fail' },
          Target: { Mode: 'field', EntityFieldName: 'SeniorityLevelID', LookupMatchField: 'Name' } },
        { Name: 'JobFunctions', Ref: '$.Functions', Constraint: { Type: 'lookup', Entity: 'Job Functions', MatchField: 'ID', ItemRef: '$.JobFunctionID', OnViolation: 'fail' },
          Target: { Mode: 'child', EntityName: 'Person Job Functions', ParentField: 'PersonID', Map: { JobFunctionID: '$.JobFunctionID' } } },
    ],
};
let modelAnswer: Record<string, unknown> = {};
let renderedData: Record<string, unknown> | undefined;
/** The lookup-row loader double every test starts with (a test restores it to read rows through the provider). */
let loadSpy: MockInstance<typeof LookupConstraintValues.Load>;

beforeEach(() => {
    vi.restoreAllMocks();
    loadSpy = vi.spyOn(LookupConstraintValues, 'Load').mockImplementation(async (c) => c.RelatedEntityName === 'Seniority Levels'
        ? [{ Match: 'Director', Display: null }, { Match: 'Manager', Display: null }]
        : [{ Match: '7E010001-A101-4B01-8C01-000000000007', Display: 'Operations' }]);
    // An empty Feature Pipeline Types catalog: the pipeline runs on the built-in LLM driver
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'FeaturePipelineTypes', 'get').mockReturnValue([]);
    vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([asPrompt({ ID: 'PROMPT-1', Name: 'JT', TemplateText: 'Title {{record.CurrentJobTitle}} {{ ConstraintBlock }}', ValidationBehavior: 'Strict' })]);
    vi.spyOn(AIPromptRunner.prototype, 'ExecutePrompt').mockImplementation(async (p: AIPromptParams): Promise<AIPromptRunResult> => {
        renderedData = p.data;
        return { success: true, result: modelAnswer, chatResult: new ChatResult(true, new Date(), new Date()) };
    });
    vi.spyOn(FeatureValueCacheService.Instance, 'Lookup').mockResolvedValue(null);
    // the context names a Record Process, so Preflight resolves its version; these tests are about the template check
    vi.spyOn(FeaturePipelineVersionService.Instance, 'ResolveForRun').mockResolvedValue({ Version: 1, Status: 'Active' });
});

describe('Preflight refuses a template without the constraint block', () => {
    it('throws naming the placeholder', async () => {
        vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([asPrompt({ ID: 'PROMPT-1', Name: 'JT', TemplateText: 'Job Title: {{record.CurrentJobTitle}}', ValidationBehavior: 'Strict' })]);
        const preflight = new InferProcessor('PROMPT-1', undefined, spec, null).Preflight(context);
        await expect(preflight).rejects.toThrow(/ConstraintBlock/);
        await expect(preflight).rejects.toBeInstanceOf(ConstraintBlockMissingError);
    });
    it('passes when the template renders it', async () => {
        await expect(new InferProcessor('PROMPT-1', undefined, spec, null).Preflight(context)).resolves.toBeUndefined();
    });
    it('passes a template without the block when no output is constrained', async () => {
        vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([asPrompt({ ID: 'PROMPT-1', Name: 'JT', TemplateText: 'Job Title: {{record.CurrentJobTitle}}', ValidationBehavior: 'Strict' })]);
        const unconstrained: DataFeatureSpec = { ...spec, Outputs: spec.Outputs.map((o) => ({ ...o, Constraint: undefined })) };
        await expect(new InferProcessor('PROMPT-1', undefined, unconstrained, null).Preflight(context)).resolves.toBeUndefined();
    });
    it('refuses the run when the prompt cannot be found', async () => {
        vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([]);
        await expect(new InferProcessor('PROMPT-1', undefined, spec, null).Preflight(context)).rejects.toThrow("AI Prompt 'PROMPT-1' not found");
    });
});

describe('Preflight resolves the pipeline version', () => {
    it('passes the trigger, dry-run flag and Activation to the version service and keeps the version', async () => {
        const resolve = vi.spyOn(FeaturePipelineVersionService.Instance, 'ResolveForRun').mockResolvedValue({ Version: 7, Status: 'Active' });
        const gated: DataFeatureSpec = { ...spec, Activation: { GoldenSetTestID: 'T-1', Metric: 'accuracy', Threshold: 0.9 } };
        const p = new InferProcessor('PROMPT-1', undefined, gated, null);
        await p.Preflight({ ...context, TriggeredBy: 'Schedule', DryRun: true });
        expect(resolve.mock.calls[0][0]).toMatchObject({ RecordProcessID: 'rp-1', TriggeredBy: 'Schedule', DryRun: true, Activation: gated.Activation });
        vi.spyOn(FeaturePipelineVersionService.Instance, 'ResolveForRun').mockRejectedValue(new Error('not activated'));
        await expect(new InferProcessor('PROMPT-1', undefined, gated, null).Preflight(context)).rejects.toThrow('not activated');
    });
    it('resolves no version for a run without a Record Process', async () => {
        const resolve = vi.spyOn(FeaturePipelineVersionService.Instance, 'ResolveForRun');
        await new InferProcessor('PROMPT-1', undefined, spec, null).Preflight({ ...context, RecordProcessID: undefined });
        expect(resolve).not.toHaveBeenCalled();
    });
});

describe('the run keeps the version it resolved', () => {
    const VALID = { SeniorityLevel: 'director', Functions: [{ JobFunctionID: '7e010001-a101-4b01-8c01-000000000007', Sequence: 1, Confidence: 0.9 }] };

    it('fails a record computed after the pin changed mid-run, naming the version the run resolved', async () => {
        vi.spyOn(FeaturePipelineVersionService.Instance, 'ResolveForRun').mockResolvedValue({ Version: 7, Status: 'Active' });
        const history = vi.spyOn(FeaturePipelineVersionService.Instance, 'RegisterCandidate');
        const p = new InferProcessor('PROMPT-1', undefined, spec, null);
        await p.Preflight(context);
        vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([asPrompt({ ID: 'PROMPT-1', Name: 'JT', TemplateText: 'Edited: {{record.CurrentJobTitle}} {{ ConstraintBlock }}', ValidationBehavior: 'Strict' })]);
        const result = await p.ProcessRecord(record, context);
        expect(result.Status).toBe('Failed');
        expect(result.ErrorMessage).toMatch(/changed during the run, after it resolved version v7/);
        expect(history).not.toHaveBeenCalled();
    });

    it('warns every dry-run record when the real run would be refused', async () => {
        const refusal = 'Feature Pipeline version changed from v1 to v2 (prompt, model, parameters or spec).';
        vi.spyOn(FeaturePipelineVersionService.Instance, 'ResolveForRun').mockResolvedValue({ Version: null, Status: null, WouldRefuse: refusal });
        modelAnswer = VALID;
        const dry: RecordProcessorContext = { ...context, DryRun: true };
        const p = new InferProcessor('PROMPT-1', undefined, spec, null);
        await p.Preflight(dry);
        const result = await p.ProcessRecord(record, dry);
        expect(result).toMatchObject({ Status: 'Succeeded', DryRun: true });
        expect(result.Warnings).toContain(`A real run would be refused: ${refusal}`);
    });

    it('reports a dry run\'s refusal at run level, so a run whose records were all skipped still reports it', async () => {
        const refusal = 'Feature Pipeline version v6 is not activated: run its golden-set test.';
        vi.spyOn(FeaturePipelineVersionService.Instance, 'ResolveForRun').mockResolvedValue({ Version: null, Status: null, WouldRefuse: refusal });
        const p = new InferProcessor('PROMPT-1', undefined, spec, null);
        expect(p.CurrentRunRefusal()).toBeNull();
        await p.Preflight({ ...context, DryRun: true });
        expect(p.CurrentRunRefusal()).toBe(refusal);
    });

    it('reports no refusal when the dry run\'s version would run', async () => {
        vi.spyOn(FeaturePipelineVersionService.Instance, 'ResolveForRun').mockResolvedValue({ Version: 5, Status: 'Active' });
        const p = new InferProcessor('PROMPT-1', undefined, spec, null);
        await p.Preflight({ ...context, DryRun: true });
        expect(p.CurrentRunRefusal()).toBeNull();
    });
});

describe('InferProcessor run pin and resolved constraints', () => {
    it('ResolveRunPin returns the run pin, and throws why the pipeline cannot run', async () => {
        const pin = await new InferProcessor('PROMPT-1', undefined, spec, null).ResolveRunPin(context);
        expect(pin).toMatchObject({ PromptID: 'PROMPT-1', SpecHash: expect.any(String), PromptVersionHash: expect.any(String) });
        vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([]);
        await expect(new InferProcessor('PROMPT-1', undefined, spec, null).ResolveRunPin(context)).rejects.toThrow("AI Prompt 'PROMPT-1' not found");
    });
    it('GetResolvedConstraints returns each output\'s constraint with its lookup rows', async () => {
        const resolved = await new InferProcessor('PROMPT-1', undefined, spec, null).GetResolvedConstraints(context);
        expect([...resolved.keys()]).toEqual(['SeniorityLevel', 'JobFunctions']);
        expect(resolved.get('SeniorityLevel')).toMatchObject({ Type: 'lookup', AllowedValues: ['Director', 'Manager'] });
    });
});

describe('InferProcessor output validation', () => {
    it('rejects the injection answer: Failed, RejectedInvalid, nothing cached or recorded', async () => {
        modelAnswer = { SeniorityLevel: 'Grand Poobah', Functions: [{ JobFunctionID: '00000000-0000-0000-0000-00000000C0DE', Sequence: 1, Confidence: 0.85 }] };
        const store = vi.spyOn(FeatureValueCacheService.Instance, 'Store');
        const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues');
        const r = await new InferProcessor('PROMPT-1', undefined, spec, null).ProcessRecord(record, context);
        expect(r.Status).toBe('Failed');
        expect(r.FailureKind).toBe('RejectedInvalid');
        expect(r.ErrorMessage).toContain('Grand Poobah');
        expect(store).not.toHaveBeenCalled();
        expect(history).not.toHaveBeenCalled();
    });
    it('accepts an in-taxonomy answer and canonicalises it', async () => {
        modelAnswer = { SeniorityLevel: 'director', Functions: [{ JobFunctionID: '7e010001-a101-4b01-8c01-000000000007', Sequence: 1, Confidence: 0.9 }] };
        vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockResolvedValue(CacheEntry({ ID: 'c1' }));
        vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
        const r = await new InferProcessor('PROMPT-1', undefined, spec, null).ProcessRecord(record, context);
        expect(r.Status).toBe('Succeeded');
        expect((r.ResultPayload as { SeniorityLevel: string }).SeniorityLevel).toBe('Director');
        expect(renderedData?.ConstraintBlock).toContain('"7E010001-A101-4B01-8C01-000000000007"');
    });
});

describe('reasoning and confidence', () => {
    const withConfidence: DataFeatureSpec = {
        ...spec,
        CaptureReasoning: true,
        Outputs: [
            { ...spec.Outputs[0], ConfidenceRef: '$.SeniorityConfidence' },
            { ...spec.Outputs[1], ConfidenceRef: '$.Functions[0].Confidence' },
        ],
    };
    it('stores the model\'s Reasoning (any key case) and per-output confidence', async () => {
        modelAnswer = { SeniorityLevel: 'Director', SeniorityConfidence: 0.92, Reasoning: 'Director is a department leader',
            Functions: [{ JobFunctionID: '7E010001-A101-4B01-8C01-000000000007', Sequence: 1, Confidence: 0.7 }] };
        vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockResolvedValue(CacheEntry({ ID: 'c1' }));
        const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
        await new InferProcessor('PROMPT-1', undefined, withConfidence, null).ProcessRecord(record, context);
        const outputs = history.mock.calls[0][0].outputs;
        expect(outputs.find((o) => o.featureName === 'SeniorityLevel')).toMatchObject({ reasoning: 'Director is a department leader', confidence: 0.92 });
        expect(outputs.find((o) => o.featureName === 'JobFunctions')?.confidence).toBe(0.7);
    });
    it('ignores a ConfidenceRef value outside 0..1', async () => {
        modelAnswer = { SeniorityLevel: 'Director', SeniorityConfidence: 1.5, Functions: [] };
        vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockResolvedValue(CacheEntry({ ID: 'c1' }));
        const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
        await new InferProcessor('PROMPT-1', undefined, withConfidence, null).ProcessRecord(record, context);
        expect(history.mock.calls[0][0].outputs.find((o) => o.featureName === 'SeniorityLevel')?.confidence ?? null).toBeNull();
    });
    it('drops reasoning when CaptureReasoning is false', async () => {
        modelAnswer = { SeniorityLevel: 'Director', Reasoning: 'x', Functions: [] };
        vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockResolvedValue(CacheEntry({ ID: 'c1' }));
        const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
        await new InferProcessor('PROMPT-1', undefined, { ...withConfidence, CaptureReasoning: false }, null).ProcessRecord(record, context);
        expect(history.mock.calls[0][0].outputs[0].reasoning ?? null).toBeNull();
    });

    describe('a cache hit records what the miss that stored it recorded', () => {
        /** SeniorityLevel answers outside the taxonomy and is nulled, so only JobFunctions keeps its confidence. */
        const nulling: DataFeatureSpec = {
            ...withConfidence,
            Outputs: [
                { ...withConfidence.Outputs[0], Constraint: { Type: 'lookup', Entity: 'Seniority Levels', MatchField: 'Name', OnViolation: 'null' } },
                withConfidence.Outputs[1],
            ],
        };
        /** Runs the answer as a miss; returns the history outputs and the cache row the miss stored. */
        const runMiss = async (): Promise<{ outputs: FeatureValueOutputItem[]; entry: MJFeatureValueCacheEntity }> => {
            modelAnswer = { SeniorityLevel: 'Grand Poobah', SeniorityConfidence: 0.92, Reasoning: 'Leads the cheese practice',
                Functions: [{ JobFunctionID: '7E010001-A101-4B01-8C01-000000000007', Sequence: 1, Confidence: 0.7 }] };
            const store = vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockResolvedValue(CacheEntry({ ID: 'c1' }));
            const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
            await new InferProcessor('PROMPT-1', undefined, nulling, null).ProcessRecord(record, context);
            const stored = store.mock.calls[0][0];
            const entry = CacheEntry({
                ID: 'c1', OutputsJSON: stored.outputsJSON, Reasoning: stored.reasoning || null, AIPromptRunID: 'AIRUN-1',
            });
            return { outputs: history.mock.calls[0][0].outputs, entry: entry };
        };

        it('on a single-record hit: the confidences its payload stores, less replaced outputs, and its reasoning', async () => {
            const miss = await runMiss();
            vi.mocked(FeatureValueCacheService.Instance.RecordFeatureValues).mockClear();
            expect(miss.outputs).toEqual([
                expect.objectContaining({ featureName: 'SeniorityLevel', confidence: undefined, reasoning: 'Leads the cheese practice' }),
                expect.objectContaining({ featureName: 'JobFunctions', confidence: 0.7 }),
            ]);
            vi.spyOn(FeatureValueCacheService.Instance, 'Lookup').mockResolvedValue(miss.entry);
            const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
            await new InferProcessor('PROMPT-1', undefined, nulling, null).ProcessRecord(record, context);
            expect(history.mock.calls[0][0].outputs).toEqual(miss.outputs);
        });
        it('on a batch hit: the same', async () => {
            const miss = await runMiss();
            vi.mocked(FeatureValueCacheService.Instance.RecordFeatureValues).mockClear();
            vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockImplementation(async (p) => new Map(p.keyHashes.map((k) => [k, miss.entry])));
            const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
            await new InferProcessor('PROMPT-1', undefined, nulling, null).ProcessBatch([record], context);
            expect(history.mock.calls[0][0].outputs).toEqual(miss.outputs);
        });
        it('drops the stored reasoning once the pipeline no longer captures it', async () => {
            const miss = await runMiss();
            vi.mocked(FeatureValueCacheService.Instance.RecordFeatureValues).mockClear();
            vi.spyOn(FeatureValueCacheService.Instance, 'Lookup').mockResolvedValue(miss.entry);
            const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
            await new InferProcessor('PROMPT-1', undefined, { ...nulling, CaptureReasoning: false }, null).ProcessRecord(record, context);
            expect(history.mock.calls[0][0].outputs.map((o) => o.reasoning ?? null)).toEqual([null, null]);
        });
    });
});

describe('the constraint hash', () => {
    /** The hash before the run's resolved values were part of it: each output's name and declared constraint. */
    const declaredOnlyHash = (outputs: DataFeatureSpec['Outputs']): string =>
        createHash('sha256').update(Canonicalize(outputs.map((o) => ({ name: o.Name, constraint: o.Constraint })))).digest('hex');
    const enumSpec: DataFeatureSpec = {
        ...spec,
        Outputs: [
            { Name: 'Tier', Ref: '$.Tier', Constraint: { Type: 'enum', Values: ['Gold', 'Silver'], OnViolation: 'fail' }, Target: { Mode: 'field', EntityFieldName: 'Tier' } },
            { Name: 'Summary', Ref: '$.Summary', Target: { Mode: 'field', EntityFieldName: 'Summary' } },
        ],
    };

    it('is unchanged for a pipeline whose allowed values all come from its own spec', async () => {
        const processor = new InferProcessor('PROMPT-1', undefined, enumSpec, null);
        await processor.ResolvePin(asPrompt({ ID: 'PROMPT-1', Name: 'JT', TemplateText: 't', ValidationBehavior: 'Strict' }), context);
        expect(processor.ConstraintHash).toBe(declaredOnlyHash(enumSpec.Outputs));
    });
    it('covers a lookup\'s loaded rows, so a changed taxonomy is a new hash', async () => {
        const hashWith = async (rows: Array<{ Match: string; Display: string | null }>): Promise<string> => {
            vi.spyOn(LookupConstraintValues, 'Load').mockResolvedValue(rows);
            const processor = new InferProcessor('PROMPT-1', undefined, spec, null);
            await processor.ResolvePin(asPrompt({ ID: 'PROMPT-1', Name: 'JT', TemplateText: 't', ValidationBehavior: 'Strict' }), context);
            return processor.ConstraintHash;
        };
        const before = await hashWith([{ Match: 'Director', Display: null }]);
        expect(await hashWith([{ Match: 'Director', Display: null }, { Match: 'VP', Display: null }])).not.toBe(before);
        expect(before).not.toBe(declaredOnlyHash(spec.Outputs));
    });
});

describe('a lookup that names no entity', () => {
    it('loads the rows of the target field\'s foreign-key entity, matched on the target\'s LookupMatchField', async () => {
        const byField: DataFeatureSpec = {
            ...spec,
            Outputs: [{ Name: 'SeniorityLevel', Ref: '$.SeniorityLevel', Constraint: { Type: 'lookup', OnViolation: 'fail' },
                Target: { Mode: 'field', EntityFieldName: 'SeniorityLevelID', LookupMatchField: 'Name' } }],
        };
        const load = vi.mocked(LookupConstraintValues.Load);
        modelAnswer = { SeniorityLevel: 'Grand Poobah' };
        const r = await new InferProcessor('PROMPT-1', undefined, byField, null).ProcessRecord(record, context);
        expect(load.mock.calls[0][0]).toMatchObject({ RelatedEntityName: 'Seniority Levels', LookupMatchField: 'Name' });
        expect(r).toMatchObject({ Status: 'Failed', FailureKind: 'RejectedInvalid' });
    });
});

describe('a key group\'s records', () => {
    it('record the same reasoning and confidence on the miss as on the next run\'s hit, so both re-runs are Unchanged', async () => {
        const grouped: DataFeatureSpec = { ...spec, CaptureReasoning: true, Outputs: [{ ...spec.Outputs[0], ConfidenceRef: '$.SeniorityConfidence' }] };
        const records: RecordRef[] = [
            { EntityID: 'ENT-P', RecordID: 'p-1', Record: { ID: 'p-1', CurrentJobTitle: 'Head of Cheese' } },
            { EntityID: 'ENT-P', RecordID: 'p-2', Record: { ID: 'p-2', CurrentJobTitle: 'Head of Cheese' } },
        ];
        modelAnswer = { SeniorityLevel: 'Director', SeniorityConfidence: 0.8, Reasoning: 'Heads a function' };
        const history = new HistoryStoreDouble();
        vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockImplementation(history.Write);
        const store = vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockResolvedValue(CacheEntry({ ID: 'c1' }));
        vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
        await new InferProcessor('PROMPT-1', undefined, grouped, null).ProcessBatch(records, context);
        const stored = store.mock.calls[0][0];
        const entry = CacheEntry({
            ID: 'c1', OutputsJSON: stored.outputsJSON, Reasoning: stored.reasoning || null, AIPromptRunID: 'AIRUN-1',
        });
        vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockImplementation(async (p) => new Map(p.keyHashes.map((k) => [k, entry])));
        const rerun = await new InferProcessor('PROMPT-1', undefined, grouped, null).ProcessBatch(records, context);
        expect([rerun.get('p-1')?.Outcome, rerun.get('p-2')?.Outcome]).toEqual(['Unchanged', 'Unchanged']);
        expect(history.Rows.get('p-2')).toBe(history.Rows.get('p-1'));
    });
});

describe('InferProcessor.ExtractReasoning', () => {
    it('treats empty or whitespace-only reasoning as none', () => {
        expect(InferProcessor.ExtractReasoning({ Reasoning: '   ' }, true)).toBeUndefined();
        expect(InferProcessor.ExtractReasoning({ Reasoning: 'Leads' }, true)).toBe('Leads');
    });
});

describe('reserved payload keys', () => {
    const withConfidence: DataFeatureSpec = {
        ...spec,
        Outputs: [{ ...spec.Outputs[0], ConfidenceRef: '$.SeniorityConfidence' }, { ...spec.Outputs[1], ConfidenceRef: '$.Functions[0].Confidence' }],
    };
    it('are not read from the model\'s own answer: an answer cannot set a driver confidence or replaced outputs', async () => {
        modelAnswer = { SeniorityLevel: 'Director', SeniorityConfidence: 0.6, _confidence: { SeniorityLevel: 0.99, JobFunctions: 0.99 },
            _violations: [{ outputName: 'JobFunctions' }], Functions: [{ JobFunctionID: '7E010001-A101-4B01-8C01-000000000007', Confidence: 0.7 }] };
        vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockResolvedValue(CacheEntry({ ID: 'c1' }));
        const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
        const r = await new InferProcessor('PROMPT-1', undefined, withConfidence, null).ProcessRecord(record, context);
        expect(history.mock.calls[0][0].outputs.map((o) => [o.featureName, o.confidence])).toEqual([['SeniorityLevel', 0.6], ['JobFunctions', 0.7]]);
        expect(r.ResultPayload).not.toHaveProperty('_confidence');
        expect(r.ResultPayload).not.toHaveProperty('_violations');
    });
    it('a stored driver confidence outside 0..1 is ignored on a hit', async () => {
        const entry = CacheEntry({
            ID: 'c1', Reasoning: null, AIPromptRunID: null,
            OutputsJSON: JSON.stringify({ SeniorityLevel: 'Director', SeniorityConfidence: 0.6, _confidence: { SeniorityLevel: 1.5 }, Functions: [] }),
        });
        vi.spyOn(FeatureValueCacheService.Instance, 'Lookup').mockResolvedValue(entry);
        const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
        await new InferProcessor('PROMPT-1', undefined, withConfidence, null).ProcessRecord(record, context);
        expect(history.mock.calls[0][0].outputs.find((o) => o.featureName === 'SeniorityLevel')?.confidence).toBe(0.6);
    });
    it('a hit\'s result reports the same Confidence as the miss that stored it', async () => {
        modelAnswer = { SeniorityLevel: 'Director', SeniorityConfidence: 0.6, Functions: [{ JobFunctionID: '7E010001-A101-4B01-8C01-000000000007', Confidence: 0.7 }] };
        const store = vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockResolvedValue(CacheEntry({ ID: 'c1' }));
        vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
        const miss = await new InferProcessor('PROMPT-1', undefined, withConfidence, null).ProcessRecord(record, context);
        const entry = CacheEntry({
            ID: 'c1', OutputsJSON: store.mock.calls[0][0].outputsJSON, Reasoning: null, AIPromptRunID: 'AIRUN-1',
        });
        vi.spyOn(FeatureValueCacheService.Instance, 'Lookup').mockResolvedValue(entry);
        const hit = await new InferProcessor('PROMPT-1', undefined, withConfidence, null).ProcessRecord(record, context);
        expect(miss.Confidence).toEqual({ SeniorityLevel: 0.6, JobFunctions: 0.7 });
        expect(hit.Confidence).toEqual(miss.Confidence);
    });
});

describe('lookup rows in the prompt', () => {
    const rowsResult = (rows: Array<Record<string, unknown>>): RunViewResult<Record<string, unknown>> =>
        ({ Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' });
    /** The processor's constraint hash and rendered block, with the provider answering each lookup's view with `rows`. */
    const runWith = async (rows: Array<Record<string, unknown>>): Promise<{ hash: string; block: unknown }> => {
        loadSpy.mockRestore();
        vi.spyOn(provider, 'RunView').mockResolvedValue(rowsResult(rows));
        modelAnswer = { SeniorityLevel: 'Director', Functions: [] };
        vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockResolvedValue(CacheEntry({ ID: 'c1' }));
        vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue(UPSERTED);
        const single: DataFeatureSpec = { ...spec, Outputs: [spec.Outputs[0]] };
        const processor = new InferProcessor('PROMPT-1', undefined, single, null);
        await processor.ProcessRecord(record, context);
        return { hash: processor.ConstraintHash, block: renderedData?.ConstraintBlock };
    };
    const rows = [{ Name: 'Manager' }, { Name: 'Director' }, { Name: 'VP' }];

    it('give the same constraint hash and block text whatever order the provider returns them in', async () => {
        const first = await runWith(rows);
        const second = await runWith([...rows].reverse());
        expect(second).toEqual(first);
    });
    it('are rendered exactly as the shared resolver renders them (what the builder previews)', async () => {
        const { block } = await runWith(rows);
        const single = [spec.Outputs[0]];
        const loaded: LookupValueRow[] = LookupConstraintValues.InStableOrder(rows.map((r) => ({ Match: r.Name, Display: null })));
        const preview = RenderConstraintBlock(single, await OutputConstraintResolver.Resolve(single, PEOPLE, async () => loaded));
        expect(block).toBe(preview);
    });
});
