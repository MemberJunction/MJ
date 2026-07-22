/**
 * @fileoverview A processor decorator that runs an inner processor (Action/Agent/Infer) and then
 * applies the Record Process's `OutputMapping` write-back (fields / child record) using the inner
 * result's payload. Lets any work type share the same declarative write-back.
 * @module @memberjunction/record-set-processor
 */

import { LogError } from '@memberjunction/core';
import {
    IRecordProcessor,
    RecordProcessorContext,
    RecordRef,
    RecordResult,
} from '@memberjunction/record-set-processor-base';
import { OutputMappingConfig, applyOutputMapping } from '../writeBack';

/** Wraps a processor and applies output-mapping write-back to each successful result. */
export class WriteBackProcessor implements IRecordProcessor {
    /**
     * @param inner - The processor that produces the work result.
     * @param outputMapping - The `OutputMapping` config to apply to each successful result.
     * @param dryRun - When true, the inner work still runs but the write-back only computes a
     *   preview (no entity is saved / no child is created), so a dry-run of any wrapped work type
     *   reports its effect without mutating data. Mirrors `FieldRulesProcessor`'s dry-run.
     */
    constructor(
        private readonly inner: IRecordProcessor,
        private readonly outputMapping: OutputMappingConfig,
        private readonly dryRun: boolean = false,
    ) {}

    public async ProcessRecord(record: RecordRef, context: RecordProcessorContext): Promise<RecordResult> {
        const result = await this.inner.ProcessRecord(record, context);
        if (result.Status !== 'Succeeded') {
            return result;
        }
        try {
            const writeBack = await applyOutputMapping({
                outputMapping: this.outputMapping,
                result: result.ResultPayload,
                record,
                contextUser: context.contextUser,
                provider: context.provider,
                dryRun: this.dryRun,
            });
            return { ...result, ResultPayload: { output: result.ResultPayload, writeBack } };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`WriteBackProcessor: write-back failed for record '${record.RecordID}': ${message}`);
            return { ...result, Status: 'Failed', ErrorMessage: `Write-back failed: ${message}` };
        }
    }
}
