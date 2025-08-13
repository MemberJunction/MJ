import { EmbedTextParams, EmbedTextsParams, EmbedTextResult, EmbedTextsResult, BaseEmbeddings, ModelUsage, ErrorAnalyzer } from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";
import { pipeline, env } from '@xenova/transformers';

// Configure Transformers.js settings
env.allowLocalModels = true;
// Note: localURL might not be available in all versions of transformers.js
if ('localURL' in env) {
    (env as any).localURL = process.env.TRANSFORMERS_LOCAL_URL || '';
}
env.cacheDir = process.env.TRANSFORMERS_CACHE_DIR || './.cache/transformers';

@RegisterClass(BaseEmbeddings, 'LocalEmbedding')
export class LocalEmbedding extends BaseEmbeddings {
    private pipelines: Map<string, any> = new Map();
    private loadingPromises: Map<string, Promise<any>> = new Map();

    constructor(apiKey?: string) {
        // Local embeddings don't require an API key
        super(apiKey || 'local');
    }

    /**
     * Get or create a pipeline for the specified model
     */
    private async getPipeline(modelName: string): Promise<any> {
        // Check if pipeline already exists
        if (this.pipelines.has(modelName)) {
            return this.pipelines.get(modelName)!;
        }

        // Check if pipeline is currently being loaded
        if (this.loadingPromises.has(modelName)) {
            return this.loadingPromises.get(modelName)!;
        }

        // Create loading promise
        // The modelName should be the Hugging Face model ID (e.g., 'Xenova/all-MiniLM-L6-v2')
        const loadingPromise = this.loadPipeline(modelName);
        this.loadingPromises.set(modelName, loadingPromise);

        try {
            const pipeline = await loadingPromise;
            this.pipelines.set(modelName, pipeline);
            this.loadingPromises.delete(modelName);
            return pipeline;
        } catch (error) {
            this.loadingPromises.delete(modelName);
            throw error;
        }
    }

    /**
     * Load a pipeline for the specified model
     */
    private async loadPipeline(modelId: string): Promise<any> {
        console.log(`Loading local embedding model: ${modelId}`);
        
        try {
            // Create feature extraction pipeline
            const pipe = await pipeline('feature-extraction', modelId, {
                quantized: true, // Use quantized models for better performance
            });
            
            console.log(`Successfully loaded model: ${modelId}`);
            return pipe;
        } catch (error) {
            const errorInfo = ErrorAnalyzer.analyzeError(error, 'LocalEmbedding');
            console.error(`Failed to load model ${modelId}:`, errorInfo);
            const errorMessage = typeof errorInfo === 'string' ? errorInfo : (errorInfo as any).message || 'Unknown error';
            throw new Error(`Failed to load local embedding model ${modelId}: ${errorMessage}`);
        }
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
            // Get or load the pipeline
            const pipe = await this.getPipeline(modelName);
            
            // Generate embeddings
            const output = await pipe(params.text, {
                pooling: 'mean',
                normalize: true
            });
            
            // Convert tensor to array
            const embedding = Array.from(output.data as Float32Array);
            
            // Calculate approximate token count (rough estimation)
            const tokenCount = Math.ceil(params.text.length / 4);
            
            const endTime = Date.now();
            console.log(`Embedded text in ${endTime - startTime}ms using ${modelName}`);

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
            // Get or load the pipeline
            const pipe = await this.getPipeline(modelName);
            
            // Process texts in batches for efficiency
            const batchSize = 32;
            const vectors: number[][] = [];
            let totalTokens = 0;
            
            for (let i = 0; i < params.texts.length; i += batchSize) {
                const batch = params.texts.slice(i, i + batchSize);
                
                // Generate embeddings for batch
                const outputs = await Promise.all(
                    batch.map(text => pipe(text, {
                        pooling: 'mean',
                        normalize: true
                    }))
                );
                
                // Convert tensors to arrays
                for (const output of outputs) {
                    const embedding = Array.from(output.data as Float32Array);
                    vectors.push(embedding);
                }
                
                // Estimate token count
                totalTokens += batch.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0);
            }
            
            const endTime = Date.now();
            console.log(`Embedded ${params.texts.length} texts in ${endTime - startTime}ms using ${modelName}`);

            return {
                object: 'list',
                model: modelName,
                ModelUsage: new ModelUsage(totalTokens, 0),
                vectors: vectors
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
        
        // Handle cache directory setting
        if (settings.cacheDir) {
            env.cacheDir = settings.cacheDir;
        }
        
        // Handle local model URL
        if (settings.localURL && 'localURL' in env) {
            (env as any).localURL = settings.localURL;
        }
        
        // Handle quantized model preference
        if (settings.useQuantized !== undefined) {
            // Store for use when loading models
            this._additionalSettings.useQuantized = settings.useQuantized;
        }
    }

    /**
     * Clear loaded pipelines to free memory
     */
    public clearCache(): void {
        this.pipelines.clear();
        this.loadingPromises.clear();
        console.log('Cleared local embedding model cache');
    }

    /**
     * Preload a specific model for faster first inference
     */
    public async preloadModel(modelName: string): Promise<void> {
        await this.getPipeline(modelName);
    }
}

export function LoadLocalEmbedding() {
    // This function prevents the class from being removed by tree shaking
}