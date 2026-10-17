import { describe, it, expect } from 'vitest';
import type { MJRecordProcessEntity } from '@memberjunction/core-entities';
import type { DataFeatureOutput, DataFeatureSpec } from '@memberjunction/feature-pipelines';
import { RecordProcessExecutor } from '../RecordProcessExecutor';
import { InferProcessor } from '../processors/InferProcessor';
import { WriteBackProcessor } from '../processors/WriteBackProcessor';

const TARGETLESS: DataFeatureOutput = { Name: 'Years', Ref: '$.Years' };
const FIELD_TARGET: DataFeatureOutput = { Name: 'Bio', Ref: '$.Bio', Target: { Mode: 'field', EntityFieldName: 'Bio' } };

/** An Infer Record Process whose pipeline has these outputs and this OutputMapping JSON. */
function inferProcess(outputs: DataFeatureOutput[], outputMapping: string | null): MJRecordProcessEntity {
    const spec: DataFeatureSpec = {
        Name: 'P', Description: 'p', PromptID: 'prompt-1', Context: { Fields: ['Bio'] },
        Caching: { Cacheable: true, KeyFields: ['Bio'], Scope: 'pipeline' }, Outputs: outputs,
    };
    const rp: Pick<MJRecordProcessEntity, 'ID' | 'Name' | 'WorkType' | 'PromptID' | 'InputMapping' | 'OutputMapping' | 'Configuration'> = {
        ID: 'rp-1', Name: 'P', WorkType: 'Infer', PromptID: 'prompt-1', InputMapping: null, OutputMapping: outputMapping, Configuration: JSON.stringify(spec),
    };
    return rp as MJRecordProcessEntity;
}

describe('RecordProcessExecutor.BuildProcessor write-back wrapping', () => {
    const build = (rp: MJRecordProcessEntity) => new RecordProcessExecutor().BuildProcessor(rp, false);

    it('wraps a pipeline with a target-less output and no OutputMapping, so previews and outcomes flow', () => {
        expect(build(inferProcess([TARGETLESS], null))).toBeInstanceOf(WriteBackProcessor);
    });

    it('does not wrap a pipeline with only field-target outputs and no OutputMapping', () => {
        expect(build(inferProcess([FIELD_TARGET], null))).toBeInstanceOf(InferProcessor);
    });

    it('still wraps a pipeline with an (empty) fields mapping', () => {
        expect(build(inferProcess([FIELD_TARGET], '{"fields":{}}'))).toBeInstanceOf(WriteBackProcessor);
    });
});
