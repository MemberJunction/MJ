import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const { mockRunViews } = vi.hoisted(() => {
  return {
    mockRunViews: vi.fn(),
  };
});

vi.mock('@memberjunction/core', () => {
  class MockRunView {
    RunView = vi.fn();
    RunViews = mockRunViews;
  }
  return {
    UserInfo: vi.fn(),
    RunView: MockRunView,
    LogStatus: vi.fn(),
    RunViewResult: vi.fn(),
  };
});

vi.mock('@memberjunction/core-entities', () => ({
  EntityDocumentEntity: vi.fn(),
  EntityDocumentTypeEntity: vi.fn(),
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
    it('should load documents and types from database', async () => {
      const mockDocuments = [
        { ID: 'doc-1', Name: 'Doc 1', EntityID: 'entity-1', Status: 'Active' },
        { ID: 'doc-2', Name: 'Doc 2', EntityID: 'entity-2', Status: 'Active' },
      ];
      const mockTypes = [
        { ID: 'type-1', Name: 'Record Duplicate' },
      ];

      mockRunViews.mockResolvedValue([
        { Success: true, Results: mockDocuments },
        { Success: true, Results: mockTypes },
      ]);

      const cache = EntityDocumentCache.Instance;
      await cache.Refresh(true);

      expect(cache.IsLoaded).toBe(true);
      expect(cache.GetDocument('doc-1')).toBe(mockDocuments[0]);
      expect(cache.GetDocument('doc-2')).toBe(mockDocuments[1]);
      expect(cache.GetDocumentType('type-1')).toBe(mockTypes[0]);
    });

    it('should skip refresh when already loaded and not forced', async () => {
      mockRunViews.mockResolvedValue([
        { Success: true, Results: [{ ID: 'doc-1' }] },
        { Success: true, Results: [] },
      ]);

      const cache = EntityDocumentCache.Instance;
      await cache.Refresh(true);
      expect(mockRunViews).toHaveBeenCalledTimes(1);

      // Second call without force should be skipped
      await cache.Refresh(false);
      expect(mockRunViews).toHaveBeenCalledTimes(1);
    });

    it('should re-refresh when forced', async () => {
      mockRunViews.mockResolvedValue([
        { Success: true, Results: [] },
        { Success: true, Results: [] },
      ]);

      const cache = EntityDocumentCache.Instance;
      await cache.Refresh(true);
      await cache.Refresh(true);
      expect(mockRunViews).toHaveBeenCalledTimes(2);
    });

    it('should handle failed results gracefully', async () => {
      mockRunViews.mockResolvedValue([
        { Success: false, Results: [] },
        { Success: false, Results: [] },
      ]);

      const cache = EntityDocumentCache.Instance;
      await cache.Refresh(true);
      expect(cache.IsLoaded).toBe(true);
    });

    it('should use context user when provided', async () => {
      mockRunViews.mockResolvedValue([
        { Success: true, Results: [] },
        { Success: true, Results: [] },
      ]);

      const cache = EntityDocumentCache.Instance;
      const mockUser = { ID: 'user-1' } as never;
      await cache.Refresh(true, mockUser);

      expect(mockRunViews).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ EntityName: 'Entity Documents' }),
          expect.objectContaining({ EntityName: 'Entity Document Types' }),
        ]),
        mockUser
      );
    });
  });

  describe('GetDocumentTypeByName after Refresh', () => {
    it('should find document type by name (case insensitive)', async () => {
      const mockTypes = [
        { ID: 'type-1', Name: 'Record Duplicate' },
      ];

      mockRunViews.mockResolvedValue([
        { Success: true, Results: [] },
        { Success: true, Results: mockTypes },
      ]);

      const cache = EntityDocumentCache.Instance;
      await cache.Refresh(true);

      const result = cache.GetDocumentTypeByName('record duplicate');
      expect(result).toBe(mockTypes[0]);
    });
  });
});
