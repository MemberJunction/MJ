/**
 * @fileoverview In-memory array source — yields a fixed list of record references in batches.
 * Useful for `SingleRecord` / explicit-array scopes and for tests.
 * @module @memberjunction/record-set-processor-base
 */

import { IRecordSetSource, SourceDescriptor } from '../interfaces';
import { ProcessCursor, RecordBatch, RecordRef, SourceTypeValue } from '../types';

/** A source backed by an in-memory array of {@link RecordRef}. */
export class ArraySource implements IRecordSetSource {
    /**
     * @param records - The records to yield.
     * @param entityID - Optional entity ID for the run header (otherwise taken from the first record).
     * @param sourceType - Reported source type (default `Array`; pass `SingleRecord` for a one-record scope).
     */
    constructor(
        private readonly records: RecordRef[],
        private readonly entityID?: string,
        private readonly sourceType: SourceTypeValue = 'Array',
    ) {}

    public Describe(): SourceDescriptor {
        return { SourceType: this.sourceType, EntityID: this.entityID ?? this.records[0]?.EntityID };
    }

    public async NextBatch(cursor: ProcessCursor | undefined, batchSize: number): Promise<RecordBatch> {
        const offset = cursor?.Offset ?? 0;
        const slice = this.records.slice(offset, offset + batchSize);
        const next = offset + slice.length;
        return {
            Records: slice,
            NextCursor: { Offset: next },
            Exhausted: next >= this.records.length,
            TotalRowCount: this.records.length,
        };
    }
}
