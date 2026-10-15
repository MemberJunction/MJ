import { describe, it, expect } from 'vitest';
import { SafeJSONParse } from '@memberjunction/global';
import { ValidateSpec, type DataFeatureOutput, type DataFeatureSpec } from '../spec/data-feature-spec.js';
import { ConfidenceFloor } from '../spec/confidence-floor.js';
import { FeaturePipelinePin } from '../spec/feature-value-key.js';

/** A spec as a pipeline row's Configuration JSON yields it (ValidateSpec checks that untrusted text). */
function parsedSpec(configuration: object): DataFeatureSpec {
    const spec = SafeJSONParse<DataFeatureSpec>(JSON.stringify(configuration));
    if (!spec) {
        throw new Error('the fixture configuration is not JSON');
    }
    return spec;
}

/** One field output with the given floor settings, in a minimal valid spec. */
function specWith(output: object, pipelineType?: string): DataFeatureSpec {
    return parsedSpec({
        Name: 'n', Description: 'd', PromptID: 'p', Context: { Fields: ['T'] }, Caching: { Cacheable: false },
        ...(pipelineType ? { PipelineType: pipelineType } : {}),
        Outputs: [{ Name: 'S', Ref: '$.S', Target: { Mode: 'field', EntityFieldName: 'S' }, ...output }],
    });
}

/** The error issues ValidateSpec reports at one path. */
function errorsAt(spec: DataFeatureSpec, path: string): string[] {
    return ValidateSpec(spec).filter((i) => i.Severity === 'error' && i.Path === path).map((i) => i.Message);
}

describe('ConfidenceFloor — spec validation', () => {
    it('accepts a floor with its policy and a ConfidenceRef', () => {
        const spec = specWith({ ConfidenceRef: '$.SConf', MinConfidence: 0.5, OnLowConfidence: 'null' });
        expect(ValidateSpec(spec).filter((i) => i.Severity === 'error')).toEqual([]);
        expect(ValidateSpec(specWith({ ConfidenceRef: '$.SConf', MinConfidence: 1, OnLowConfidence: 'fail' })).filter((i) => i.Severity === 'error')).toEqual([]);
    });

    it('requires a ConfidenceRef on an LLM pipeline output with a floor', () => {
        expect(errorsAt(specWith({ MinConfidence: 0.5, OnLowConfidence: 'null' }), 'Outputs[0].MinConfidence')).toHaveLength(1);
    });

    it('lets a non-LLM pipeline (its driver supplies confidence) set a floor without a ConfidenceRef', () => {
        expect(errorsAt(specWith({ MinConfidence: 0.5, OnLowConfidence: 'null' }, 'Decision'), 'Outputs[0].MinConfidence')).toEqual([]);
    });

    it.each([0, -0.1, 1.5, Number.NaN, '0.5', null])('rejects MinConfidence %s (must be a number with 0 < floor <= 1)', (floor) => {
        expect(errorsAt(specWith({ ConfidenceRef: '$.SConf', MinConfidence: floor, OnLowConfidence: 'null' }), 'Outputs[0].MinConfidence')).toHaveLength(1);
    });

    it('rejects an OnLowConfidence that is not null or fail', () => {
        expect(errorsAt(specWith({ ConfidenceRef: '$.SConf', MinConfidence: 0.5, OnLowConfidence: 'skip' }), 'Outputs[0].OnLowConfidence')).toHaveLength(1);
    });

    it('requires OnLowConfidence with a floor, and a floor with OnLowConfidence', () => {
        expect(errorsAt(specWith({ ConfidenceRef: '$.SConf', MinConfidence: 0.5 }), 'Outputs[0].OnLowConfidence')).toHaveLength(1);
        expect(errorsAt(specWith({ ConfidenceRef: '$.SConf', OnLowConfidence: 'null' }), 'Outputs[0].MinConfidence')).toHaveLength(1);
    });

    it('refuses a floor on a whole-answer ($) output alongside other outputs, and allows it on a single output', () => {
        const two = parsedSpec({ Name: 'n', Description: 'd', PromptID: 'p', Context: {}, Caching: { Cacheable: false }, Outputs: [
            { Name: 'W', Ref: '$', ConfidenceRef: '$.c', MinConfidence: 0.5, OnLowConfidence: 'null', Target: { Mode: 'field', EntityFieldName: 'W' } },
            { Name: 'X', Ref: '$.x', Target: { Mode: 'field', EntityFieldName: 'X' } }] });
        expect(errorsAt(two, 'Outputs[0].MinConfidence')).toHaveLength(1);
        const one = parsedSpec({ ...two, Outputs: [two.Outputs[0]] });
        expect(errorsAt(one, 'Outputs[0].MinConfidence')).toEqual([]);
    });

});

describe('ConfidenceFloor — evaluation', () => {
    const floored: DataFeatureOutput = { Name: 'S', Ref: '$.S', ConfidenceRef: '$.SConf', MinConfidence: 0.5, OnLowConfidence: 'null', Target: { Mode: 'field', EntityFieldName: 'S' } };
    const unfloored: DataFeatureOutput = { Name: 'F', Ref: '$.F', Target: { Mode: 'field', EntityFieldName: 'F' } };

    it('is below the floor under it, and not at or above it', () => {
        expect(ConfidenceFloor.IsBelow(floored, 0.49)).toBe(true);
        expect(ConfidenceFloor.IsBelow(floored, 0)).toBe(true);
        expect(ConfidenceFloor.IsBelow(floored, 0.5)).toBe(false);
        expect(ConfidenceFloor.IsBelow(floored, 0.9)).toBe(false);
    });

    it('treats a missing or unusable confidence as below the floor', () => {
        expect(ConfidenceFloor.IsBelow(floored, undefined)).toBe(true);
        expect(ConfidenceFloor.IsBelow(floored, Number.NaN)).toBe(true);
    });

    it('lists the outputs below their floor, with the confidence, floor and policy', () => {
        const fail: DataFeatureOutput = { ...floored, Name: 'G', OnLowConfidence: 'fail', MinConfidence: 0.8 };
        const below = ConfidenceFloor.FindBelow([floored, unfloored, fail], { S: 0.2, G: 0.9 });
        expect(below).toEqual([{ OutputName: 'S', Confidence: 0.2, MinConfidence: 0.5, Policy: 'null' }]);
        expect(ConfidenceFloor.FindBelow([floored, fail], undefined)).toEqual([
            { OutputName: 'S', Confidence: null, MinConfidence: 0.5, Policy: 'null' },
            { OutputName: 'G', Confidence: null, MinConfidence: 0.8, Policy: 'fail' },
        ]);
    });
});

describe('ConfidenceFloor — spec hash', () => {
    it('changes the spec hash when an output\'s floor or its policy changes', async () => {
        const base = specWith({ ConfidenceRef: '$.SConf' });
        const floorA = specWith({ ConfidenceRef: '$.SConf', MinConfidence: 0.5, OnLowConfidence: 'null' });
        const floorB = specWith({ ConfidenceRef: '$.SConf', MinConfidence: 0.6, OnLowConfidence: 'null' });
        const failA = specWith({ ConfidenceRef: '$.SConf', MinConfidence: 0.5, OnLowConfidence: 'fail' });
        const hashes = await Promise.all([base, floorA, floorB, failA].map((s) => FeaturePipelinePin.ComputeSpecHash(s, null, null)));
        expect(new Set(hashes).size).toBe(4);
    });
});

describe('Context.RecordAsUserMessage', () => {
    const base = (context: object, pipelineType?: string): DataFeatureSpec => parsedSpec({
        Name: 'n', Description: 'd', PromptID: 'p', Context: context, Caching: { Cacheable: false },
        ...(pipelineType ? { PipelineType: pipelineType } : {}),
        Outputs: [{ Name: 'S', Ref: '$.S', Target: { Mode: 'field', EntityFieldName: 'S' } }],
    });

    it('accepts true on an LLM pipeline with context fields, and false or absent anywhere', () => {
        expect(errorsAt(base({ Fields: ['T'], RecordAsUserMessage: true }), 'Context.RecordAsUserMessage')).toEqual([]);
        expect(errorsAt(base({ RecordAsUserMessage: false }, 'Decision'), 'Context.RecordAsUserMessage')).toEqual([]);
        expect(errorsAt(base({ Fields: ['T'] }), 'Context.RecordAsUserMessage')).toEqual([]);
    });

    it('rejects a non-boolean, a non-LLM pipeline, and a flag without context fields', () => {
        expect(errorsAt(base({ Fields: ['T'], RecordAsUserMessage: 'yes' }), 'Context.RecordAsUserMessage')).toHaveLength(1);
        expect(errorsAt(base({ Fields: ['T'], RecordAsUserMessage: true }, 'Decision'), 'Context.RecordAsUserMessage')).toHaveLength(1);
        expect(errorsAt(base({ RecordAsUserMessage: true }), 'Context.RecordAsUserMessage')).toHaveLength(1);
    });

    it('is part of the spec hash', async () => {
        const off = await FeaturePipelinePin.ComputeSpecHash(base({ Fields: ['T'] }), null, null);
        const on = await FeaturePipelinePin.ComputeSpecHash(base({ Fields: ['T'], RecordAsUserMessage: true }), null, null);
        expect(on).not.toBe(off);
    });
});
