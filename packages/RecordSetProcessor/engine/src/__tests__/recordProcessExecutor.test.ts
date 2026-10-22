import { describe, it, expect, afterEach } from 'vitest';
import type { MJRecordProcessEntity } from '@memberjunction/core-entities';
import {
    RecordProcessorRegistry,
    type IRecordProcessor,
    type OutputMappingConfig,
} from '@memberjunction/record-set-processor-base';
import { RecordProcessExecutor } from '../RecordProcessExecutor';
import { WriteBackProcessor } from '../processors/WriteBackProcessor';

class FakeInferProcessor implements IRecordProcessor {
    constructor(
        private readonly hasUnmappedWrites: boolean,
        private readonly enrichedFields?: Record<string, string>,
    ) {}

    public async ProcessRecord() {
        return { Status: 'Succeeded' as const };
    }

    public PrepareOutputMapping(rawMapping: OutputMappingConfig | undefined): {
        OutputMapping: OutputMappingConfig | undefined;
        HasUnmappedWrites: boolean;
    } {
        if (!this.enrichedFields) {
            return { OutputMapping: rawMapping, HasUnmappedWrites: this.hasUnmappedWrites };
        }
        return {
            OutputMapping: {
                ...(rawMapping ?? {}),
                fields: { ...(rawMapping?.fields ?? {}), ...this.enrichedFields },
            },
            HasUnmappedWrites: this.hasUnmappedWrites,
        };
    }
}

function inferProcess(outputMapping: string | null): MJRecordProcessEntity {
    const rp: Pick<MJRecordProcessEntity, 'ID' | 'Name' | 'WorkType' | 'PromptID' | 'InputMapping' | 'OutputMapping' | 'Configuration'> = {
        ID: 'rp-1', Name: 'P', WorkType: 'Infer', PromptID: 'prompt-1', InputMapping: null, OutputMapping: outputMapping, Configuration: '{}',
    };
    return rp as MJRecordProcessEntity;
}

describe('RecordProcessExecutor.BuildProcessor write-back wrapping', () => {
    afterEach(() => RecordProcessorRegistry.Instance.Unregister('Infer'));

    const build = (rp: MJRecordProcessEntity) => new RecordProcessExecutor().BuildProcessor(rp, false);

    it('wraps a processor that reports HasUnmappedWrites even with no OutputMapping, so previews and outcomes flow', () => {
        RecordProcessorRegistry.Instance.Register('Infer', () => new FakeInferProcessor(true));
        expect(build(inferProcess(null))).toBeInstanceOf(WriteBackProcessor);
    });

    it('does not wrap a processor with HasUnmappedWrites=false and no OutputMapping', () => {
        RecordProcessorRegistry.Instance.Register('Infer', () => new FakeInferProcessor(false));
        expect(build(inferProcess(null))).toBeInstanceOf(FakeInferProcessor);
    });

    it('still wraps a processor with an (empty) fields mapping', () => {
        RecordProcessorRegistry.Instance.Register('Infer', () => new FakeInferProcessor(false));
        expect(build(inferProcess('{"fields":{}}'))).toBeInstanceOf(WriteBackProcessor);
    });
});
