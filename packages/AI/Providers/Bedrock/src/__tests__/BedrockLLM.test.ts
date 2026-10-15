import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */
/** The fields of an InvokeModel command the mocked command classes keep, and the reply shapes the tests script. */
type SentCommand = { modelId: string; body: string };
type ScriptedReply = { body: Uint8Array | never[] };
const mockSend = vi.hoisted(() => vi.fn<(command: SentCommand, options?: { abortSignal?: AbortSignal }) => Promise<ScriptedReply>>());

vi.mock('@aws-sdk/client-bedrock-runtime', () => {
  return {
    BedrockRuntimeClient: class MockBedrockRuntimeClient {
      send = mockSend;
      constructor(_opts: Record<string, unknown>) {}
    },
    InvokeModelCommand: class MockInvokeModelCommand {
      modelId: string;
      body: string;
      contentType: string;
      accept: string;
      constructor(params: Record<string, string>) {
        this.modelId = params.modelId;
        this.body = params.body;
        this.contentType = params.contentType;
        this.accept = params.accept;
      }
    },
    InvokeModelWithResponseStreamCommand: class MockInvokeModelWithResponseStreamCommand {
      constructor(params: Record<string, string>) { Object.assign(this, params); }
    },
  };
});

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (_target: unknown) => {},
}));

vi.mock('@memberjunction/ai', () => {
  class MockBaseLLM {
    protected _additionalSettings: Record<string, unknown> = {};
    constructor(_apiKey: string) {}
    get SupportsStreaming() { return true; }
    // Cancellation itself is covered against the real BaseLLM in BedrockLLM.cancellation.test.ts.
    protected IsCancellationError(_error: unknown, signal?: AbortSignal | null): boolean { return signal?.aborted === true; }
  }
  class MockChatResult {
    success: boolean;
    statusText: string = '';
    data: unknown;
    errorMessage: string | null = null;
    exception: unknown = null;
    errorInfo: unknown = null;
    startTime: Date;
    endTime: Date;
    timeElapsed: number;
    constructor(success: boolean, start: Date, end: Date) {
      this.success = success;
      this.startTime = start;
      this.endTime = end;
      this.timeElapsed = end.getTime() - start.getTime();
    }
  }
  class MockModelUsage {
    promptTokens: number;
    completionTokens: number;
    constructor(prompt: number, completion: number) {
      this.promptTokens = prompt;
      this.completionTokens = completion;
    }
  }
  return {
    BaseLLM: MockBaseLLM,
    ChatResult: MockChatResult,
    ChatResultChoice: class {},
    ChatMessageRole: { user: 'user', assistant: 'assistant', system: 'system' },
    ModelUsage: MockModelUsage,
    ChatParams: class {},
    ChatMessage: class {},
    ChatMessageContentBlock: class {},
    ClassifyParams: class {},
    ClassifyResult: class {},
    SummarizeParams: class {},
    SummarizeResult: class {},
    ErrorAnalyzer: { analyzeError: vi.fn().mockReturnValue({ category: 'unknown' }) },
    GetTextFromContent: (content: string | Array<{ type: string; content: string }>): string =>
      typeof content === 'string' ? content : content.filter(b => b.type === 'text').map(b => b.content).join('\n'),
    parseBase64DataUrl: vi.fn().mockImplementation((input: string) => {
      const match = input.match(/^data:([^;]+);base64,(.+)$/);
      if (match) return { mediaType: match[1], data: match[2] };
      return null;
    }),
  };
});

import { ChatParams, type ChatResult } from '@memberjunction/ai';
import { BedrockLLM } from '../models/bedrockLLM';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('BedrockLLM', () => {
  let llm: BedrockLLM;

  beforeEach(() => {
    vi.clearAllMocks();
    llm = new BedrockLLM('access-key:secret-key');
  });

  /* ---- Constructor ---- */
  describe('constructor', () => {
    it('should create an instance', () => {
      expect(llm).toBeInstanceOf(BedrockLLM);
    });

    it('should default region to us-east-1', () => {
      expect((llm as unknown as Record<string, unknown>)['_region']).toBe('us-east-1');
    });

    it('should accept custom region', () => {
      const custom = new BedrockLLM('key:secret', 'eu-west-1');
      expect((custom as unknown as Record<string, unknown>)['_region']).toBe('eu-west-1');
    });

    it('should expose Client getter', () => {
      expect(llm.Client).toBeDefined();
    });
  });

  /* ---- SupportsStreaming ---- */
  describe('SupportsStreaming', () => {
    it('should return true', () => {
      expect(llm.SupportsStreaming).toBe(true);
    });
  });

  /* ---- nonStreamingChatCompletion – Anthropic model ---- */
  describe('nonStreamingChatCompletion', () => {
    it('should handle Anthropic model format', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ text: 'Hello from Claude!' }],
          usage: { input_tokens: 10, output_tokens: 20 },
        })),
      };
      mockSend.mockResolvedValueOnce(mockResponse);

      const params = {
        model: 'anthropic.claude-v2',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        maxOutputTokens: 1024,
      };

      const fn = (llm as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['nonStreamingChatCompletion']
        .bind(llm);
      const result = await fn(params) as Record<string, unknown>;
      expect(result.success).toBe(true);
      const data = result.data as { choices: Array<{ message: { content: string } }>; usage: { promptTokens: number } };
      expect(data.choices[0].message.content).toBe('Hello from Claude!');
      expect(data.usage.promptTokens).toBe(10);
    });

    it('should handle AI21 model format', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          completions: [{ data: { text: 'AI21 response' } }],
          prompt_tokens: 5,
          completion_tokens: 10,
        })),
      };
      mockSend.mockResolvedValueOnce(mockResponse);

      const params = {
        model: 'ai21.j2-ultra',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const fn = (llm as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['nonStreamingChatCompletion']
        .bind(llm);
      const result = await fn(params) as Record<string, unknown>;
      expect(result.success).toBe(true);
    });

    it('should handle Amazon Titan model format', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          results: [{ outputText: 'Titan response' }],
          inputTextTokenCount: 8,
          outputTextTokenCount: 12,
        })),
      };
      mockSend.mockResolvedValueOnce(mockResponse);

      const params = {
        model: 'amazon.titan-text-express-v1',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const fn = (llm as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['nonStreamingChatCompletion']
        .bind(llm);
      const result = await fn(params) as Record<string, unknown>;
      expect(result.success).toBe(true);
    });

    it('should handle Meta Llama model format', async () => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify({
          generation: 'Llama response',
        })),
      };
      mockSend.mockResolvedValueOnce(mockResponse);

      const params = {
        model: 'meta.llama2-70b',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const fn = (llm as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['nonStreamingChatCompletion']
        .bind(llm);
      const result = await fn(params) as Record<string, unknown>;
      expect(result.success).toBe(true);
    });

    it('should throw for unsupported model provider', async () => {
      const params = {
        model: 'unsupported.model-v1',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const fn = (llm as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['nonStreamingChatCompletion']
        .bind(llm);
      const result = await fn(params) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Unsupported model provider');
    });

    it('should return error result on API failure', async () => {
      mockSend.mockRejectedValueOnce(new Error('AWS error'));

      const params = {
        model: 'anthropic.claude-v2',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const fn = (llm as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['nonStreamingChatCompletion']
        .bind(llm);
      const result = await fn(params) as Record<string, unknown>;
      expect(result.success).toBe(false);
    });
  });

  /* ---- convertMessagesToPrompt ---- */
  describe('convertMessagesToPrompt', () => {
    it('should convert messages to prompt string', () => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => string>)['convertMessagesToPrompt']
        .bind(llm);
      const result = fn([
        { role: 'system', content: 'Be helpful' },
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
      ]);
      expect(result).toContain('System: Be helpful');
      expect(result).toContain('User: Hi');
      expect(result).toContain('Assistant: Hello');
    });
  });

  /* ---- mapRole ---- */
  describe('mapRole', () => {
    it('should map system to system', () => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => string>)['mapRole'].bind(llm);
      expect(fn('system')).toBe('system');
    });

    it('should map assistant to assistant', () => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => string>)['mapRole'].bind(llm);
      expect(fn('assistant')).toBe('assistant');
    });

    it('should default to user', () => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => string>)['mapRole'].bind(llm);
      expect(fn('unknown')).toBe('user');
    });
  });

  /* ---- formatImageForBedrock ---- */
  describe('formatImageForBedrock', () => {
    it('should handle data URL format', () => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => unknown>)['formatImageForBedrock']
        .bind(llm);
      const result = fn({ type: 'image_url', content: 'data:image/png;base64,abc123' }) as Record<string, unknown>;
      expect(result).not.toBeNull();
      expect(result.type).toBe('image');
    });

    it('should handle raw base64 with mimeType', () => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => unknown>)['formatImageForBedrock']
        .bind(llm);
      const result = fn({ type: 'image_url', content: 'rawbase64data', mimeType: 'image/jpeg' }) as Record<string, unknown>;
      expect(result).not.toBeNull();
      const source = (result as Record<string, Record<string, string>>).source;
      expect(source.media_type).toBe('image/jpeg');
    });

    it('should return null for HTTP URLs', () => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => unknown>)['formatImageForBedrock']
        .bind(llm);
      const result = fn({ type: 'image_url', content: 'https://example.com/img.png' });
      expect(result).toBeNull();
    });
  });

  /* ---- Unsupported methods ---- */
  describe('unsupported methods', () => {
    it('SummarizeText should throw', async () => {
      await expect(llm.SummarizeText({} as never)).rejects.toThrow('Method not implemented.');
    });

    it('ClassifyText should throw', async () => {
      await expect(llm.ClassifyText({} as never)).rejects.toThrow('Method not implemented.');
    });
  });

  /* ---- stopSequences ---- */
  describe('stopSequences', () => {
    const mockAnthropicResponse = {
      body: new TextEncoder().encode(JSON.stringify({
        content: [{ text: 'response' }],
        usage: { input_tokens: 5, output_tokens: 10 },
      })),
    };
    const mockAI21Response = {
      body: new TextEncoder().encode(JSON.stringify({
        completions: [{ data: { text: 'response' } }],
        prompt_tokens: 5,
        completion_tokens: 10,
      })),
    };
    const mockTitanResponse = {
      body: new TextEncoder().encode(JSON.stringify({
        results: [{ outputText: 'response' }],
        inputTextTokenCount: 5,
        outputTextTokenCount: 10,
      })),
    };
    const mockLlamaResponse = {
      body: new TextEncoder().encode(JSON.stringify({
        generation: 'response',
      })),
    };

    const callNonStreaming = async (model: string, stopSequences: string[]) => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['nonStreamingChatCompletion'].bind(llm);
      await fn({
        model,
        messages: [{ role: 'user', content: 'Hello' }],
        stopSequences,
      });
      const sentBody = JSON.parse(mockSend.mock.calls[0][0].body);
      return sentBody;
    };

    it('should pass stop_sequences for Anthropic models', async () => {
      mockSend.mockResolvedValueOnce(mockAnthropicResponse);
      const body = await callNonStreaming('anthropic.claude-v2', ['STOP', 'END']);
      expect(body.stop_sequences).toEqual(['STOP', 'END']);
    });

    it('should pass stopSequences for AI21 models', async () => {
      mockSend.mockResolvedValueOnce(mockAI21Response);
      const body = await callNonStreaming('ai21.j2-ultra', ['STOP', 'END']);
      expect(body.stopSequences).toEqual(['STOP', 'END']);
    });

    it('should pass stopSequences inside textGenerationConfig for Amazon Titan models', async () => {
      mockSend.mockResolvedValueOnce(mockTitanResponse);
      const body = await callNonStreaming('amazon.titan-text-express-v1', ['STOP', 'END']);
      expect(body.textGenerationConfig.stopSequences).toEqual(['STOP', 'END']);
    });

    it('should NOT include stop sequences for Meta Llama models', async () => {
      mockSend.mockResolvedValueOnce(mockLlamaResponse);
      const body = await callNonStreaming('meta.llama2-70b', ['STOP', 'END']);
      expect(body.stop_sequences).toBeUndefined();
      expect(body.stopSequences).toBeUndefined();
    });

    it('should omit stop_sequences for Anthropic when array is empty', async () => {
      mockSend.mockResolvedValueOnce(mockAnthropicResponse);
      const body = await callNonStreaming('anthropic.claude-v2', []);
      expect(body.stop_sequences).toBeUndefined();
    });
  });

  /* ---- assistantPrefill ---- */
  describe('assistantPrefill', () => {
    const mockAnthropicResponse = {
      body: new TextEncoder().encode(JSON.stringify({
        content: [{ text: 'completed prefill' }],
        usage: { input_tokens: 5, output_tokens: 10 },
      })),
    };

    const callWithPrefill = async (model: string, assistantPrefill: string | undefined) => {
      const mockResponse = {
        body: new TextEncoder().encode(JSON.stringify(
          model.startsWith('anthropic.')
            ? { content: [{ text: 'response' }], usage: { input_tokens: 5, output_tokens: 10 } }
            : model.startsWith('ai21.')
              ? { completions: [{ data: { text: 'response' } }], prompt_tokens: 5, completion_tokens: 10 }
              : model.startsWith('amazon.titan-')
                ? { results: [{ outputText: 'response' }], inputTextTokenCount: 5, outputTextTokenCount: 10 }
                : { generation: 'response' }
        )),
      };
      mockSend.mockResolvedValueOnce(mockResponse);

      const fn = (llm as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['nonStreamingChatCompletion'].bind(llm);
      await fn({
        model,
        messages: [{ role: 'user', content: 'Hello' }],
        assistantPrefill,
      });
      const sentBody = JSON.parse(mockSend.mock.calls[0][0].body);
      return sentBody;
    };

    it('should append assistant message with prefill text for Anthropic models', async () => {
      const body = await callWithPrefill('anthropic.claude-v2', '{"result":');
      const messages = body.messages;
      expect(messages[messages.length - 1]).toEqual({ role: 'assistant', content: '{"result":' });
    });

    it('should not append assistant message when assistantPrefill is undefined for Anthropic', async () => {
      const body = await callWithPrefill('anthropic.claude-v2', undefined);
      const messages = body.messages;
      // Only the user message should be present (no trailing assistant)
      expect(messages.length).toBe(1);
      expect(messages[0].role).toBe('user');
    });

    it('should not include prefill in AI21 request body', async () => {
      const body = await callWithPrefill('ai21.j2-ultra', '{"result":');
      // AI21 uses prompt string, not messages array — no assistant prefill
      expect(body.messages).toBeUndefined();
      expect(body.prompt).toBeDefined();
      expect(body.prompt).not.toContain('{"result":');
    });

    it('should not include prefill in Amazon Titan request body', async () => {
      const body = await callWithPrefill('amazon.titan-text-express-v1', '{"result":');
      expect(body.messages).toBeUndefined();
      expect(body.inputText).toBeDefined();
      expect(body.inputText).not.toContain('{"result":');
    });

    it('should not include prefill in Meta Llama request body', async () => {
      const body = await callWithPrefill('meta.llama2-70b', '{"result":');
      expect(body.messages).toBeUndefined();
      expect(body.prompt).toBeDefined();
      expect(body.prompt).not.toContain('{"result":');
    });
  });

  /* ---- processStreamingChunk ---- */
  describe('processStreamingChunk', () => {
    it('should extract content from delta.text format', () => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => unknown>)['processStreamingChunk']
        .bind(llm);
      const chunk = {
        chunk: {
          bytes: new TextEncoder().encode(JSON.stringify({
            delta: { text: 'streaming text' },
          })),
        },
      };
      const result = fn(chunk) as { content: string };
      expect(result.content).toBe('streaming text');
    });

    it('should handle empty chunk', () => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => unknown>)['processStreamingChunk']
        .bind(llm);
      const result = fn({}) as { content: string };
      expect(result.content).toBe('');
    });
  });

  /* ---- finalizeStreamingResponse ---- */
  describe('finalizeStreamingResponse', () => {
    it('should create a ChatResult from accumulated content', () => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => unknown>)['finalizeStreamingResponse']
        .bind(llm);
      const result = fn('accumulated text', null, null) as Record<string, unknown>;
      expect(result.success).toBe(true);
      const data = result.data as { choices: Array<{ message: { content: string } }> };
      expect(data.choices[0].message.content).toBe('accumulated text');
    });
  });

  /* ---- cancellationToken ---- */
  describe('cancellationToken', () => {
    const baseParams = {
      model: 'anthropic.claude-v2',
      messages: [{ role: 'user', content: 'Hello' }],
      maxOutputTokens: 1024,
    };

    it('should forward the token to send() as abortSignal (non-streaming)', async () => {
      mockSend.mockResolvedValueOnce({
        body: new TextEncoder().encode(JSON.stringify({
          content: [{ text: 'Hi' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        })),
      });
      const controller = new AbortController();

      const fn = (llm as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['nonStreamingChatCompletion']
        .bind(llm);
      await fn({ ...baseParams, cancellationToken: controller.signal });

      // AWS SDK uses `abortSignal` (NOT `signal`) on the send() http options
      expect(mockSend.mock.calls[0][1]).toEqual({ abortSignal: controller.signal });
    });

    it('should forward the token to send() as abortSignal (streaming)', async () => {
      mockSend.mockResolvedValueOnce({ body: [] });
      const controller = new AbortController();

      const fn = (llm as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['createStreamingRequest']
        .bind(llm);
      await fn({ ...baseParams, cancellationToken: controller.signal });

      expect(mockSend.mock.calls[0][1]).toEqual({ abortSignal: controller.signal });
    });
  });
});

/** Reaches the protected request paths through a subclass, so a test sees the exact InvokeModel body. */
class RequestCapturingBedrockLLM extends BedrockLLM {
  public SendNonStreaming(params: ChatParams): Promise<ChatResult> { return this.nonStreamingChatCompletion(params); }
  // `unknown` on purpose: the stream handle is never read here, and the driver's own return type is the SDK's untyped stream.
  public SendStreaming(params: ChatParams): Promise<unknown> { return this.createStreamingRequest(params); }
}
/** Chat params from a partial literal; `ChatParams` is mocked, so the instance carries only what is given. */
const chatParams = (o: Partial<ChatParams>): ChatParams => Object.assign(new ChatParams(), o);
/** The command most recently sent to the mocked Bedrock client. */
const lastSentCommand = (): SentCommand => mockSend.mock.calls[mockSend.mock.calls.length - 1][0];
/** The JSON body of the most recent command sent to the mocked Bedrock client. */
const lastSentBody = (): Record<string, unknown> => JSON.parse(lastSentCommand().body);

describe('BedrockLLM parameter fidelity', () => {
  const families: Array<[string, (body: Record<string, unknown>) => unknown]> = [
    ['anthropic.claude-3-haiku-20240307-v1:0', (b) => b.temperature],
    ['ai21.j2-ultra-v1', (b) => b.temperature],
    ['amazon.titan-text-express-v1', (b) => (b.textGenerationConfig as Record<string, unknown>).temperature],
    ['meta.llama3-8b-instruct-v1:0', (b) => b.temperature],
  ];
  it.each(families)('%s sends a configured temperature of 0 as 0', async (model, read) => {
    mockSend.mockResolvedValueOnce({ body: new TextEncoder().encode(JSON.stringify({})) });
    await new RequestCapturingBedrockLLM('a:b').SendNonStreaming(chatParams({ model, messages: [{ role: 'user', content: 'x' }], temperature: 0 }));
    expect(read(lastSentBody())).toBe(0);
  });
  it('a streaming request sends a configured temperature of 0 as 0', async () => {
    mockSend.mockResolvedValueOnce({ body: [] });
    await new RequestCapturingBedrockLLM('a:b').SendStreaming(chatParams({ model: 'anthropic.claude-3-haiku-20240307-v1:0', messages: [{ role: 'user', content: 'x' }], temperature: 0 }));
    expect(lastSentBody().temperature).toBe(0);
  });
  it('sends a configured topP and max tokens of 0 as given, leaving the vendor to judge them', async () => {
    mockSend.mockResolvedValueOnce({ body: new TextEncoder().encode(JSON.stringify({})) });
    await new RequestCapturingBedrockLLM('a:b').SendNonStreaming(chatParams({ model: 'anthropic.claude-3-haiku-20240307-v1:0', messages: [{ role: 'user', content: 'x' }], topP: 0, maxOutputTokens: 0 }));
    expect(lastSentBody()).toMatchObject({ top_p: 0, max_tokens: 0 });
  });
  it('keeps 0.7 when no temperature is configured, and describes no seed', () => {
    const llm = new BedrockLLM('a:b');
    expect(llm.DescribeSentParameters(chatParams({ model: 'anthropic.claude-3-haiku-20240307-v1:0', messages: [], seed: 42 })))
      .toEqual({ VendorModelName: 'anthropic.claude-3-haiku-20240307-v1:0', Temperature: 0.7, MaxTokens: 1024, Seed: null });
  });
});

describe('BedrockLLM inference-profile model IDs', () => {
  const claudeReply = (): { body: Uint8Array } => ({ body: new TextEncoder().encode(JSON.stringify({ content: [{ text: 'OK' }], usage: { input_tokens: 7, output_tokens: 1 } })) });
  beforeEach(() => { vi.clearAllMocks(); });

  it.each([
    ['anthropic.claude-opus-4-5-20251101-v1:0', 'anthropic'],
    ['us.anthropic.claude-opus-4-6-v1', 'anthropic'],
    ['global.anthropic.claude-opus-5-5', 'anthropic'],
    ['eu.anthropic.claude-sonnet-4-6', 'anthropic'],
    ['apac.anthropic.claude-haiku-4-5-20251001-v1:0', 'anthropic'],
    ['us-gov.meta.llama3-8b-instruct-v1:0', 'meta'],
    ['us.amazon.titan-text-express-v1', 'amazon.titan'],
    ['ai21.j2-ultra-v1', 'ai21'],
    ['openai.gpt-6-astra', null],
    ['us.openai.gpt-oss-120b-1:0', null],
    ['amazon.nova-pro-v1:0', null],
  ])('%s belongs to family %s', (modelID, family) => {
    expect(BedrockLLM.ResolveModelFamily(modelID)).toBe(family);
  });

  it('sends a Claude body for a profile ID, keeps the full profile ID as the model, and reads the Claude reply', async () => {
    mockSend.mockResolvedValueOnce(claudeReply());
    const result = await new RequestCapturingBedrockLLM('a:b').SendNonStreaming(chatParams({ model: 'us.anthropic.claude-opus-4-6-v1', messages: [{ role: 'user', content: 'x' }] }));
    expect(lastSentCommand().modelId).toBe('us.anthropic.claude-opus-4-6-v1');
    expect(lastSentBody()).toMatchObject({ anthropic_version: 'bedrock-2023-05-31', max_tokens: 1024, temperature: 0.7 });
    expect(result.success).toBe(true);
    expect(result.data.choices[0].message.content).toBe('OK');
    expect(result.data.usage?.promptTokens).toBe(7);
  });

  it('streams a profile ID with a Claude body and the full profile ID', async () => {
    mockSend.mockResolvedValueOnce({ body: [] });
    await new RequestCapturingBedrockLLM('a:b').SendStreaming(chatParams({ model: 'global.anthropic.claude-opus-5-5', messages: [{ role: 'user', content: 'x' }] }));
    expect(lastSentCommand().modelId).toBe('global.anthropic.claude-opus-5-5');
    expect(lastSentBody()).toMatchObject({ anthropic_version: 'bedrock-2023-05-31' });
  });

  it('still refuses a family it cannot build a body for, before sending', async () => {
    const result = await new RequestCapturingBedrockLLM('a:b').SendNonStreaming(chatParams({ model: 'us.openai.gpt-oss-120b-1:0', messages: [{ role: 'user', content: 'x' }] }));
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('Unsupported model provider for Bedrock: us.openai.gpt-oss-120b-1:0');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('describes exactly the model ID, temperature and max tokens a profile-ID request sends', async () => {
    mockSend.mockResolvedValueOnce(claudeReply());
    const params = chatParams({ model: 'us.anthropic.claude-opus-4-6-v1', messages: [{ role: 'user', content: 'x' }], temperature: 0, maxOutputTokens: 5 });
    const llm = new RequestCapturingBedrockLLM('a:b');
    await llm.SendNonStreaming(params);
    const body = lastSentBody();
    expect(llm.DescribeSentParameters(params)).toEqual({ VendorModelName: lastSentCommand().modelId, Temperature: body.temperature, MaxTokens: body.max_tokens, Seed: null });
  });
});

describe('BedrockLLM Claude request body', () => {
  beforeEach(() => { vi.clearAllMocks(); mockSend.mockResolvedValue({ body: new TextEncoder().encode(JSON.stringify({ content: [{ text: 'OK' }] })) }); });

  it('sends no top_p unless one is configured (Claude 4.x rejects temperature and top_p together)', async () => {
    await new RequestCapturingBedrockLLM('a:b').SendNonStreaming(chatParams({ model: 'us.anthropic.claude-opus-4-6-v1', messages: [{ role: 'user', content: 'x' }] }));
    expect(lastSentBody()).not.toHaveProperty('top_p');
  });

  it('sends a configured top_p without the default temperature, and describes no temperature (Claude 4.x rejects the pair)', async () => {
    const params = chatParams({ model: 'anthropic.claude-opus-4-5-20251101-v1:0', messages: [{ role: 'user', content: 'x' }], topP: 0.5 });
    const llm = new RequestCapturingBedrockLLM('a:b');
    await llm.SendNonStreaming(params);
    expect(lastSentBody().top_p).toBe(0.5);
    expect(lastSentBody()).not.toHaveProperty('temperature');
    expect(llm.DescribeSentParameters(params).Temperature).toBeNull();
  });

  it('streams a configured top_p without the default temperature too', async () => {
    mockSend.mockResolvedValueOnce({ body: [] });
    await new RequestCapturingBedrockLLM('a:b').SendStreaming(chatParams({ model: 'us.anthropic.claude-opus-4-6-v1', messages: [{ role: 'user', content: 'x' }], topP: 0.5 }));
    expect(lastSentBody()).not.toHaveProperty('temperature');
  });

  it.each([
    [{}, ['temperature']],
    [{ temperature: 0 }, ['temperature']],
    [{ topP: 0.5 }, ['top_p']],
    [{ temperature: 0.2, topP: 0.5 }, ['temperature', 'top_p']],
    [{ topP: null }, ['temperature']],
  ])('with %j the Claude body carries exactly %j of temperature and top_p', async (sampling, expected) => {
    await new RequestCapturingBedrockLLM('a:b').SendNonStreaming(Object.assign(chatParams({ model: 'us.anthropic.claude-opus-4-6-v1', messages: [{ role: 'user', content: 'x' }] }), sampling));
    expect(['temperature', 'top_p'].filter(k => k in lastSentBody())).toEqual(expected);
  });

  it('keeps the 0.7 default temperature beside topP for the non-Claude families', async () => {
    mockSend.mockResolvedValueOnce({ body: new TextEncoder().encode(JSON.stringify({ generation: 'OK' })) });
    await new RequestCapturingBedrockLLM('a:b').SendNonStreaming(chatParams({ model: 'meta.llama3-8b-instruct-v1:0', messages: [{ role: 'user', content: 'x' }], topP: 0.5 }));
    expect(lastSentBody()).toMatchObject({ temperature: 0.7, top_p: 0.5 });
  });

  it('moves system messages to the top-level system field, which is the only place Claude reads them', async () => {
    await new RequestCapturingBedrockLLM('a:b').SendNonStreaming(chatParams({
      model: 'us.anthropic.claude-opus-4-6-v1',
      messages: [{ role: 'system', content: 'Be terse.' }, { role: 'system', content: [{ type: 'text', content: 'Answer in JSON.' }] }, { role: 'user', content: 'x' }],
    }));
    const body = lastSentBody();
    expect(body.system).toBe('Be terse.\n\nAnswer in JSON.');
    expect(body.messages).toEqual([{ role: 'user', content: 'x' }]);
  });

  it('sends no system field when there are no system messages', async () => {
    await new RequestCapturingBedrockLLM('a:b').SendNonStreaming(chatParams({ model: 'anthropic.claude-opus-4-5-20251101-v1:0', messages: [{ role: 'user', content: 'x' }] }));
    expect(lastSentBody()).not.toHaveProperty('system');
  });

  it('keeps system messages in the prompt text of the non-Claude families', async () => {
    mockSend.mockResolvedValueOnce({ body: new TextEncoder().encode(JSON.stringify({ generation: 'OK' })) });
    await new RequestCapturingBedrockLLM('a:b').SendNonStreaming(chatParams({ model: 'meta.llama3-8b-instruct-v1:0', messages: [{ role: 'system', content: 'Be terse.' }, { role: 'user', content: 'x' }] }));
    expect(lastSentBody().prompt).toBe('System: Be terse.\nUser: x\n');
  });
});
