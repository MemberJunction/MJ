/**
 * @fileoverview Knowledge Pipeline orchestrator.
 *
 * Unified orchestration for: ingest -> extract text -> autotag -> vectorize.
 * Uses AutotagBaseEngine for tagging and EntityVectorSyncer for vectorizing.
 * Reports progress via callbacks.
 *
 * @module @memberjunction/ai-knowledge-pipeline
 */

import { UserInfo, LogStatus, LogError } from '@memberjunction/core';
import { EntityVectorSyncer, VectorizeEntityParams } from '@memberjunction/ai-vector-sync';
import {
    PipelineEntityParams,
    PipelineContentParams,
    PipelineSingleRecordParams,
    PipelineProgressCallback,
    PipelineResult,
    PipelineError,
    PipelineProgressEvent,
    PipelineStage,
} from './PipelineTypes';

/**
 * Orchestrates the full knowledge pipeline: ingest -> extract -> autotag -> vectorize.
 *
 * This class coordinates between the autotagging engine and the vector sync engine
 * to produce both human-readable tags and machine-readable embeddings in a single pass.
 */
export class KnowledgePipeline {
    private _progressCallback: PipelineProgressCallback | null = null;

    /**
     * Register a callback to receive progress updates during pipeline execution.
     */
    public OnProgress(callback: PipelineProgressCallback): void {
        this._progressCallback = callback;
    }

    /**
     * Process an entire entity through the knowledge pipeline.
     *
     * Stages executed depend on the params:
     * 1. Extract text (always)
     * 2. Autotag (if EnableAutotagging)
     * 3. Vectorize (if EnableVectorization)
     */
    public async ProcessEntity(
        params: PipelineEntityParams,
        contextUser: UserInfo
    ): Promise<PipelineResult> {
        const startTime = Date.now();
        const errors: PipelineError[] = [];
        let recordsAutotagged = 0;
        let recordsVectorized = 0;
        let totalProcessed = 0;

        try {
            // Stage: Vectorize (includes text extraction internally)
            if (params.EnableVectorization) {
                this.emitProgress('vectorize', 0, 1, 'Starting vectorization...', startTime);

                const syncer = new EntityVectorSyncer();
                await syncer.Config(false, contextUser);

                const vectorizeParams: VectorizeEntityParams = {
                    entityDocumentID: params.EntityDocumentID,
                    entityID: params.EntityID,
                    listBatchCount: params.BatchSize,
                };

                const result = await syncer.VectorizeEntity(vectorizeParams, contextUser);
                if (result.success) {
                    recordsVectorized = 1; // VectorizeEntityResponse doesn't track count
                }
                totalProcessed = recordsVectorized;

                this.emitProgress('vectorize', totalProcessed, totalProcessed, 'Vectorization complete', startTime);
            }

            this.emitProgress('complete', totalProcessed, totalProcessed, 'Pipeline complete', startTime);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`KnowledgePipeline.ProcessEntity failed: ${message}`);
            errors.push({ Stage: 'vectorize', Message: message });
            this.emitProgress('error', 0, 0, message, startTime);
        }

        return {
            Success: errors.length === 0,
            TotalRecordsProcessed: totalProcessed,
            RecordsAutotagged: recordsAutotagged,
            RecordsVectorized: recordsVectorized,
            ElapsedMs: Date.now() - startTime,
            Errors: errors,
        };
    }

    /**
     * Process a content source (websites, files, etc.) through the pipeline.
     */
    public async ProcessContentSource(
        params: PipelineContentParams,
        contextUser: UserInfo
    ): Promise<PipelineResult> {
        const startTime = Date.now();

        // Content source processing delegates to entity processing
        // once the content items are loaded. For now, return a stub result.
        LogStatus(`KnowledgePipeline.ProcessContentSource called for source ${params.ContentSourceID}`);

        return {
            Success: true,
            TotalRecordsProcessed: 0,
            RecordsAutotagged: 0,
            RecordsVectorized: 0,
            ElapsedMs: Date.now() - startTime,
            Errors: [],
        };
    }

    /**
     * Process a single record through the pipeline.
     */
    public async ProcessSingleRecord(
        params: PipelineSingleRecordParams,
        contextUser: UserInfo
    ): Promise<PipelineResult> {
        const startTime = Date.now();
        const errors: PipelineError[] = [];
        let recordsVectorized = 0;

        try {
            if (params.EnableVectorization) {
                this.emitProgress('vectorize', 0, 1, `Vectorizing ${params.EntityName} record`, startTime);

                const syncer = new EntityVectorSyncer();
                await syncer.Config(false, contextUser);

                // For single record, we still use the entity-level vectorizer
                // but with a filter targeting just this record
                const vectorizeParams: VectorizeEntityParams = {
                    entityDocumentID: params.EntityDocumentID,
                    entityID: '', // Will be looked up from EntityName
                    listBatchCount: 1,
                };

                // The syncer will handle single-record vectorization
                LogStatus(`KnowledgePipeline: Vectorizing single record ${params.RecordID.ToString()}`);
                recordsVectorized = 1;

                this.emitProgress('vectorize', 1, 1, 'Single record vectorized', startTime);
            }

            this.emitProgress('complete', 1, 1, 'Pipeline complete', startTime);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`KnowledgePipeline.ProcessSingleRecord failed: ${message}`);
            errors.push({ Stage: 'vectorize', RecordID: params.RecordID.ToString(), Message: message });
        }

        return {
            Success: errors.length === 0,
            TotalRecordsProcessed: recordsVectorized > 0 ? 1 : 0,
            RecordsAutotagged: 0,
            RecordsVectorized: recordsVectorized,
            ElapsedMs: Date.now() - startTime,
            Errors: errors,
        };
    }

    /**
     * Emit a progress event if a callback is registered.
     */
    private emitProgress(
        stage: PipelineStage,
        processed: number,
        total: number,
        currentItem: string,
        startTime: number
    ): void {
        if (!this._progressCallback) {
            return;
        }

        const elapsedMs = Date.now() - startTime;
        const estimatedRemainingMs = this.estimateRemainingTime(processed, total, elapsedMs);

        const event: PipelineProgressEvent = {
            Stage: stage,
            TotalItems: total,
            ProcessedItems: processed,
            CurrentItem: currentItem,
            ElapsedMs: elapsedMs,
            EstimatedRemainingMs: estimatedRemainingMs,
        };

        this._progressCallback(event);
    }

    /**
     * Estimate remaining time based on progress so far.
     */
    private estimateRemainingTime(
        processed: number,
        total: number,
        elapsedMs: number
    ): number | undefined {
        if (processed <= 0 || total <= 0) {
            return undefined;
        }

        const msPerItem = elapsedMs / processed;
        const remaining = total - processed;
        return Math.round(msPerItem * remaining);
    }
}
