import { BaseEntitySaveQueue, IMetadataProvider } from '@memberjunction/core';
import { AIEmbeddingRunner } from './embedding/AIEmbeddingRunner';
import { EmbeddingRunParams, EmbeddingRunResult } from './embedding/embedding-runner.types';

export type { EmbeddingRunResult, EmbeddingRunParams } from './embedding/embedding-runner.types';

/**
 * AIModelRunner — Lightweight AI model execution tracker for non-LLM model types.
 *
 * @deprecated Use {@link AIEmbeddingRunner} instead. AIModelRunner is retained for backward
 * compatibility and delegates all execution and prompt-run queuing to AIEmbeddingRunner.
 */
export class AIModelRunner {
    private _embeddingRunner = new AIEmbeddingRunner();

    /**
     * Optional metadata provider override.
     */
    public get Provider(): IMetadataProvider {
        return this._embeddingRunner.Provider;
    }
    public set Provider(value: IMetadataProvider | null) {
        this._embeddingRunner.Provider = value;
    }

    /**
     * Exposes the embedding runner's prompt run save queue for backward compatibility.
     */
    private get _promptRunQueue(): BaseEntitySaveQueue {
        return this._embeddingRunner.PromptRunQueue;
    }

    /**
     * Execute an embedding call with full AIPromptRun tracking.
     * Delegates to {@link AIEmbeddingRunner.RunEmbedding}.
     *
     * @param params - Embedding execution parameters
     * @returns Result with vectors, run ID, and usage metrics
     */
    public async RunEmbedding(params: EmbeddingRunParams): Promise<EmbeddingRunResult> {
        return this._embeddingRunner.RunEmbedding(params);
    }

    /**
     * Awaits all in-flight prompt-run saves queued by this runner.
     */
    public async WaitForPendingPromptRunSaves(): Promise<void> {
        await this._embeddingRunner.WaitForPendingPromptRunSaves();
    }
}
