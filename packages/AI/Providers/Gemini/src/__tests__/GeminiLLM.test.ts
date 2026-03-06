import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    chats: {
      create: vi.fn().mockReturnValue({
        sendMessage: vi.fn(),
        sendMessageStream: vi.fn(),
      }),
    },
  })),
  Content: class {},
  Part: class {},
  Blob: class {},
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (_target: unknown) => {},
}));

vi.mock('@memberjunction/ai', () => {
  class MockBaseLLM {
    protected _additionalSettings: Record<string, unknown> = {};
    protected _apiKey: string;
    constructor(apiKey: string) { this._apiKey = apiKey; }
    get apiKey() { return this._apiKey; }
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
  class MockBaseImageGenerator {
    protected _apiKey: string;
    constructor(apiKey: string) { this._apiKey = apiKey; }
    get apiKey() { return this._apiKey; }
  }
  class MockGeneratedImage {
    data: Buffer | null = null;
    base64: string = '';
    url: string = '';
    format: string = '';
    index: number = 0;
  }
  return {
    BaseLLM: MockBaseLLM,
    ChatResult: MockChatResult,
    ChatParams: class {},
    ChatMessage: class {},
    ChatMessageContent: class {},
    StreamingChatCallbacks: class {},
    ModelUsage: MockModelUsage,
    SummarizeParams: class {},
    SummarizeResult: class {},
    ChatMessageRole: { user: 'user', assistant: 'assistant', system: 'system' },
    ErrorAnalyzer: { analyzeError: vi.fn().mockReturnValue({ category: 'unknown' }) },
    BaseImageGenerator: MockBaseImageGenerator,
    ImageGenerationParams: class {},
    ImageGenerationResult: class {},
    ImageEditParams: class {},
    ImageVariationParams: class {},
    ImageModelInfo: class {},
    GeneratedImage: MockGeneratedImage,
  };
});

import { GeminiLLM } from '../index';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('GeminiLLM', () => {
  let llm: GeminiLLM;

  beforeEach(() => {
    vi.clearAllMocks();
    llm = new GeminiLLM('test-gemini-key');
  });

  /* ---- Constructor ---- */
  describe('constructor', () => {
    it('should create an instance', () => {
      expect(llm).toBeInstanceOf(GeminiLLM);
    });

    it('should not initialize the client eagerly (lazy init)', () => {
      expect((llm as unknown as Record<string, unknown>)['_gemini']).toBeNull();
    });
  });

  /* ---- SupportsStreaming ---- */
  describe('SupportsStreaming', () => {
    it('should return true', () => {
      expect(llm.SupportsStreaming).toBe(true);
    });
  });

  /* ---- GeminiClient getter ---- */
  describe('GeminiClient', () => {
    it('should throw if client is not yet initialized', () => {
      expect(() => llm.GeminiClient).toThrow('Gemini client not initialized');
    });
  });

  /* ---- getThinkingBudget (private) ---- */
  describe('getThinkingBudget', () => {
    const callGetThinkingBudget = (effortLevel: string | number | undefined, modelName: string) => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => unknown>)['getThinkingBudget']
        .bind(llm);
      return fn(effortLevel, modelName) as number | undefined;
    };

    it('should return undefined for undefined effort level', () => {
      expect(callGetThinkingBudget(undefined, 'gemini-2.5-flash')).toBeUndefined();
    });

    it('should return undefined for empty string effort level', () => {
      expect(callGetThinkingBudget('', 'gemini-2.5-flash')).toBeUndefined();
    });

    it('should return undefined for NaN effort level', () => {
      expect(callGetThinkingBudget('abc', 'gemini-2.5-flash')).toBeUndefined();
    });

    it('should return 0 for very low effort on Flash models', () => {
      expect(callGetThinkingBudget(3, 'gemini-2.5-flash')).toBe(0);
    });

    it('should return low budget for effort level 20', () => {
      const budget = callGetThinkingBudget(20, 'gemini-2.5-pro');
      expect(budget).toBeGreaterThanOrEqual(1024);
      expect(budget).toBeLessThanOrEqual(4096);
    });

    it('should return medium budget for effort level 50', () => {
      const budget = callGetThinkingBudget(50, 'gemini-2.5-pro');
      expect(budget).toBeGreaterThanOrEqual(4097);
      expect(budget).toBeLessThanOrEqual(12288);
    });

    it('should return high budget for effort level 90', () => {
      const budget = callGetThinkingBudget(90, 'gemini-2.5-pro');
      expect(budget).toBeGreaterThanOrEqual(12289);
      expect(budget).toBeLessThanOrEqual(24576);
    });

    it('should clamp effort level to 1-100', () => {
      const low = callGetThinkingBudget(-10, 'gemini-2.5-pro');
      const high = callGetThinkingBudget(200, 'gemini-2.5-pro');
      expect(low).toBeGreaterThanOrEqual(0);
      expect(high).toBeLessThanOrEqual(24576);
    });

    it('should parse string effort level', () => {
      const budget = callGetThinkingBudget('50', 'gemini-2.5-pro');
      expect(budget).toBeGreaterThanOrEqual(4097);
    });
  });

  /* ---- supportsThinking (private) ---- */
  describe('supportsThinking', () => {
    const callSupportsThinking = (modelName: string) => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => boolean>)['supportsThinking']
        .bind(llm);
      return fn(modelName);
    };

    it('should return true for 2.5 models', () => {
      expect(callSupportsThinking('gemini-2.5-pro')).toBe(true);
      expect(callSupportsThinking('gemini-2.5-flash')).toBe(true);
    });

    it('should return true for gemini-3 models', () => {
      expect(callSupportsThinking('gemini-3-pro')).toBe(true);
    });

    it('should return true for experimental models', () => {
      expect(callSupportsThinking('gemini-exp-001')).toBe(true);
    });

    it('should return false for older models', () => {
      expect(callSupportsThinking('gemini-pro')).toBe(false);
      expect(callSupportsThinking('gemini-1.5-pro')).toBe(false);
    });
  });

  /* ---- geminiMessageSpacing ---- */
  describe('geminiMessageSpacing', () => {
    it('should combine consecutive messages with same role', () => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => unknown>)['geminiMessageSpacing']
        .bind(llm);
      const messages = [
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'user', parts: [{ text: 'World' }] },
        { role: 'model', parts: [{ text: 'Hi!' }] },
      ];
      const result = fn(messages) as Array<{ role: string; parts: Array<{ text: string }> }>;
      expect(result).toHaveLength(2);
      expect(result[0].parts).toHaveLength(2);
      expect(result[0].parts[0].text).toBe('Hello');
      expect(result[0].parts[1].text).toBe('World');
    });

    it('should return empty array for empty input', () => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => unknown>)['geminiMessageSpacing']
        .bind(llm);
      const result = fn([]) as unknown[];
      expect(result).toHaveLength(0);
    });

    it('should not combine messages with different roles', () => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => unknown>)['geminiMessageSpacing']
        .bind(llm);
      const messages = [
        { role: 'user', parts: [{ text: 'A' }] },
        { role: 'model', parts: [{ text: 'B' }] },
        { role: 'user', parts: [{ text: 'C' }] },
      ];
      const result = fn(messages) as Array<{ role: string; parts: unknown[] }>;
      expect(result).toHaveLength(3);
    });
  });

  /* ---- MapMJContentToGeminiParts (static) ---- */
  describe('MapMJContentToGeminiParts', () => {
    it('should convert string content to text part', () => {
      const parts = GeminiLLM.MapMJContentToGeminiParts('Hello world');
      expect(parts).toHaveLength(1);
      expect(parts[0]).toEqual({ text: 'Hello world' });
    });

    it('should convert array of text blocks', () => {
      const content = [
        { type: 'text', content: 'Line 1' },
        { type: 'text', content: 'Line 2' },
      ];
      const parts = GeminiLLM.MapMJContentToGeminiParts(content as never);
      expect(parts).toHaveLength(2);
      expect(parts[0]).toEqual({ text: 'Line 1' });
    });

    it('should convert image content to inlineData', () => {
      const content = [
        { type: 'image_url', content: 'base64imagedata' },
      ];
      const parts = GeminiLLM.MapMJContentToGeminiParts(content as never);
      expect(parts).toHaveLength(1);
      expect(parts[0]).toHaveProperty('inlineData');
    });
  });

  /* ---- MapMJMessageToGeminiHistoryEntry (static) ---- */
  describe('MapMJMessageToGeminiHistoryEntry', () => {
    it('should map assistant role to model', () => {
      const entry = GeminiLLM.MapMJMessageToGeminiHistoryEntry({
        role: 'assistant',
        content: 'Hi',
      } as never);
      expect(entry.role).toBe('model');
    });

    it('should map user role to user', () => {
      const entry = GeminiLLM.MapMJMessageToGeminiHistoryEntry({
        role: 'user',
        content: 'Hello',
      } as never);
      expect(entry.role).toBe('user');
    });

    it('should map system role to user', () => {
      const entry = GeminiLLM.MapMJMessageToGeminiHistoryEntry({
        role: 'system',
        content: 'Be helpful',
      } as never);
      expect(entry.role).toBe('user');
    });
  });

  /* ---- Unsupported methods ---- */
  describe('unsupported methods', () => {
    it('SummarizeText should throw', () => {
      expect(() => llm.SummarizeText({} as never)).toThrow('Method not implemented.');
    });

    it('ClassifyText should throw', () => {
      expect(() => llm.ClassifyText({} as never)).toThrow('Method not implemented.');
    });
  });
});
