import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { ApiError } from '@google/genai';

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
  ThinkingLevel: {
    THINKING_LEVEL_UNSPECIFIED: 'THINKING_LEVEL_UNSPECIFIED',
    MINIMAL: 'MINIMAL',
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
  },
  // Shaped like the SDK's ApiError: an Error carrying the HTTP status.
  ApiError: class extends Error {
    status: number;
    constructor(options: { message: string; status: number }) { super(options.message); this.status = options.status; }
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
    // Cancellation itself is covered against the real BaseLLM in GeminiLLM.cancellation.test.ts.
    protected IsCancellationError(_error: unknown, signal?: AbortSignal | null): boolean { return signal?.aborted === true; }
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

import { ChatParams } from '@memberjunction/ai';
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

    it('still reports non-cancellation failures as normal errors', async () => {
      const mocks = await getChatMocks();
      mocks.sendMessage.mockRejectedValue(new Error('boom'));

      const result = await callNonStreaming(undefined);

      expect(result.success).toBe(false);
      expect(result.statusText).toBe('boom');
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

    it('replays a signature minted here — same endpoint and model', async () => {
      await run({
        messages: [
          { role: 'user', content: 'weather?' },
          { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'get_weather', arguments: {}, providerMetadata: { thoughtSignature: 'sig-here', thoughtSignatureOrigin: 'gemini-api:gemini-2.5-flash' } }] },
          { role: 'user', content: 'thanks' }
        ],
        tools: [WEATHER_TOOL]
      });
      expect(sentHistory()[1].parts).toEqual([{ functionCall: { id: 'call_1', name: 'get_weather', args: {} }, thoughtSignature: 'sig-here' }]);
    });

    it('swaps in the placeholder for a signature minted by Vertex AI (failover) — AI Studio rejects it as corrupted', async () => {
      await run({
        messages: [
          { role: 'user', content: 'weather?' },
          { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'get_weather', arguments: {}, providerMetadata: { thoughtSignature: 'sig-vertex', thoughtSignatureOrigin: 'vertex:gemini-2.5-flash' } }] },
          { role: 'user', content: 'thanks' }
        ],
        tools: [WEATHER_TOOL]
      });
      expect(sentHistory()[1].parts).toEqual([{ functionCall: { id: 'call_1', name: 'get_weather', args: {} }, thoughtSignature: 'skip_thought_signature_validator' }]);
    });

    it('swaps in the placeholder for a signature minted by another model', async () => {
      await run({
        messages: [
          { role: 'user', content: 'weather?' },
          { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'get_weather', arguments: {}, providerMetadata: { thoughtSignature: 'sig-other', thoughtSignatureOrigin: 'gemini-api:gemini-3-pro' } }] },
          { role: 'user', content: 'thanks' }
        ],
        tools: [WEATHER_TOOL]
      });
      expect(sentHistory()[1].parts[0].thoughtSignature).toBe('skip_thought_signature_validator');
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
        { id: 'call_1', name: 'get_weather', arguments: { city: 'NYC' }, providerMetadata: { thoughtSignature: 'sig-from-model', thoughtSignatureOrigin: 'gemini-api:gemini-2.5-flash' } }
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

  describe('parameter fidelity', () => {
    /** A typed chat request; `ChatParams` is mocked, so the instance carries only what is given. */
    const chatParams = (fields: Partial<ChatParams>): ChatParams => Object.assign(new ChatParams(), fields);

    it('sends maxOutputTokens and seed when configured, and describes exactly that', async () => {
      await run({ messages: [{ role: 'user', content: 'x' }], temperature: 0, maxOutputTokens: 256, seed: 42 });
      expect(sentConfig()).toMatchObject({ temperature: 0, maxOutputTokens: 256, seed: 42 });
      expect(llm.DescribeSentParameters(chatParams({ model: 'gemini-2.5-flash', messages: [], temperature: 0, maxOutputTokens: 256, seed: 42 })))
        .toEqual({ VendorModelName: 'gemini-2.5-flash', Temperature: 0, MaxTokens: 256, Seed: 42 });
    });

    it('sends and describes no max tokens or seed when none is configured', async () => {
      await run({ messages: [{ role: 'user', content: 'x' }] });
      expect(sentConfig()).not.toHaveProperty('maxOutputTokens');
      expect(sentConfig()).not.toHaveProperty('seed');
      expect(llm.DescribeSentParameters(chatParams({ model: 'gemini-2.5-flash', messages: [] })))
        .toEqual({ VendorModelName: 'gemini-2.5-flash', Temperature: 0.5, MaxTokens: null, Seed: null });
    });

    it('describes no temperature for a model that takes none, so a strict call refuses a configured 0', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await run({ model: 'gemini-3.8-flash', messages: [{ role: 'user', content: 'x' }], temperature: 0 });
      expect(sentConfig()).not.toHaveProperty('temperature');
      expect(llm.DescribeSentParameters(chatParams({ model: 'gemini-3.8-flash', messages: [], temperature: 0 })))
        .toEqual({ VendorModelName: 'gemini-3.8-flash', Temperature: null, MaxTokens: null, Seed: null });
      warn.mockRestore();
    });

    it('describes a model-specific response format that overrides the sampling, as the request sends it', async () => {
      const overriding: Partial<ChatParams> = { model: 'gemini-2.5-flash', temperature: 0.2, responseFormat: 'ModelSpecific', modelSpecificResponseFormat: { temperature: 0.9, maxOutputTokens: 64 } };
      await run({ messages: [{ role: 'user', content: 'x' }], ...overriding });
      expect(sentConfig()).toMatchObject({ temperature: 0.9, maxOutputTokens: 64 });
      expect(llm.DescribeSentParameters(chatParams({ messages: [], ...overriding })))
        .toEqual({ VendorModelName: 'gemini-2.5-flash', Temperature: 0.9, MaxTokens: 64, Seed: null });
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Generation config by model version                                */
/*  Google is retiring temperature/topP/topK (ignored since Gemini    */
/*  3.6, rejected by upcoming models) and thinkingBudget.             */
/* ------------------------------------------------------------------ */
/** The parts of a ChatResult these tests read; @memberjunction/ai is mocked in this file. */
interface ChatResultShape {
  success: boolean;
  errorMessage?: string;
  data: {
    usage: Record<string, number>;
    choices: Array<{ message: { content: string; thinking?: string } }>;
  };
}

describe('GeminiLLM — generation config by model version', () => {
  let llm: GeminiLLM;
  let sendMessage: Mock;
  let sendMessageStream: Mock;
  let create: Mock;
  let warn: ReturnType<typeof vi.spyOn>;

  const run = async (params: Record<string, unknown>): Promise<ChatResultShape> => {
    const fn = (llm as unknown as Record<string, (p: unknown) => Promise<unknown>>)['nonStreamingChatCompletion'].bind(llm);
    return await fn({ messages: [{ role: 'user', content: 'hi' }], ...params }) as ChatResultShape;
  };

  const runStreaming = async (params: Record<string, unknown>): Promise<void> => {
    const fn = (llm as unknown as Record<string, (p: unknown) => Promise<unknown>>)['createStreamingRequest'].bind(llm);
    await fn({ messages: [{ role: 'user', content: 'hi' }], ...params });
  };

  /**
   * The per-request config handed to sendMessage. @google/genai uses it INSTEAD of the session
   * config (`params.config ?? this.config`), so this is exactly what goes on the wire.
   */
  const requestConfig = (): Record<string, unknown> => sendMessage.mock.calls[0][0].config as Record<string, unknown>;

  beforeEach(() => {
    llm = new GeminiLLM('test-gemini-key');
    sendMessage = vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text: 'hi' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2 }
    });
    sendMessageStream = vi.fn().mockResolvedValue({});
    create = vi.fn().mockReturnValue({ sendMessage, sendMessageStream });
    (llm as unknown as Record<string, unknown>)['_gemini'] = { chats: { create } };
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // The warn-once and rejected-model sets are static (per process); clear them so each test starts clean.
    const statics = GeminiLLM as unknown as Partial<Record<'_warnedUnsupportedSampling' | '_warnedThinking' | '_thinkingReplacements', { clear(): void }>>;
    statics._warnedUnsupportedSampling?.clear();
    statics._warnedThinking?.clear();
    statics._thinkingReplacements?.clear();
  });

  afterEach(() => {
    warn.mockRestore();
  });

  describe('models before Gemini 3.6 — sampling unchanged', () => {
    it.each(['gemini-2.5-flash', 'gemini-3-pro-preview', 'gemini-3.1-pro-preview', 'gemini-3.5-flash'])(
      '%s keeps the 0.5 default temperature', async (model) => {
        await run({ model });
        expect(requestConfig().temperature).toBe(0.5);
      });

    it('keeps sampling for non-Gemini models served by this driver (Gemma on Vertex)', async () => {
      await run({ model: 'gemma-4-31b-it', temperature: 0.2, topP: 0.9 });
      expect(requestConfig()).toMatchObject({ temperature: 0.2, topP: 0.9 });
      expect(warn).not.toHaveBeenCalled();
    });

    it('sends an explicit temperature of 0 as 0 (not the 0.5 default)', async () => {
      await run({ model: 'gemini-2.5-flash', temperature: 0 });
      expect(requestConfig().temperature).toBe(0);
    });

    it('sends caller temperature / topP / topK under the SDK camelCase keys, without warning', async () => {
      await run({ model: 'gemini-3.5-flash', temperature: 0.2, topP: 0.9, topK: 40 });
      expect(requestConfig()).toMatchObject({ temperature: 0.2, topP: 0.9, topK: 40 });
      expect(requestConfig()).not.toHaveProperty('top_p');
      expect(requestConfig()).not.toHaveProperty('top_k');
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('Gemini 3.6+ and unversioned ids — no sampling fields', () => {
    it('omits temperature / topP / topK and warns once per model and field', async () => {
      await run({ model: 'gemini-3.8-flash', temperature: 0.2, topP: 0.9, topK: 40 });
      await run({ model: 'gemini-3.8-flash', temperature: 0.2, topP: 0.9, topK: 40 });

      for (const field of ['temperature', 'topP', 'topK', 'top_p', 'top_k']) {
        expect(requestConfig()).not.toHaveProperty(field);
      }
      const samplingWarnings = warn.mock.calls.filter(c => String(c[0]).includes('gemini-3.8-flash'));
      expect(samplingWarnings).toHaveLength(3);
    });

    it.each(['gemini-3.6-flash', 'gemini-4-pro', 'gemini-flash-latest'])(
      '%s gets no default temperature', async (model) => {
        await run({ model });
        expect(requestConfig()).not.toHaveProperty('temperature');
      });

    it('omits sampling fields on the streaming path too', async () => {
      await runStreaming({ model: 'gemini-3.8-flash', temperature: 0.2, topP: 0.9, topK: 40 });
      const config = sendMessageStream.mock.calls[0][0].config as Record<string, unknown>;
      expect(config).not.toHaveProperty('temperature');
      expect(config).not.toHaveProperty('topP');
      expect(config).not.toHaveProperty('topK');
    });
  });

  describe('thinking reaches the request (per-request config, not the chat session)', () => {
    const thinkingConfig = (call = 0): unknown => (sendMessage.mock.calls[call][0].config as Record<string, unknown>).thinkingConfig;
    const badRequest = (): ApiError => new ApiError({ message: 'thinking_level MINIMAL is not supported', status: 400 });

    it.each(['gemini-2.5-pro', 'gemini-3.8-flash', 'gemini-flash-latest'])(
      '%s sends no thinkingConfig without an effort level', async (model) => {
        await run({ model });
        expect(requestConfig()).not.toHaveProperty('thinkingConfig');
        expect(create.mock.calls[0][0].config).toBeUndefined();
      });

    it.each([
      ['1', 'LOW'], ['33', 'LOW'], ['34', 'MEDIUM'], ['66', 'MEDIUM'], ['67', 'HIGH'], ['100', 'HIGH'],
    ])('gemini-3.8-flash at effort %s sends thinkingLevel %s, never MINIMAL', async (effortLevel, level) => {
      await run({ model: 'gemini-3.8-flash', effortLevel });
      expect(thinkingConfig()).toEqual({ thinkingLevel: level, includeThoughts: true });
    });

    it('an unversioned Gemini id gets a thinking level', async () => {
      await run({ model: 'gemini-flash-latest', effortLevel: '50' });
      expect(thinkingConfig()).toEqual({ thinkingLevel: 'MEDIUM', includeThoughts: true });
    });

    it('a named level is sent as that level, including MINIMAL when asked for by name', async () => {
      await run({ model: 'gemini-3-flash-preview', effortLevel: 'minimal' });
      expect(thinkingConfig()).toEqual({ thinkingLevel: 'MINIMAL', includeThoughts: true });
    });

    it('Gemini 2.5 gets a thinking budget, never a level', async () => {
      await run({ model: 'gemini-2.5-pro', effortLevel: '90' });
      expect(thinkingConfig()).toEqual({ thinkingBudget: 24576, includeThoughts: true });
    });

    it.each(['gemini-2.0-flash', 'gemma-3-27b-it'])('%s gets no thinking setting, with one warning', async (model) => {
      await run({ model, effortLevel: '90' });
      await run({ model, effortLevel: '90' });
      expect(thinkingConfig(0)).toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('an unrecognized effort sends nothing and warns once', async () => {
      await run({ model: 'gemini-3.8-flash', effortLevel: 'turbo' });
      expect(thinkingConfig()).toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('sends the thinking setting on the streaming path too', async () => {
      await runStreaming({ model: 'gemini-3.8-flash', effortLevel: '90' });
      expect(sendMessageStream.mock.calls[0][0].config.thinkingConfig).toEqual({ thinkingLevel: 'HIGH', includeThoughts: true });
      expect(create.mock.calls[0][0].config).toBeUndefined();
    });

    it('retries a rejected MINIMAL with LOW, then sends LOW for MINIMAL and still sends the other levels', async () => {
      sendMessage.mockRejectedValueOnce(badRequest());
      const first = await run({ model: 'gemini-3.8-flash', effortLevel: 'minimal' });
      expect(first.success).toBe(true);
      expect(thinkingConfig(0)).toEqual({ thinkingLevel: 'MINIMAL', includeThoughts: true });
      expect(thinkingConfig(1)).toEqual({ thinkingLevel: 'LOW', includeThoughts: true });
      expect(warn).toHaveBeenCalledTimes(1);

      await run({ model: 'gemini-3.8-flash', effortLevel: 'minimal' });
      expect(sendMessage).toHaveBeenCalledTimes(3);
      expect(thinkingConfig(2)).toEqual({ thinkingLevel: 'LOW', includeThoughts: true });

      await run({ model: 'gemini-3.8-flash', effortLevel: '90' });
      expect(thinkingConfig(3)).toEqual({ thinkingLevel: 'HIGH', includeThoughts: true });
    });

    it('retries any other rejected setting without one, and only that setting is dropped afterwards', async () => {
      sendMessage.mockRejectedValueOnce(new ApiError({ message: 'thinking_level HIGH is not supported', status: 400 }));
      await run({ model: 'gemini-3-pro-preview', effortLevel: '90' });
      expect(thinkingConfig(1)).toBeUndefined();

      await run({ model: 'gemini-3-pro-preview', effortLevel: '90' });
      expect(sendMessage).toHaveBeenCalledTimes(3);
      expect(thinkingConfig(2)).toBeUndefined();

      await run({ model: 'gemini-3-pro-preview', effortLevel: '10' });
      expect(thinkingConfig(3)).toEqual({ thinkingLevel: 'LOW', includeThoughts: true });
    });

    it('a rejection through one driver class does not change what another sends', async () => {
      class OtherGeminiDriver extends GeminiLLM {}
      sendMessage.mockRejectedValueOnce(badRequest());
      await run({ model: 'gemini-3.8-flash', effortLevel: 'minimal' });

      const other = new OtherGeminiDriver('test-gemini-key');
      (other as unknown as Record<string, unknown>)['_gemini'] = { chats: { create } };
      const fn = (other as unknown as Record<string, (p: unknown) => Promise<unknown>>)['nonStreamingChatCompletion'].bind(other);
      await fn({ messages: [{ role: 'user', content: 'hi' }], model: 'gemini-3.8-flash', effortLevel: 'minimal' });
      expect(thinkingConfig(2)).toEqual({ thinkingLevel: 'MINIMAL', includeThoughts: true });
    });

    it('the streaming path retries the same way', async () => {
      sendMessageStream.mockRejectedValueOnce(badRequest());
      await runStreaming({ model: 'gemini-3.8-flash', effortLevel: 'minimal' });
      expect(sendMessageStream).toHaveBeenCalledTimes(2);
      expect(sendMessageStream.mock.calls[1][0].config.thinkingConfig).toEqual({ thinkingLevel: 'LOW', includeThoughts: true });
    });

    it('when the retry also fails, reports the original error and remembers nothing', async () => {
      sendMessage.mockRejectedValueOnce(badRequest()).mockRejectedValueOnce(new ApiError({ message: 'contents is empty', status: 400 }));
      const result = await run({ model: 'gemini-3.8-flash', effortLevel: '90' });
      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('thinking_level MINIMAL is not supported');

      await run({ model: 'gemini-3.8-flash', effortLevel: '90' });
      expect(thinkingConfig(2)).toEqual({ thinkingLevel: 'HIGH', includeThoughts: true });
    });

    it.each([
      ['a non-400 error', () => new ApiError({ message: 'overloaded', status: 503 })],
      ['a non-API error', () => new TypeError('fetch failed')],
    ])('does not retry on %s', async (_label, error) => {
      sendMessage.mockRejectedValueOnce(error());
      const result = await run({ model: 'gemini-3.8-flash', effortLevel: '90' });
      expect(result.success).toBe(false);
      expect(sendMessage).toHaveBeenCalledTimes(1);
    });

    it('does not retry a request that carried no thinking setting', async () => {
      sendMessage.mockRejectedValueOnce(badRequest());
      await run({ model: 'gemini-3.8-flash' });
      expect(sendMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('thinking output and usage', () => {
    it('counts thinking tokens in completion tokens', async () => {
      sendMessage.mockResolvedValueOnce({
        candidates: [{ content: { parts: [{ text: 'answer' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 100, cachedContentTokenCount: 40, candidatesTokenCount: 20, thoughtsTokenCount: 300 },
      });
      const result = await run({ model: 'gemini-3.8-flash', effortLevel: '90' });
      expect(result.data.usage).toMatchObject({ promptTokens: 60, completionTokens: 320, cacheReadTokens: 40 });
    });

    it('keeps every thought part, not only the first', async () => {
      sendMessage.mockResolvedValueOnce({
        candidates: [{ content: { parts: [{ text: 'first. ', thought: true }, { text: 'second.', thought: true }, { text: 'answer' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      });
      const result = await run({ model: 'gemini-3.8-flash', effortLevel: '90' });
      expect(result.data.choices[0].message).toMatchObject({ content: 'answer', thinking: 'first. second.' });
    });

    it('counts streamed thinking tokens in completion tokens', () => {
      const process = (llm as unknown as Record<string, (c: unknown) => { usage: Record<string, number> | null }>)['processStreamingChunk'].bind(llm);
      const { usage } = process({ usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 7 } });
      expect(usage).toMatchObject({ promptTokens: 10, completionTokens: 12 });
    });
  });
});
