import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */
vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (_target: unknown) => {},
}));

vi.mock('@memberjunction/ai', () => {
  class MockBaseLLM {
    protected _additionalSettings: Record<string, unknown> = {};
    constructor(_apiKey: string) {}
    get SupportsStreaming() { return true; }
  }
  return {
    BaseLLM: MockBaseLLM,
    ChatParams: class {},
    ChatResult: class {},
    ChatMessageRole: { user: 'user', assistant: 'assistant', system: 'system' },
    ModelUsage: class {
      promptTokens: number;
      completionTokens: number;
      constructor(p: number, c: number) {
        this.promptTokens = p;
        this.completionTokens = c;
      }
    },
    ErrorAnalyzer: { analyzeError: vi.fn() },
  };
});

/**
 * Captures the last request sent through chat.completions.create so each test
 * can assert what reached the wire. Reset in beforeEach.
 */
const captured: { lastRequest: Record<string, unknown> | null } = { lastRequest: null };

vi.mock('@memberjunction/ai-openai', () => {
  class MockOpenAILLM {
    protected _baseUrl: string;
    protected _apiKey: string;
    protected _additionalSettings: Record<string, unknown> = {};
    constructor(apiKey: string, baseUrl?: string) {
      this._apiKey = apiKey;
      this._baseUrl = baseUrl || 'https://api.openai.com/v1';
    }
    get SupportsStreaming() { return true; }
    get OpenAI() {
      return {
        chat: {
          completions: {
            create: async (req: Record<string, unknown>) => {
              captured.lastRequest = req;
              if (req.stream) {
                // Return something that looks stream-ish; tests only assert on the request.
                return { __stream: true };
              }
              return {
                id: 'mock-id',
                model: req.model,
                object: 'chat.completion',
                created: 0,
                choices: [
                  {
                    index: 0,
                    finish_reason: 'stop',
                    message: { role: 'assistant', content: 'ok' },
                  },
                ],
                usage: { prompt_tokens: 10, completion_tokens: 5 },
              };
            },
          },
        },
      };
    }
    public ConvertMJToOpenAIChatMessages(messages: Array<{ role: string; content: string }>) {
      return messages.map((m) => ({ role: m.role, content: m.content }));
    }
  }
  return { OpenAILLM: MockOpenAILLM };
});

import { InceptionLLM } from '../models/inception';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('InceptionLLM', () => {
  let llm: InceptionLLM;

  const baseChatParams = () => ({
    model: 'mercury-2',
    messages: [{ role: 'user', content: 'hi' }],
    temperature: 0.75,
    maxOutputTokens: 1024,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    captured.lastRequest = null;
    llm = new InceptionLLM('test-inception-key');
  });

  describe('constructor', () => {
    it('should create an instance', () => {
      expect(llm).toBeInstanceOf(InceptionLLM);
    });

    it('should set the base URL to the Inception Labs API', () => {
      expect((llm as unknown as Record<string, unknown>)['_baseUrl']).toBe('https://api.inceptionlabs.ai/v1');
    });

    it('should pass the API key to the parent class', () => {
      expect((llm as unknown as Record<string, unknown>)['_apiKey']).toBe('test-inception-key');
    });
  });

  describe('inheritance', () => {
    it('should inherit SupportsStreaming from OpenAILLM', () => {
      expect(llm.SupportsStreaming).toBe(true);
    });
  });

  describe('reasoning_effort 4-tier mapping', () => {
    it('maps "instant" string through to the wire', async () => {
      const params = { ...baseChatParams(), effortLevel: 'instant' } as never;
      await (llm as unknown as { nonStreamingChatCompletion: (p: unknown) => Promise<unknown> }).nonStreamingChatCompletion(params);
      expect(captured.lastRequest?.reasoning_effort).toBe('instant');
    });

    it('maps numeric 0-25 to "instant"', async () => {
      const params = { ...baseChatParams(), effortLevel: '20' } as never;
      await (llm as unknown as { nonStreamingChatCompletion: (p: unknown) => Promise<unknown> }).nonStreamingChatCompletion(params);
      expect(captured.lastRequest?.reasoning_effort).toBe('instant');
    });

    it('maps numeric 26-50 to "low"', async () => {
      const params = { ...baseChatParams(), effortLevel: '40' } as never;
      await (llm as unknown as { nonStreamingChatCompletion: (p: unknown) => Promise<unknown> }).nonStreamingChatCompletion(params);
      expect(captured.lastRequest?.reasoning_effort).toBe('low');
    });

    it('maps numeric 51-75 to "medium"', async () => {
      const params = { ...baseChatParams(), effortLevel: '60' } as never;
      await (llm as unknown as { nonStreamingChatCompletion: (p: unknown) => Promise<unknown> }).nonStreamingChatCompletion(params);
      expect(captured.lastRequest?.reasoning_effort).toBe('medium');
    });

    it('maps numeric 76+ to "high"', async () => {
      const params = { ...baseChatParams(), effortLevel: '90' } as never;
      await (llm as unknown as { nonStreamingChatCompletion: (p: unknown) => Promise<unknown> }).nonStreamingChatCompletion(params);
      expect(captured.lastRequest?.reasoning_effort).toBe('high');
    });

    it('omits reasoning_effort when no effortLevel is supplied', async () => {
      const params = baseChatParams() as never;
      await (llm as unknown as { nonStreamingChatCompletion: (p: unknown) => Promise<unknown> }).nonStreamingChatCompletion(params);
      expect(captured.lastRequest).not.toHaveProperty('reasoning_effort');
    });
  });

  describe('Mercury-specific extras', () => {
    it('omits all extras by default so server defaults apply', async () => {
      const params = baseChatParams() as never;
      await (llm as unknown as { nonStreamingChatCompletion: (p: unknown) => Promise<unknown> }).nonStreamingChatCompletion(params);
      expect(captured.lastRequest).not.toHaveProperty('reasoning_summary');
      expect(captured.lastRequest).not.toHaveProperty('reasoning_summary_wait');
      expect(captured.lastRequest).not.toHaveProperty('diffusing');
    });

    it('forwards reasoning_summary, reasoning_summary_wait, and diffusing when set on _additionalSettings', async () => {
      (llm as unknown as { _additionalSettings: Record<string, unknown> })._additionalSettings = {
        reasoning_summary: false,
        reasoning_summary_wait: true,
        diffusing: true,
      };
      const params = baseChatParams() as never;
      await (llm as unknown as { nonStreamingChatCompletion: (p: unknown) => Promise<unknown> }).nonStreamingChatCompletion(params);
      expect(captured.lastRequest?.reasoning_summary).toBe(false);
      expect(captured.lastRequest?.reasoning_summary_wait).toBe(true);
      expect(captured.lastRequest?.diffusing).toBe(true);
    });

    it('also applies extras in the streaming path', async () => {
      (llm as unknown as { _additionalSettings: Record<string, unknown> })._additionalSettings = {
        diffusing: true,
      };
      const params = { ...baseChatParams(), effortLevel: 'instant' } as never;
      await (llm as unknown as { createStreamingRequest: (p: unknown) => Promise<unknown> }).createStreamingRequest(params);
      expect(captured.lastRequest?.diffusing).toBe(true);
      expect(captured.lastRequest?.reasoning_effort).toBe('instant');
      expect(captured.lastRequest?.stream).toBe(true);
    });
  });
});
