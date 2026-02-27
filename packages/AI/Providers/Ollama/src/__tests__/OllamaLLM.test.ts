import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */
const mockChat = vi.hoisted(() => vi.fn());
const mockGenerate = vi.hoisted(() => vi.fn());
const mockList = vi.hoisted(() => vi.fn());
const mockPull = vi.hoisted(() => vi.fn());
const mockEmbeddings = vi.hoisted(() => vi.fn());
const mockShow = vi.hoisted(() => vi.fn());

vi.mock('ollama', () => {
  return {
    Ollama: class MockOllama {
      chat = mockChat;
      generate = mockGenerate;
      list = mockList;
      pull = mockPull;
      embeddings = mockEmbeddings;
      show = mockShow;
      constructor(_opts?: Record<string, unknown>) {}
    },
    ChatRequest: class {},
    ChatResponse: class {},
    GenerateRequest: class {},
    GenerateResponse: class {},
    Message: class {},
    EmbeddingsRequest: class {},
    EmbeddingsResponse: class {},
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
    protected extractThinkingFromContent(content: string) {
      if (content.startsWith('<think>') && content.includes('</think>')) {
        const thinkEnd = content.indexOf('</think>');
        const thinking = content.substring('<think>'.length, thinkEnd).trim();
        const remaining = content.substring(thinkEnd + '</think>'.length).trim();
        return { content: remaining, thinking };
      }
      return { content, thinking: undefined };
    }
    protected get thinkingStreamState() {
      return { accumulatedThinking: '' };
    }
    protected addThinkingToMessage(msg: Record<string, unknown>, thinking?: string) {
      if (thinking) return { ...msg, thinking };
      return msg;
    }
  }
  class MockBaseEmbeddings {
    protected _additionalSettings: Record<string, unknown> = {};
    constructor(_apiKey: string) {}
    public SetAdditionalSettings(settings: Record<string, unknown>) {
      this._additionalSettings = { ...this._additionalSettings, ...settings };
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
    BaseEmbeddings: MockBaseEmbeddings,
    ChatResult: MockChatResult,
    ChatResultChoice: class {},
    ChatMessageRole: { user: 'user', assistant: 'assistant', system: 'system' },
    ModelUsage: MockModelUsage,
    ChatParams: class {},
    ChatMessage: class {},
    ChatMessageContentBlock: class {},
    ClassifyParams: class {},
    ClassifyResult: class {},
    SummarizeParams: class {},
    SummarizeResult: class {},
    EmbedTextParams: class {},
    EmbedTextsParams: class {},
    EmbedTextResult: class {},
    EmbedTextsResult: class {},
    ErrorAnalyzer: { analyzeError: vi.fn().mockReturnValue({ category: 'unknown' }) },
    parseBase64DataUrl: vi.fn().mockImplementation((input: string) => {
      const match = input.match(/^data:([^;]+);base64,(.+)$/);
      if (match) return { mediaType: match[1], data: match[2] };
      return null;
    }),
  };
});

import { OllamaLLM } from '../models/ollama-llm';
import { OllamaEmbedding } from '../models/ollama-embeddings';

/* ------------------------------------------------------------------ */
/*  OllamaLLM Tests                                                   */
/* ------------------------------------------------------------------ */
describe('OllamaLLM', () => {
  let llm: OllamaLLM;

  beforeEach(() => {
    vi.clearAllMocks();
    llm = new OllamaLLM();
  });

  /* ---- Constructor ---- */
  describe('constructor', () => {
    it('should create an instance without API key', () => {
      expect(llm).toBeInstanceOf(OllamaLLM);
    });

    it('should set default base URL to localhost:11434', () => {
      expect((llm as unknown as Record<string, unknown>)['_baseUrl']).toBe('http://localhost:11434');
    });

    it('should expose OllamaClient getter', () => {
      expect(llm.OllamaClient).toBeDefined();
    });

    it('should expose client alias', () => {
      expect(llm.client).toBe(llm.OllamaClient);
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
      llm.SetAdditionalSettings({ baseUrl: 'http://remote:11434' });
      expect(llm.client).not.toBe(clientBefore);
      expect((llm as unknown as Record<string, unknown>)['_baseUrl']).toBe('http://remote:11434');
    });

    it('should accept host as alias for baseUrl', () => {
      const clientBefore = llm.client;
      llm.SetAdditionalSettings({ host: 'http://otherhost:11434' });
      expect(llm.client).not.toBe(clientBefore);
      expect((llm as unknown as Record<string, unknown>)['_baseUrl']).toBe('http://otherhost:11434');
    });

    it('should update keepAlive setting', () => {
      llm.SetAdditionalSettings({ keepAlive: '10m' });
      expect((llm as unknown as Record<string, unknown>)['_keepAlive']).toBe('10m');
    });
  });

  /* ---- nonStreamingChatCompletion ---- */
  describe('nonStreamingChatCompletion', () => {
    it('should call Ollama chat and return success', async () => {
      mockChat.mockResolvedValueOnce({
        message: { content: 'Hello from Ollama!' },
        done: true,
        prompt_eval_count: 10,
        eval_count: 20,
        total_duration: 1000000,
        load_duration: 500000,
      });

      const params = {
        model: 'llama3',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
      };

      const fn = (llm as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['nonStreamingChatCompletion']
        .bind(llm);
      const result = await fn(params) as Record<string, unknown>;
      expect(result.success).toBe(true);
      const data = result.data as { choices: Array<{ message: { content: string } }>; usage: { promptTokens: number } };
      expect(data.choices[0].message.content).toBe('Hello from Ollama!');
      expect(data.usage.promptTokens).toBe(10);
    });

    it('should extract thinking content from response', async () => {
      mockChat.mockResolvedValueOnce({
        message: { content: '<think>reasoning here</think>The answer is 42' },
        done: true,
        prompt_eval_count: 10,
        eval_count: 20,
      });

      const params = {
        model: 'deepseek-r1',
        messages: [{ role: 'user', content: 'What is 6x7?' }],
      };

      const fn = (llm as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['nonStreamingChatCompletion']
        .bind(llm);
      const result = await fn(params) as Record<string, unknown>;
      const data = result.data as { choices: Array<{ message: { content: string; thinking: string } }> };
      expect(data.choices[0].message.content).toBe('The answer is 42');
      expect(data.choices[0].message.thinking).toBe('reasoning here');
    });

    it('should return error result on failure', async () => {
      mockChat.mockRejectedValueOnce(new Error('Connection refused'));

      const params = {
        model: 'llama3',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const fn = (llm as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['nonStreamingChatCompletion']
        .bind(llm);
      const result = await fn(params) as Record<string, unknown>;
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Connection refused');
    });

    it('should handle JSON response format', async () => {
      mockChat.mockResolvedValueOnce({
        message: { content: '{"answer": 42}' },
        done: true,
      });

      const params = {
        model: 'llama3',
        messages: [{ role: 'user', content: 'Give me JSON' }],
        responseFormat: 'JSON',
      };

      const fn = (llm as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['nonStreamingChatCompletion']
        .bind(llm);
      const result = await fn(params) as Record<string, unknown>;
      expect(result.success).toBe(true);
      // Verify format was set in the chat call
      expect(mockChat).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'json' }),
      );
    });
  });

  /* ---- Image handling ---- */
  describe('convertToOllamaMessages', () => {
    it('should handle multimodal messages with images', () => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => unknown>)['convertToOllamaMessages']
        .bind(llm);
      const messages = [{
        role: 'user',
        content: [
          { type: 'text', content: 'What is in this image?' },
          { type: 'image_url', content: 'data:image/png;base64,abc123' },
        ],
      }];

      const result = fn(messages) as Array<{ role: string; content: string; images?: string[] }>;
      expect(result[0].content).toBe('What is in this image?');
      expect(result[0].images).toHaveLength(1);
      expect(result[0].images![0]).toBe('abc123');
    });

    it('should handle string content messages', () => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => unknown>)['convertToOllamaMessages']
        .bind(llm);
      const messages = [{ role: 'user', content: 'Hello' }];

      const result = fn(messages) as Array<{ role: string; content: string; images?: string[] }>;
      expect(result[0].content).toBe('Hello');
      expect(result[0].images).toBeUndefined();
    });
  });

  /* ---- extractBase64ForOllama ---- */
  describe('extractBase64ForOllama', () => {
    it('should extract base64 from data URL', () => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => unknown>)['extractBase64ForOllama']
        .bind(llm);
      const result = fn({ content: 'data:image/png;base64,abc123' });
      expect(result).toBe('abc123');
    });

    it('should return raw base64 content directly', () => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => unknown>)['extractBase64ForOllama']
        .bind(llm);
      const result = fn({ content: 'rawbase64data' });
      expect(result).toBe('rawbase64data');
    });

    it('should return null for HTTP URLs', () => {
      const fn = (llm as unknown as Record<string, (...args: unknown[]) => unknown>)['extractBase64ForOllama']
        .bind(llm);
      const result = fn({ content: 'https://example.com/img.png' });
      expect(result).toBeNull();
    });
  });

  /* ---- listModels ---- */
  describe('listModels', () => {
    it('should return list of models', async () => {
      mockList.mockResolvedValueOnce({ models: [{ name: 'llama3:latest' }] });
      const result = await llm.listModels();
      expect(result.models).toHaveLength(1);
    });
  });

  /* ---- isModelAvailable ---- */
  describe('isModelAvailable', () => {
    it('should return true when model exists', async () => {
      mockList.mockResolvedValueOnce({ models: [{ name: 'llama3:latest' }] });
      const result = await llm.isModelAvailable('llama3');
      expect(result).toBe(true);
    });

    it('should return false when model does not exist', async () => {
      mockList.mockResolvedValueOnce({ models: [{ name: 'llama3:latest' }] });
      const result = await llm.isModelAvailable('mistral');
      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockList.mockRejectedValueOnce(new Error('Connection refused'));
      const result = await llm.isModelAvailable('llama3');
      expect(result).toBe(false);
    });
  });

  /* ---- Unsupported methods ---- */
  describe('unsupported methods', () => {
    it('SummarizeText should throw', async () => {
      await expect(llm.SummarizeText({} as never)).rejects.toThrow();
    });

    it('ClassifyText should throw', async () => {
      await expect(llm.ClassifyText({} as never)).rejects.toThrow();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  OllamaEmbedding Tests                                             */
/* ------------------------------------------------------------------ */
describe('OllamaEmbedding', () => {
  let embedder: OllamaEmbedding;

  beforeEach(() => {
    vi.clearAllMocks();
    embedder = new OllamaEmbedding();
  });

  /* ---- Constructor ---- */
  describe('constructor', () => {
    it('should create an instance without API key', () => {
      expect(embedder).toBeInstanceOf(OllamaEmbedding);
    });

    it('should expose client getter', () => {
      expect(embedder.client).toBeDefined();
    });
  });

  /* ---- EmbedText ---- */
  describe('EmbedText', () => {
    it('should throw when model name is missing', async () => {
      await expect(embedder.EmbedText({ text: 'hello' } as never))
        .rejects.toThrow('Model name is required');
    });

    it('should return embedding result on success', async () => {
      mockList.mockResolvedValueOnce({ models: [{ name: 'nomic-embed-text:latest' }] });
      mockEmbeddings.mockResolvedValueOnce({
        embedding: [0.1, 0.2, 0.3],
        prompt_eval_count: 5,
      });

      const result = await embedder.EmbedText({ text: 'hello', model: 'nomic-embed-text' });
      expect(result.vector).toEqual([0.1, 0.2, 0.3]);
      expect(result.model).toBe('nomic-embed-text');
    });
  });

  /* ---- SetAdditionalSettings ---- */
  describe('SetAdditionalSettings', () => {
    it('should reconfigure client with new baseUrl', () => {
      const clientBefore = embedder.client;
      embedder.SetAdditionalSettings({ baseUrl: 'http://remote:11434' });
      expect(embedder.client).not.toBe(clientBefore);
    });
  });
});
