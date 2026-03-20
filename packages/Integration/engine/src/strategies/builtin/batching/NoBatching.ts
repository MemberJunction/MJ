/**
 * No-batching strategy.
 * Each record is processed individually (batch size of 1).
 * Used when the external API does not support bulk operations.
 */
import type { BatchingStrategy, BatchOperationType } from '../../BatchingStrategy.js';
import type { ExternalRecord, CRUDContext, CRUDResult } from '../../../types.js';

export class NoBatching implements BatchingStrategy {
    public readonly MaxBatchSize = 1;
    public readonly SupportsBulkOperations = false;

    public BatchRecords(records: ExternalRecord[], _operation: BatchOperationType): ExternalRecord[][] {
        return records.map(record => [record]);
    }

    public async ExecuteBatch(_batch: ExternalRecord[], _operation: BatchOperationType, _context: CRUDContext): Promise<CRUDResult[]> {
        throw new Error('ExecuteBatch must be implemented by the connector');
    }
}
