import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

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
  FunctionCallingConfigMode: {
    MODE_UNSPECIFIED: 'MODE_UNSPECIFIED',
    AUTO: 'AUTO',
    ANY: 'ANY',
    NONE: 'NONE',
    VALIDATED: 'VALIDATED',
  },
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (_target: unknown) => {},
  ToJSONSafe: (v: unknown) => (v == null ? null : JSON.parse(JSON.stringify(v))),
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
  class MockBaseRealtimeModel {
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
    ChatMessageRole: { user: 'user', assistant: 'assistant', system: 'system', tool: 'tool' },
    ChatToolCall: class {},
    CHAT_FINISH_REASON_TOOL_CALLS: 'tool_calls',
    ErrorAnalyzer: { analyzeError: vi.fn().mockReturnValue({ category: 'unknown' }) },
    BaseImageGenerator: MockBaseImageGenerator,
    ImageGenerationParams: class {},
    ImageGenerationResult: class {},
    ImageEditParams: class {},
    ImageVariationParams: class {},
    ImageModelInfo: class {},
    GeneratedImage: MockGeneratedImage,
    BaseRealtimeModel: MockBaseRealtimeModel,
    BaseEmbeddings: class {},
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

    it('should return 0 only for effort 1 on Flash models (minimal)', () => {
      expect(callGetThinkingBudget(1, 'gemini-2.5-flash')).toBe(0);
      // effort 2 falls into the LOW band (1024-4096) — no longer disabled
      const lowBudget = callGetThinkingBudget(2, 'gemini-2.5-flash');
      expect(lowBudget).toBeGreaterThanOrEqual(1024);
      expect(lowBudget).toBeLessThanOrEqual(4096);
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

    it('should map a data-URL image alongside text into an inlineData part and a text part', () => {
      // Regression: the bug was that an image_url block was sent as a TEXT string of its data URL,
      // so vision models never received an actual image. The data URL must become inlineData with
      // the base64 stripped of its "data:...;base64," prefix.
      const content = [
        { type: 'text', content: 'what is this?' },
        { type: 'image_url', content: 'data:image/jpeg;base64,QUJD' },
      ];
      const parts = GeminiLLM.MapMJContentToGeminiParts(content as never);
      expect(parts).toHaveLength(2);
      expect(parts[0]).toEqual({ text: 'what is this?' });
      expect(parts[1]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } });
    });

    it('should map an http(s) image_url to a fileData part', () => {
      const content = [
        { type: 'image_url', content: 'https://example.com/cat.png' },
      ];
      const parts = GeminiLLM.MapMJContentToGeminiParts(content as never);
      expect(parts).toHaveLength(1);
      expect(parts[0]).toEqual({
        fileData: { fileUri: 'https://example.com/cat.png', mimeType: 'image/png' },
      });
    });

    it('should honor an explicit mimeType on an http(s) image_url fileData part', () => {
      const content = [
        { type: 'image_url', content: 'https://example.com/photo', mimeType: 'image/webp' },
      ];
      const parts = GeminiLLM.MapMJContentToGeminiParts(content as never);
      expect(parts[0]).toEqual({
        fileData: { fileUri: 'https://example.com/photo', mimeType: 'image/webp' },
      });
    });

    it('should keep a plain-string content as a single text part (no behavior change)', () => {
      const parts = GeminiLLM.MapMJContentToGeminiParts('just text');
      expect(parts).toHaveLength(1);
      expect(parts[0]).toEqual({ text: 'just text' });
    });
  });

  /* ---- mjContentToSystemInstructionText (private, static) ---- */
  describe('mjContentToSystemInstructionText', () => {
    const callSysText = (content: unknown): string => {
      const fn = (GeminiLLM as unknown as Record<string, (c: unknown) => string>)['mjContentToSystemInstructionText'];
      return fn(content);
    };

    it('returns a plain string unchanged', () => {
      expect(callSysText('Be a helpful assistant')).toBe('Be a helpful assistant');
    });

    it('joins only text blocks and skips media blocks (no base64 blob in the system instruction)', () => {
      const content = [
        { type: 'text', content: 'You are a vision agent.' },
        { type: 'image_url', content: 'data:image/png;base64,QUJD' },
        { type: 'text', content: 'Describe images carefully.' },
      ];
      const text = callSysText(content);
      expect(text).toBe('You are a vision agent.\nDescribe images carefully.');
      expect(text).not.toContain('QUJD');
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

  /* ---- processStreamingChunk (protected) ---- */
  describe('processStreamingChunk', () => {
    type StreamChunk = {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
        finishReason?: string;
      }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    type StreamResult = { content: string; finishReason?: string; usage?: unknown };

    const callProcessStreamingChunk = (chunk: StreamChunk): StreamResult => {
      const fn = (llm as unknown as Record<string, (c: StreamChunk) => StreamResult>)['processStreamingChunk']
        .bind(llm);
      return fn(chunk);
    };

    const resetState = () => {
      const reset = (llm as unknown as Record<string, () => void>)['resetStreamingState'].bind(llm);
      reset();
    };

    beforeEach(() => {
      resetState();
    });

    it('extracts text from new-SDK content.parts shape', () => {
      // Regression: legacy code accessed content[0].parts (array shape from
      // @google/generative-ai). New SDK exposes content as an object with parts[].
      const result = callProcessStreamingChunk({
        candidates: [{ content: { parts: [{ text: 'hello world' }] } }],
      });
      expect(result.content).toBe('hello world');
    });

    it('returns empty content if chunk used the legacy content[0].parts shape', () => {
      // Construct a chunk shaped like the OLD SDK to prove we don't accidentally
      // succeed against the wrong shape. content[0] would imply content is an array.
      const legacyChunk = {
        candidates: [{
          // @ts-expect-error -- intentionally legacy shape
          content: [{ parts: [{ text: 'should-not-extract' }] }],
        }],
      } as unknown as StreamChunk;
      const result = callProcessStreamingChunk(legacyChunk);
      expect(result.content).toBe('');
    });

    it('separates thought parts from visible text parts', () => {
      const result = callProcessStreamingChunk({
        candidates: [{
          content: {
            parts: [
              { text: 'reasoning summary', thought: true },
              { text: 'visible answer' },
            ],
          },
        }],
      });
      expect(result.content).toBe('visible answer');
      // Thinking is accumulated into streaming state, not emitted in `content`
      const state = (llm as unknown as Record<string, { accumulatedThinking: string }>)['_streamingState'];
      expect(state.accumulatedThinking).toBe('reasoning summary');
    });

    it('accumulates thinking across multiple chunks without emitting content', () => {
      callProcessStreamingChunk({
        candidates: [{ content: { parts: [{ text: 'step 1 ', thought: true }] } }],
      });
      const second = callProcessStreamingChunk({
        candidates: [{ content: { parts: [{ text: 'step 2', thought: true }] } }],
      });
      expect(second.content).toBe('');
      const state = (llm as unknown as Record<string, { accumulatedThinking: string }>)['_streamingState'];
      expect(state.accumulatedThinking).toBe('step 1 step 2');
    });

    it('returns finishReason when present on the candidate', () => {
      const result = callProcessStreamingChunk({
        candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }],
      });
      expect(result.finishReason).toBe('STOP');
    });

    it('returns usage when usageMetadata is on the chunk', () => {
      const result = callProcessStreamingChunk({
        candidates: [{ content: { parts: [{ text: 'x' }] } }],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 34 },
      });
      expect(result.usage).toBeDefined();
      expect((result.usage as { promptTokens: number }).promptTokens).toBe(12);
      expect((result.usage as { completionTokens: number }).completionTokens).toBe(34);
    });

    it('handles chunks with no candidates without throwing', () => {
      const result = callProcessStreamingChunk({});
      expect(result.content).toBe('');
      expect(result.finishReason).toBeUndefined();
    });
  });

  /* ---- cancellation (ChatParams.cancellationToken) ---- */
  describe('cancellation', () => {
    type ChatMocks = { sendMessage: Mock; sendMessageStream: Mock };
    type ChatResultLike = { success: boolean; statusText: string; errorMessage: string | null; exception: unknown };

    let chatMocks: ChatMocks;

    beforeEach(() => {
      // Inject a client stub directly — the module-level GoogleGenAI mock uses an arrow
      // implementation, which cannot be `new`-ed by createClient().
      chatMocks = { sendMessage: vi.fn(), sendMessageStream: vi.fn() };
      const client = { chats: { create: vi.fn().mockReturnValue(chatMocks) } };
      (llm as unknown as Record<string, unknown>)['_gemini'] = client;
    });

    const getChatMocks = async (): Promise<ChatMocks> => chatMocks;

    const buildParams = (token?: AbortSignal) => ({
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'hello' }],
      cancellationToken: token,
    });

    const callNonStreaming = (token?: AbortSignal): Promise<ChatResultLike> => {
      const fn = (llm as unknown as Record<string, (p: unknown) => Promise<ChatResultLike>>)['nonStreamingChatCompletion'].bind(llm);
      return fn(buildParams(token));
    };

    const callCreateStream = (token?: AbortSignal): Promise<unknown> => {
      const fn = (llm as unknown as Record<string, (p: unknown) => Promise<unknown>>)['createStreamingRequest'].bind(llm);
      return fn(buildParams(token));
    };

    const okResponse = {
      candidates: [{ content: { parts: [{ text: 'hi' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2 },
    };

    it('forwards the token to @google/genai as config.abortSignal (non-streaming)', async () => {
      const controller = new AbortController();
      const mocks = await getChatMocks();
      mocks.sendMessage.mockResolvedValue(okResponse);

      await callNonStreaming(controller.signal);

      const config = mocks.sendMessage.mock.calls[0][0].config as Record<string, unknown>;
      expect(config.abortSignal).toBe(controller.signal);
    });

    it('does not set abortSignal when no token is supplied', async () => {
      const mocks = await getChatMocks();
      mocks.sendMessage.mockResolvedValue(okResponse);

      await callNonStreaming(undefined);

      const config = mocks.sendMessage.mock.calls[0][0].config as Record<string, unknown>;
      expect(config.abortSignal).toBeUndefined();
    });

    it('forwards the token to @google/genai as config.abortSignal (streaming)', async () => {
      const controller = new AbortController();
      const mocks = await getChatMocks();
      mocks.sendMessageStream.mockResolvedValue({});

      await callCreateStream(controller.signal);

      const config = mocks.sendMessageStream.mock.calls[0][0].config as Record<string, unknown>;
      expect(config.abortSignal).toBe(controller.signal);
    });

    it('returns a cancelled ChatResult without calling the SDK when pre-aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      const mocks = await getChatMocks();

      const result = await callNonStreaming(controller.signal);

      expect(mocks.sendMessage).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.statusText).toBe('Cancelled');
    });

    it('maps a mid-flight AbortError to a cancelled ChatResult (not a generic error)', async () => {
      const controller = new AbortController();
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      const mocks = await getChatMocks();
      mocks.sendMessage.mockRejectedValue(abortError);

      const result = await callNonStreaming(controller.signal);

      expect(result.success).toBe(false);
      expect(result.statusText).toBe('Cancelled');
      expect(result.exception).toBe(abortError);
    });

    it('still reports non-cancellation failures as normal errors', async () => {
      const mocks = await getChatMocks();
      mocks.sendMessage.mockRejectedValue(new Error('boom'));

      const result = await callNonStreaming(undefined);

      expect(result.success).toBe(false);
      expect(result.statusText).toBe('boom');
    });

    it('finalizeStreamingResponse reports cancellation when the stream was aborted mid-flight', () => {
      const controller = new AbortController();
      (llm as unknown as Record<string, AbortSignal | null>)['_streamingCancellationToken'] = controller.signal;
      controller.abort();

      const fn = (llm as unknown as Record<string, (...a: unknown[]) => ChatResultLike>)['finalizeStreamingResponse'].bind(llm);
      const result = fn('partial text', null, null);

      expect(result.success).toBe(false);
      expect(result.statusText).toBe('Cancelled');
    });
  });
});

// =============================================================================
// Native tool calling — request mapping + response normalization (plan §5)
// =============================================================================

describe('GeminiLLM — native tool calling', () => {
  let llm: GeminiLLM;
  let sendMessage: Mock;

  const WEATHER_TOOL = {
    name: 'get_weather',
    description: 'Call this when the user asks about weather.',
    inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] }
  };

  /** Invokes the protected driver entry point the way the base class would. */
  const run = async (params: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const fn = (llm as unknown as Record<string, (p: unknown) => Promise<Record<string, unknown>>>)['nonStreamingChatCompletion'].bind(llm);
    return fn({ model: 'gemini-2.5-flash', ...params });
  };

  /** The per-request config the driver handed the SDK. */
  const sentConfig = (): Record<string, unknown> => sendMessage.mock.calls[0][0].config as Record<string, unknown>;

  /** The history the driver handed chats.create(). */
  let create: Mock;
  const sentHistory = (): Array<Record<string, unknown>> => create.mock.calls[0][0].history;

  /**
   * The parts of the CURRENT turn. Gemini splits the conversation: everything but the last turn is
   * `history`, and the last turn rides as `message` — so a trailing tool result lands here.
   */
  const sentMessageParts = (): Array<Record<string, unknown>> => sendMessage.mock.calls[0][0].message;

  beforeEach(() => {
    llm = new GeminiLLM('test-gemini-key');
    sendMessage = vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text: 'hi' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2 }
    });
    create = vi.fn().mockReturnValue({ sendMessage, sendMessageStream: vi.fn() });
    (llm as unknown as Record<string, unknown>)['_gemini'] = { chats: { create } };
  });

  it('declares SupportsTools', () => {
    expect(llm.SupportsTools).toBe(true);
  });

  describe('request mapping', () => {
    it('maps tool declarations onto functionDeclarations using parametersJsonSchema', async () => {
      await run({ messages: [{ role: 'user', content: 'weather?' }], tools: [WEATHER_TOOL] });

      expect(sentConfig().tools).toEqual([{
        functionDeclarations: [{
          name: 'get_weather',
          description: 'Call this when the user asks about weather.',
          parametersJsonSchema: WEATHER_TOOL.inputSchema
        }]
      }]);
    });

    it('sends no tool fields when the caller declares none', async () => {
      await run({ messages: [{ role: 'user', content: 'hi' }] });

      expect(sentConfig().tools).toBeUndefined();
      expect(sentConfig().toolConfig).toBeUndefined();
    });

    it.each([
      ['auto', 'AUTO'],
      ['none', 'NONE'],
      ['required', 'ANY']
    ])("maps toolChoice '%s' onto functionCallingConfig mode %s", async (choice, mode) => {
      await run({ messages: [{ role: 'user', content: 'x' }], tools: [WEATHER_TOOL], toolChoice: choice });

      expect(sentConfig().toolConfig).toEqual({ functionCallingConfig: { mode } });
    });

    it('maps a named tool choice onto ANY restricted to that name', async () => {
      await run({ messages: [{ role: 'user', content: 'x' }], tools: [WEATHER_TOOL], toolChoice: { name: 'get_weather' } });

      expect(sentConfig().toolConfig).toEqual({
        functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['get_weather'] }
      });
    });
  });

  describe('conversation round-tripping (§5.3)', () => {
    it('replays a prior assistant turn as functionCall parts on a model turn', async () => {
      await run({
        messages: [
          { role: 'user', content: 'weather?' },
          { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'get_weather', arguments: { city: 'NYC' } }] },
          { role: 'tool', content: [{ type: 'tool_result', content: '72F', toolCallId: 'call_1', toolName: 'get_weather' }] }
        ],
        tools: [WEATHER_TOOL]
      });

      const modelTurn = sentHistory()[1];
      expect(modelTurn.role).toBe('model');
      // A synthesized call carries no signature, so the documented placeholder goes out.
      expect(modelTurn.parts).toEqual([{ functionCall: { id: 'call_1', name: 'get_weather', args: { city: 'NYC' } }, thoughtSignature: 'skip_thought_signature_validator' }]);
    });

    it('replays the thought signature the model attached to its own call', async () => {
      await run({
        messages: [
          { role: 'user', content: 'weather?' },
          { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'get_weather', arguments: { city: 'NYC' }, providerMetadata: { thoughtSignature: 'sig-abc' } }] },
          { role: 'tool', content: [{ type: 'tool_result', content: '72F', toolCallId: 'call_1', toolName: 'get_weather' }] }
        ],
        tools: [WEATHER_TOOL]
      });
      const modelTurn = sentHistory()[1];
      expect(modelTurn.parts).toEqual([{ functionCall: { id: 'call_1', name: 'get_weather', args: { city: 'NYC' } }, thoughtSignature: 'sig-abc' }]);
    });

    it('sends a tool result as a functionResponse part with the output key', async () => {
      await run({
        messages: [
          { role: 'user', content: 'weather?' },
          { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'get_weather', arguments: {} }] },
          { role: 'tool', content: [{ type: 'tool_result', content: '72F', toolCallId: 'call_1', toolName: 'get_weather' }] }
        ],
        tools: [WEATHER_TOOL]
      });

      // The tool result is the latest turn, so it rides as the message rather than in history.
      expect(sentMessageParts()).toEqual([
        { functionResponse: { id: 'call_1', name: 'get_weather', response: { output: '72F' } } }
      ]);
    });

    it('uses the error key for a failed tool result', async () => {
      await run({
        messages: [
          { role: 'user', content: 'weather?' },
          { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'get_weather', arguments: {} }] },
          { role: 'tool', content: [{ type: 'tool_result', content: 'boom', toolCallId: 'call_1', toolName: 'get_weather', isError: true }] }
        ],
        tools: [WEATHER_TOOL]
      });

      expect(sentMessageParts()).toEqual([
        { functionResponse: { id: 'call_1', name: 'get_weather', response: { error: 'boom' } } }
      ]);
    });

    it('drops the empty text part on a pure tool-call turn — Gemini rejects empty parts', async () => {
      await run({
        messages: [
          { role: 'user', content: 'weather?' },
          { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'get_weather', arguments: {} }] },
          { role: 'user', content: 'thanks' }
        ],
        tools: [WEATHER_TOOL]
      });

      expect(sentHistory()[1].parts).toEqual([{ functionCall: { id: 'call_1', name: 'get_weather', args: {} }, thoughtSignature: 'skip_thought_signature_validator' }]);
    });

    it('keeps prose alongside the functionCall when the model produced both', async () => {
      await run({
        messages: [
          { role: 'user', content: 'weather?' },
          { role: 'assistant', content: 'Let me check.', toolCalls: [{ id: 'call_1', name: 'get_weather', arguments: {} }] },
          { role: 'user', content: 'thanks' }
        ],
        tools: [WEATHER_TOOL]
      });

      expect(sentHistory()[1].parts).toEqual([
        { text: 'Let me check.' },
        { functionCall: { id: 'call_1', name: 'get_weather', args: {} }, thoughtSignature: 'skip_thought_signature_validator' }
      ]);
    });
  });

  describe('response normalization (§5.2)', () => {
    it('normalizes functionCall parts into toolCalls', async () => {
      sendMessage.mockResolvedValue({
        candidates: [{ content: { parts: [{ functionCall: { id: 'call_1', name: 'get_weather', args: { city: 'NYC' } }, thoughtSignature: 'sig-from-model' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2 }
      });

      const result = await run({ messages: [{ role: 'user', content: 'x' }], tools: [WEATHER_TOOL] });

      // The model's thought signature rides on the call so a replay can send it back.
      expect(result.data.choices[0].message.toolCalls).toEqual([
        { id: 'call_1', name: 'get_weather', arguments: { city: 'NYC' }, providerMetadata: { thoughtSignature: 'sig-from-model' } }
      ]);
      expect(result.data.choices[0].finish_reason).toBe('tool_calls');
    });

    it('does NOT report "no output received" for a text-free tool-call turn', async () => {
      // The regression this guards: a pure tool call has no text, and the empty-output guard used
      // to treat that as a failed generation and throw.
      sendMessage.mockResolvedValue({
        candidates: [{ content: { parts: [{ functionCall: { name: 'get_weather', args: {} } }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2 }
      });

      const result = await run({ messages: [{ role: 'user', content: 'x' }], tools: [WEATHER_TOOL] });

      expect(result.success).toBe(true);
      expect(result.data.choices[0].message.toolCalls).toHaveLength(1);
    });

    it('synthesizes a stable id when Gemini omits one', async () => {
      sendMessage.mockResolvedValue({
        candidates: [{ content: { parts: [
          { functionCall: { name: 'get_weather', args: {} } },
          { functionCall: { name: 'get_time', args: {} } }
        ] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2 }
      });

      const result = await run({ messages: [{ role: 'user', content: 'x' }], tools: [WEATHER_TOOL] });

      expect(result.data.choices[0].message.toolCalls.map((c: { id: string }) => c.id))
        .toEqual(['get_weather_0', 'get_time_1']);
    });

    it('still fails when the model returned neither text nor a tool call', async () => {
      sendMessage.mockResolvedValue({
        candidates: [{ content: { parts: [] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0 }
      });

      const result = await run({ messages: [{ role: 'user', content: 'x' }] });

      expect(result.success).toBe(false);
      expect(String(result.errorMessage)).toContain('No output received from model');
    });

    it('leaves toolCalls undefined and finish_reason untouched on an ordinary turn', async () => {
      const result = await run({ messages: [{ role: 'user', content: 'x' }] });

      expect(result.data.choices[0].message.toolCalls).toBeUndefined();
      expect(result.data.choices[0].finish_reason).toBe('STOP');
    });
  });
});
