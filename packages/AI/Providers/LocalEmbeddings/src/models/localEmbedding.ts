import { EmbedTextParams, EmbedTextsParams, EmbedTextResult, EmbedTextsResult, BaseEmbeddings, ModelUsage, ErrorAnalyzer } from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";

// Dynamic import for ESM-only package
// TypeScript types for @xenova/transformers (since we can't import them directly)
interface TransformersEnv {
    allowLocalModels: boolean;
    cacheDir: string;
    localURL?: string;
}

interface TransformersModule {
    pipeline: (task: string, model: string, options?: Record<string, unknown>) => Promise<unknown>;
    env: TransformersEnv;
}

let pipeline: TransformersModule['pipeline'] | null = null;
let env: TransformersEnv | null = null;
let transformersLoaded = false;
let pendingSettings: Record<string, unknown> = {};

async function loadTransformers(): Promise<void> {
    if (!transformersLoaded) {
        // Use dynamic import to load ESM module in CommonJS context
        // This approach is cleaner than Function constructor and TypeScript-friendly
        const transformers = await (eval('import("@xenova/transformers")') as Promise<TransformersModule>);
        pipeline = transformers.pipeline;
        env = transformers.env;
        
        // Configure Transformers.js settings
        env.allowLocalModels = true;
        // Note: localURL might not be available in all versions of transformers.js
        if ('localURL' in env) {
            env.localURL = process.env.TRANSFORMERS_LOCAL_URL || '';
        }
        env.cacheDir = process.env.TRANSFORMERS_CACHE_DIR || './.cache/transformers';
        
        // Apply any pending settings that were set before transformers was loaded
        if (pendingSettings.cacheDir) {
            env.cacheDir = pendingSettings.cacheDir as string;
        }
        if (pendingSettings.localURL && 'localURL' in env) {
            env.localURL = pendingSettings.localURL as string;
        }
        
        transformersLoaded = true;
    }
}

@RegisterClass(BaseEmbeddings, 'LocalEmbedding')
export class LocalEmbedding extends BaseEmbeddings {
    private static pipelines: Map<string, any> = new Map();
    private static loadingPromises: Map<string, Promise<any>> = new Map();

    constructor(apiKey?: string) {
        // Local embeddings don't require an API key
        super(apiKey || 'local');
    }

    /**
     * Get or create a pipeline for the specified model
     */
    private async getPipeline(modelName: string): Promise<any> {
        // Ensure transformers is loaded
        await loadTransformers();
        // Check if pipeline already exists
        if (LocalEmbedding.pipelines.has(modelName)) {
            return LocalEmbedding.pipelines.get(modelName)!;
        }

        // Check if pipeline is currently being loaded
        if (LocalEmbedding.loadingPromises.has(modelName)) {
            return LocalEmbedding.loadingPromises.get(modelName)!;
        }

        // Create loading promise
        // The modelName should be the Hugging Face model ID (e.g., 'Xenova/all-MiniLM-L6-v2')
        const loadingPromise = this.loadPipeline(modelName);
        LocalEmbedding.loadingPromises.set(modelName, loadingPromise);

        try {
            const pipeline = await loadingPromise;
            LocalEmbedding.pipelines.set(modelName, pipeline);
            LocalEmbedding.loadingPromises.delete(modelName);
            return pipeline;
        } catch (error) {
            LocalEmbedding.loadingPromises.delete(modelName);
            throw error;
        }
    }

    /**
     * Load a pipeline for the specified model
     */
    private async loadPipeline(modelId: string): Promise<unknown> {
        try {
            if (!pipeline) {
                throw new Error('Transformers module not loaded');
            }
            // Create feature extraction pipeline
            const pipe = await pipeline('feature-extraction', modelId, {
                quantized: true, // Use quantized models for better performance
            });
            
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
            // Only log if it took more than 1 second per text on average
            if ((endTime - startTime) / params.texts.length > 1000) {
                console.log(`Embedded ${params.texts.length} texts in ${endTime - startTime}ms using ${modelName}`);
            }

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
        
        // Store settings in pendingSettings to be applied when transformers loads
        if (settings.cacheDir) {
            pendingSettings.cacheDir = settings.cacheDir;
        }
        if (settings.localURL) {
            pendingSettings.localURL = settings.localURL;
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
        LocalEmbedding.pipelines.clear();
        LocalEmbedding.loadingPromises.clear();
        console.log('Cleared local embedding model cache');
    }
    
    /**
     * Static method to clear the shared cache
     */
    public static clearSharedCache(): void {
        LocalEmbedding.pipelines.clear();
        LocalEmbedding.loadingPromises.clear();
        console.log('Cleared shared local embedding model cache');
    }

    /**
     * Preload a specific model for faster first inference
     */
    public async preloadModel(modelName: string): Promise<void> {
        await this.getPipeline(modelName);
    }
}