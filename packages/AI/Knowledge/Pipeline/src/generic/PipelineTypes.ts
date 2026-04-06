/**
 * @fileoverview Type definitions for the Knowledge Pipeline.
 *
 * The pipeline orchestrates: ingest -> extract text -> autotag -> vectorize
 * in a single unified pass.
 *
 * @module @memberjunction/ai-knowledge-pipeline
 */

import { UserInfo, CompositeKey } from '@memberjunction/core';

/**
 * The discrete stages of the knowledge pipeline.
 */
export type PipelineStage = 'extract' | 'autotag' | 'vectorize' | 'complete' | 'error';

/**
 * Parameters for processing an entire entity through the pipeline.
 */
export interface PipelineEntityParams {
    /** The entity ID to process */
    EntityID: string;
    /** The Entity Document ID to use for vectorization */
    EntityDocumentID: string;
    /** Whether to run the autotagging stage */
    EnableAutotagging: boolean;
    /** Whether to run the vectorization stage */
    EnableVectorization: boolean;
    /** Optional batch size for processing records */
    BatchSize?: number;
    /** Optional filter to restrict which records are processed */
    ExtraFilter?: string;
}

/**
 * Parameters for processing a content source (e.g., website, file collection).
 */
export interface PipelineContentParams {
    /** The content source entity ID */
    ContentSourceID: string;
    /** Whether to run autotagging */
    EnableAutotagging: boolean;
    /** Whether to run vectorization */
    EnableVectorization: boolean;
    /** Optional Entity Document ID for vectorization */
    EntityDocumentID?: string;
}

/**
 * Parameters for processing a single record.
 */
export interface PipelineSingleRecordParams {
    /** The entity name */
    EntityName: string;
    /** The record composite key */
    RecordID: CompositeKey;
    /** The Entity Document ID to use for vectorization */
    EntityDocumentID: string;
    /** Whether to run autotagging */
    EnableAutotagging: boolean;
    /** Whether to run vectorization */
    EnableVectorization: boolean;
}

/**
 * Progress event emitted during pipeline execution.
 */
export interface PipelineProgressEvent {
    /** Current stage of the pipeline */
    Stage: PipelineStage;
    /** Total number of items to process in this stage */
    TotalItems: number;
    /** Number of items processed so far */
    ProcessedItems: number;
    /** Description of the current item being processed */
    CurrentItem?: string;
    /** Milliseconds elapsed since pipeline start */
    ElapsedMs: number;
    /** Estimated milliseconds remaining (if calculable) */
    EstimatedRemainingMs?: number;
}

/**
 * Callback type for receiving pipeline progress updates.
 */
export type PipelineProgressCallback = (event: PipelineProgressEvent) => void;

/**
 * Result of a pipeline execution.
 */
export interface PipelineResult {
    /** Whether the pipeline completed successfully */
    Success: boolean;
    /** Total records processed */
    TotalRecordsProcessed: number;
    /** Records that were autotagged */
    RecordsAutotagged: number;
    /** Records that were vectorized */
    RecordsVectorized: number;
    /** Total execution time in milliseconds */
    ElapsedMs: number;
    /** Error messages for any failed records */
    Errors: PipelineError[];
}

/**
 * An individual error from pipeline processing.
 */
export interface PipelineError {
    /** The stage where the error occurred */
    Stage: PipelineStage;
    /** The record ID that failed (if applicable) */
    RecordID?: string;
    /** The error message */
    Message: string;
}
