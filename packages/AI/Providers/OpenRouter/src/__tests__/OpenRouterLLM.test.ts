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

  /* ---- Ordered model preference ---- */
  describe('model preference', () => {
    // OpenRouter walks `models` in order on ANY error from the one before —
    // downtime, rate limiting, moderation, context-length validation — and bills
    // for whichever model actually answered. That makes a standing preference
    // expressible without pinning: prefer these, fall through to the rest.
    const ENV = 'MJ_OPENROUTER_MODEL_PREFERENCE';
    const withPreference = (
      value: string | undefined,
      params: Record<string, unknown>
    ): Record<string, unknown> => {
      const had = Object.prototype.hasOwnProperty.call(process.env, ENV);
      const previous = process.env[ENV];
      if (value === undefined) {
        delete process.env[ENV];
      } else {
        process.env[ENV] = value;
      }
      try {
        return (
          llm as unknown as {
            getProviderRequestExtras: (p: unknown) => Record<string, unknown>;
          }
        ).getProviderRequestExtras(params);
      } finally {
        // Restored in a finally so one failing expectation cannot leak an
        // environment variable into every test that runs after it.
        if (had) {
          process.env[ENV] = previous as string;
        } else {
          delete process.env[ENV];
        }
      }
    };

    it('sends nothing new when no preference is configured', () => {
      // The load-bearing default. Every existing OpenRouter caller in the fleet
      // must keep sending exactly the body it sent before.
      expect(withPreference(undefined, { model: 'anthropic/claude-3-opus' })).toEqual({
        usage: { include: true }
      });
    });

    it('treats an empty or whitespace preference as unset', () => {
      expect(withPreference('', { model: 'x' })).toEqual({ usage: { include: true } });
      expect(withPreference('   ,  , ', { model: 'x' })).toEqual({ usage: { include: true } });
    });

    it('puts the preferred models first and the caller model last', () => {
      const e = withPreference('google/gemini-3.8-flash,anthropic/claude-3-5-haiku', {
        model: 'anthropic/claude-3-opus'
      });
      expect(e.models).toEqual([
        'google/gemini-3.8-flash',
        'anthropic/claude-3-5-haiku',
        'anthropic/claude-3-opus'
      ]);
    });

    it('never drops the caller model, so a preference cannot make it unreachable', () => {
      // The caller chose that model for a reason. A preference reorders; it does
      // not veto. It also makes the context-length case degrade correctly: a
      // prompt too large for the preferred model falls through to the one it was
      // actually sized for.
      const e = withPreference('google/gemini-3.8-flash', { model: 'anthropic/claude-3-opus' });
      expect(e.models).toContain('anthropic/claude-3-opus');
      expect((e.models as string[])[(e.models as string[]).length - 1]).toBe(
        'anthropic/claude-3-opus'
      );
    });

    it('sets `model` to the head of the same list', () => {
      // Deliberate, not redundant: OpenRouter documents both `model` and `models`
      // and never states which wins when both are present. Setting them
      // consistently means the same model leads under either reading.
      const e = withPreference('google/gemini-3.8-flash,x/y', { model: 'anthropic/claude-3-opus' });
      expect(e.model).toBe('google/gemini-3.8-flash');
      expect((e.models as string[])[0]).toBe('google/gemini-3.8-flash');
    });

    it('does not walk the same model twice', () => {
      // A repeat costs a whole failed attempt before the fallback that would
      // have worked.
      const e = withPreference('google/gemini-3.8-flash,anthropic/claude-3-opus', {
        model: 'anthropic/claude-3-opus'
      });
      expect(e.models).toEqual(['google/gemini-3.8-flash', 'anthropic/claude-3-opus']);
    });

    it('tolerates padding around names', () => {
      const e = withPreference('  google/gemini-3.8-flash ,  x/y  ', { model: 'z/w' });
      expect(e.models).toEqual(['google/gemini-3.8-flash', 'x/y', 'z/w']);
    });

    it('still works when the caller named no model at all', () => {
      const e = withPreference('google/gemini-3.8-flash', {});
      expect(e.models).toEqual(['google/gemini-3.8-flash']);
      expect(e.model).toBe('google/gemini-3.8-flash');
    });

    it('keeps usage accounting alongside the preference', () => {
      // Losing this would silently break OpenRouter cost capture, which is the
      // reason this override existed in the first place.
      const e = withPreference('google/gemini-3.8-flash', { model: 'x/y' });
      expect(e.usage).toEqual({ include: true });
    });
  });
});
