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

import { OpenRouterLLM } from '../models/openRouter';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('OpenRouterLLM', () => {
  let llm: OpenRouterLLM;

  beforeEach(() => {
    vi.clearAllMocks();
    llm = new OpenRouterLLM('test-openrouter-key');
  });

  /* ---- Constructor ---- */
  describe('constructor', () => {
    it('should create an instance', () => {
      expect(llm).toBeInstanceOf(OpenRouterLLM);
    });

    it('should set the base URL to OpenRouter API', () => {
      expect((llm as unknown as Record<string, unknown>)['_baseUrl']).toBe('https://openrouter.ai/api/v1');
    });

    it('should pass the API key to the parent class', () => {
      expect((llm as unknown as Record<string, unknown>)['_apiKey']).toBe('test-openrouter-key');
    });
  });

  /* ---- Inheritance ---- */
  describe('inheritance', () => {
    it('should inherit SupportsStreaming from OpenAILLM', () => {
      expect(llm.SupportsStreaming).toBe(true);
    });
  });

  /* ---- Usage accounting opt-in ---- */
  describe('getProviderRequestExtras', () => {
    // The whole OpenRouter cost-capture story hinges on this: OpenRouter only returns usage.cost
    // when the request opts into usage accounting. The inherited OpenAILLM merges these extras into
    // both the streaming and non-streaming request bodies.
    const extras = (instance: OpenRouterLLM): Record<string, unknown> =>
      (instance as unknown as { getProviderRequestExtras: (p: unknown) => Record<string, unknown> })
        .getProviderRequestExtras({});

    it('requests OpenRouter usage accounting so the response includes cost', () => {
      expect(extras(llm)).toEqual({ usage: { include: true } });
    });
  });
});
