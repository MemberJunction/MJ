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

import { LlamaCppLLM, DEFAULT_LLAMA_CPP_URL } from '../models/llama-cpp';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('LlamaCppLLM', () => {
  let llm: LlamaCppLLM;

  beforeEach(() => {
    vi.clearAllMocks();
    llm = new LlamaCppLLM();
  });

  /* ---- Constants ---- */
  describe('DEFAULT_LLAMA_CPP_URL', () => {
    it('should point at the stock llama-server port and /v1 path', () => {
      expect(DEFAULT_LLAMA_CPP_URL).toBe('http://localhost:8080/v1');
    });
  });

  /* ---- Constructor ---- */
  describe('constructor', () => {
    it('should create an instance without arguments', () => {
      expect(llm).toBeInstanceOf(LlamaCppLLM);
    });

    it('should default base URL to the local llama-server endpoint', () => {
      expect((llm as unknown as Record<string, unknown>)['_baseUrl']).toBe(DEFAULT_LLAMA_CPP_URL);
    });

    it('should use a placeholder API key when none is provided', () => {
      expect((llm as unknown as Record<string, unknown>)['_apiKey']).toBe('llama-cpp-no-auth');
    });

    it('should use a placeholder API key when an empty string is provided', () => {
      const instance = new LlamaCppLLM('');
      expect((instance as unknown as Record<string, unknown>)['_apiKey']).toBe('llama-cpp-no-auth');
    });

    it('should forward a caller-supplied API key (for --api-key llama-server mode)', () => {
      const instance = new LlamaCppLLM('secret-token');
      expect((instance as unknown as Record<string, unknown>)['_apiKey']).toBe('secret-token');
    });

    it('should accept a custom base URL', () => {
      const instance = new LlamaCppLLM(undefined, 'http://192.168.1.10:8000/v1');
      expect((instance as unknown as Record<string, unknown>)['_baseUrl']).toBe('http://192.168.1.10:8000/v1');
    });

    it('should fall back to the default base URL when an empty string is provided', () => {
      const instance = new LlamaCppLLM('key', '');
      expect((instance as unknown as Record<string, unknown>)['_baseUrl']).toBe(DEFAULT_LLAMA_CPP_URL);
    });

    it('should accept both a custom key and custom URL together', () => {
      const instance = new LlamaCppLLM('my-key', 'http://remote-host:9090/v1');
      expect((instance as unknown as Record<string, unknown>)['_apiKey']).toBe('my-key');
      expect((instance as unknown as Record<string, unknown>)['_baseUrl']).toBe('http://remote-host:9090/v1');
    });
  });

  /* ---- Inheritance ---- */
  describe('inheritance', () => {
    it('should inherit SupportsStreaming from OpenAILLM', () => {
      expect(llm.SupportsStreaming).toBe(true);
    });
  });
});
