import { BaseEmbeddings, Embeddings, EmbedTextParams, EmbedTextResult, EmbedTextsParams, EmbedTextsResult, BaseResult, ErrorAnalyzer } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import { DefaultAzureCredential } from "@azure/identity";

/**
 * Implementation of Azure AI Embedding Model
 * @class AzureEmbedding
 * @extends BaseEmbeddings
 */
@RegisterClass(BaseEmbeddings, "AzureEmbedding")
export class AzureEmbedding extends BaseEmbeddings {
    private _client: ReturnType<typeof ModelClient> | null = null;
    
    /**
     * Create a new AzureEmbedding instance with an API key
     * @param apiKey API key string
     */
    constructor(apiKey: string) {
        super(apiKey);
        // Client initialization is deferred until SetAdditionalSettings is called
    }
    
    /**
     * Set additional provider-specific settings
     * @param settings Azure-specific settings
     */
    public override SetAdditionalSettings(settings: Record<string, any>): void {
        // Call the base class implementation to store settings
        super.SetAdditionalSettings(settings);
        
        // Validate required settings
        if (!this.AdditionalSettings.endpoint) {
            throw new Error('Azure AI requires an endpoint URL in AdditionalSettings');
        }
        
        // Initialize client with settings
        if (this.AdditionalSettings.useAzureAD) {
            this._client = ModelClient(
                this.AdditionalSettings.endpoint,
                new DefaultAzureCredential()
            );
        } else {
            this._client = ModelClient(
                this.AdditionalSettings.endpoint,
                new AzureKeyCredential(this.apiKey)
            );
        }
    }
    
    /**
     * Clear all additional settings and reset the client
     */
    public override ClearAdditionalSettings(): void {
        super.ClearAdditionalSettings();
        this._client = null;
    }
    
    /**
     * Get the Azure AI client, initializing if necessary
     */
    protected get Client(): ReturnType<typeof ModelClient> {
        if (!this._client) {
            throw new Error('Azure client not initialized. Call SetAdditionalSettings with an endpoint first.');
        }
        return this._client;
    }
    
    /**
     * Get the Azure endpoint URL from additional settings
     */
    public get Endpoint(): string {
        if (!this.AdditionalSettings.endpoint) {
            throw new Error('Azure endpoint URL not set. Call SetAdditionalSettings first.');
        }
        return this.AdditionalSettings.endpoint;
    }
    
    /**
     * Create embeddings for a single text using Azure AI
     * @param params Embedding parameters
     * @returns Embedding result
     */
    public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
        // Ensure client is initialized
        if (!this._client) {
            throw new Error('Azure client not initialized. Call SetAdditionalSettings with an endpoint first.');
        }
        
        const startTime = new Date();
        
        try {
            // Call Azure AI embeddings API
            const response = await this.Client.path("/embeddings").post({
                body: {
                    input: [params.text], // API requires array
                    model: params.model || "text-embedding-ada-002", // Default model
                    dimensions: 1536 // Default dimensions
                }
            });
            
            if (!response.body) {
                throw new Error('No response body received from Azure AI');
            }
            
            const responseBody = response.body as any;
            const endTime = new Date();
            
            // Check for errors in the response
            if (!responseBody.data || !Array.isArray(responseBody.data) || responseBody.data.length === 0) {
                throw new Error('Invalid embedding response format');
            }
            
            // Extract embedding from response
            const embedding = responseBody.data[0].embedding;
            
            // Return embedding result
            const result: EmbedTextResult = {
                object: 'object',
                model: responseBody.model || params.model || "unknown",
                vector: embedding,
                ModelUsage: {
                    promptTokens: responseBody.usage?.prompt_tokens || 0,
                    completionTokens: 0,
                    get totalTokens() { return this.promptTokens + this.completionTokens; }
                }
            };
            
            return result;
        } catch (error) {
            const endTime = new Date();
            
            // Log error details for debugging
            const errorInfo = ErrorAnalyzer.analyzeError(error, 'Azure');
            console.error('Azure embedding error:', errorInfo);
            
            // Return error result
            const result: EmbedTextResult = {
                object: 'object',
                model: params.model || "unknown",
                vector: [],
                ModelUsage: {
                    promptTokens: 0,
                    completionTokens: 0,
                    get totalTokens() { return this.promptTokens + this.completionTokens; }
                }
            };
            
            return result;
        }
    }
    
    /**
     * Create embeddings for multiple texts using Azure AI
     * @param params Embedding parameters
     * @returns Embedding result
     */
    public async EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult> {
        // Ensure client is initialized
        if (!this._client) {
            throw new Error('Azure client not initialized. Call SetAdditionalSettings with an endpoint first.');
        }
        
        const startTime = new Date();
        
        try {
            // Ensure we have text input
            if (!params.texts || params.texts.length === 0) {
                throw new Error('Input texts are required for embedding');
            }
            
            // Call Azure AI embeddings API
            const response = await this.Client.path("/embeddings").post({
                body: {
                    input: params.texts,
                    model: params.model || "text-embedding-ada-002", // Default model
                    dimensions: 1536 // Default dimensions
                }
            });
            
            if (!response.body) {
                throw new Error('No response body received from Azure AI');
            }
            
            const responseBody = response.body as any;
            const endTime = new Date();
            
            // Check for errors in the response
            if (!responseBody.data || !Array.isArray(responseBody.data)) {
                throw new Error('Invalid embedding response format');
            }
            
            // Extract embeddings from response
            const embeddings = responseBody.data.map((item: any) => item.embedding);
            
            // Return embedding result
            const result: EmbedTextsResult = {
                object: 'list',
                model: responseBody.model || params.model || "unknown",
                vectors: embeddings,
                ModelUsage: {
                    promptTokens: responseBody.usage?.prompt_tokens || 0,
                    completionTokens: 0,
                    get totalTokens() { return this.promptTokens + this.completionTokens; }
                }
            };
            
            return result;
        } catch (error) {
            const endTime = new Date();
            
            // Log error details for debugging
            const errorInfo = ErrorAnalyzer.analyzeError(error, 'Azure');
            console.error('Azure embedding error:', errorInfo);
            
            // Return error result
            const result: EmbedTextsResult = {
                object: 'list',
                model: params.model || "unknown",
                vectors: [],
                ModelUsage: {
                    promptTokens: 0,
                    completionTokens: 0,
                    get totalTokens() { return this.promptTokens + this.completionTokens; }
                }
            };
            
            return result;
        }
    }
    
    /**
     * Get available embedding models
     * @returns List of available embedding models
     */
    public async GetEmbeddingModels(): Promise<any> {
        return [
            {
                id: "text-embedding-ada-002",
                name: "Azure Embedding - text-embedding-ada-002",
                contextLength: 8191,
                dimensions: 1536
            }
        ];
    }
}

