import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks – must be declared before any import that pulls     */
/*  the module under test.                                            */
/* ------------------------------------------------------------------ */
const mockAxiosPost = vi.hoisted(() => vi.fn());
const mockAxiosIsAxiosError = vi.hoisted(() => vi.fn().mockReturnValue(false));

vi.mock('axios', () => ({
  default: {
    post: mockAxiosPost,
    isAxiosError: mockAxiosIsAxiosError,
  },
  isAxiosError: mockAxiosIsAxiosError,
}));

vi.mock('../config', () => ({
  BETTY_BOT_BASE_URL: 'https://betty-api.test.co/',
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (_target: unknown) => {},
}));

vi.mock('@memberjunction/ai', () => {
  class MockBaseLLM {
    protected _additionalSettings: Record<string, unknown> = {};
    constructor(_apiKey: string) {}
    get SupportsStreaming() { return false; }
  }
  class MockChatResult {
    success: boolean;
    statusText: string;
    data: unknown;
    errorMessage: string | null;
    exception: unknown;
    errorInfo: unknown;
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
    ModelUsage: MockModelUsage,
    ChatMessageRole: { user: 'user', assistant: 'assistant', system: 'system' },
    ErrorAnalyzer: { analyzeError: vi.fn().mockReturnValue({ category: 'unknown' }) },
    ChatParams: class {},
    ClassifyParams: class {},
    ClassifyResult: class {},
    SummarizeParams: class {},
    SummarizeResult: class {},
  };
});

vi.mock('env-var', () => ({
  default: {
    get: () => ({
      default: () => ({ asString: () => 'https://betty-api.test.co/' }),
      asString: () => 'https://betty-api.test.co/',
    }),
  },
}));

import { BettyBotLLM } from '../models/BettyBotLLM';
import { ChatMessageRole } from '@memberjunction/ai';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('BettyBotLLM', () => {
  let llm: BettyBotLLM;

  beforeEach(() => {
    vi.clearAllMocks();
    llm = new BettyBotLLM('test-api-key');
  });

  /* ---- Constructor ---- */
  describe('constructor', () => {
    it('should create an instance with the provided API key', () => {
      expect(llm).toBeInstanceOf(BettyBotLLM);
    });

    it('should initialize JWTToken as empty string', () => {
      // The JWT starts empty; GetJWTToken fetches a fresh one
      expect((llm as unknown as Record<string, unknown>)['JWTToken']).toBe('');
    });

    it('should initialize TokenExpiration as a Date', () => {
      expect((llm as unknown as Record<string, unknown>)['TokenExpiration']).toBeInstanceOf(Date);
    });
  });

  /* ---- SupportsStreaming ---- */
  describe('SupportsStreaming', () => {
    it('should return false', () => {
      expect(llm.SupportsStreaming).toBe(false);
    });
  });

  /* ---- GetJWTToken ---- */
  describe('GetJWTToken', () => {
    it('should call settings endpoint and return token on success', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          status: 'SUCCESS',
          errorMessage: '',
          enabledFeatures: [],
          token: 'jwt-123',
        },
      });

      const result = await llm.GetJWTToken();
      expect(result).not.toBeNull();
      expect(result!.status).toBe('SUCCESS');
      expect(result!.token).toBe('jwt-123');
      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://betty-api.test.co/settings',
        { token: 'test-api-key' },
      );
    });

    it('should return cached token if still valid', async () => {
      // First call – fetches the token
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          status: 'SUCCESS',
          errorMessage: '',
          enabledFeatures: [],
          token: 'jwt-cached',
        },
      });
      await llm.GetJWTToken();

      // Second call should use cached token (no second axios call)
      const result = await llm.GetJWTToken();
      expect(result).not.toBeNull();
      expect(result!.token).toBe('jwt-cached');
      expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    });

    it('should force-refresh token when forceRefresh is true', async () => {
      mockAxiosPost
        .mockResolvedValueOnce({
          data: { status: 'SUCCESS', errorMessage: '', enabledFeatures: [], token: 'jwt-1' },
        })
        .mockResolvedValueOnce({
          data: { status: 'SUCCESS', errorMessage: '', enabledFeatures: [], token: 'jwt-2' },
        });

      await llm.GetJWTToken();
      const result = await llm.GetJWTToken(true);
      expect(result!.token).toBe('jwt-2');
      expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    });

    it('should return null when axios throws', async () => {
      mockAxiosPost.mockRejectedValueOnce(new Error('network error'));
      const result = await llm.GetJWTToken();
      expect(result).toBeNull();
    });
  });

  /* ---- nonStreamingChatCompletion (via ChatCompletion) ---- */
  describe('nonStreamingChatCompletion', () => {
    it('should return error result when no user message is present', async () => {
      // First mock JWT call
      mockAxiosPost.mockResolvedValueOnce({
        data: { status: 'SUCCESS', errorMessage: '', enabledFeatures: [], token: 'jwt' },
      });

      const params = {
        messages: [{ role: ChatMessageRole.system, content: 'system prompt' }],
        model: 'betty',
      };

      // Access the protected method
      const result = await (llm as unknown as { nonStreamingChatCompletion: (p: unknown) => Promise<unknown> })
        .nonStreamingChatCompletion(params);
      const chatResult = result as Record<string, unknown>;
      expect(chatResult.success).toBe(false);
      expect(chatResult.errorMessage).toBe('No user message found in params');
    });

    it('should return error result when JWT retrieval fails', async () => {
      mockAxiosPost.mockRejectedValueOnce(new Error('jwt fail'));

      const params = {
        messages: [{ role: ChatMessageRole.user, content: 'hello' }],
        model: 'betty',
      };

      const result = await (llm as unknown as { nonStreamingChatCompletion: (p: unknown) => Promise<unknown> })
        .nonStreamingChatCompletion(params);
      const chatResult = result as Record<string, unknown>;
      expect(chatResult.success).toBe(false);
    });

    it('should return successful result with response data', async () => {
      // JWT call
      mockAxiosPost.mockResolvedValueOnce({
        data: { status: 'SUCCESS', errorMessage: '', enabledFeatures: [], token: 'jwt' },
      });
      // Betty response call
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          status: 'ok',
          errorMessage: '',
          conversationId: 1,
          response: 'Hello from Betty!',
          references: [],
        },
      });

      const params = {
        messages: [{ role: ChatMessageRole.user, content: 'hi' }],
        model: 'betty',
      };

      const result = await (llm as unknown as { nonStreamingChatCompletion: (p: unknown) => Promise<unknown> })
        .nonStreamingChatCompletion(params);
      const chatResult = result as Record<string, unknown>;
      expect(chatResult.success).toBe(true);
      expect(chatResult.statusText).toBe('OK');
      const data = chatResult.data as { choices: Array<{ message: { content: string } }> };
      expect(data.choices[0].message.content).toBe('Hello from Betty!');
    });

    it('should include references as additional choices', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: { status: 'SUCCESS', errorMessage: '', enabledFeatures: [], token: 'jwt' },
      });
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          status: 'ok',
          errorMessage: '',
          conversationId: 1,
          response: 'Here is info',
          references: [
            { title: 'Doc 1', link: 'https://doc1.com', type: 'article' },
            { title: 'Doc 2', link: 'https://doc2.com', type: 'article' },
          ],
        },
      });

      const params = {
        messages: [{ role: ChatMessageRole.user, content: 'question' }],
        model: 'betty',
      };

      const result = await (llm as unknown as { nonStreamingChatCompletion: (p: unknown) => Promise<unknown> })
        .nonStreamingChatCompletion(params);
      const chatResult = result as Record<string, unknown>;
      const data = chatResult.data as { choices: Array<{ message: { content: string }; finish_reason: string }> };
      expect(data.choices).toHaveLength(3);
      expect(data.choices[1].message.content).toContain('Doc 1');
      expect(data.choices[2].finish_reason).toBe('references_json');
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
