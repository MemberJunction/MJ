import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */
const mockModel = vi.hoisted(() => vi.fn());

vi.mock('@lmstudio/sdk', () => {
  return {
    LMStudioClient: class MockLMStudioClient {
      llm = { model: mockModel };
      constructor(_opts?: Record<string, unknown>) {}
    },
  };
});

// The cancellation classification is pure and shared, so the stand-in BaseLLM below builds its
// cancelled results from the real module rather than from a hand-copied shape.
import * as actualCancellation from '../../../../Core/src/generic/cancellation';

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (_target: unknown) => {},
  ToJSONSafe: (v: unknown) => (v == null ? null : JSON.parse(JSON.stringify(v))),
}));

vi.mock('@memberjunction/ai', () => {
  class MockBaseLLM {
    protected _additionalSettings: Record<string, unknown> = {};
    constructor(_apiKey: string) {}
    get SupportsStreaming() { return true; }
    public SetAdditionalSettings(settings: Record<string, unknown>) {
      this._additionalSettings = { ...this._additionalSettings, ...settings };
    }
    protected initializeThinkingStreamState() {}
    protected resetStreamingState() {}
    protected processStreamChunkWithThinking(content: string) { return content; }
    protected get thinkingStreamState() {
      return { accumulatedThinking: '' };
    }
    protected addThinkingToMessage(msg: Record<string, unknown>, thinking?: string) {
      if (thinking) {
        return { ...msg, thinking };
      }
      return msg;
    }
    /** Mirrors BaseLLM.IsCancellationError: an aborted signal or an abort-named error. */
    protected IsCancellationError(error: unknown, signal?: AbortSignal | null): boolean {
      return signal?.aborted === true || actualCancellation.IsAbortError(error);
    }
    /** Mirrors BaseLLM.BuildCancelledChatResult, classifying through the real shared module. */
    protected BuildCancelledChatResult(startTime: Date, options: { error?: unknown; signal?: AbortSignal | null; message?: string } = {}) {
      return {
        success: false,
        startTime,
        endTime: new Date(),
        statusText: 'cancelled',
        errorMessage: options.message || actualCancellation.DescribeCancellation(options.signal),
        exception: options.error,
        errorInfo: actualCancellation.BuildCancellationErrorInfo({ error: options.error, signal: options.signal, provider: 'LMStudioLLM' }),
        data: { choices: [], usage: { promptTokens: 0, completionTokens: 0 } },
      };
    }
  }
  class MockChatResult {
    success: boolean;
    statusText: string = '';
    data: unknown;
    errorMessage: string | null = null;
    exception: unknown = null;
    modelSpecificResponseDetails: unknown;
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
    ChatMessageRole: { user: 'user', assistant: 'assistant', system: 'system', tool: 'tool' },
    toClassicChatMessageRole: (role: string): string => (role === 'tool' ? 'user' : role),
    ModelUsage: MockModelUsage,
    ChatParams: class {},
    ClassifyParams: class {},
    ClassifyResult: class {},
    SummarizeParams: class {},
    SummarizeResult: class {},
    ErrorAnalyzer: { analyzeError: vi.fn().mockReturnValue({ category: 'unknown' }) },
  };
});

import { LMStudioLLM } from '../models/lm-studio';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('LMStudioLLM', () => {
  let llm: LMStudioLLM;

  beforeEach(() => {
    vi.clearAllMocks();
    llm = new LMStudioLLM();
  });

  /* ---- Constructor ---- */
  describe('constructor', () => {
    it('should create an instance without API key', () => {
      expect(llm).toBeInstanceOf(LMStudioLLM);
    });

    it('should create an instance with optional API key', () => {
      const inst = new LMStudioLLM('optional-key');
      expect(inst).toBeInstanceOf(LMStudioLLM);
    });

    it('should expose LMStudioClient getter', () => {
      expect(llm.LMStudioClient).toBeDefined();
    });

    it('should expose client getter (alias)', () => {
      expect(llm.client).toBe(llm.LMStudioClient);
    });
  });

  /* ---- SupportsStreaming ---- */
  describe('SupportsStreaming', () => {
    it('should return true', () => {
      expect(llm.SupportsStreaming).toBe(true);
    });
  });

  /* ---- SetAdditionalSettings ---- */
  describe('SetAdditionalSettings', () => {
    it('should reconfigure client with new baseUrl', () => {
      const clientBefore = llm.client;
      llm.SetAdditionalSettings({ baseUrl: 'http://custom:1234' });
      // The client should be a new instance
      const clientAfter = llm.client;
      expect(clientAfter).not.toBe(clientBefore);
    });
  });

  /* ---- nonStreamingChatCompletion ---- */
  describe('nonStreamingChatCompletion', () => {
    it('should call model.respond and return success', async () => {
      const mockRespond = vi.fn().mockResolvedValue({
        nonReasoningContent: 'Hello from LM Studio',
        reasoningContent: undefined,
        stats: { promptTokensCount: 10, predictedTokensCount: 20 },
      });
      mockModel.mockResolvedValue({ respond: mockRespond });

      const params = {
        model: 'local-model',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
      };

      const fn = (llm as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['nonStreamingChatCompletion']
        .bind(llm);
      const result = await fn(params) as Record<string, unknown>;
      expect(result.success).toBe(true);
      const data = result.data as { choices: Array<{ message: { content: string } }>; usage: { promptTokens: number } };
      expect(data.choices[0].message.content).toBe('Hello from LM Studio');
      expect(data.usage.promptTokens).toBe(10);
    });

    it('should include thinking content when present', async () => {
      const mockRespond = vi.fn().mockResolvedValue({
        nonReasoningContent: 'The answer is 42',
        reasoningContent: 'Let me think about this...',
        stats: {},
      });
      mockModel.mockResolvedValue({ respond: mockRespond });

      const params = {
        model: 'local-model',
        messages: [{ role: 'user', content: 'What is 6x7?' }],
      };

      const fn = (llm as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['nonStreamingChatCompletion']
        .bind(llm);
      const result = await fn(params) as Record<string, unknown>;
      const data = result.data as { choices: Array<{ message: { content: string; thinking: string } }> };
      expect(data.choices[0].message.thinking).toBe('Let me think about this...');
    });

    it('should return error result on failure', async () => {
      mockModel.mockRejectedValue(new Error('Model not loaded'));

      const params = {
        model: 'missing-model',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const fn = (llm as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['nonStreamingChatCompletion']
        .bind(llm);
      const result = await fn(params) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Model not loaded');
    });
  });

  /* ---- cancellationToken ---- */
  describe('cancellationToken', () => {
    type CancellableResult = {
      success: boolean;
      statusText: string;
      errorMessage: string | null;
      errorInfo?: { errorType: string; severity: string; canFailover: boolean; providerErrorCode?: string };
    };

    const callNonStreaming = (params: Record<string, unknown>): Promise<CancellableResult> => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['nonStreamingChatCompletion']
        .bind(llm);
      return fn(params) as Promise<CancellableResult>;
    };
    const callCreateStream = (params: Record<string, unknown>): Promise<AsyncIterable<unknown>> => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['createStreamingRequest']
        .bind(llm);
      return fn(params) as Promise<AsyncIterable<unknown>>;
    };

    /** Asserts the shared cancelled-result contract BaseLLM builds for every driver. */
    const expectCancelled = (result: CancellableResult): void => {
      expect(result.success).toBe(false);
      expect(result.statusText).toBe('cancelled');
      expect(result.errorMessage).toMatch(/^Request was cancelled/);
      expect(result.errorInfo?.errorType).toBe('Cancelled');
      expect(result.errorInfo?.severity).toBe('Fatal');
      expect(result.errorInfo?.canFailover).toBe(false);
      expect(result.errorInfo?.providerErrorCode).toBe('request_cancelled');
    };

    it('should forward the token to model() and respond()', async () => {
      const mockRespond = vi.fn().mockResolvedValue({
        nonReasoningContent: 'Hi',
        reasoningContent: undefined,
        stats: {},
      });
      mockModel.mockResolvedValue({ respond: mockRespond });
      const controller = new AbortController();

      await callNonStreaming({
        model: 'local-model',
        messages: [{ role: 'user', content: 'Hello' }],
        cancellationToken: controller.signal,
      });

      expect(mockModel).toHaveBeenCalledWith('local-model', { signal: controller.signal });
      const respondOptions = mockRespond.mock.calls[0][1] as { signal?: AbortSignal };
      expect(respondOptions.signal).toBe(controller.signal);
    });

    it('should report a cancellation when LM Studio resolves after an abort (userStopped)', async () => {
      const controller = new AbortController();
      // LM Studio stops the prediction rather than throwing, so it resolves with partial content
      const mockRespond = vi.fn().mockImplementation(async () => {
        controller.abort();
        return { nonReasoningContent: 'partial', reasoningContent: undefined, stats: { stopReason: 'userStopped' } };
      });
      mockModel.mockResolvedValue({ respond: mockRespond });

      const result = await callNonStreaming({
        model: 'local-model',
        messages: [{ role: 'user', content: 'Hello' }],
        cancellationToken: controller.signal,
      });

      expectCancelled(result);
    });

    it('should report a prediction LM Studio stopped on its own (not our abort) as a retriable failure, not a cancellation', async () => {
      const mockRespond = vi.fn().mockResolvedValue({
        nonReasoningContent: 'partial',
        reasoningContent: undefined,
        stats: { stopReason: 'userStopped' },
      });
      mockModel.mockResolvedValue({ respond: mockRespond });

      const result = await callNonStreaming({
        model: 'local-model',
        messages: [{ role: 'user', content: 'Hello' }],
        cancellationToken: new AbortController().signal,
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('LM Studio stopped the prediction before it finished');
      expect(result.errorInfo).toMatchObject({ errorType: 'ServiceUnavailable', severity: 'Retriable', canFailover: true });
    });

    it('should report an abort raised while loading the model as cancelled', async () => {
      const controller = new AbortController();
      mockModel.mockImplementation(async () => {
        controller.abort();
        const error = new Error('The operation was aborted.');
        error.name = 'AbortError';
        throw error;
      });

      const result = await callNonStreaming({
        model: 'local-model',
        messages: [{ role: 'user', content: 'Hello' }],
        cancellationToken: controller.signal,
      });

      expectCancelled(result);
    });

    it('should stream fragments without awaiting the prediction, forwarding the token', async () => {
      const controller = new AbortController();
      // An OngoingPrediction is both async-iterable and a thenable that settles only when the
      // prediction finishes; the stream must be iterable before that happens.
      const prediction = {
        async *[Symbol.asyncIterator]() {
          yield { content: 'partial' };
        },
        then: vi.fn(),
      };
      const mockRespond = vi.fn().mockReturnValue(prediction);
      mockModel.mockResolvedValue({ respond: mockRespond });

      const stream = await callCreateStream({
        model: 'local-model',
        messages: [{ role: 'user', content: 'Hello' }],
        cancellationToken: controller.signal,
      });

      expect(prediction.then).not.toHaveBeenCalled();
      const respondOptions = mockRespond.mock.calls[0][1] as { signal?: AbortSignal; stream?: boolean };
      expect(respondOptions.signal).toBe(controller.signal);
      const fragments: unknown[] = [];
      for await (const fragment of stream) {
        fragments.push(fragment);
      }
      expect(fragments).toEqual([{ content: 'partial' }]);
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
});
