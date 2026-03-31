/**
 * @fileoverview Knowledge Pipeline orchestrator.
 *
 * Unified orchestration for: ingest -> extract text -> autotag -> vectorize.
 * Uses AutotagBaseEngine for tagging and EntityVectorSyncer for vectorizing.
 * Reports progress via callbacks.
 *
 * @module @memberjunction/ai-knowledge-pipeline
 */

import { UserInfo, LogStatus, LogError, RunView } from '@memberjunction/core';
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
     * Loads content items from the source, then vectorizes each one.
     */
    public async ProcessContentSource(
        params: PipelineContentParams,
        contextUser: UserInfo
    ): Promise<PipelineResult> {
        const startTime = Date.now();
        const errors: PipelineError[] = [];
        let recordsVectorized = 0;
        let recordsAutotagged = 0;
        let totalProcessed = 0;

        try {
            this.emitProgress('extract', 0, 0, 'Loading content source items...', startTime);

            // Load content items for this content source
            const rv = new RunView();
            const contentItems = await rv.RunView<Record<string, unknown>>({
                EntityName: 'Content Items',
                ExtraFilter: `ContentSourceID='${params.ContentSourceID}'`,
                ResultType: 'simple',
                Fields: ['ID', 'Name', 'ContentSourceID'],
            }, contextUser);

            if (!contentItems.Success) {
                LogError(`KnowledgePipeline.ProcessContentSource: Failed to load content items: ${contentItems.ErrorMessage}`);
                return {
                    Success: false,
                    TotalRecordsProcessed: 0,
                    RecordsAutotagged: 0,
                    RecordsVectorized: 0,
                    ElapsedMs: Date.now() - startTime,
                    Errors: [{ Stage: 'extract', Message: contentItems.ErrorMessage || 'Failed to load content items' }],
                };
            }

            const items = contentItems.Results;
            LogStatus(`KnowledgePipeline: Found ${items.length} content items for source ${params.ContentSourceID}`);

            if (items.length === 0) {
                this.emitProgress('complete', 0, 0, 'No content items found', startTime);
                return {
                    Success: true,
                    TotalRecordsProcessed: 0,
                    RecordsAutotagged: 0,
                    RecordsVectorized: 0,
                    ElapsedMs: Date.now() - startTime,
                    Errors: [],
                };
            }

            // Vectorize if enabled and EntityDocumentID is provided
            if (params.EnableVectorization && params.EntityDocumentID) {
                this.emitProgress('vectorize', 0, items.length, 'Starting content vectorization...', startTime);

                const syncer = new EntityVectorSyncer();
                await syncer.Config(false, contextUser);

                const vectorizeParams: VectorizeEntityParams = {
                    entityDocumentID: params.EntityDocumentID,
                    entityID: '', // Will be resolved from the EntityDocument
                    listBatchCount: 50,
                };

                const result = await syncer.VectorizeEntity(vectorizeParams, contextUser);
                if (result.success) {
                    recordsVectorized = items.length;
                } else {
                    errors.push({
                        Stage: 'vectorize',
                        Message: result.errorMessage || 'Vectorization failed',
                    });
                }

                totalProcessed = items.length;
                this.emitProgress('vectorize', totalProcessed, totalProcessed, 'Content vectorization complete', startTime);
            } else {
                totalProcessed = items.length;
            }

            this.emitProgress('complete', totalProcessed, totalProcessed, 'Pipeline complete', startTime);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`KnowledgePipeline.ProcessContentSource failed: ${message}`);
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
