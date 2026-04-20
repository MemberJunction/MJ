import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const { mockRunViewFn } = vi.hoisted(() => {
  return {
    mockRunViewFn: vi.fn(),
  };
});

vi.mock('@memberjunction/core', () => {
  class MockRunView {
    RunView = mockRunViewFn;
    RunViews = vi.fn();
  }
  return {
    UserInfo: vi.fn(),
    RunView: MockRunView,
    LogStatus: vi.fn(),
    RunViewResult: vi.fn(),
  };
});

const { mockKHConfig, mockKHEntityDocuments, mockKHGetEntityDocumentById } = vi.hoisted(() => {
  return {
    mockKHConfig: vi.fn().mockResolvedValue(undefined),
    mockKHEntityDocuments: [] as { ID: string; Name: string; EntityID?: string; Status?: string; TypeID?: string; Entity?: string }[],
    mockKHGetEntityDocumentById: vi.fn((id: string) => {
      return mockKHEntityDocuments.find(d => d.ID === id) ?? undefined;
    }),
  };
});

vi.mock('@memberjunction/core-entities', () => ({
  MJEntityDocumentEntity: vi.fn(),
  MJEntityDocumentTypeEntity: vi.fn(),
  KnowledgeHubMetadataEngine: {
    Instance: {
      Config: mockKHConfig,
      EntityDocuments: mockKHEntityDocuments,
      GetEntityDocumentById: mockKHGetEntityDocumentById,
    },
  },
}));

import { EntityDocumentCache } from '../models/EntityDocumentCache';

describe('EntityDocumentCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset singleton between tests
    (EntityDocumentCache as unknown as { _instance: undefined })._instance = undefined;
  });

  describe('Instance', () => {
    it('should return singleton instance', () => {
      const instance1 = EntityDocumentCache.Instance;
      const instance2 = EntityDocumentCache.Instance;
      expect(instance1).toBe(instance2);
    });
  });

  describe('IsLoaded', () => {
    it('should be false initially', () => {
      const cache = EntityDocumentCache.Instance;
      expect(cache.IsLoaded).toBe(false);
    });
  });

  describe('GetDocument', () => {
    it('should return null for cache miss', () => {
      const cache = EntityDocumentCache.Instance;
      const result = cache.GetDocument('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('GetDocumentType', () => {
    it('should return null for cache miss', () => {
      const cache = EntityDocumentCache.Instance;
      const result = cache.GetDocumentType('non-existent-type-id');
      expect(result).toBeNull();
    });
  });

  describe('GetDocumentByName', () => {
    it('should return null for cache miss', () => {
      const cache = EntityDocumentCache.Instance;
      const result = cache.GetDocumentByName('Non Existent');
      expect(result).toBeNull();
    });
  });

  describe('GetDocumentTypeByName', () => {
    it('should return null for cache miss', () => {
      const cache = EntityDocumentCache.Instance;
      const result = cache.GetDocumentTypeByName('Non Existent');
      expect(result).toBeNull();
    });
  });

  describe('GetFirstActiveDocumentForEntityByID', () => {
    it('should return null when no document type found', () => {
      const cache = EntityDocumentCache.Instance;
      const result = cache.GetFirstActiveDocumentForEntityByID('entity-1');
      expect(result).toBeNull();
    });
  });

  describe('GetFirstActiveDocumentForEntityByName', () => {
    it('should return null when no document type found', () => {
      const cache = EntityDocumentCache.Instance;
      const result = cache.GetFirstActiveDocumentForEntityByName('Contacts');
      expect(result).toBeNull();
    });
  });

  describe('SetCurrentUser', () => {
    it('should set the current user without errors', () => {
      const cache = EntityDocumentCache.Instance;
      const mockUser = { ID: 'user-1', Email: 'test@test.com' } as never;
      cache.SetCurrentUser(mockUser);
      // No error thrown means success
    });
  });

  describe('Refresh', () => {
    it('should load documents via KH engine and types from database', async () => {
      // Populate mock KH engine with entity documents
      mockKHEntityDocuments.length = 0;
      mockKHEntityDocuments.push(
        { ID: 'doc-1', Name: 'Doc 1', EntityID: 'entity-1', Status: 'Active' } as never,
        { ID: 'doc-2', Name: 'Doc 2', EntityID: 'entity-2', Status: 'Active' } as never,
      );

      const mockTypes = [
        { ID: 'type-1', Name: 'Record Duplicate' },
      ];

      // RunView (singular) is now only used for Entity Document Types
      mockRunViewFn.mockResolvedValue({ Success: true, Results: mockTypes });

      const cache = EntityDocumentCache.Instance;
      await cache.Refresh(true);

      expect(cache.IsLoaded).toBe(true);
      expect(mockKHConfig).toHaveBeenCalled();
      expect(cache.GetDocument('doc-1')).toBe(mockKHEntityDocuments[0]);
      expect(cache.GetDocument('doc-2')).toBe(mockKHEntityDocuments[1]);
      expect(cache.GetDocumentType('type-1')).toBe(mockTypes[0]);
    });

    it('should skip refresh when already loaded and not forced', async () => {
      mockKHEntityDocuments.length = 0;
      mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

      const cache = EntityDocumentCache.Instance;
      await cache.Refresh(true);
      const callCount = mockKHConfig.mock.calls.length;

      // Second call without force should be skipped
      await cache.Refresh(false);
      expect(mockKHConfig.mock.calls.length).toBe(callCount);
    });

    it('should re-refresh when forced', async () => {
      mockKHEntityDocuments.length = 0;
      mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

      const cache = EntityDocumentCache.Instance;
      await cache.Refresh(true);
      const callCount = mockKHConfig.mock.calls.length;
      await cache.Refresh(true);
      expect(mockKHConfig.mock.calls.length).toBe(callCount + 1);
    });

    it('should handle failed RunView results gracefully', async () => {
      mockKHEntityDocuments.length = 0;
      mockRunViewFn.mockResolvedValue({ Success: false, Results: [] });

      const cache = EntityDocumentCache.Instance;
      await cache.Refresh(true);
      expect(cache.IsLoaded).toBe(true);
    });

    it('should use context user when provided', async () => {
      mockKHEntityDocuments.length = 0;
      mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

      const cache = EntityDocumentCache.Instance;
      const mockUser = { ID: 'user-1' } as never;
      await cache.Refresh(true, mockUser);

      expect(mockKHConfig).toHaveBeenCalledWith(true, mockUser);
    });
  });

  describe('GetDocumentTypeByName after Refresh', () => {
    it('should find document type by name (case insensitive)', async () => {
      const mockTypes = [
        { ID: 'type-1', Name: 'Record Duplicate' },
      ];

      mockRunViewFn.mockResolvedValue({ Success: true, Results: mockTypes });

      const cache = EntityDocumentCache.Instance;
      await cache.Refresh(true);

      const result = cache.GetDocumentTypeByName('record duplicate');
      expect(result).toBe(mockTypes[0]);
    });
  });
});
