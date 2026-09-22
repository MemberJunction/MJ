import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const { mockRunViewFn } = vi.hoisted(() => {
  return {
    mockRunViewFn: vi.fn(),
  };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class MockRunView {
    RunView = mockRunViewFn;
    RunViews = vi.fn();
  }
  return {
    ...actual,
    RunView: MockRunView,
  };
});

const { mockKHConfig, mockKHEntityDocuments, mockKHGetEntityDocumentByID } = vi.hoisted(() => {
  return {
    mockKHConfig: vi.fn().mockResolvedValue(undefined),
    mockKHEntityDocuments: [] as { ID: string; Name: string; EntityID?: string; Status?: string; TypeID?: string; Entity?: string }[],
    mockKHGetEntityDocumentByID: vi.fn((id: string) => {
      return mockKHEntityDocuments.find(d => d.ID === id) ?? undefined;
    }),
  };
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
  return {
    ...actual,
    KnowledgeHubMetadataEngine: {
      Instance: {
        Config: mockKHConfig,
        EntityDocuments: mockKHEntityDocuments,
        GetEntityDocumentByID: mockKHGetEntityDocumentByID,
      },
    },
  };
});

import { EntityDocumentCache } from '../models/EntityDocumentCache';

describe('EntityDocumentCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    (EntityDocumentCache as unknown as { _instance: undefined })._instance = undefined;
  });

  describe('Instance', () => {
    it('should return singleton instance', () => {
      const instance1 = EntityDocumentCache.Instance;
      const instance2 = EntityDocumentCache.Instance;
      expect(instance1).toBe(instance2);
    });
  });

  describe('GetDocument', () => {
    it('should return document from KnowledgeHubMetadataEngine when it exists', () => {
      const mockDoc = { ID: 'doc-1', Name: 'Test Document' };
      mockKHEntityDocuments.length = 0;
      mockKHEntityDocuments.push(mockDoc);

      const cache = EntityDocumentCache.Instance;
      const result = cache.GetDocument('doc-1');

      expect(result).toBeDefined();
      expect(result?.ID).toBe('doc-1');
    });

    it('should return null when document does not exist', () => {
      mockKHEntityDocuments.length = 0;
      const cache = EntityDocumentCache.Instance;
      const result = cache.GetDocument('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('GetDocumentByName', () => {
    it('should return document when name matches (case insensitive)', () => {
      const mockDoc = { ID: 'doc-1', Name: 'Test Document' };
      mockKHEntityDocuments.length = 0;
      mockKHEntityDocuments.push(mockDoc);

      const cache = EntityDocumentCache.Instance;
      const result = cache.GetDocumentByName('test document');

      expect(result).toBeDefined();
      expect(result?.ID).toBe('doc-1');
    });

    it('should return null when document with name does not exist', () => {
      mockKHEntityDocuments.length = 0;
      const cache = EntityDocumentCache.Instance;
      const result = cache.GetDocumentByName('non-existent');

      expect(result).toBeNull();
    });
  });
});
