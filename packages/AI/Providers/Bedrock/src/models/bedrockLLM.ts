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
  ChatMessage,
  ChatMessageContentBlock,
  ErrorAnalyzer,
  parseBase64DataUrl
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { 
  BedrockRuntimeClient, 
  InvokeModelCommand, 
  InvokeModelWithResponseStreamCommand 
} from '@aws-sdk/client-bedrock-runtime';

@RegisterClass(BaseLLM, "BedrockLLM")
export class BedrockLLM extends BaseLLM {
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

  /**
   * Amazon Bedrock supports streaming for most models
   */
  public override get SupportsStreaming(): boolean {
    return true;
  }

  /**
   * Bedrock supports assistant prefill for Claude (anthropic.*) models.
   * The provider implementation handles per-model-prefix gating internally.
   */
  public override get SupportsPrefill(): boolean {
    return true;
  }

  /**
   * Implementation of non-streaming chat completion for Amazon Bedrock
   */
  protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
    const startTime = new Date();
    
    try {
      // Map provider-agnostic params to Bedrock-specific format
      const bedrockParams = this.mapToBedrockParams(params);
      
      // The modelId should be specified in the model parameter, e.g., "anthropic.claude-v2"
      const modelId = params.model;
      
      // Create the request body - depends on the specific model provider in Bedrock
      let requestBody: any;
      
      if (modelId.startsWith('anthropic.')) {
        // Anthropic Claude models
        const claudeMessages = [...bedrockParams.messages];
        // Append assistant prefill if specified — Claude on Bedrock supports this natively
        if (params.assistantPrefill) {
          claudeMessages.push({ role: 'assistant', content: params.assistantPrefill });
        }
        requestBody = {
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: params.maxOutputTokens || 1024,
          messages: claudeMessages,
          temperature: params.temperature || 0.7,
          top_p: 0.9
        };
        if (params.stopSequences != null && params.stopSequences.length > 0) {
          requestBody.stop_sequences = params.stopSequences;
        }
      } else if (modelId.startsWith('ai21.')) {
        // AI21 models
        requestBody = {
          prompt: this.convertMessagesToPrompt(bedrockParams.messages),
          maxTokens: params.maxOutputTokens || 1024,
          temperature: params.temperature || 0.7,
          topP: 0.9
        };
        if (params.stopSequences != null && params.stopSequences.length > 0) {
          requestBody.stopSequences = params.stopSequences;
        }
      } else if (modelId.startsWith('amazon.titan-')) {
        // Amazon Titan models
        requestBody = {
          inputText: this.convertMessagesToPrompt(bedrockParams.messages),
          textGenerationConfig: {
            maxTokenCount: params.maxOutputTokens || 1024,
            temperature: params.temperature || 0.7,
            topP: 0.9
          }
        };
        if (params.stopSequences != null && params.stopSequences.length > 0) {
          requestBody.textGenerationConfig.stopSequences = params.stopSequences;
        }
      } else if (modelId.startsWith('meta.')) {
        // Meta Llama models
        requestBody = {
          prompt: this.convertMessagesToPrompt(bedrockParams.messages),
          max_gen_len: params.maxOutputTokens || 1024,
          temperature: params.temperature || 0.7,
          top_p: 0.9
        };
        // Note: Meta Llama models on Bedrock don't support stop sequences in the request body
      } else {
        throw new Error(`Unsupported model provider for Bedrock: ${modelId}`);
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
      
      // Parse response body based on model provider.
      // cacheReadTokens / cacheWriteTokens default to 0; only Anthropic-on-Bedrock reports caching.
      let content = '';
      let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

      if (modelId.startsWith('anthropic.')) {
        content = responseBody.content?.[0]?.text || '';
        // Anthropic-style usage: input_tokens EXCLUDES cached tokens, so it is already the net-new
        // (uncached) prompt count — assign through. Cache reads/writes are reported separately and
        // are DISJOINT from input_tokens.
        tokenUsage = {
          promptTokens: responseBody.usage?.input_tokens || 0,
          completionTokens: responseBody.usage?.output_tokens || 0,
          totalTokens: (responseBody.usage?.input_tokens || 0) + (responseBody.usage?.output_tokens || 0),
          cacheReadTokens: responseBody.usage?.cache_read_input_tokens || 0,
          cacheWriteTokens: responseBody.usage?.cache_creation_input_tokens || 0
        };
      } else if (modelId.startsWith('ai21.')) {
        content = responseBody.completions?.[0]?.data?.text || '';
        // AI21 via Bedrock has no prompt-cache reporting — promptTokens is already net-new.
        tokenUsage = {
          promptTokens: responseBody.prompt_tokens || 0,
          completionTokens: responseBody.completion_tokens || 0,
          totalTokens: (responseBody.prompt_tokens || 0) + (responseBody.completion_tokens || 0),
          cacheReadTokens: 0,
          cacheWriteTokens: 0
        };
      } else if (modelId.startsWith('amazon.titan-')) {
        content = responseBody.results?.[0]?.outputText || '';
        // Titan via Bedrock has no prompt-cache reporting — promptTokens is already net-new.
        tokenUsage = {
          promptTokens: responseBody.inputTextTokenCount || 0,
          completionTokens: responseBody.outputTextTokenCount || 0,
          totalTokens: (responseBody.inputTextTokenCount || 0) + (responseBody.outputTextTokenCount || 0),
          cacheReadTokens: 0,
          cacheWriteTokens: 0
        };
      } else if (modelId.startsWith('meta.')) {
        content = responseBody.generation || '';
        // Llama models via Bedrock may not provide token counts, and report no cache info.
        tokenUsage = {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0
        };
      }
      
      const endTime = new Date();
      
      // Create the ChatResult
      const choices: ChatResultChoice[] = [{
        message: {
          role: ChatMessageRole.assistant,
          content: content
        },
        finish_reason: 'stop',
        index: 0
      }];
      
      const usage = new ModelUsage(tokenUsage.promptTokens, tokenUsage.completionTokens);
      usage.cacheReadTokens = tokenUsage.cacheReadTokens;
      usage.cacheWriteTokens = tokenUsage.cacheWriteTokens;

      return {
        success: true,
        statusText: "OK",
        startTime: startTime,
        endTime: endTime,
        timeElapsed: endTime.getTime() - startTime.getTime(),
        data: {
          choices: choices,
          usage
        },
        cacheInfo: { cacheHit: tokenUsage.cacheReadTokens > 0, cachedTokenCount: tokenUsage.cacheReadTokens },
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
        errorMessage: error.message || "Error calling Amazon Bedrock",
        exception: error,
        errorInfo: ErrorAnalyzer.analyzeError(error, 'Bedrock')
      };
    }
  }
  
  /**
   * Create a streaming request for Bedrock
   */
  protected async createStreamingRequest(params: ChatParams): Promise<any> {
    // Map provider-agnostic params to Bedrock-specific format
    const bedrockParams = this.mapToBedrockParams(params);
    
    // The modelId should be specified in the model parameter, e.g., "anthropic.claude-v2"
    const modelId = params.model;
    
    // Create the request body - depends on the specific model provider in Bedrock
    let requestBody: any;
    
    if (modelId.startsWith('anthropic.')) {
      // Anthropic Claude models
      const claudeMessages = [...bedrockParams.messages];
      // Append assistant prefill if specified — Claude on Bedrock supports this natively
      if (params.assistantPrefill) {
        claudeMessages.push({ role: 'assistant', content: params.assistantPrefill });
      }
      requestBody = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: params.maxOutputTokens || 1024,
        messages: claudeMessages,
        temperature: params.temperature || 0.7,
        top_p: 0.9
      };
      if (params.stopSequences != null && params.stopSequences.length > 0) {
        requestBody.stop_sequences = params.stopSequences;
      }
    } else if (modelId.startsWith('ai21.')) {
      // AI21 models
      requestBody = {
        prompt: this.convertMessagesToPrompt(bedrockParams.messages),
        maxTokens: params.maxOutputTokens || 1024,
        temperature: params.temperature || 0.7,
        topP: 0.9
      };
      if (params.stopSequences != null && params.stopSequences.length > 0) {
        requestBody.stopSequences = params.stopSequences;
      }
    } else if (modelId.startsWith('amazon.titan-')) {
      // Amazon Titan models
      requestBody = {
        inputText: this.convertMessagesToPrompt(bedrockParams.messages),
        textGenerationConfig: {
          maxTokenCount: params.maxOutputTokens || 1024,
          temperature: params.temperature || 0.7,
          topP: 0.9
        }
      };
      if (params.stopSequences != null && params.stopSequences.length > 0) {
        requestBody.textGenerationConfig.stopSequences = params.stopSequences;
      }
    } else if (modelId.startsWith('meta.')) {
      // Meta Llama models
      requestBody = {
        prompt: this.convertMessagesToPrompt(bedrockParams.messages),
        max_gen_len: params.maxOutputTokens || 1024,
        temperature: params.temperature || 0.7,
        top_p: 0.9
      };
      // Note: Meta Llama models on Bedrock don't support stop sequences in the request body
    } else {
      throw new Error(`Unsupported model provider for Bedrock: ${modelId}`);
    }

    // Invoke the model with streaming
    const command = new InvokeModelWithResponseStreamCommand({
      modelId: modelId,
      body: JSON.stringify(requestBody),
      contentType: 'application/json',
      accept: 'application/json'
    });
    
    return this._client.send(command);
  }
  
  /**
   * Process a streaming chunk from Bedrock
   */
  protected processStreamingChunk(chunk: any): {
    content: string;
    finishReason?: string;
    usage?: any;
  } {
    let content = '';
    let finishReason = null;
    let usage = null;
    
    if (chunk.chunk?.bytes) {
      const chunkData = JSON.parse(new TextDecoder().decode(chunk.chunk.bytes));
      
      if (chunkData.completion) {
        content = chunkData.completion;
      } else if (chunkData.delta?.text) {
        content = chunkData.delta.text;
      } else if (chunkData.outputText) {
        content = chunkData.outputText;
      } else if (chunkData.generation) {
        content = chunkData.generation;
      } else if (chunkData.content?.[0]?.text) {
        content = chunkData.content[0].text;
      }
      
      // Check for finish reason and token usage
      if (chunkData.stop_reason) {
        finishReason = chunkData.stop_reason;
      }
      
      if (chunkData.usage) {
        // Anthropic-style: input_tokens already EXCLUDES cached tokens (net-new). Cache
        // reads/writes are reported separately and are DISJOINT from input_tokens.
        usage = new ModelUsage(
          chunkData.usage.input_tokens || 0,
          chunkData.usage.output_tokens || 0
        );
        usage.cacheReadTokens = chunkData.usage.cache_read_input_tokens || 0;
        usage.cacheWriteTokens = chunkData.usage.cache_creation_input_tokens || 0;
      }
    }
    
    return {
      content,
      finishReason,
      usage
    };
  }
  
  /**
   * Create the final response from streaming results for Bedrock
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
    const finalUsage: ModelUsage = usage || new ModelUsage(0, 0);
    result.data = {
      choices: [{
        message: {
          role: ChatMessageRole.assistant,
          content: accumulatedContent ? accumulatedContent : ''
        },
        finish_reason: lastChunk?.finishReason || 'stop',
        index: 0
      }],
      usage: finalUsage
    };

    const cacheRead = finalUsage.cacheReadTokens ?? 0;
    result.cacheInfo = { cacheHit: cacheRead > 0, cachedTokenCount: cacheRead };

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
   * Map MemberJunction ChatParams to Bedrock-specific params
   */
  private mapToBedrockParams(params: ChatParams): any {
    return {
      modelId: params.model,
      messages: this.convertToBedrockMessages(params.messages),
      temperature: params.temperature,
      maxTokens: params.maxOutputTokens
    };
  }

  /**
   * Convert MemberJunction chat messages to Bedrock-compatible messages
   * Supports multimodal content for Claude models (images via base64)
   */
  private convertToBedrockMessages(messages: ChatMessage[]): any[] {
    return messages.map(msg => {
      const role = this.mapRole(msg.role);

      // If content is a simple string, return as-is for text-only models
      // or wrap in content array for Claude models
      if (typeof msg.content === 'string') {
        return {
          role,
          content: msg.content
        };
      }

      // Content is an array of ChatMessageContentBlock - convert to Bedrock format
      const contentBlocks = msg.content as ChatMessageContentBlock[];
      const bedrockContent: any[] = [];

      for (const block of contentBlocks) {
        if (block.type === 'text') {
          bedrockContent.push({
            type: 'text',
            text: block.content
          });
        } else if (block.type === 'image_url') {
          // Convert image to Bedrock/Claude format
          const imageBlock = this.formatImageForBedrock(block);
          if (imageBlock) {
            bedrockContent.push(imageBlock);
          }
        } else if (block.type === 'file_url') {
          // Convert document to Bedrock/Claude format
          const docBlock = this.formatDocumentForBedrock(block);
          if (docBlock) {
            bedrockContent.push(docBlock);
          }
        }
        // Note: audio_url, video_url not yet supported by Bedrock Claude
      }

      return {
        role,
        content: bedrockContent.length > 0 ? bedrockContent : msg.content
      };
    });
  }

  /**
   * Format an image content block for Bedrock Claude API
   * Claude expects: { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "..." } }
   */
  private formatImageForBedrock(block: ChatMessageContentBlock): any | null {
    const content = block.content;

    // Check if it's a data URL (data:image/png;base64,...)
    const parsed = parseBase64DataUrl(content);
    if (parsed) {
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: parsed.mediaType,
          data: parsed.data
        }
      };
    }

    // Check if it's raw base64 with mimeType provided
    if (block.mimeType && !content.startsWith('http')) {
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: block.mimeType,
          data: content
        }
      };
    }

    // URLs are not supported by Bedrock Claude - must be base64
    if (content.startsWith('http://') || content.startsWith('https://')) {
      console.warn('Bedrock Claude does not support image URLs, only base64. Skipping image.');
      return null;
    }

    // If we can't determine the format, try to use it as base64 with a default type
    console.warn('Image content block has unknown format, attempting to use as base64 JPEG');
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: content
      }
    };
  }

  /**
   * Format a file content block as a Bedrock Claude document block.
   * Bedrock Converse API supports documents in the format:
   * { type: "document", source: { type: "base64", media_type: "application/pdf", data: "..." } }
   *
   * Same format as direct Anthropic API — Bedrock mirrors the Claude content block types.
   */
  private formatDocumentForBedrock(block: ChatMessageContentBlock): any | null {
    const content = block.content;

    // Determine the MIME type
    const mimeType = block.mimeType || this.inferDocumentMimeType(block.fileName) || 'application/octet-stream';

    // Check if it's a data URL (data:application/pdf;base64,...)
    const parsed = parseBase64DataUrl(content);
    if (parsed) {
      return {
        type: 'document',
        source: {
          type: 'base64',
          media_type: parsed.mediaType,
          data: parsed.data
        }
      };
    }

    // Raw base64 with mimeType
    if (mimeType && !content.startsWith('http')) {
      return {
        type: 'document',
        source: {
          type: 'base64',
          media_type: mimeType,
          data: content
        }
      };
    }

    // Bedrock doesn't support URL-based documents — must be base64
    if (content.startsWith('http://') || content.startsWith('https://')) {
      console.warn('Bedrock Claude does not support document URLs, only base64. Skipping document.');
      return null;
    }

    console.warn(`Document content block has unknown format (mime: ${mimeType}), skipping`);
    return null;
  }

  /** Infer MIME type from file extension when mimeType is not provided */
  private inferDocumentMimeType(fileName?: string): string | null {
    if (!fileName) return null;
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf': return 'application/pdf';
      case 'csv': return 'text/csv';
      case 'txt': return 'text/plain';
      case 'html': case 'htm': return 'text/html';
      case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      default: return null;
    }
  }

  /**
   * Map MemberJunction roles to Bedrock roles
   */
  private mapRole(role: string): string {
    switch (role) {
      case ChatMessageRole.system:
        return 'system';
      case ChatMessageRole.assistant:
        return 'assistant';
      case ChatMessageRole.user:
      default:
        return 'user';
    }
  }

  /**
   * Convert messages to a single prompt string for models that don't support chat format
   */
  private convertMessagesToPrompt(messages: any[]): string {
    // Basic implementation - can be enhanced for different models
    return messages.map(msg => {
      if (msg.role === 'system') {
        return `System: ${msg.content}\n`;
      } else if (msg.role === 'assistant') {
        return `Assistant: ${msg.content}\n`;
      } else {
        return `User: ${msg.content}\n`;
      }
    }).join('');
  }
}