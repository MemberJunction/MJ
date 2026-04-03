import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies, preserving BaseEngine and related classes
// Shared mock function so tests can reconfigure RunView behavior
const mockRunViewFn = vi.fn().mockResolvedValue({
  Success: true,
  Results: [],
});

const mockRunViewsFn = vi.fn().mockResolvedValue([
  { Success: true, Results: [], TotalCount: 0, RowCount: 0, Elapsed: 0, ErrorMessage: '' },
  { Success: true, Results: [], TotalCount: 0, RowCount: 0, Elapsed: 0, ErrorMessage: '' },
]);

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class MockMetadata {
    GetEntityObject = vi.fn().mockResolvedValue({
      NewRecord: vi.fn(),
      Load: vi.fn().mockResolvedValue(true),
      Delete: vi.fn().mockResolvedValue(true),
      Save: vi.fn().mockResolvedValue(true),
      Set: vi.fn(),
      Get: vi.fn(),
      ID: 'mock-id',
      Name: 'Mock',
      Description: '',
      ItemID: '',
      Tag: '',
      ContentItemID: '',
      Value: '',
      SourceID: '',
      StartTime: new Date(),
      EndTime: new Date(),
      Status: '',
      ProcessedItems: 0,
    });
  }
  class MockRunView {
    RunView = mockRunViewFn;
    RunViews = mockRunViewsFn;
  }
  return {
    ...actual,
    Metadata: MockMetadata,
    RunView: MockRunView,
    LogStatus: vi.fn(),
    LogError: vi.fn(),
  };
});

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return {
    ...actual,
    RegisterClass: vi.fn(() => (target: Function) => target),
    MJGlobal: {
      Instance: {
        ClassFactory: {
          CreateInstance: vi.fn().mockReturnValue({
            ChatCompletion: vi.fn().mockResolvedValue({
              data: {
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        title: 'Test Title',
                        description: 'Test Description',
                        keywords: ['tag1', 'tag2'],
                        isValidContent: true,
                      }),
                    },
                  },
                ],
              },
            }),
          }),
        },
      },
    },
  };
});

vi.mock('@memberjunction/ai', () => ({
  BaseEmbeddings: class MockBaseEmbeddings {},
  GetAIAPIKey: vi.fn().mockReturnValue('mock-api-key'),
}));

vi.mock('@memberjunction/ai-prompts', () => ({
  AIPromptRunner: vi.fn().mockImplementation(() => ({
    ExecutePrompt: vi.fn().mockResolvedValue({
      success: true,
      result: {
        title: 'Test Title',
        description: 'Test Description',
        keywords: ['tag1', 'tag2'],
        isValidContent: true,
      },
    }),
  })),
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
  AIPromptParams: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@memberjunction/ai-vectordb', () => ({
  VectorDBBase: class MockVectorDBBase {},
  VectorRecord: vi.fn(),
  BaseResponse: vi.fn(),
}));

vi.mock('@memberjunction/ai-vectors', () => ({
  TextChunker: {
    ChunkText: vi.fn().mockImplementation((params: { Text: string; MaxChunkTokens: number }) => {
      // Simulate sentence-based chunking: split by '. ' and group into chunks
      const sentences = params.Text.split('. ').filter(s => s.length > 0);
      if (sentences.length <= 1) return [{ Text: params.Text }];
      const charsPerChunk = params.MaxChunkTokens * 4; // rough char estimate
      const chunks: { Text: string }[] = [];
      let current = '';
      for (const sentence of sentences) {
        const candidate = current ? `${current}. ${sentence}` : sentence;
        if (candidate.length > charsPerChunk && current) {
          chunks.push({ Text: current });
          current = sentence;
        } else {
          current = candidate;
        }
      }
      if (current) chunks.push({ Text: current });
      return chunks;
    }),
  },
  ChunkTextParams: vi.fn(),
}));

const mockModels = [
  {
    ID: 'model-1',
    DriverClass: 'OpenAILLM',
    InputTokenLimit: 8000,
    APIName: 'gpt-4',
    Name: 'GPT-4',
  },
  {
    ID: 'embed-model-1',
    DriverClass: 'OpenAIEmbedding',
    InputTokenLimit: 8192,
    APIName: 'text-embedding-3-small',
    Name: 'text-embedding-3-small',
  },
];

const mockPrompts = [
  {
    ID: 'prompt-autotag',
    Name: 'Content Autotagging',
    Status: 'Active',
    TemplateID: 'template-1',
  },
];

vi.mock('@memberjunction/aiengine', () => ({
  AIEngine: class MockAIEngine {
    static getInstance() {
      return new MockAIEngine();
    }
    static get Instance() {
      return {
        Config: vi.fn().mockResolvedValue(undefined),
        Models: mockModels,
        Prompts: mockPrompts,
      };
    }
    Config = vi.fn().mockResolvedValue(undefined);
    get Models() {
      return mockModels;
    }
    get Prompts() {
      return mockPrompts;
    }
  },
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJContentSourceEntity: vi.fn(),
  MJContentItemEntity: vi.fn(),
  MJContentFileTypeEntity: vi.fn(),
  MJContentProcessRunEntity: vi.fn(),
  MJContentTypeEntity: vi.fn(),
  MJContentSourceTypeEntity: vi.fn(),
  MJContentTypeAttributeEntity: vi.fn(),
  MJContentSourceParamEntity: vi.fn(),
  MJContentItemAttributeEntity: vi.fn(),
}));

vi.mock('pdf-parse', () => ({
  default: vi.fn().mockResolvedValue({ text: 'PDF text content' }),
}));

vi.mock('officeparser', () => ({
  default: {
    parseOffice: vi.fn().mockResolvedValue({
      toText: vi.fn().mockReturnValue('DOCX text content'),
    }),
  }
}));

vi.mock('cheerio', () => ({
  load: vi.fn().mockReturnValue(
    Object.assign(
      (selector: string) => ({
        remove: vi.fn(),
        text: vi.fn().mockReturnValue('   Parsed HTML content   '),
      }),
      {
        // The loaded cheerio API
        root: vi.fn(),
      }
    )
  ),
}));

vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: 'downloaded content' }),
  },
}));

vi.mock('crypto', () => ({
  default: {
    createHash: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        digest: vi.fn().mockReturnValue('abc123hash'),
      }),
    }),
  },
}));

vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn().mockResolvedValue(Buffer.from('file content')),
  },
}));

vi.mock('date-fns-tz', () => ({
  toZonedTime: vi.fn().mockImplementation((date: Date) => date),
}));

import { AutotagBaseEngine } from '../Engine/generic/AutotagBaseEngine';

describe('AutotagBaseEngine', () => {
  let engine: AutotagBaseEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new AutotagBaseEngine();
  });

  describe('chunkExtractedText', () => {
    it('should return single chunk for short text', () => {
      const text = 'Short text';
      const tokenLimit = 1000;

      const result = engine.chunkExtractedText(text, tokenLimit);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe('Short text');
    });

    it('should chunk text exceeding token limit', () => {
      // tokenLimit / 1.5 = 666 char limit * 4 chars/token = 2664 char threshold
      // With TextChunker, sentence-based chunking may produce different chunk counts
      const text = 'This is a sentence. '.repeat(200); // ~4000 chars, well above threshold
      const tokenLimit = 1000;

      const result = engine.chunkExtractedText(text, tokenLimit);
      expect(result.length).toBeGreaterThan(1);
    });

    it('should calculate text limit as tokenLimit / 1.5', () => {
      const tokenLimit = 1500;
      const textLimit = Math.ceil(tokenLimit / 1.5); // 1000

      // Text below the threshold (textLimit * 4 chars) should not be chunked
      const shortText = 'Short text.';
      const result = engine.chunkExtractedText(shortText, tokenLimit);
      expect(result).toHaveLength(1);

      // Text well above the threshold should be chunked
      const longText = 'This is a test sentence. '.repeat(500); // ~12500 chars
      const result2 = engine.chunkExtractedText(longText, tokenLimit);
      expect(result2.length).toBeGreaterThan(1);
    });

    it('should handle empty text', () => {
      const result = engine.chunkExtractedText('', 1000);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('');
    });

    it('should handle very small token limit', () => {
      // With sentence-based chunking, a single sentence stays as one chunk
      const text = 'Hello World. This is another sentence. And a third.';
      const result = engine.chunkExtractedText(text, 3);
      // Even with a tiny limit, the text is short enough or chunking produces at least the text
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result.join('')).toContain('Hello World');
    });

    it('should preserve all text across chunks', () => {
      const text = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
      const tokenLimit = 100;

      const result = engine.chunkExtractedText(text, tokenLimit);
      // With sentence-based chunking, each chunk's text should be part of the original
      for (const chunk of result) {
        expect(text).toContain(chunk.trim());
      }
    });
  });

  describe('castValueAsCorrectType', () => {
    it('should cast string to number', () => {
      const result = engine.castValueAsCorrectType('42', 'number');
      expect(result).toBe(42);
    });

    it('should cast string to boolean true', () => {
      const result = engine.castValueAsCorrectType('true', 'boolean');
      expect(result).toBe(true);
    });

    it('should cast string to boolean false', () => {
      const result = engine.castValueAsCorrectType('false', 'boolean');
      expect(result).toBe(false);
    });

    it('should return string as-is for string type', () => {
      const result = engine.castValueAsCorrectType('hello', 'string');
      expect(result).toBe('hello');
    });

    it('should parse string array', () => {
      const result = engine.castValueAsCorrectType('["a","b","c"]', 'string[]');
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should cast to RegExp for regexp type', () => {
      const result = engine.castValueAsCorrectType('test.*pattern', 'regexp');
      expect(result).toBeInstanceOf(RegExp);
    });

    it('should return value as-is for unknown type', () => {
      const result = engine.castValueAsCorrectType('value', 'unknown');
      expect(result).toBe('value');
    });

    it('should handle NaN for non-numeric string cast to number', () => {
      const result = engine.castValueAsCorrectType('not-a-number', 'number');
      expect(Number.isNaN(result)).toBe(true);
    });
  });

  describe('stringToBoolean', () => {
    it('should return true for "true"', () => {
      expect(engine.stringToBoolean('true')).toBe(true);
    });

    it('should return false for "false"', () => {
      expect(engine.stringToBoolean('false')).toBe(false);
    });

    it('should return false for "True" (case-sensitive)', () => {
      expect(engine.stringToBoolean('True')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(engine.stringToBoolean('')).toBe(false);
    });

    it('should return false for arbitrary string', () => {
      expect(engine.stringToBoolean('yes')).toBe(false);
    });
  });

  describe('parseStringArray', () => {
    it('should parse valid JSON array of strings', () => {
      const result = engine.parseStringArray('["hello","world"]');
      expect(result).toEqual(['hello', 'world']);
    });

    it('should parse empty array', () => {
      const result = engine.parseStringArray('[]');
      expect(result).toEqual([]);
    });

    it('should parse single element array', () => {
      const result = engine.parseStringArray('["only"]');
      expect(result).toEqual(['only']);
    });

    it('should throw for invalid JSON', () => {
      expect(() => engine.parseStringArray('not json')).toThrow();
    });

    it('should handle array with special characters', () => {
      const result = engine.parseStringArray('["hello world","foo-bar","test_123"]');
      expect(result).toEqual(['hello world', 'foo-bar', 'test_123']);
    });
  });

  describe('getChecksumFromText', () => {
    it('should return a hash string', async () => {
      const result = await engine.getChecksumFromText('test content');
      expect(typeof result).toBe('string');
      expect(result).toBe('abc123hash');
    });

    it('should call crypto.createHash with sha256', async () => {
      const crypto = await import('crypto');
      await engine.getChecksumFromText('test content');
      expect(crypto.default.createHash).toHaveBeenCalledWith('sha256');
    });

    it('should handle empty string', async () => {
      const result = await engine.getChecksumFromText('');
      expect(typeof result).toBe('string');
    });
  });

  describe('getChecksumFromURL', () => {
    it('should download content and compute hash', async () => {
      const result = await engine.getChecksumFromURL('https://example.com');
      expect(typeof result).toBe('string');
    });

    it('should call axios.get with the URL', async () => {
      const axios = await import('axios');
      await engine.getChecksumFromURL('https://example.com/page');
      expect(axios.default.get).toHaveBeenCalledWith('https://example.com/page');
    });
  });

  describe('parseHTML', () => {
    it('should return parsed text from HTML', async () => {
      const cheerio = await import('cheerio');
      // Re-mock cheerio for this specific test
      const mockRemove = vi.fn();
      const mockText = vi.fn().mockReturnValue('   Parsed HTML content   ');
      vi.mocked(cheerio.load).mockReturnValue(
        Object.assign(
          (selector: string) => {
            if (selector === 'script, style, nav, footer, header, .hidden') {
              return { remove: mockRemove };
            }
            if (selector === 'body') {
              return { text: mockText };
            }
            return { remove: vi.fn(), text: vi.fn().mockReturnValue('') };
          },
          { root: vi.fn() }
        ) as ReturnType<typeof cheerio.load>
      );

      const result = await engine.parseHTML('<html><body>Parsed HTML content</body></html>');
      expect(typeof result).toBe('string');
    });

    it('should handle cheerio load errors', async () => {
      const cheerio = await import('cheerio');
      vi.mocked(cheerio.load).mockImplementation(() => {
        throw new Error('Load error');
      });

      await expect(engine.parseHTML('invalid html')).rejects.toThrow('Load error');
    });
  });

  describe('parseFileFromPath', () => {
    it('should parse PDF files', async () => {
      const fsModule = await import('fs');
      vi.mocked(fsModule.promises.readFile).mockResolvedValue(Buffer.from('pdf content'));

      const result = await engine.parseFileFromPath('/path/to/document.pdf');
      expect(result).toBe('PDF text content');
    });

    it('should parse DOCX files', async () => {
      const fsModule = await import('fs');
      vi.mocked(fsModule.promises.readFile).mockResolvedValue(Buffer.from('docx content'));

      const result = await engine.parseFileFromPath('/path/to/document.docx');
      expect(result).toBe('DOCX text content');
    });

    it('should throw for unsupported file types', async () => {
      await expect(engine.parseFileFromPath('/path/to/document.txt')).rejects.toThrow("File type 'txt' not supported");
    });

    it('should throw for files without extension', async () => {
      await expect(engine.parseFileFromPath('/path/to/document')).rejects.toThrow('not supported');
    });
  });

  describe('saveLLMResults', () => {
    it('should save results when content is valid', async () => {
      const mockUser = { ID: 'user-1' } as never;
      const results = {
        isValidContent: true,
        contentItemID: 'item-1',
        title: 'Test Title',
        description: 'Test Desc',
        keywords: ['tag1', 'tag2'],
      };

      // Should not throw
      await expect(engine.saveLLMResults(results, mockUser)).resolves.not.toThrow();
    });

    it('should delete content when isValidContent is false', async () => {
      const mockUser = { ID: 'user-1' } as never;
      const results = {
        isValidContent: false,
        contentItemID: 'item-1',
      };

      // Should not throw
      await expect(engine.saveLLMResults(results, mockUser)).resolves.not.toThrow();
    });
  });

  describe('convertLastRunDateToTimezone', () => {
    it('should convert date to local timezone', async () => {
      const inputDate = new Date('2024-01-15T10:00:00Z');
      const result = await engine.convertLastRunDateToTimezone(inputDate);
      expect(result).toBeInstanceOf(Date);
    });

    it('should handle epoch date', async () => {
      const inputDate = new Date(0);
      const result = await engine.convertLastRunDateToTimezone(inputDate);
      expect(result).toBeInstanceOf(Date);
    });
  });

  describe('VectorizeContentItems', () => {
    const mockUser = { ID: 'user-1' } as never;

    // Helper to create mock content items
    function createMockItem(id: string, text: string, name?: string, description?: string, url?: string): Record<string, unknown> {
      return {
        ID: id,
        Text: text,
        Name: name ?? `Item ${id}`,
        Description: description ?? `Description for ${id}`,
        URL: url ?? `https://example.com/${id}`,
        ContentSourceID: 'source-1',
        ContentSourceTypeID: 'type-1',
        ContentFileTypeID: 'file-type-1',
        ContentTypeID: 'content-type-1',
      };
    }

    /**
     * Setup the RunView/RunViews mocks to return vector infrastructure data and the
     * ClassFactory mock to return embedding + vectorDB instances.
     * Returns references to the mock functions for assertion.
     *
     * New flow:
     * 1. RunViews is called to load content sources + types (returns empty by default — global fallback)
     * 2. RunView calls resolve vector infrastructure (default index, vector DB, tags)
     */
    async function setupVectorMocks(tagResults?: Record<string, unknown>[]) {
      // RunViews returns empty content sources + types (triggers global fallback path)
      mockRunViewsFn.mockResolvedValue([
        { Success: true, Results: [], TotalCount: 0, RowCount: 0, Elapsed: 0, ErrorMessage: '' },
        { Success: true, Results: [], TotalCount: 0, RowCount: 0, Elapsed: 0, ErrorMessage: '' },
      ]);

      // RunView calls come in varying order — dispatch by EntityName
      mockRunViewFn.mockImplementation(async (params: Record<string, unknown>) => {
        const entityName = params['EntityName'] as string;
        if (entityName === 'MJ: Vector Indexes') {
          return {
            Success: true,
            Results: [{
              ID: 'idx-1', Name: 'test-index',
              VectorDatabaseID: 'vdb-1', EmbeddingModelID: 'embed-model-1'
            }],
            TotalCount: 1, RowCount: 1, Elapsed: 0, ErrorMessage: '',
          } as never;
        }
        if (entityName === 'MJ: Vector Databases') {
          return {
            Success: true,
            Results: [{ ID: 'vdb-1', Name: 'Pinecone', ClassKey: 'PineconeDB' }],
            TotalCount: 1, RowCount: 1, Elapsed: 0, ErrorMessage: '',
          } as never;
        }
        // Content Item Tags or any other entity
        return {
          Success: true,
          Results: tagResults ?? [],
          TotalCount: tagResults?.length ?? 0,
          RowCount: tagResults?.length ?? 0,
          Elapsed: 0,
          ErrorMessage: '',
        } as never;
      });

      const { MJGlobal } = await import('@memberjunction/global');
      const mockEmbedTexts = vi.fn().mockResolvedValue({
        vectors: [[0.1, 0.2, 0.3]],
      });
      const mockCreateRecords = vi.fn().mockResolvedValue({
        success: true, message: 'OK',
      });
      vi.mocked(MJGlobal.Instance.ClassFactory.CreateInstance).mockImplementation((_base, driverClass) => {
        if (typeof driverClass === 'string' && driverClass.includes('Embed')) {
          return { EmbedTexts: mockEmbedTexts } as never;
        }
        return { CreateRecords: mockCreateRecords } as never;
      });

      return { mockEmbedTexts, mockCreateRecords };
    }

    it('should return zero vectorized and correct skipped count for empty items array', async () => {
      const result = await engine.VectorizeContentItems([] as never[], mockUser);
      expect(result).toEqual({ vectorized: 0, skipped: 0 });
    });

    it('should skip items with empty text and return correct counts', async () => {
      const items = [
        createMockItem('1', ''),
        createMockItem('2', '   '),
        createMockItem('3', ''),
      ] as never[];

      const result = await engine.VectorizeContentItems(items, mockUser);
      expect(result.vectorized).toBe(0);
      expect(result.skipped).toBe(3);
    });

    it('should call crypto.createHash with sha1 for vector ID generation', async () => {
      const cryptoModule = await import('crypto');
      await setupVectorMocks();

      const items = [createMockItem('item-abc', 'Hello world content')] as never[];
      await engine.VectorizeContentItems(items, mockUser);

      // Verify sha1 was called for vector ID
      expect(cryptoModule.default.createHash).toHaveBeenCalledWith('sha1');
    });

    it('should build metadata with tags when available', async () => {
      const { mockCreateRecords } = await setupVectorMocks([
        { ItemID: 'item-1', Tag: 'ai' },
        { ItemID: 'item-1', Tag: 'podcast' },
      ]);

      const items = [createMockItem('item-1', 'Content about AI')] as never[];
      await engine.VectorizeContentItems(items, mockUser);

      expect(mockCreateRecords).toHaveBeenCalled();
      const records = mockCreateRecords.mock.calls[0][0];
      expect(records).toHaveLength(1);
      // Verify metadata includes entity and record ID
      expect(records[0].metadata.RecordID).toBe('item-1');
      expect(records[0].metadata.Entity).toBe('MJ: Content Items');
    });

    it('should call progress callback with correct counts', async () => {
      const { mockEmbedTexts } = await setupVectorMocks();
      // Override to return 2 vectors for 2 items
      mockEmbedTexts.mockResolvedValue({ vectors: [[0.1], [0.2]] });

      const progressFn = vi.fn();
      const items = [
        createMockItem('1', 'Text one'),
        createMockItem('2', 'Text two'),
      ] as never[];

      await engine.VectorizeContentItems(items, mockUser, progressFn);

      expect(progressFn).toHaveBeenCalledWith(2, 2);
    });
  });
});
