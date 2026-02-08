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

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (_target: unknown) => {},
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
    ChatMessageRole: { user: 'user', assistant: 'assistant', system: 'system' },
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
