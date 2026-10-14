import { describe, it, expect } from 'vitest';
import { ComputeContentHashAsync } from '@memberjunction/global';
import {
    FeaturePipelinePin, FeatureValueKey, type FeaturePipelinePinData, type FeaturePipelinePromptModelRow, type FeaturePipelinePromptParameters,
} from '../spec/feature-value-key';
import type { DataFeatureSpec } from '../spec/data-feature-spec';
import { FeatureValueCacheService } from '../cache/FeatureValueCacheService';

describe('FeatureValueKey.NormalizeValue', () => {
    it('trims, collapses whitespace and case-folds strings', () => {
        expect(FeatureValueKey.NormalizeValue('  Director   of\tSales ')).toBe('director of sales');
    });
    it('composes Unicode to NFC so precomposed and combining forms match', () => {
        const decomposed = 'Fromage\u0301';
        const precomposed = 'fromag\u00e9';
        expect(decomposed.length).toBe(8);
        expect(precomposed.length).toBe(7);
        expect(FeatureValueKey.NormalizeValue(decomposed)).toBe(precomposed);
    });
    it('leaves non-text key inputs unchanged in a cache key', async () => {
        const k = await FeatureValueCacheService.Instance.ComputeCacheKey({ KeyFields: ['N', 'B', 'X'], RecordData: { N: 42, B: false, X: null } });
        expect(k.KeyJSON).toBe(JSON.stringify({ B: false, N: 42, X: null }));
    });
});

describe('ComputeCacheKey normalisation', () => {
    const svc = FeatureValueCacheService.Instance;
    it('gives one key to the same title with different case and spacing', async () => {
        const a = await svc.ComputeCacheKey({ KeyFields: ['CurrentJobTitle'], RecordData: { CurrentJobTitle: 'Director of Sales' } });
        const b = await svc.ComputeCacheKey({ KeyFields: ['CurrentJobTitle'], RecordData: { CurrentJobTitle: ' director  of sales ' } });
        expect(a.KeyHash).toBe(b.KeyHash);
        expect(a.KeyDisplay).toBe('Director of Sales');
    });
    it('resolves key-field names case-insensitively', async () => {
        const k = await svc.ComputeCacheKey({ KeyFields: ['currentjobtitle'], RecordData: { CurrentJobTitle: 'Owner' } });
        expect(k.KeyJSON).toBe(JSON.stringify({ currentjobtitle: 'owner' }));
    });
    it('normalises whole-record keys too', async () => {
        const a = await svc.ComputeCacheKey({ RecordData: { Title: 'VP Sales' } });
        const b = await svc.ComputeCacheKey({ RecordData: { Title: 'vp  sales' } });
        expect(a.KeyHash).toBe(b.KeyHash);
    });
});

const baseParams: FeaturePipelinePromptParameters = {
    Temperature: null, TopP: null, TopK: null, MinP: null, FrequencyPenalty: null, PresencePenalty: null,
    Seed: null, ResponseFormat: 'JSON', EffortLevel: null, ModelParameters: null,
};

describe('the pipeline pin', () => {
    it('picks the highest-priority Active prompt model as primary', () => {
        const primary = FeaturePipelinePin.SelectPrimaryModel([
            { ModelID: 'A', Priority: 1, Status: 'Active', EffortLevel: null, ModelParameters: null },
            { ModelID: 'B', Priority: 5, Status: 'Inactive', EffortLevel: null, ModelParameters: null },
            { ModelID: 'C', Priority: 3, Status: 'Active', EffortLevel: null, ModelParameters: null },
        ]);
        expect(primary?.ModelID).toBe('C');
        expect(FeaturePipelinePin.SelectPrimaryModel([])).toBeNull();
    });
    it('breaks a priority tie on the model ID regardless of its case', () => {
        const lower: FeaturePipelinePromptModelRow = { ModelID: 'b-model', Priority: 2, Status: 'Active', EffortLevel: null, ModelParameters: null };
        const upper: FeaturePipelinePromptModelRow = { ModelID: 'A-MODEL', Priority: 2, Status: 'Active', EffortLevel: null, ModelParameters: null };
        const upperFirst = FeaturePipelinePin.SelectPrimaryModel([upper, lower]);
        const lowerFirst = FeaturePipelinePin.SelectPrimaryModel([lower, upper]);
        expect(upperFirst?.ModelID).toBe('A-MODEL');
        expect(lowerFirst?.ModelID).toBe('A-MODEL');
        const mixed = FeaturePipelinePin.SelectPrimaryModel([
            { ...lower, ModelID: 'B-MODEL' },
            { ...upper, ModelID: 'a-model' },
        ]);
        expect(mixed?.ModelID).toBe('a-model');
    });
    it('changes the parameters hash when temperature changes, including to 0', async () => {
        const unset = await FeaturePipelinePin.ComputeParametersHash(baseParams);
        const zero = await FeaturePipelinePin.ComputeParametersHash({ ...baseParams, Temperature: 0 });
        const half = await FeaturePipelinePin.ComputeParametersHash({ ...baseParams, Temperature: 0.5 });
        expect(new Set([unset, zero, half]).size).toBe(3);
    });
    it('ignores spec name, description, caching and watermark in the spec hash', async () => {
        const spec: DataFeatureSpec = {
            Name: 'A', Description: 'a', PromptID: 'p1', Context: { Fields: ['CurrentJobTitle'] },
            Outputs: [{ Name: 'S', Ref: '$.S', Target: { Mode: 'field', EntityFieldName: 'S' } }],
            Caching: { Cacheable: true, KeyFields: ['CurrentJobTitle'], TTLSeconds: 10 },
        };
        const renamed: DataFeatureSpec = { ...spec, Name: 'B', Description: 'b', Caching: { Cacheable: true, TTLSeconds: 99 } };
        expect(await FeaturePipelinePin.ComputeSpecHash(spec, null, null)).toBe(await FeaturePipelinePin.ComputeSpecHash(renamed, null, null));
        const otherOutputs: DataFeatureSpec = { ...spec, Outputs: [{ Name: 'T', Ref: '$.T', Target: { Mode: 'field', EntityFieldName: 'T' } }] };
        expect(await FeaturePipelinePin.ComputeSpecHash(spec, null, null)).not.toBe(await FeaturePipelinePin.ComputeSpecHash(otherOutputs, null, null));
    });
    it('leaves the spec hash unchanged by the Unattended settings', async () => {
        const spec: DataFeatureSpec = {
            Name: 'A', Description: 'a', PromptID: 'p1', Context: { Fields: ['CurrentJobTitle'] },
            Outputs: [{ Name: 'S', Ref: '$.S', Target: { Mode: 'field', EntityFieldName: 'S' } }],
            Caching: { Cacheable: false },
        };
        const optedOut: DataFeatureSpec = { ...spec, Unattended: { AutoEvaluate: false, AutoBackfill: false } };
        expect(await FeaturePipelinePin.ComputeSpecHash(optedOut, null, null)).toBe(await FeaturePipelinePin.ComputeSpecHash(spec, null, null));
    });
    it('changes the spec hash when the OutputMapping changes', async () => {
        const spec: DataFeatureSpec = {
            Name: 'A', Description: 'a', PromptID: 'p1', Context: { Fields: ['CurrentJobTitle'] },
            Outputs: [{ Name: 'S', Ref: '$.S', Target: { Mode: 'field', EntityFieldName: 'S' } }],
            Caching: { Cacheable: false },
        };
        const none = await FeaturePipelinePin.ComputeSpecHash(spec, null, null);
        const mapA = await FeaturePipelinePin.ComputeSpecHash(spec, '{"fields":{"S":"$.S"}}', null);
        const mapB = await FeaturePipelinePin.ComputeSpecHash(spec, '{"fields":{"T":"$.S"}}', null);
        expect(new Set([none, mapA, mapB]).size).toBe(3);
    });
    it('covers an escalation target\'s pin, and leaves the hash of a pipeline without one unchanged', async () => {
        const spec: DataFeatureSpec = {
            Name: 'A', Description: 'a', PromptID: 'p1', Context: { Fields: ['CurrentJobTitle'] },
            Outputs: [{ Name: 'S', Ref: '$.S', Target: { Mode: 'field', EntityFieldName: 'S' } }],
            Caching: { Cacheable: false },
        };
        const none = await FeaturePipelinePin.ComputeSpecHash(spec, null, null);
        // the hash a spec had before targets were covered: the same parts, no target entry
        expect(none).toBe(await ComputeContentHashAsync({
            Context: spec.Context, Outputs: spec.Outputs, PipelineType: null, Escalation: null, PromptID: 'p1', ProcessorExtensionKey: null, OutputMapping: null,
        }));
        const targetA = await FeaturePipelinePin.ComputeSpecHash(spec, null, 'target-pin-a');
        const targetB = await FeaturePipelinePin.ComputeSpecHash(spec, null, 'target-pin-b');
        expect(new Set([none, targetA, targetB]).size).toBe(3);
    });
    it('gives a different pin hash when only the AI model changes', async () => {
        const pin: FeaturePipelinePinData = { PromptID: 'P', PromptVersionHash: 'h', AIModelID: 'M1', ParametersHash: 'x', SpecHash: 's' };
        expect(await FeaturePipelinePin.ComputeHash(pin)).not.toBe(await FeaturePipelinePin.ComputeHash({ ...pin, AIModelID: 'M2' }));
    });
    it('keys a value by record, feature, pin, input and source, case-insensitively on UUIDs', async () => {
        const k = { EntityID: 'aaaa-1', RecordID: 'r1', FeatureName: 'SeniorityLevel', PipelineVersion: 2,
            PromptVersionHash: 'h', AIModelID: 'MODEL-1', ParametersHash: 'x', InputHash: 'i', Source: 'Pipeline' as const };
        expect(await FeatureValueKey.ComputeHash(k)).toBe(await FeatureValueKey.ComputeHash({ ...k, EntityID: 'AAAA-1', AIModelID: 'model-1' }));
        expect(await FeatureValueKey.ComputeHash(k)).not.toBe(await FeatureValueKey.ComputeHash({ ...k, PipelineVersion: 3 }));
        expect(await FeatureValueKey.ComputeHash(k)).not.toBe(await FeatureValueKey.ComputeHash({ ...k, Source: 'Human' }));
    });
    it('normalises a UUID record ID by case, and keeps a non-UUID record ID as it is', async () => {
        const k = { EntityID: 'aaaa-1', RecordID: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890', FeatureName: 'SeniorityLevel',
            PipelineVersion: 2, PromptVersionHash: 'h', AIModelID: null, ParametersHash: 'x', InputHash: 'i', Source: 'Pipeline' as const };
        expect(await FeatureValueKey.ComputeHash(k))
            .toBe(await FeatureValueKey.ComputeHash({ ...k, RecordID: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }));
        const composite = { ...k, RecordID: 'OrderID|ABC-1' };
        expect(await FeatureValueKey.ComputeHash(composite))
            .not.toBe(await FeatureValueKey.ComputeHash({ ...composite, RecordID: 'orderid|abc-1' }));
    });
});
