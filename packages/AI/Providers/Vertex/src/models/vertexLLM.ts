import { 
  BaseLLM, 
  ChatParams, 
  ChatResult, 
  ChatResultChoice, 
  ChatMessageRole, 
  ClassifyParams, 
  ClassifyResult, 
  SummarizeParams, 
  SummarizeResult, 
  ModelUsage, 
  ChatMessage 
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { VertexAI } from '@google-cloud/vertexai';

@RegisterClass(BaseLLM, "VertexLLM")
export class VertexLLM extends BaseLLM {
  private _client: VertexAI;
  private _projectId: string;
  private _location: string;

  constructor(apiKey: string, projectId: string, location: string = 'us-central1') {
    super(apiKey);
    this._projectId = projectId;
    this._location = location;
    
    // Initialize Google Vertex AI client
    this._client = new VertexAI({
      project: this._projectId,
      location: this._location,
      apiEndpoint: `${this._location}-aiplatform.googleapis.com`,
      googleAuthOptions: {
        keyFile: apiKey // assumes apiKey is a path to a service account key file
      }
    });
  }

  public get Client(): VertexAI {
    return this._client;
  }

  /**
   * Google Vertex AI supports streaming
   */
  public override get SupportsStreaming(): boolean {
    return true;
  }

  /**
   * Implementation of non-streaming chat completion for Google Vertex AI
   */
  protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
    const startTime = new Date();
    
    try {
      // Map provider-agnostic params to Vertex-specific format
      const vertexParams = this.mapToVertexParams(params);
      
      // The model ID should be in the format like "gemini-pro", "text-bison", etc.
      const modelName = params.model;
      
      // Get the appropriate service for the model
      const generativeModel = this.getGenerativeModelForModel(modelName);
      
      // Prepare request parameters
      const requestParams = {
        model: modelName,
        temperature: vertexParams.temperature,
        maxOutputTokens: vertexParams.maxOutputTokens,
        topP: vertexParams.topP,
        topK: vertexParams.topK,
        safetySettings: vertexParams.safetySettings
      };
      
      // Send the request
      const response = await generativeModel.generateContent({
        contents: this.mapToVertexContents(vertexParams.messages),
        generationConfig: requestParams
      });
      
      const result = response.response;
      
      // Extract the response content
      let content = '';
      if (result.candidates && result.candidates.length > 0) {
        const candidate = result.candidates[0];
        if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
          content = candidate.content.parts.map(part => {
            if (typeof part === 'string') {
              return part;
            } else if (part.text) {
              return part.text;
            }
            return '';
          }).join('');
        }
      }
      
      // Extract usage information
      const tokenUsage = {
        promptTokens: result.usageMetadata?.promptTokenCount || 0,
        completionTokens: result.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: (result.usageMetadata?.promptTokenCount || 0) + (result.usageMetadata?.candidatesTokenCount || 0)
      };
      
      const endTime = new Date();
      
      // Create the ChatResult
      const choices: ChatResultChoice[] = [{
        message: {
          role: ChatMessageRole.assistant,
          content: content
        },
        finish_reason: result.candidates?.[0]?.finishReason || 'stop',
        index: 0
      }];
      
      return {
        success: true,
        statusText: "OK",
        startTime: startTime,
        endTime: endTime,
        timeElapsed: endTime.getTime() - startTime.getTime(),
        data: {
          choices: choices,
          usage: new ModelUsage(tokenUsage.promptTokens, tokenUsage.completionTokens)
        },
        errorMessage: "",
        exception: null,
      };
    } catch (error) {
      const endTime = new Date();
      return {
        success: false,
        statusText: "Error",
        startTime: startTime,
        endTime: endTime,
        timeElapsed: endTime.getTime() - startTime.getTime(),
        data: {
          choices: [],
          usage: new ModelUsage(0, 0)
        },
        errorMessage: error.message || "Error calling Google Vertex AI",
        exception: error,
      };
    }
  }
  
  /**
   * Create a streaming request for Vertex AI
   */
  protected async createStreamingRequest(params: ChatParams): Promise<any> {
    // Map provider-agnostic params to Vertex-specific format
    const vertexParams = this.mapToVertexParams(params);
    
    // The model ID should be in the format like "gemini-pro", "text-bison", etc.
    const modelName = params.model;
    
    // Get the appropriate service for the model
    const generativeModel = this.getGenerativeModelForModel(modelName);
    
    // Prepare request parameters
    const requestParams = {
      model: modelName,
      temperature: vertexParams.temperature,
      maxOutputTokens: vertexParams.maxOutputTokens,
      topP: vertexParams.topP,
      topK: vertexParams.topK,
      safetySettings: vertexParams.safetySettings
    };
    
    // Send the streaming request
    return generativeModel.generateContentStream({
      contents: this.mapToVertexContents(vertexParams.messages),
      generationConfig: requestParams
    });
  }
  
  /**
   * Process a streaming chunk from Vertex AI
   */
  protected processStreamingChunk(chunk: any): {
    content: string;
    finishReason?: string;
    usage?: any;
  } {
    let content = '';
    let finishReason = null;
    let usage = null;
    
    if (chunk && chunk.candidates && chunk.candidates.length > 0) {
      const candidate = chunk.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        content = candidate.content.parts.map(part => {
          if (typeof part === 'string') {
            return part;
          } else if (part.text) {
            return part.text;
          }
          return '';
        }).join('');
      }
      
      finishReason = candidate.finishReason || null;
    }
    
    // Save usage information if available
    if (chunk && chunk.usageMetadata) {
      usage = new ModelUsage(
        chunk.usageMetadata.promptTokenCount || 0,
        chunk.usageMetadata.candidatesTokenCount || 0
      );
    }
    
    return {
      content,
      finishReason,
      usage
    };
  }
  
  /**
   * Create the final response from streaming results for Vertex AI
   */
  protected finalizeStreamingResponse(
    accumulatedContent: string | null | undefined,
    lastChunk: any | null | undefined,
    usage: any | null | undefined
  ): ChatResult {
    // Create dates (will be overridden by base class)
    const now = new Date();
    
    // Create a proper ChatResult instance with constructor params
    const result = new ChatResult(true, now, now);
    
    // Set all properties
    result.data = {
      choices: [{
        message: {
          role: ChatMessageRole.assistant,
          content: accumulatedContent ? accumulatedContent : ''
        },
        finish_reason: lastChunk?.finishReason || 'stop',
        index: 0
      }],
      usage: usage || new ModelUsage(0, 0)
    };
    
    result.statusText = 'success';
    result.errorMessage = null;
    result.exception = null;
    
    return result;
  }

  /**
   * Not implemented yet
   */
  public async SummarizeText(params: SummarizeParams): Promise<SummarizeResult> {
    throw new Error("Method not implemented.");
  }

  /**
   * Not implemented yet
   */
  public async ClassifyText(params: ClassifyParams): Promise<ClassifyResult> {
    throw new Error("Method not implemented.");
  }

  /**
   * Map MemberJunction ChatParams to Vertex-specific params
   */
  private mapToVertexParams(params: ChatParams): any {
    return {
      model: params.model,
      messages: this.convertToVertexMessages(params.messages),
      temperature: params.temperature,
      maxOutputTokens: params.maxOutputTokens
    };
  }

  /**
   * Convert MemberJunction chat messages to Vertex-compatible messages
   */
  private convertToVertexMessages(messages: ChatMessage[]): any[] {
    return messages.map(msg => {
      return {
        role: this.mapRole(msg.role),
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      };
    });
  }

  /**
   * Map message roles to Vertex format
   */
  private mapRole(role: string): string {
    switch (role) {
      case ChatMessageRole.system:
        return 'system';
      case ChatMessageRole.assistant:
        return 'model';
      case ChatMessageRole.user:
      default:
        return 'user';
    }
  }

  /**
   * Get the appropriate generative model based on model name
   */
  private getGenerativeModelForModel(modelName: string) {
    // For different model types, we might need different parameters
    if (modelName.startsWith('gemini-')) {
      return this._client.getGenerativeModel({ model: modelName });
    } else if (modelName.startsWith('text-')) {
      return this._client.getGenerativeModel({ model: modelName });
    } else if (modelName.startsWith('code-')) {
      return this._client.getGenerativeModel({ model: modelName });
    } else {
      // Default case
      return this._client.getGenerativeModel({ model: modelName });
    }
  }

  /**
   * Convert messages to Vertex content format
   */
  private mapToVertexContents(messages: any[]) {
    // Convert messages to the format expected by Vertex AI
    return messages.map(msg => {
      return {
        role: msg.role,
        parts: [{ text: msg.content }]
      };
    });
  }
}

export function LoadVertexLLM() {
  // this does nothing but prevents the class from being removed by the tree shaker
}