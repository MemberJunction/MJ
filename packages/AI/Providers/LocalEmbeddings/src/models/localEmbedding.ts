import { EmbedTextParams, EmbedTextsParams, EmbedTextResult, EmbedTextsResult, BaseEmbeddings, ModelUsage, ErrorAnalyzer } from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";
import {
    ApplyEmbeddingSettings,
    ClearEmbeddingPipelines,
    CurrentEmbeddingSettings,
    EmbedTextsWithModel,
    PreloadEmbeddingModel
} from "./embeddingRuntime";
import { EmbeddingWorkerHost } from "../worker/EmbeddingWorkerHost";

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

    /**
     * Embeds texts on the embedding worker thread when one is available, otherwise in-process.
     * Inference blocks the thread it runs on, so running it here would stall every request on
     * the process for the length of the batch (MJ #5510).
     */
    private async embedVectors(modelName: string, texts: string[]): Promise<number[][]> {
        const host = EmbeddingWorkerHost.Instance;
        const vectors = host.IsAvailable
            ? await host.Run({ Kind: 'embed', Model: modelName, Texts: texts, Settings: CurrentEmbeddingSettings() })
            : await EmbedTextsWithModel(modelName, texts);
        return vectors.map(vector => Array.from(vector));
    }

    /**
     * Embed a single text string
     */
    public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
        if (!params.model) {
            throw new Error('Model name is required for LocalEmbedding provider');
        }
        const modelName = params.model;
        const startTime = Date.now();

        try {
            const [embedding] = await this.embedVectors(modelName, [params.text]);
            
            // Calculate approximate token count (rough estimation)
            const tokenCount = Math.ceil(params.text.length / 4);
            
            const endTime = Date.now();
            // Only log if it took more than 1 second (indicating potential performance issues)
            if (endTime - startTime > 1000) {
                console.log(`Embedded text in ${endTime - startTime}ms using ${modelName}`);
            }

            return {
                object: 'object',
                model: modelName,
                ModelUsage: new ModelUsage(tokenCount, 0),
                vector: embedding
            };
        } catch (error) {
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
        if (!params.model) {
            throw new Error('Model name is required for LocalEmbedding provider');
        }
        const modelName = params.model;
        const startTime = Date.now();

        try {
            const vectors = await this.embedVectors(modelName, params.texts);
            // Estimate token count
            const totalTokens = params.texts.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0);
            
            const endTime = Date.now();
            // Only log if it took more than 1 second per text on average
            if ((endTime - startTime) / params.texts.length > 1000) {
                console.log(`Embedded ${params.texts.length} texts in ${endTime - startTime}ms using ${modelName}`);
            }

            return {
                object: 'list',
                model: modelName,
                ModelUsage: new ModelUsage(totalTokens, 0),
                vectors
            };
        } catch (error) {
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
    public async GetEmbeddingModels(): Promise<any> {
        // This method is typically not called directly when using MemberJunction
        // as the models are configured in the database
        return [];
    }

    /**
     * Override SetAdditionalSettings to handle local embedding specific settings
     */
    public override SetAdditionalSettings(settings: Record<string, any>): void {
        super.SetAdditionalSettings(settings);
        
        // Applied to transformers.js here, and sent with each request to the worker thread
        ApplyEmbeddingSettings({ CacheDir: settings.cacheDir, LocalURL: settings.localURL });
        
        // Handle quantized model preference
        if (settings.useQuantized !== undefined) {
            // Store for use when loading models
            this._additionalSettings.useQuantized = settings.useQuantized;
        }
    }

    /**
     * Clear loaded pipelines to free memory
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

    /** Drops the models loaded in this thread and, if one is running, in the embedding worker. */
    private static clearLoadedModels(): void {
        ClearEmbeddingPipelines();
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