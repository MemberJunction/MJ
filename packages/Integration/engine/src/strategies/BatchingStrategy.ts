/**
 * Strategy interfaces for batching records during write operations.
 * Different APIs support different batch sizes and bulk mechanisms.
 */

import type { ExternalRecord, CRUDContext, CRUDResult } from '../types.js';

/** Type of batch operation */
export type BatchOperationType = 'create' | 'update' | 'delete';

/** A batching strategy implementation */
export interface BatchingStrategy {
    /** Maximum records per batch call */
    MaxBatchSize: number;
    /** Whether the API supports async bulk operations (e.g., Salesforce Bulk 2.0) */
    SupportsBulkOperations: boolean;
    /**
     * Split records into batches respecting MaxBatchSize.
     * @param records - records to batch
     * @param operation - the CRUD operation type
     * @returns array of batches (each batch is an array of records)
     */
    BatchRecords(records: ExternalRecord[], operation: BatchOperationType): ExternalRecord[][];
    /**
     * Execute a single batch of records against the external API.
     * @param batch - records in this batch
     * @param operation - the CRUD operation type
     * @param context - CRUD context with auth and connection details
     * @returns per-record results
     */
    ExecuteBatch(batch: ExternalRecord[], operation: BatchOperationType, context: CRUDContext): Promise<CRUDResult[]>;
}
