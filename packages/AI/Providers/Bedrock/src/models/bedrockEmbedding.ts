import { 
  EmbedTextParams, 
  EmbedTextsParams, 
  BaseEmbeddings, 
  ModelUsage, 
  EmbedTextResult, 
  EmbedTextsResult,
  EmbeddingModelInfo,
  ErrorAnalyzer 
} from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";
import { 
  BedrockRuntimeClient, 
  InvokeModelCommand 
} from '@aws-sdk/client-bedrock-runtime';

/** The model the driver calls when it's given no model name. */
const DEFAULT_MODEL = 'amazon.titan-embed-text-v1';

/**
 * The Titan text models' widths. The Cohere models aren't listed: the driver doesn't send them
 * `dimensions`, so a requested width is passed through as before.
 */
const BEDROCK_EMBEDDING_MODELS: readonly EmbeddingModelInfo[] = [
  {
    Model: 'amazon.titan-embed-text-v1',
    Description: 'Amazon Titan Embed Text V1',
    OutputDimension: 1536,
    AcceptsDimensions: false,
  },
  {
    Model: 'amazon.titan-embed-text-v2:0',
    Description: 'Amazon Titan Embed Text V2',
    OutputDimension: 1024,
    AcceptsDimensions: true,
    SupportedDimensions: [256, 512, 1024],
  },
];

@RegisterClass(BaseEmbeddings, 'BedrockEmbedding')
export class BedrockEmbedding extends BaseEmbeddings {
  private _client: BedrockRuntimeClient;
  private _region: string;

  constructor(apiKey: string, region: string = 'us-east-1') {
    super(apiKey);
    this._region = region;
    
    // Initialize AWS Bedrock client
    this._client = new BedrockRuntimeClient({
      region: this._region,
      credentials: {
        accessKeyId: apiKey.split(':')[0],
        secretAccessKey: apiKey.split(':')[1]
      }
    });
  }

  public get Client(): BedrockRuntimeClient {
    return this._client;
  }

  protected override get EmbeddingModels(): readonly EmbeddingModelInfo[] {
    return BEDROCK_EMBEDDING_MODELS;
  }

  /**
   * Embeds a single text using Amazon Bedrock embedding models
   */
  public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
    // The modelId should be specified in the model parameter, e.g., "amazon.titan-embed-text-v1"
    const modelId = params.model || DEFAULT_MODEL;
    // Outside the try: a width the model can't produce throws before any API call.
    const dimensionsParam = this.DimensionsParam(modelId, params.dimensions);
    try {
      
      // Create request body - differs based on the provider's embedding model
      let requestBody: any;
      
      if (modelId.startsWith('amazon.titan-embed')) {
        requestBody = {
          inputText: params.text,
          ...dimensionsParam
        };
      } else if (modelId.startsWith('cohere.embed')) {
        requestBody = { texts: [params.text], input_type: "search_document" };
      } else {
        throw new Error(`Unsupported embedding model provider for Bedrock: ${modelId}`);
      }
      
      // Invoke the model
      const command = new InvokeModelCommand({
        modelId: modelId,
        body: JSON.stringify(requestBody),
        contentType: 'application/json',
        accept: 'application/json'
      });
      
      const response = await this._client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      // Parse response body based on the model provider
      let embedding: number[] = [];
      let tokensUsed = 0;
      
      if (modelId.startsWith('amazon.titan-embed')) {
        embedding = responseBody.embedding;
        tokensUsed = responseBody.inputTextTokenCount || 0;
      } else if (modelId.startsWith('cohere.embed')) {
        embedding = responseBody.embeddings[0];
        tokensUsed = responseBody.tokens || 0;
      }
      
      return {
        object: "object" as "object" | "list",
        model: modelId,
        ModelUsage: new ModelUsage(tokensUsed, 0),
        vector: embedding
      };
    } catch (error) {
      // Log error details for debugging
      const errorInfo = ErrorAnalyzer.analyzeError(error, 'Bedrock');
      console.error('Bedrock embedding error:', errorInfo);
      
      // Return error result
      return {
        object: "object" as "object" | "list",
        model: modelId,
        ModelUsage: new ModelUsage(0, 0),
        vector: []
      };
    }
  }

  /**
   * Embeds multiple texts using Amazon Bedrock embedding models
   */
  public async EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult> {
    // The modelId should be specified in the model parameter, e.g., "amazon.titan-embed-text-v1"
    const modelId = params.model || DEFAULT_MODEL;
    // Checked once, outside the try, so a width the model can't produce throws before the first call
    // instead of being degraded to an empty result.
    this.DimensionsParam(modelId, params.dimensions);
    try {
      
      // Some embedding models may support batch processing, others may not
      // For those that don't, we'll process texts one by one
      
      if (modelId.startsWith('cohere.embed')) {
        // Cohere supports batch embedding
        const requestBody = { 
          texts: params.texts, 
          input_type: "search_document" 
        };
        
        // Invoke the model
        const command = new InvokeModelCommand({
          modelId: modelId,
          body: JSON.stringify(requestBody),
          contentType: 'application/json',
          accept: 'application/json'
        });
        
        const response = await this._client.send(command);
        const responseBody = JSON.parse(new TextDecoder().decode(response.body));
        
        return {
          object: "list",
          model: modelId,
          ModelUsage: new ModelUsage(responseBody.tokens || 0, 0),
          vectors: responseBody.embeddings
        };
      } else {
        // For models that don't support batch embedding, process one by one
        // and collect the results
        const embeddings: number[][] = [];
        let totalTokens = 0;
        
        for (const text of params.texts) {
          const result = await this.EmbedText({
            text: text,
            model: modelId,
            dimensions: params.dimensions
          });
          
          embeddings.push(result.vector);
          totalTokens += result.ModelUsage.promptTokens;
        }
        
        return {
          object: "list",
          model: modelId,
          ModelUsage: new ModelUsage(totalTokens, 0),
          vectors: embeddings
        };
      }
    } catch (error) {
      // Log error details for debugging
      const errorInfo = ErrorAnalyzer.analyzeError(error, 'Bedrock');
      console.error('Bedrock embedding error:', errorInfo);
      
      // Return error result
      return {
        object: "list",
        model: modelId,
        ModelUsage: new ModelUsage(0, 0),
        vectors: []
      };
    }
  }

  /**
   * Get available embedding models from Bedrock
   */
  public async GetEmbeddingModels(): Promise<any> {
    try {
      // In practice, you would list models from Bedrock and filter for embedding models
      // This is a simplified implementation
      return [
        "amazon.titan-embed-text-v1",
        "amazon.titan-embed-image-v1",
        "cohere.embed-english-v3",
        "cohere.embed-multilingual-v3"
      ];
    } catch (error) {
      console.error('Error listing Bedrock embedding models:', ErrorAnalyzer.analyzeError(error, 'Bedrock'));
      return [];
    }
  }
}