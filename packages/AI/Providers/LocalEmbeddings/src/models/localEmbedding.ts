import { EmbedTextParams, EmbedTextsParams, EmbedTextResult, EmbedTextsResult, BaseEmbeddings, ModelUsage, ErrorAnalyzer, ThrowIfAborted } from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";
import {
    ApplyEmbeddingSettings,
    ClearEmbeddingPipelines,
    CurrentEmbeddingSettings,
    EmbedTextsWithModel,
    PreloadEmbeddingModel
} from "./embeddingRuntime.js";
import { EmbeddingWorkerHost } from "../worker/EmbeddingWorkerHost.js";

/**
 * Matryoshka truncation: keeps the leading `dimensions` values, then L2 re-normalizes, because a
 * slice of a unit vector is not unit length and cosine scores would drift silently.
 */
function truncateToDimensions(vector: number[], dimensions: number): number[] {
    if (dimensions === vector.length) {
        return vector;
    }
    if (dimensions > vector.length) {
        throw new Error(`Requested ${dimensions} dimensions, but the model produces ${vector.length}`);
    }
    const head = vector.slice(0, dimensions);
    const norm = Math.hypot(...head);
    return norm > 0 ? head.map(x => x / norm) : head;
}

@RegisterClass(BaseEmbeddings, 'LocalEmbedding')
export class LocalEmbedding extends BaseEmbeddings {
    constructor(apiKey?: string) {
        // Local embeddings don't require an API key
        super(apiKey || 'local');
    }

    /**
     * Runs ONNX models in-process, so it needs no API key. Lets credential checks (e.g.
     * `AIEmbeddingRunner`) accept a local model on an install with no
     * `AI_VENDOR_API_KEY__LocalEmbedding` set.
     */
    public override get RequiresAPIKey(): boolean {
        return false;
    }

    /** Batches go through native batch path: one ONNX call per batch on the worker or in-process. */
    public override get SupportsBatchEmbeddings(): boolean {
        return true;
    }

    /**
     * Embeds texts on the embedding worker thread when one is available, otherwise in-process.
     * Inference blocks the thread it runs on, so running it here would stall every request on
     * the process for the length of the batch (MJ #5510).
     */
    private async embedVectors(modelName: string, texts: string[], maxInputTokens?: number): Promise<{ vectors: number[][]; tokens: number }> {
        const host = EmbeddingWorkerHost.Instance;
        const embedded = host.IsAvailable
            ? await host.Run({ Kind: 'embed', Model: modelName, Texts: texts, MaxInputTokens: maxInputTokens, Settings: CurrentEmbeddingSettings() })
            : await EmbedTextsWithModel(modelName, texts, maxInputTokens);
        return { vectors: embedded.Vectors.map(vector => Array.from(vector)), tokens: embedded.Tokens };
    }

    private requireModel(model: string | undefined): string {
        if (!model) {
            throw new Error('Model name is required for LocalEmbedding provider');
        }
        return model;
    }

    /**
     * Embed a single text string
     */
    public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
        const modelName = this.requireModel(params.model);
        const startTime = Date.now();

        try {
            ThrowIfAborted(params.CancellationToken, 'LocalEmbedding');
            const { vectors: [rawVector], tokens } = await this.embedVectors(modelName, [params.text], params.maxInputTokens);
            const vector = (rawVector && params.dimensions) ? truncateToDimensions(rawVector, params.dimensions) : (rawVector ?? []);
            
            const endTime = Date.now();
            // Only log if it took more than 1 second (indicating potential performance issues)
            if (endTime - startTime > 1000) {
                console.log(`Embedded text in ${endTime - startTime}ms using ${modelName}`);
            }

            return {
                object: 'object',
                model: modelName,
                ModelUsage: new ModelUsage(tokens, 0),
                vector
            };
        } catch (error) {
            this.ThrowIfRequestAborted(error, params.CancellationToken);
            const errorInfo = ErrorAnalyzer.analyzeError(error, 'LocalEmbedding');
            console.error('Local embedding error:', errorInfo);
            
            return {
                object: 'object',
                model: modelName,
                ModelUsage: new ModelUsage(0, 0),
                vector: []
            };
        }
    }

    /**
     * Embed multiple text strings
     */
    public async EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult> {
        return this.embedBatch(params);
    }

    /**
     * Native batch path behind {@link BaseEmbeddings.EmbedTexts}, which checks the result is 1:1
     * with the inputs.
     */
    protected override async embedBatch(params: EmbedTextsParams): Promise<EmbedTextsResult> {
        const modelName = this.requireModel(params.model);
        const startTime = Date.now();

        try {
            ThrowIfAborted(params.CancellationToken, 'LocalEmbedding');
            const { vectors: rawVectors, tokens } = await this.embedVectors(modelName, params.texts, params.maxInputTokens);
            const vectors = params.dimensions
                ? rawVectors.map(v => truncateToDimensions(v, params.dimensions!))
                : rawVectors;
            const endTime = Date.now();
            // Only log if it took more than 1 second per text on average
            if (params.texts.length > 0 && (endTime - startTime) / params.texts.length > 1000) {
                console.log(`Embedded ${params.texts.length} texts in ${endTime - startTime}ms using ${modelName}`);
            }

            return {
                object: 'list',
                model: modelName,
                ModelUsage: new ModelUsage(tokens, 0),
                vectors
            };
        } catch (error) {
            this.ThrowIfRequestAborted(error, params.CancellationToken);
            const errorInfo = ErrorAnalyzer.analyzeError(error, 'LocalEmbedding');
            console.error('Local embedding error:', errorInfo);
            
            return {
                object: 'list',
                model: modelName,
                ModelUsage: new ModelUsage(0, 0),
                vectors: []
            };
        }
    }

    /**
     * Get available embedding models
     * Note: In production, this would be fetched from the database
     * through MemberJunction's AI framework
     */
    public async GetEmbeddingModels(): Promise<string[]> {
        // This method is typically not called directly when using MemberJunction
        // as the models are configured in the database
        return [];
    }

    /**
     * Override SetAdditionalSettings to handle local embedding specific settings
     */
    public override SetAdditionalSettings(settings: Record<string, unknown>): void {
        super.SetAdditionalSettings(settings);
        
        // Applied to transformers.js here, and sent with each request to the worker thread
        ApplyEmbeddingSettings({
            CacheDir: typeof settings.cacheDir === 'string' ? settings.cacheDir : undefined,
            LocalURL: typeof settings.localURL === 'string' ? settings.localURL : undefined,
        });
        
        // Models always load at q8 (DTYPE in embeddingRuntime); the preference is stored only so
        // callers that read it back from the settings still see what they set.
        if (settings.useQuantized !== undefined) {
            this._additionalSettings.useQuantized = settings.useQuantized;
        }
    }

    /**
     * Drops the loaded models and releases their ONNX sessions once their in-flight calls finish,
     * to free memory.
     */
    public ClearCache(): void {
        LocalEmbedding.clearLoadedModels();
        console.log('Cleared local embedding model cache');
    }

    /** @deprecated Use {@link ClearCache}. */
    public clearCache(): void {
        return this.ClearCache();
    }
    
    /**
     * Static method to clear the shared cache
     */
    public static ClearSharedCache(): void {
        LocalEmbedding.clearLoadedModels();
        console.log('Cleared shared local embedding model cache');
    }

    /**
     * Drops the models loaded in this thread and, if one is running, in the embedding worker. The
     * release is asynchronous and this stays synchronous for its callers, so a failed release is
     * logged here instead of thrown.
     */
    private static clearLoadedModels(): void {
        ClearEmbeddingPipelines().catch(error => console.warn('[LocalEmbedding] Releasing in-process models failed:', error));
        const host = EmbeddingWorkerHost.Instance;
        if (host.IsAvailable) {
            host.Run({ Kind: 'clear' }).catch(error => console.warn(`[LocalEmbedding] Clearing the worker's models failed: ${error}`));
        }
    }

    /** @deprecated Use {@link ClearSharedCache}. */
    public static clearSharedCache(): void {
        return this.ClearSharedCache();
    }

    /**
     * Preload a specific model for faster first inference
     */
    public async PreloadModel(modelName: string): Promise<void> {
        const host = EmbeddingWorkerHost.Instance;
        if (host.IsAvailable) {
            await host.Run({ Kind: 'preload', Model: modelName, Settings: CurrentEmbeddingSettings() });
        } else {
            await PreloadEmbeddingModel(modelName);
        }
    }

    /** @deprecated Use {@link PreloadModel}. */
    public async preloadModel(modelName: string): Promise<void> {
        return this.PreloadModel(modelName);
    }
}
