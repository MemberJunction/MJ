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
const captured: {
  lastRequest: Record<string, unknown> | null;
  lastOptions: { signal?: AbortSignal } | undefined;
} = { lastRequest: null, lastOptions: undefined };

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
            create: async (req: Record<string, unknown>, options?: { signal?: AbortSignal }) => {
              captured.lastRequest = req;
              captured.lastOptions = options;
              // Mirror the real SDK: an already-aborted signal rejects rather than
              // opening a socket, so the driver's cancellation path is exercised.
              if (options?.signal?.aborted) {
                const err = new Error('Request was aborted.');
                err.name = 'AbortError';
                throw err;
              }
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

    // --- cancellation helpers inherited from the real OpenAILLM ---
    // InceptionLLM overrides both chat paths without calling super, so it must forward
    // the cancellation token itself using these. Mirrored here so the mock parent
    // exposes the same protected surface the real one does.
    protected activeStreamCancellationToken: AbortSignal | undefined = undefined;

    protected buildRequestOptions(params: { cancellationToken?: AbortSignal }): { signal?: AbortSignal } {
      return params.cancellationToken ? { signal: params.cancellationToken } : {};
    }

    protected isCancellationError(error: unknown, cancellationToken?: AbortSignal): boolean {
      if (error instanceof Error && error.name === 'AbortError') return true;
      return cancellationToken?.aborted === true;
    }

    protected buildCancelledChatResult(error: unknown, startTime: Date) {
      return {
        success: false,
        startTime,
        endTime: new Date(),
        statusText: 'cancelled',
        errorMessage: error instanceof Error ? error.message : 'Request was cancelled',
        exception: error,
        errorInfo: { errorType: 'Unknown', severity: 'Fatal', canFailover: false, providerErrorCode: 'request_cancelled' },
        data: { choices: [], usage: { promptTokens: 0, completionTokens: 0 } },
      };
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

  /**
   * InceptionLLM overrides BOTH chat paths without calling super, so unlike its five
   * OpenAILLM siblings it does NOT inherit cancellation for free. These tests pin that
   * it forwards the token itself — the absence of exactly this coverage is why the gap
   * went unnoticed.
   */
  describe('cancellation', () => {
    it('forwards the cancellation token to the SDK on the non-streaming path', async () => {
      const controller = new AbortController();
      const params = { ...baseChatParams(), cancellationToken: controller.signal } as never;
      await (llm as unknown as { nonStreamingChatCompletion: (p: unknown) => Promise<unknown> }).nonStreamingChatCompletion(params);
      expect(captured.lastOptions?.signal).toBe(controller.signal);
    });

    it('forwards the cancellation token to the SDK on the streaming path', async () => {
      const controller = new AbortController();
      const params = { ...baseChatParams(), cancellationToken: controller.signal } as never;
      await (llm as unknown as { createStreamingRequest: (p: unknown) => Promise<unknown> }).createStreamingRequest(params);
      expect(captured.lastOptions?.signal).toBe(controller.signal);
    });

    it('stashes the token so the inherited finalizeStreamingResponse can detect an abort', async () => {
      const controller = new AbortController();
      const params = { ...baseChatParams(), cancellationToken: controller.signal } as never;
      await (llm as unknown as { createStreamingRequest: (p: unknown) => Promise<unknown> }).createStreamingRequest(params);
      expect((llm as unknown as { activeStreamCancellationToken?: AbortSignal }).activeStreamCancellationToken).toBe(controller.signal);
    });

    it('returns a cancelled ChatResult rather than throwing when the request is aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      const params = { ...baseChatParams(), cancellationToken: controller.signal } as never;
      const result = await (llm as unknown as {
        nonStreamingChatCompletion: (p: unknown) => Promise<{ success: boolean; statusText: string }>;
      }).nonStreamingChatCompletion(params);
      expect(result.success).toBe(false);
      expect(result.statusText).toBe('cancelled');
    });

    it('passes no signal when the caller supplies no token (unchanged legacy behavior)', async () => {
      const params = baseChatParams() as never;
      await (llm as unknown as { nonStreamingChatCompletion: (p: unknown) => Promise<unknown> }).nonStreamingChatCompletion(params);
      expect(captured.lastOptions?.signal).toBeUndefined();
    });
  });
});
