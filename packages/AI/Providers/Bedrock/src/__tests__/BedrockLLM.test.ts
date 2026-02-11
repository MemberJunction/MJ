import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */
const mockSend = vi.hoisted(() => vi.fn());

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
    parseBase64DataUrl: vi.fn().mockImplementation((input: string) => {
      const match = input.match(/^data:([^;]+);base64,(.+)$/);
      if (match) return { mediaType: match[1], data: match[2] };
      return null;
    }),
  };
});

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
});
