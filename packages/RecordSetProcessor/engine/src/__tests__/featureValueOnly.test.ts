import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityInfo, UserInfo } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import type { AIPromptParams, AIPromptRunResult, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { ChatResult } from '@memberjunction/ai';
import type { RecordProcessorContext, RecordRef, RecordResult, WriteBackRunPayload } from '@memberjunction/record-set-processor-base';
import { FeaturePipelineVersionService, FeatureValueCacheService, type DataFeatureSpec, type TypedFeatureValue } from '@memberjunction/feature-pipelines';
import { KnowledgeHubMetadataEngine, type MJFeatureValueCacheEntity } from '@memberjunction/core-entities';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import { InferProcessor } from '../processors/InferProcessor';
import { WriteBackProcessor } from '../processors/WriteBackProcessor';

type PromptDouble = Pick<MJAIPromptEntityExtended, 'ID' | 'Name' | 'TemplateText' | 'ValidationBehavior'>;
const asPrompt = (p: PromptDouble): MJAIPromptEntityExtended => p as MJAIPromptEntityExtended;

const USER = new UserInfo();
const record: RecordRef = { EntityID: 'ENT-P', RecordID: 'p-1', Record: { ID: 'p-1', Bio: 'Seven years of cheese' } };
const PEOPLE = new EntityInfo({ ID: 'ENT-P', Name: 'People', Fields: [{ Name: 'Bio', TSType: 'string' }] });
const provider = new EntitiesOnlyProvider([PEOPLE]);
const context: RecordProcessorContext = { contextUser: USER, recordProcessID: 'rp-1', entityID: 'ENT-P', processRunID: 'run-1', provider };
const EMPTY: TypedFeatureValue = { ValueText: null, ValueNumeric: null, ValueBoolean: null, ValueDate: null, ValueJSON: null };

/** One output with no write target: its answer is stored as a Feature Value only. */
const spec: DataFeatureSpec = {
    Name: 'Years', Description: 'years', PromptID: 'PROMPT-1', Context: { Fields: ['Bio'] },
    Caching: { Cacheable: true, KeyFields: ['Bio'], Scope: 'pipeline' },
    Outputs: [{ Name: 'Years', Ref: '$.Years', Constraint: { Type: 'numeric', OnViolation: 'fail' } }],
};
let modelAnswer: Record<string, unknown> = {};

beforeEach(() => {
    vi.restoreAllMocks();
    modelAnswer = { Years: 7 };
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'FeaturePipelineTypes', 'get').mockReturnValue([]);
    vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([asPrompt({ ID: 'PROMPT-1', Name: 'Y', TemplateText: 'Bio {{record.Bio}} {{ ConstraintBlock }}', ValidationBehavior: 'Strict' })]);
    vi.spyOn(AIPromptRunner.prototype, 'ExecutePrompt').mockImplementation(async (_p: AIPromptParams): Promise<AIPromptRunResult> =>
        ({ success: true, result: modelAnswer, chatResult: new ChatResult(true, new Date(), new Date()) }));
    vi.spyOn(FeatureValueCacheService.Instance, 'Lookup').mockResolvedValue(null);
    vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
    vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockResolvedValue({ ID: 'cache-1' } as MJFeatureValueCacheEntity);
    vi.spyOn(FeaturePipelineVersionService.Instance, 'ResolveForRun').mockResolvedValue({ Version: 1, Status: 'Active' });
});

/** The latest stored Pipeline value per (lower-cased) feature name, as `GetLatestPipelineValues` would answer. */
function storedValues(pipeline: Record<string, TypedFeatureValue>) {
    return vi.spyOn(FeatureValueCacheService.Instance, 'GetLatestPipelineValues').mockImplementation(async () => new Map(Object.entries(pipeline)));
}

describe('a pipeline whose output has no write target', () => {
    it('stores the value on a real run with the output\'s constraint type', async () => {
        const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue({ Upserted: 1, Unchanged: 0, Previous: {} });
        const result = await new InferProcessor('PROMPT-1', undefined, spec, null).ProcessRecord(record, context);
        expect(result.ErrorMessage).toBeUndefined();
        expect(result.Status).toBe('Succeeded');
        expect(history.mock.calls[0][0].outputs).toEqual([expect.objectContaining({ featureName: 'Years', value: 7, constraintType: 'numeric' })]);
    });

    it('withholds no write-back targets, even from a result that withheld the output', () => {
        const p = new InferProcessor('PROMPT-1', undefined, spec, null);
        const withheld: RecordResult = { Status: 'Succeeded', BelowConfidenceOutputs: ['Years'] };
        expect(p.WithheldWriteBackTargets(withheld)).toBeUndefined();
    });

    it('previews on a dry run what it would store, writing nothing', async () => {
        const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues');
        storedValues({});
        const p = new InferProcessor('PROMPT-1', undefined, spec, null);
        const result = await p.ProcessRecord(record, { ...context, DryRun: true });
        expect(result).toMatchObject({ Status: 'Succeeded', DryRun: true });
        expect(history).not.toHaveBeenCalled();
        expect(p.PreviewFeatureValues('p-1')).toEqual([{ FeatureName: 'Years', Previous: null, Proposed: 7 }]);
        expect(p.PreviewFeatureValues('other')).toEqual([]);
    });

    it('previews the record\'s latest stored Pipeline value as Previous, with one read per record', async () => {
        const read = storedValues({ years: { ...EMPTY, ValueNumeric: 3 } });
        const p = new InferProcessor('PROMPT-1', undefined, spec, null);
        await p.ProcessRecord(record, { ...context, DryRun: true });
        expect(p.PreviewFeatureValues('p-1')).toEqual([{ FeatureName: 'Years', Previous: 3, Proposed: 7 }]);
        expect(read).toHaveBeenCalledTimes(1);
        expect(read.mock.calls[0][0]).toMatchObject({ RecordProcessID: 'rp-1', EntityID: 'ENT-P', RecordID: 'p-1', FeatureNames: ['Years'] });
    });

    it('ignores a Human value: the real run compares against the Pipeline value only', async () => {
        storedValues({ years: { ...EMPTY, ValueNumeric: 7 } });
        const human = vi.spyOn(FeatureValueCacheService.Instance, 'GetLatestValue').mockResolvedValue({ ...EMPTY, ValueNumeric: 5 });
        const p = new InferProcessor('PROMPT-1', undefined, spec, null);
        await p.ProcessRecord(record, { ...context, DryRun: true });
        expect(p.PreviewFeatureValues('p-1')).toEqual([]);
        expect(human).not.toHaveBeenCalled();
    });

    it('fails the record, naming the read, when the stored values cannot be read', async () => {
        vi.spyOn(FeatureValueCacheService.Instance, 'GetLatestPipelineValues').mockRejectedValue(new Error('db down'));
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const result = await new InferProcessor('PROMPT-1', undefined, spec, null).ProcessRecord(record, { ...context, DryRun: true });
        expect(result.Status).toBe('Failed');
        expect(result.ErrorMessage).toBe('Feature Value preview read failed: db down');
        expect(logged).toHaveBeenCalled();
    });

    it('omits an output whose stored value already equals the proposed one', async () => {
        storedValues({ years: { ...EMPTY, ValueNumeric: 7 } });
        const p = new InferProcessor('PROMPT-1', undefined, spec, null);
        await p.ProcessRecord(record, { ...context, DryRun: true });
        expect(p.PreviewFeatureValues('p-1')).toEqual([]);
    });

    it('omits an output withheld below its confidence floor', async () => {
        storedValues({});
        const floored: DataFeatureSpec = { ...spec, Outputs: [{ ...spec.Outputs[0], ConfidenceRef: '$.YearsConfidence', MinConfidence: 0.9, OnLowConfidence: 'null' }] };
        modelAnswer = { Years: 7, YearsConfidence: 0.1 };
        const p = new InferProcessor('PROMPT-1', undefined, floored, null);
        const result = await p.ProcessRecord(record, { ...context, DryRun: true });
        expect(result.BelowConfidenceOutputs).toEqual(['Years']);
        expect(p.PreviewFeatureValues('p-1')).toEqual([]);
    });

    it('forgets a previous batch\'s previews when a new batch starts', async () => {
        storedValues({});
        const p = new InferProcessor('PROMPT-1', undefined, spec, null);
        await p.ProcessBatch([record], { ...context, DryRun: true });
        expect(p.PreviewFeatureValues('p-1')).toHaveLength(1);
        await p.ProcessBatch([{ ...record, RecordID: 'p-2' }], { ...context, DryRun: true });
        expect(p.PreviewFeatureValues('p-1')).toEqual([]);
        expect(p.PreviewFeatureValues('p-2')).toHaveLength(1);
    });
});

/** The typed value `RecordFeatureValues` stores for each captured output item (it calls `ToTypedValue` the same way). */
function storedTyped(history: ReturnType<typeof recordHistory>, call = 0): Record<string, TypedFeatureValue> {
    return Object.fromEntries(history.mock.calls[call][0].outputs.map((o) => [o.featureName, FeatureValueCacheService.ToTypedValue(o.value, o.constraintType)]));
}
function recordHistory() {
    return vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue({ Upserted: 1, Unchanged: 0, Previous: {} });
}

describe('string answers to typed constraints on outputs without a write target', () => {
    const typed: DataFeatureSpec = {
        ...spec, Name: 'Typed',
        Outputs: [
            { Name: 'Score', Ref: '$.Score', Constraint: { Type: 'numeric', Min: 0, Max: 1, OnViolation: 'fail' } },
            { Name: 'Flag', Ref: '$.Flag', Constraint: { Type: 'boolean', OnViolation: 'fail' } },
            { Name: 'Bad', Ref: '$.Bad', Constraint: { Type: 'numeric', OnViolation: 'null' } },
        ],
    };

    it('coerces \'0.75\' to a number and \'true\' to a boolean, and nulls an unparseable number under OnViolation null', async () => {
        modelAnswer = { Score: '0.75', Flag: 'true', Bad: 'abc' };
        const history = recordHistory();
        const result = await new InferProcessor('PROMPT-1', undefined, typed, null).ProcessRecord(record, context);
        expect(result.ErrorMessage).toBeUndefined();
        expect(result.Status).toBe('Succeeded');
        const stored = storedTyped(history);
        expect(stored.Score).toEqual({ ...EMPTY, ValueNumeric: 0.75 });
        expect(stored.Flag).toEqual({ ...EMPTY, ValueBoolean: true });
        expect(stored.Bad).toEqual(EMPTY);
    });

    it('a rejected string names no target column', async () => {
        const strict: DataFeatureSpec = { ...typed, Outputs: [{ Name: 'Score', Ref: '$.Score', Constraint: { Type: 'numeric', OnViolation: 'fail' } }] };
        modelAnswer = { Score: 'abc' };
        const result = await new InferProcessor('PROMPT-1', undefined, strict, null).ProcessRecord(record, context);
        expect(result.Status).toBe('Failed');
        expect(result.ErrorMessage).toContain("Constraint violation for 'Score'");
        expect(result.ErrorMessage).not.toMatch(/target column/i);
    });
});

describe('coercion by constraint applies to outputs without a write target only', () => {
    const PEOPLE_DATED = new EntityInfo({ ID: 'ENT-P', Name: 'People', Fields: [{ Name: 'Bio', TSType: 'string' }, { Name: 'Notes', TSType: 'string' }] });
    const datedContext: RecordProcessorContext = { ...context, provider: new EntitiesOnlyProvider([PEOPLE_DATED]) };
    const dated: DataFeatureSpec = {
        ...spec, Name: 'Dated',
        Outputs: [
            { Name: 'SeenOn', Ref: '$.SeenOn', Constraint: { Type: 'date', OnViolation: 'fail' }, Target: { Mode: 'field', EntityFieldName: 'Notes' } },
            { Name: 'FirstSeen', Ref: '$.FirstSeen', Constraint: { Type: 'date', OnViolation: 'fail' } },
        ],
    };

    it('a field-target date output keeps its text storage; a target-less one stores ValueDate', async () => {
        modelAnswer = { SeenOn: '2026-01-02', FirstSeen: '2026-01-02' };
        const history = recordHistory();
        const result = await new InferProcessor('PROMPT-1', undefined, dated, null).ProcessRecord(record, datedContext);
        expect(result.ErrorMessage).toBeUndefined();
        const items = history.mock.calls[0][0].outputs;
        expect(items.find((o) => o.featureName === 'SeenOn')?.constraintType).toBeUndefined();
        expect(items.find((o) => o.featureName === 'FirstSeen')?.constraintType).toBe('date');
        const stored = storedTyped(history);
        expect(stored.SeenOn).toEqual({ ...EMPTY, ValueText: '2026-01-02' });
        expect(stored.FirstSeen.ValueDate).toBeInstanceOf(Date);
        expect(stored.FirstSeen.ValueText).toBeNull();
    });
});

describe('a pipeline that writes no history', () => {
    it('previews nothing on a dry run and reads no stored value', async () => {
        const read = storedValues({});
        const p = new InferProcessor('PROMPT-1', undefined, spec, null);
        p.WritesHistory = false;
        await p.ProcessRecord(record, { ...context, DryRun: true });
        expect(p.PreviewFeatureValues('p-1')).toEqual([]);
        expect(read).not.toHaveBeenCalled();
    });
});

describe('a target-less real run through InferProcessor and WriteBackProcessor', () => {
    it('writes the deferred Feature Values in the write-back unit: Upserted, then Unchanged', async () => {
        const history = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues')
            .mockResolvedValueOnce({ Upserted: 1, Unchanged: 0, Previous: {} })
            .mockResolvedValueOnce({ Upserted: 0, Unchanged: 1, Previous: { Years: { ...EMPTY, ValueNumeric: 7 } } });
        const writeBack = new WriteBackProcessor(new InferProcessor('PROMPT-1', undefined, spec, null), { fields: {} }, false);
        const first = await writeBack.ProcessRecord(record, context);
        expect(first.ErrorMessage).toBeUndefined();
        expect(first.Outcome).toBe('Upserted');
        const second = await writeBack.ProcessRecord(record, { ...context, processRunID: 'run-2' });
        expect(second.Outcome).toBe('Unchanged');
        expect(history).toHaveBeenCalledTimes(2);
        expect(history.mock.calls[0][0].outputs).toEqual([expect.objectContaining({ featureName: 'Years', value: 7 })]);
    });
});

describe('WriteBackProcessor over a target-less pipeline', () => {
    const inner = {
        ProcessRecord: async (): Promise<RecordResult> => ({ Status: 'Succeeded', ResultPayload: { Years: 7 } }),
        PreviewFeatureValues: (_id: string) => [{ FeatureName: 'Years', Previous: null, Proposed: 7 }],
    };
    const writeBackOf = (r: RecordResult) => (r.ResultPayload as WriteBackRunPayload).writeBack;

    it('copies the processor\'s preview into the dry-run write-back result', async () => {
        const r = await new WriteBackProcessor(inner, { fields: {} }, false).ProcessRecord(record, { ...context, DryRun: true });
        expect(r).toMatchObject({ Status: 'Succeeded', DryRun: true });
        expect(writeBackOf(r)?.previewFeatureValues).toEqual([{ FeatureName: 'Years', Previous: null, Proposed: 7 }]);
    });

    it('leaves the field out when the processor previews nothing', async () => {
        const quiet = { ...inner, PreviewFeatureValues: () => [] };
        const r = await new WriteBackProcessor(quiet, { fields: {} }, false).ProcessRecord(record, { ...context, DryRun: true });
        expect(writeBackOf(r)?.previewFeatureValues).toBeUndefined();
    });

    it('reports Upserted on a real run that upserted a Feature Value although nothing else changed', async () => {
        const deferring = {
            ...inner,
            DeferFeatureValuesToWriteBack: () => undefined,
            DiscardDeferredFeatureValues: () => undefined,
            WriteDeferredFeatureValues: async () => ({ Upserted: 1, Unchanged: 0, Previous: {} }),
        };
        const r = await new WriteBackProcessor(deferring, { fields: {} }, false).ProcessRecord(record, context);
        expect(r.ErrorMessage).toBeUndefined();
        expect(r.Outcome).toBe('Upserted');
        expect(writeBackOf(r)?.changed).toBe(false);
    });

    it('reports Unchanged when every Feature Value matched', async () => {
        const deferring = {
            ...inner,
            DeferFeatureValuesToWriteBack: () => undefined,
            DiscardDeferredFeatureValues: () => undefined,
            WriteDeferredFeatureValues: async () => ({ Upserted: 0, Unchanged: 1, Previous: {} }),
        };
        const r = await new WriteBackProcessor(deferring, { fields: {} }, false).ProcessRecord(record, context);
        expect(r.Outcome).toBe('Unchanged');
    });
});
