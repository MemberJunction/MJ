/**
 * Simple batching strategy.
 * Chunks records into groups of a configurable maximum batch size.
 * ExecuteBatch is a structural placeholder -- the connector or engine handles actual execution.
 */
import type { BatchingStrategy, BatchOperationType } from '../../BatchingStrategy.js';
import type { ExternalRecord, CRUDContext, CRUDResult } from '../../../types.js';

export class SimpleBatching implements BatchingStrategy {
    public readonly MaxBatchSize: number;
    public readonly SupportsBulkOperations = false;

    /**
     * @param maxBatchSize - maximum number of records per batch (default: 100)
     */
    constructor(maxBatchSize: number = 100) {
        this.MaxBatchSize = maxBatchSize;
    }

    public BatchRecords(records: ExternalRecord[], _operation: BatchOperationType): ExternalRecord[][] {
        const batches: ExternalRecord[][] = [];
        for (let i = 0; i < records.length; i += this.MaxBatchSize) {
            batches.push(records.slice(i, i + this.MaxBatchSize));
        }
        return batches;
    }

    public async ExecuteBatch(_batch: ExternalRecord[], _operation: BatchOperationType, _context: CRUDContext): Promise<CRUDResult[]> {
        throw new Error('ExecuteBatch must be implemented by the connector');
    }
}
