import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies
vi.mock('@memberjunction/core', () => {
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
    RunView = vi.fn().mockResolvedValue({
      Success: true,
      Results: [],
    });
  }
  return {
    Metadata: MockMetadata,
    RunView: MockRunView,
    UserInfo: vi.fn(),
  };
});

vi.mock('@memberjunction/global', () => ({
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
}));

vi.mock('@memberjunction/ai', () => ({
  BaseLLM: vi.fn(),
  GetAIAPIKey: vi.fn().mockReturnValue('mock-api-key'),
}));

vi.mock('@memberjunction/aiengine', () => ({
  AIEngine: class MockAIEngine {
    static getInstance() {
      return new MockAIEngine();
    }
    static get Instance() {
      return {
        Models: [
          {
            ID: 'model-1',
            DriverClass: 'OpenAILLM',
            InputTokenLimit: 8000,
            APIName: 'gpt-4',
          },
        ],
      };
    }
    get Models() {
      return [
        {
          ID: 'model-1',
          DriverClass: 'OpenAILLM',
          InputTokenLimit: 8000,
          APIName: 'gpt-4',
        },
      ];
    }
  },
}));

vi.mock('@memberjunction/core-entities', () => ({
  ContentSourceEntity: vi.fn(),
  ContentItemEntity: vi.fn(),
  ContentFileTypeEntity: vi.fn(),
  ContentProcessRunEntity: vi.fn(),
  ContentTypeEntity: vi.fn(),
  ContentSourceTypeEntity: vi.fn(),
  ContentTypeAttributeEntity: vi.fn(),
  ContentSourceParamEntity: vi.fn(),
  ContentItemAttributeEntity: vi.fn(),
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
      // tokenLimit / 1.5 = 666 char limit, so 2000 chars needs 3 chunks
      const text = 'a'.repeat(2000);
      const tokenLimit = 1000;

      const result = engine.chunkExtractedText(text, tokenLimit);

      expect(result.length).toBeGreaterThan(1);
      // Verify all text is captured
      expect(result.join('')).toBe(text);
    });

    it('should calculate text limit as tokenLimit / 1.5', () => {
      const tokenLimit = 1500;
      const textLimit = Math.ceil(tokenLimit / 1.5); // 1000

      // Text exactly at limit should not be chunked
      const shortText = 'a'.repeat(textLimit);
      const result = engine.chunkExtractedText(shortText, tokenLimit);
      expect(result).toHaveLength(1);

      // Text exceeding limit should be chunked
      const longText = 'a'.repeat(textLimit + 1);
      const result2 = engine.chunkExtractedText(longText, tokenLimit);
      expect(result2.length).toBeGreaterThan(1);
    });

    it('should handle empty text', () => {
      const result = engine.chunkExtractedText('', 1000);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('');
    });

    it('should handle very small token limit', () => {
      const text = 'Hello World';
      const result = engine.chunkExtractedText(text, 3);
      // tokenLimit / 1.5 = 2, so each chunk is ~2 chars
      expect(result.length).toBeGreaterThan(1);
    });

    it('should preserve all text across chunks', () => {
      const text = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
      const tokenLimit = 100;

      const result = engine.chunkExtractedText(text, tokenLimit);
      const reassembled = result.join('');

      expect(reassembled).toBe(text);
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

      const result = await engine.parseHTML('invalid html');
      expect(result).toBeUndefined();
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
      await expect(engine.parseFileFromPath('/path/to/document.txt')).rejects.toThrow('File type not supported');
    });

    it('should throw for files without extension', async () => {
      await expect(engine.parseFileFromPath('/path/to/document')).rejects.toThrow('File type not supported');
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
});
