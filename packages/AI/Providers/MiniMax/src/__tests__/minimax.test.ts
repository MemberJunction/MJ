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
    ModelUsage: class {},
    ErrorAnalyzer: { analyzeError: vi.fn() },
  };
});

vi.mock('@memberjunction/ai-openai', () => {
  class MockOpenAILLM {
    protected _baseUrl: string;
    protected _apiKey: string;
    constructor(apiKey: string, baseUrl?: string) {
      this._apiKey = apiKey;
      this._baseUrl = baseUrl || 'https://api.openai.com/v1';
    }
    get SupportsStreaming() { return true; }
  }
  return { OpenAILLM: MockOpenAILLM };
});

import { MiniMaxLLM } from '../models/minimax';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('MiniMaxLLM', () => {
  let llm: MiniMaxLLM;

  beforeEach(() => {
    vi.clearAllMocks();
    llm = new MiniMaxLLM('test-minimax-key');
  });

  /* ---- Constructor ---- */
  describe('constructor', () => {
    it('should create an instance', () => {
      expect(llm).toBeInstanceOf(MiniMaxLLM);
    });

    it('should set the base URL to MiniMax API', () => {
      expect((llm as unknown as Record<string, unknown>)['_baseUrl']).toBe('https://api.minimax.io/v1');
    });

    it('should pass the API key to the parent class', () => {
      expect((llm as unknown as Record<string, unknown>)['_apiKey']).toBe('test-minimax-key');
    });
  });

  /* ---- Inheritance ---- */
  describe('inheritance', () => {
    it('should inherit SupportsStreaming from OpenAILLM', () => {
      expect(llm.SupportsStreaming).toBe(true);
    });
  });
});
