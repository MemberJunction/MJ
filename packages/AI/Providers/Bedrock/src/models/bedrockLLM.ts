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
  parseBase64DataUrl,
  GetTextFromContent,
  type VendorCallParameters
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { 
  BedrockRuntimeClient, 
  InvokeModelCommand, 
  InvokeModelWithResponseStreamCommand 
} from '@aws-sdk/client-bedrock-runtime';

/** A base64 image or document block, in the Claude content-block shape Bedrock mirrors. */
type BedrockMediaBlock = { type: 'image' | 'document'; source: { type: 'base64'; media_type: string; data: string } };

/** One content block of a Bedrock Claude message. */
type BedrockContentBlock = { type: 'text'; text: string } | BedrockMediaBlock;

/**
 * One message as the Bedrock model families read it: plain text, or content blocks for Claude. A message whose
 * blocks are all of unsupported kinds (audio, video) keeps its original MJ blocks, as it always has.
 */
type BedrockMessage = { role: string; content: string | BedrockContentBlock[] | ChatMessageContentBlock[] };

/** The Bedrock model families this driver builds InvokeModel request bodies for. */
export type BedrockModelFamily = 'anthropic' | 'ai21' | 'amazon.titan' | 'meta';

@RegisterClass(BaseLLM, "BedrockLLM")
export class BedrockLLM extends BaseLLM {
  /** The foundation-model ID prefix of each supported family. */
  private static readonly FAMILY_PREFIXES: ReadonlyArray<readonly [string, BedrockModelFamily]> = [
    ['anthropic.', 'anthropic'],
    ['ai21.', 'ai21'],
    ['amazon.titan-', 'amazon.titan'],
    ['meta.', 'meta'],
  ];

  /**
   * The model family whose request body a Bedrock model ID needs, or `null` when this driver supports none.
   *
   * Accepts a foundation-model ID (`anthropic.claude-opus-4-5-20251101-v1:0`) and a system-defined
   * cross-region inference-profile ID, which is a foundation-model ID behind one geography segment
   * (`us.`, `eu.`, `apac.`, `global.`, `us-gov.` ...). Claude 4.x and later on Bedrock are served ONLY through
   * such profiles, so the family must be read past that segment. The geography list is not hard-coded:
   * AWS adds geographies, and a segment in front of a known family prefix is unambiguous. The full ID,
   * profile segment included, is what the request sends.
   */
  public static ResolveModelFamily(modelID: string): BedrockModelFamily | null {
    const direct = BedrockLLM.familyOfFoundationModelID(modelID);
    if (direct) {
      return direct;
    }
    const profileSegmentEnd = modelID.indexOf('.');
    return profileSegmentEnd > 0 ? BedrockLLM.familyOfFoundationModelID(modelID.slice(profileSegmentEnd + 1)) : null;
  }

  /** The family whose foundation-model ID prefix starts `modelID`, or `null`. */
  private static familyOfFoundationModelID(modelID: string): BedrockModelFamily | null {
    const match = BedrockLLM.FAMILY_PREFIXES.find(([prefix]) => modelID.startsWith(prefix));
    return match ? match[1] : null;
  }

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
   * Bedrock supports assistant prefill for Claude models (`anthropic.*` and their inference profiles).
   * The provider implementation handles per-model-prefix gating internally.
   */
  public override get SupportsPrefill(): boolean {
    return true;
  }

  /**
   * The request options passed to `BedrockRuntimeClient.send()`. Note the AWS SDK spells this
   * `abortSignal` (NOT `signal`, which is what the Anthropic/OpenAI SDKs use).
   */
  private buildSendOptions(params: ChatParams): { abortSignal?: AbortSignal } {
    return { abortSignal: params.cancellationToken };
  }

  /**
   * Implementation of non-streaming chat completion for Amazon Bedrock
   */
  protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
    const startTime = new Date();

    try {
      // The model ID is sent exactly as configured: a foundation-model ID or an inference-profile ID.
      const modelId = params.model;
      const family = BedrockLLM.ResolveModelFamily(modelId);
      const requestBody = this.buildRequestBody(params);

      // Invoke the model
      const command = new InvokeModelCommand({
        modelId: modelId,
        body: JSON.stringify(requestBody),
        contentType: 'application/json',
        accept: 'application/json'
      });
      
      // Forward the caller's cancellation token so an abort tears down the HTTP socket.
      const response = await this._client.send(command, this.buildSendOptions(params));
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      // Parse response body based on model provider.
      // cacheReadTokens / cacheWriteTokens default to 0; only Anthropic-on-Bedrock reports caching.
      let content = '';
      let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

      if (family === 'anthropic') {
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
      } else if (family === 'ai21') {
        content = responseBody.completions?.[0]?.data?.text || '';
        // AI21 via Bedrock has no prompt-cache reporting — promptTokens is already net-new.
        tokenUsage = {
          promptTokens: responseBody.prompt_tokens || 0,
          completionTokens: responseBody.completion_tokens || 0,
          totalTokens: (responseBody.prompt_tokens || 0) + (responseBody.completion_tokens || 0),
          cacheReadTokens: 0,
          cacheWriteTokens: 0
        };
      } else if (family === 'amazon.titan') {
        content = responseBody.results?.[0]?.outputText || '';
        // Titan via Bedrock has no prompt-cache reporting — promptTokens is already net-new.
        tokenUsage = {
          promptTokens: responseBody.inputTextTokenCount || 0,
          completionTokens: responseBody.outputTextTokenCount || 0,
          totalTokens: (responseBody.inputTextTokenCount || 0) + (responseBody.outputTextTokenCount || 0),
          cacheReadTokens: 0,
          cacheWriteTokens: 0
        };
      } else if (family === 'meta') {
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
      // The AWS SDK's HTTP handlers reject with an `AbortError` when `abortSignal` fires, and the
      // retry strategy does not retry it.
      if (this.IsCancellationError(error, params.cancellationToken)) {
        return this.BuildCancelledChatResult(startTime, { error, signal: params.cancellationToken });
      }
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
    // The model ID is sent exactly as configured: a foundation-model ID or an inference-profile ID.
    const modelId = params.model;
    const requestBody = this.buildRequestBody(params);

    // Invoke the model with streaming
    const command = new InvokeModelWithResponseStreamCommand({
      modelId: modelId,
      body: JSON.stringify(requestBody),
      contentType: 'application/json',
      accept: 'application/json'
    });

    // Forward the cancellation token so an abort cancels the streaming HTTP request instead of
    // letting the socket keep delivering events into an abandoned promise.
    const response = await this._client.send(command, this.buildSendOptions(params));
    // The command output is an envelope; the event stream the base class iterates is its `body`.
    if (!response.body) {
      throw new Error(`Bedrock returned no response stream for model ${modelId}`);
    }
    return response.body;
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
   * The temperature sent: the configured one (0 included — `??` on purpose: `||` would turn a configured 0 into 0.7),
   * otherwise the 0.7 default. Claude is the exception: it gets no default temperature when a topP is configured,
   * because Claude 4.x rejects a request carrying both `temperature` and `top_p` (Bedrock ValidationException, seen
   * live on Claude Opus 4.6). `undefined` = not sent. The request body and {@link DescribeSentParameters} both read this.
   */
  private resolveTemperature(params: ChatParams): number | undefined {
    if (params.temperature !== undefined && params.temperature !== null) {
      return params.temperature;
    }
    const claudeWithTopP = BedrockLLM.ResolveModelFamily(params.model) === 'anthropic' && BedrockLLM.hasConfiguredTopP(params);
    return claudeWithTopP ? undefined : 0.7;
  }

  /** Whether a topP is configured. A `null` override (prompt-runner overrides pass through as given) counts as unset. */
  private static hasConfiguredTopP(params: ChatParams): boolean {
    return params.topP !== undefined && params.topP !== null;
  }

  /** The max tokens sent: configured or 1024. `??` keeps a configured value exactly as given. */
  private resolveMaxTokens(params: ChatParams): number {
    return params.maxOutputTokens ?? 1024;
  }

  /**
   * Bedrock sends temperature and max tokens as resolved here, and never a seed: the InvokeModel bodies of the
   * supported families have no seed field. The request body reads the same resolvers, so this cannot drift from it.
   */
  public override DescribeSentParameters(params: ChatParams): VendorCallParameters {
    // `??`: a temperature of 0 is sent; only an unsent one becomes null.
    return { VendorModelName: params.model, Temperature: this.resolveTemperature(params) ?? null, MaxTokens: this.resolveMaxTokens(params), Seed: null };
  }

  /**
   * The InvokeModel request body for the model's family; shared by the streaming and non-streaming paths.
   * Throws for a model ID whose family this driver has no body for, before anything is sent.
   */
  private buildRequestBody(params: ChatParams): Record<string, unknown> {
    const family = BedrockLLM.ResolveModelFamily(params.model);
    const temperature = this.resolveTemperature(params);
    const maxTokens = this.resolveMaxTokens(params);
    const topP = params.topP ?? 0.9; // `??`: a configured 0 is sent as 0
    const stops = params.stopSequences && params.stopSequences.length > 0 ? params.stopSequences : undefined;
    if (family === 'anthropic') {
      return this.buildClaudeRequestBody(params, temperature, maxTokens, stops);
    }
    const prompt = this.convertMessagesToPrompt(this.convertToBedrockMessages(params.messages));
    if (family === 'ai21') {
      return { prompt, maxTokens, temperature, topP, ...(stops ? { stopSequences: stops } : {}) };
    }
    if (family === 'amazon.titan') {
      return { inputText: prompt, textGenerationConfig: { maxTokenCount: maxTokens, temperature, topP, ...(stops ? { stopSequences: stops } : {}) } };
    }
    if (family === 'meta') {
      // Meta Llama models on Bedrock don't support stop sequences in the request body.
      return { prompt, max_gen_len: maxTokens, temperature, top_p: topP };
    }
    // TODO: Bedrock model rows for the openai.*, xai.* and mistral.* families are Active in metadata, but this driver
    // has no request body for them, so they always fail here. Track adding their bodies (or deactivating the rows) as an issue.
    throw new Error(`Unsupported model provider for Bedrock: ${params.model}`);
  }

  /**
   * The Claude Messages body. System messages go to the top-level `system` field: Claude's `messages` take only the
   * user and assistant roles. `top_p` is sent only when configured, and then the temperature only when configured too
   * ({@link resolveTemperature}): Claude 4.x rejects the pair, so the driver never adds half of it on its own. Claude
   * supports an assistant prefill natively.
   */
  private buildClaudeRequestBody(params: ChatParams, temperature: number | undefined, maxTokens: number, stops: string[] | undefined): Record<string, unknown> {
    const system = params.messages.filter(m => m.role === ChatMessageRole.system).map(m => GetTextFromContent(m.content)).join('\n\n');
    const messages = this.convertToBedrockMessages(params.messages.filter(m => m.role !== ChatMessageRole.system));
    const claudeMessages: BedrockMessage[] = params.assistantPrefill ? [...messages, { role: 'assistant', content: params.assistantPrefill }] : messages;
    return {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: claudeMessages,
      ...(temperature !== undefined ? { temperature } : {}),
      ...(BedrockLLM.hasConfiguredTopP(params) ? { top_p: params.topP } : {}),
      ...(stops ? { stop_sequences: stops } : {})
    };
  }

  /**
   * Convert MemberJunction chat messages to Bedrock-compatible messages
   * Supports multimodal content for Claude models (images via base64)
   */
  private convertToBedrockMessages(messages: ChatMessage[]): BedrockMessage[] {
    return messages.map((msg): BedrockMessage => {
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
      const bedrockContent: BedrockContentBlock[] = [];

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
  private formatImageForBedrock(block: ChatMessageContentBlock): BedrockMediaBlock | null {
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
  private formatDocumentForBedrock(block: ChatMessageContentBlock): BedrockMediaBlock | null {
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
  private convertMessagesToPrompt(messages: BedrockMessage[]): string {
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