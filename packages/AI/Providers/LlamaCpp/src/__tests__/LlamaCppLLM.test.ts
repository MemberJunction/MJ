import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

const readField = (instance: LlamaCppLLM, key: string): unknown =>
  (instance as unknown as Record<string, unknown>)[key];

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('LlamaCppLLM', () => {
  const envKeys = ['LLAMACPP_BASE_URL', 'LLAMACPP_HOST', 'LLAMACPP_PORT', 'LLAMACPP_API_KEY'] as const;
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    // Snapshot and clear the env vars so each test starts clean.
    for (const key of envKeys) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  /* ---- Constants ---- */
  describe('DEFAULT_LLAMA_CPP_URL', () => {
    it('should point at the stock llama-server port and /v1 path', () => {
      expect(DEFAULT_LLAMA_CPP_URL).toBe('http://localhost:8080/v1');
    });
  });

  /* ---- Constructor (no env, no args) ---- */
  describe('constructor with no args and no env', () => {
    it('should create an instance', () => {
      expect(new LlamaCppLLM()).toBeInstanceOf(LlamaCppLLM);
    });

    it('should default base URL to the local llama-server endpoint', () => {
      expect(readField(new LlamaCppLLM(), '_baseUrl')).toBe(DEFAULT_LLAMA_CPP_URL);
    });

    it('should use a placeholder API key', () => {
      expect(readField(new LlamaCppLLM(), '_apiKey')).toBe('llama-cpp-no-auth');
    });

    it('should use a placeholder API key when an empty string is provided', () => {
      expect(readField(new LlamaCppLLM(''), '_apiKey')).toBe('llama-cpp-no-auth');
    });
  });

  /* ---- Explicit constructor arguments ---- */
  describe('explicit constructor arguments', () => {
    it('should forward a caller-supplied API key', () => {
      expect(readField(new LlamaCppLLM('secret-token'), '_apiKey')).toBe('secret-token');
    });

    it('should accept a custom base URL', () => {
      const inst = new LlamaCppLLM(undefined, 'http://192.168.1.10:8000/v1');
      expect(readField(inst, '_baseUrl')).toBe('http://192.168.1.10:8000/v1');
    });

    it('should fall back to the default base URL when an empty string is provided', () => {
      const inst = new LlamaCppLLM('key', '');
      expect(readField(inst, '_baseUrl')).toBe(DEFAULT_LLAMA_CPP_URL);
    });

    it('should accept both a custom key and custom URL together', () => {
      const inst = new LlamaCppLLM('my-key', 'http://remote-host:9090/v1');
      expect(readField(inst, '_apiKey')).toBe('my-key');
      expect(readField(inst, '_baseUrl')).toBe('http://remote-host:9090/v1');
    });
  });

  /* ---- Environment variable overrides ---- */
  describe('env var overrides', () => {
    it('LLAMACPP_BASE_URL should override the default when no constructor arg is given', () => {
      process.env.LLAMACPP_BASE_URL = 'http://my-box:7000/v1';
      expect(readField(new LlamaCppLLM(), '_baseUrl')).toBe('http://my-box:7000/v1');
    });

    it('LLAMACPP_HOST alone should produce the expected URL', () => {
      process.env.LLAMACPP_HOST = 'inference.lan';
      expect(readField(new LlamaCppLLM(), '_baseUrl')).toBe('http://inference.lan:8080/v1');
    });

    it('LLAMACPP_PORT alone should produce the expected URL', () => {
      process.env.LLAMACPP_PORT = '9999';
      expect(readField(new LlamaCppLLM(), '_baseUrl')).toBe('http://localhost:9999/v1');
    });

    it('LLAMACPP_HOST and LLAMACPP_PORT together should produce the expected URL', () => {
      process.env.LLAMACPP_HOST = '10.0.0.5';
      process.env.LLAMACPP_PORT = '8000';
      expect(readField(new LlamaCppLLM(), '_baseUrl')).toBe('http://10.0.0.5:8000/v1');
    });

    it('LLAMACPP_BASE_URL should take precedence over LLAMACPP_HOST/LLAMACPP_PORT', () => {
      process.env.LLAMACPP_BASE_URL = 'http://override:1234/v1';
      process.env.LLAMACPP_HOST = 'ignored';
      process.env.LLAMACPP_PORT = '9999';
      expect(readField(new LlamaCppLLM(), '_baseUrl')).toBe('http://override:1234/v1');
    });

    it('constructor baseUrl argument should take precedence over env vars', () => {
      process.env.LLAMACPP_BASE_URL = 'http://env-url:7000/v1';
      const inst = new LlamaCppLLM(undefined, 'http://explicit:5555/v1');
      expect(readField(inst, '_baseUrl')).toBe('http://explicit:5555/v1');
    });

    it('empty env vars should be treated as unset and fall back to defaults', () => {
      process.env.LLAMACPP_BASE_URL = '';
      process.env.LLAMACPP_HOST = '';
      process.env.LLAMACPP_PORT = '';
      expect(readField(new LlamaCppLLM(), '_baseUrl')).toBe(DEFAULT_LLAMA_CPP_URL);
    });

    it('LLAMACPP_API_KEY should supply the key when no constructor arg is given', () => {
      process.env.LLAMACPP_API_KEY = 'env-secret';
      expect(readField(new LlamaCppLLM(), '_apiKey')).toBe('env-secret');
    });

    it('constructor apiKey argument should take precedence over LLAMACPP_API_KEY', () => {
      process.env.LLAMACPP_API_KEY = 'env-secret';
      expect(readField(new LlamaCppLLM('explicit-key'), '_apiKey')).toBe('explicit-key');
    });

    it('empty LLAMACPP_API_KEY should fall back to the placeholder', () => {
      process.env.LLAMACPP_API_KEY = '';
      expect(readField(new LlamaCppLLM(), '_apiKey')).toBe('llama-cpp-no-auth');
    });
  });

  /* ---- Inheritance ---- */
  describe('inheritance', () => {
    it('should inherit SupportsStreaming from OpenAILLM', () => {
      expect(new LlamaCppLLM().SupportsStreaming).toBe(true);
    });
  });
});
