/**
 * @fileoverview A processor that delegates to a plain function — the simplest executor seam, useful
 * for inline logic and tests. Action / Agent / Infer-&-Write-Back processors are added alongside
 * their consuming features.
 * @module @memberjunction/record-set-processor
 */

import {
    IRecordProcessor,
    RecordProcessorContext,
    RecordRef,
    RecordResult,
} from '@memberjunction/record-set-processor-base';

/** Per-record handler function wrapped by {@link FunctionRecordProcessor}. */
export type RecordProcessorFn = (record: RecordRef, context: RecordProcessorContext) => Promise<RecordResult> | RecordResult;

/** An {@link IRecordProcessor} backed by a function. */
export class FunctionRecordProcessor implements IRecordProcessor {
    constructor(private readonly fn: RecordProcessorFn) {}

    public async ProcessRecord(record: RecordRef, context: RecordProcessorContext): Promise<RecordResult> {
        return this.fn(record, context);
    }
}
