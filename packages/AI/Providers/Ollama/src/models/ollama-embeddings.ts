import { BaseEmbeddings, EmbedTextParams, EmbedTextResult, EmbedTextsParams, EmbedTextsResult, ModelUsage } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { Ollama, EmbeddingsRequest, EmbeddingsResponse } from 'ollama';

/**
 * Ollama implementation of the BaseEmbeddings class for local embedding generation
 * Supports various embedding models like nomic-embed-text, mxbai-embed-large, etc.
 */
@RegisterClass(BaseEmbeddings, "OllamaEmbedding")
export class OllamaEmbedding extends BaseEmbeddings {
    private _client: Ollama;
    private _baseUrl: string = 'http://localhost:11434';
    private _keepAlive: string | number = '5m'; // Default keep model loaded for 5 minutes
    
    constructor(apiKey?: string) {
        super(apiKey || ''); // Ollama doesn't require API key for local usage
        this._client = new Ollama({ host: this._baseUrl });
    }

    /**
     * Read only getter method to get the Ollama client instance
     */
    public get OllamaClient(): Ollama {
        return this._client;
    }

    /**
     * Read only getter method to get the Ollama client instance
     */
    public get client(): Ollama {
        return this.OllamaClient;
    }

    /**
     * Override SetAdditionalSettings to handle Ollama specific settings
     */
    public override SetAdditionalSettings(settings: Record<string, any>): void {
        super.SetAdditionalSettings(settings);
        
        // Handle Ollama-specific settings
        if (settings.baseUrl || settings.host) {
            this._baseUrl = settings.baseUrl || settings.host;
            this._client = new Ollama({ host: this._baseUrl });
        }
        
        if (settings.keepAlive !== undefined) {
            this._keepAlive = settings.keepAlive;
        }
    }

    /**
     * Embed a single text string using Ollama
     */
    public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
        if (!params.model) {
            throw new Error('Model name is required for Ollama embedding provider');
        }

        const startTime = new Date();

        try {
            // Ensure the model is available
            await this.ensureModelAvailable(params.model);

            // Create embeddings request
            const embeddingsRequest: EmbeddingsRequest = {
                model: params.model,
                prompt: params.text,
                keep_alive: this._keepAlive
            };

            // Additional options can be passed through additionalParams if needed
            if ((params as any).additionalParams) {
                Object.assign(embeddingsRequest, (params as any).additionalParams);
            }

            // Make the embeddings request
            const response: EmbeddingsResponse = await this.client.embeddings(embeddingsRequest);
            
            const endTime = new Date();

            // Return the embedding result
            const result: EmbedTextResult = {
                object: 'object',
                model: params.model,
                ModelUsage: new ModelUsage(
                    (response as any).prompt_eval_count || 0,
                    0
                ),
                vector: response.embedding
            };
            
            return result;

        } catch (error) {
            const endTime = new Date();
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            // On error, return a minimal valid result structure
            // The BaseEmbeddings class expects a specific format
            throw error;
        }
    }

    /**
     * Embed multiple texts in batch using Ollama
     * Note: Ollama doesn't have native batch support, so we process sequentially
     * For better performance, consider running multiple Ollama instances or using async processing
     */
    public async EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult> {
        if (!params.model) {
            throw new Error('Model name is required for Ollama embedding provider');
        }

        const startTime = new Date();
        const embeddings: number[][] = [];
        let totalPromptTokens = 0;

        try {
            // Ensure the model is available
            await this.ensureModelAvailable(params.model);

            // Process each text sequentially
            // Note: Ollama doesn't support true batch processing, but we can optimize by keeping the model loaded
            for (const text of params.texts) {
                const embeddingsRequest: EmbeddingsRequest = {
                    model: params.model,
                    prompt: text,
                    keep_alive: this._keepAlive
                };

                // Additional options can be passed through additionalParams if needed
                if ((params as any).additionalParams) {
                    Object.assign(embeddingsRequest, (params as any).additionalParams);
                }

                const response: EmbeddingsResponse = await this.client.embeddings(embeddingsRequest);
                embeddings.push(response.embedding);
                totalPromptTokens += (response as any).prompt_eval_count || 0;
            }

            const endTime = new Date();

            // Return the batch embedding result
            const result: EmbedTextsResult = {
                object: 'list',
                model: params.model,
                ModelUsage: new ModelUsage(totalPromptTokens, 0),
                vectors: embeddings
            };
            
            return result;

        } catch (error) {
            const endTime = new Date();
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            // On error, throw to let caller handle
            throw error;
        }
    }

    /**
     * Ensure a model is available locally, pulling it if necessary
     */
    private async ensureModelAvailable(modelName: string): Promise<void> {
        try {
            // Check if model is available
            const models = await this.client.list();
            const isAvailable = models.models.some((m: any) => 
                m.name === modelName || m.name.startsWith(modelName + ':')
            );

            if (!isAvailable) {
                console.log(`Model ${modelName} not found locally. Attempting to pull...`);
                await this.client.pull({ model: modelName, stream: false });
                console.log(`Model ${modelName} pulled successfully.`);
            }
        } catch (error) {
            // If we can't check or pull, continue anyway - the embeddings call will fail with a clear error
            console.warn(`Could not verify model availability: ${error}`);
        }
    }

    /**
     * Get available embedding models
     * Required by BaseEmbeddings abstract class
     */
    public async GetEmbeddingModels(): Promise<any> {
        try {
            const models = await this.client.list();
            // Filter for common embedding models
            const embeddingKeywords = ['embed', 'e5', 'bge', 'gte', 'nomic', 'mxbai', 'all-minilm'];
            
            const embeddingModels = models.models
                .filter((m: any) => 
                    embeddingKeywords.some(keyword => m.name.toLowerCase().includes(keyword))
                )
                .map((m: any) => ({
                    name: m.name,
                    size: m.size,
                    modified: m.modified_at
                }));
            
            return embeddingModels;
        } catch (error) {
            console.error('Failed to get embedding models:', error);
            return [];
        }
    }

    /**
     * List available embedding models in Ollama
     */
    public async listEmbeddingModels(): Promise<string[]> {
        try {
            const models = await this.client.list();
            // Filter for common embedding models (this is a heuristic as Ollama doesn't strictly categorize)
            const embeddingKeywords = ['embed', 'e5', 'bge', 'gte', 'nomic', 'mxbai', 'all-minilm'];
            
            return models.models
                .map((m: any) => m.name)
                .filter((name: string) => 
                    embeddingKeywords.some(keyword => name.toLowerCase().includes(keyword))
                );
        } catch (error) {
            console.error('Failed to list embedding models:', error);
            return [];
        }
    }

    /**
     * Get information about a specific embedding model
     */
    public async getModelInfo(modelName: string): Promise<any> {
        try {
            const response = await this.client.show({ model: modelName });
            return response;
        } catch (error) {
            console.error(`Failed to get info for model ${modelName}:`, error);
            return null;
        }
    }

    /**
     * Get the dimension size for a specific embedding model
     * This is useful for setting up vector databases
     */
    public async getEmbeddingDimension(modelName: string): Promise<number | null> {
        try {
            // Generate a sample embedding to get dimensions
            const response = await this.client.embeddings({
                model: modelName,
                prompt: "test",
                keep_alive: 0 // Don't keep model loaded for this test
            });
            
            return response.embedding.length;
        } catch (error) {
            console.error(`Failed to get embedding dimension for ${modelName}:`, error);
            return null;
        }
    }
}