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

/** Captured before any test mutates it, so afterEach restores the shipped default. */
const DEFAULT_STALE_AFTER_MS = EntityDocumentCache.StaleAfterMs;

describe('EntityDocumentCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset the singleton between tests. `BaseSingleton` keeps instances in the global object
    // store keyed by class name, NOT in a `_instance` static — so the assignment this replaces
    // was a silent no-op and every case in this file shared one cache. That was survivable while
    // the cases only ever moved `_loaded` forward; it stops being survivable the moment a case
    // manipulates the clock.
    delete (globalThis as unknown as Record<string, unknown>)['___SINGLETON__EntityDocumentCache'];
    EntityDocumentCache.StaleAfterMs = DEFAULT_STALE_AFTER_MS;
    vi.useRealTimers();
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

    it('should skip an unforced refresh that lands inside the staleness window', async () => {
      // Deliberately still pinned: `Refresh` is called once per lookup, and a vectorize run over
      // many entities must not re-read this metadata for each one. What changed is that the skip
      // is now bounded by a window instead of being a permanent latch — see the tests below.
      mockKHEntityDocuments.length = 0;
      mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

      const cache = EntityDocumentCache.Instance;
      await cache.Refresh(true);
      const callCount = mockKHConfig.mock.calls.length;

      // Second call without force should be skipped
      await cache.Refresh(false);
      expect(mockKHConfig.mock.calls.length).toBe(callCount);
    });

    // -------------------------------------------------------------------------------------
    // `_loaded` used to be a one-way latch, and EVERY production caller passes false
    // (entityVectorSync.GetEntityDocument/GetEntityDocumentByName, the Vectorize Entity
    // action, KnowledgePipeline, KnowledgeAgent). So an Entity Document edited outside this
    // process was invisible until MJAPI restarted — and `_typeCache`, which is only ever
    // populated inside Refresh, was restart-only no matter what any caller passed.
    // -------------------------------------------------------------------------------------

    it('an out-of-band edit is visible to the next unforced refresh once the window passes', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      mockKHEntityDocuments.length = 0;
      mockRunViewFn.mockResolvedValue({ Success: true, Results: [{ ID: 'type-1', Name: 'Record Duplicate' }] });

      const cache = EntityDocumentCache.Instance;
      await cache.Refresh(false);
      const callCount = mockKHConfig.mock.calls.length;
      expect(cache.IsStale).toBe(false);

      // Someone edits an Entity Document directly in the database. Nobody tells this process.
      vi.setSystemTime(Date.now() + EntityDocumentCache.StaleAfterMs + 1);
      expect(cache.IsStale).toBe(true);

      mockKHEntityDocuments.push({ ID: 'doc-new', Name: 'Added Out Of Band' } as never);
      await cache.Refresh(false);

      expect(mockKHConfig.mock.calls.length).toBe(callCount + 1);
      expect(cache.GetDocument('doc-new')).toBe(mockKHEntityDocuments[0]);
    });

    it('forces the KH engine when it reloads, so documents refresh and not just types', async () => {
      // Passing the caller's `false` through would refresh the type cache while leaving the
      // Entity Documents stale — a half-refresh is harder to diagnose than no refresh.
      EntityDocumentCache.StaleAfterMs = 0;
      mockKHEntityDocuments.length = 0;
      mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

      const cache = EntityDocumentCache.Instance;
      await cache.Refresh(false);
      await cache.Refresh(false);

      expect(mockKHConfig.mock.calls.length).toBe(2);
      for (const call of mockKHConfig.mock.calls) {
        expect(call[0]).toBe(true);
      }
    });

    it('rebuilds the Entity Document Type cache, which used to be restart-only', async () => {
      EntityDocumentCache.StaleAfterMs = 0;
      mockKHEntityDocuments.length = 0;
      mockRunViewFn.mockResolvedValue({ Success: true, Results: [{ ID: 'type-1', Name: 'Record Duplicate' }] });

      const cache = EntityDocumentCache.Instance;
      await cache.Refresh(false);
      expect(cache.GetDocumentTypeByName('Search')).toBeNull();

      mockRunViewFn.mockResolvedValue({ Success: true, Results: [
        { ID: 'type-1', Name: 'Record Duplicate' },
        { ID: 'type-2', Name: 'Search' },
      ] });
      await cache.Refresh(false);

      expect(cache.GetDocumentTypeByName('Search')).toEqual({ ID: 'type-2', Name: 'Search' });
    });

    it('Invalidate drops the cached copy regardless of the window', async () => {
      mockKHEntityDocuments.length = 0;
      mockRunViewFn.mockResolvedValue({ Success: true, Results: [{ ID: 'type-1', Name: 'Record Duplicate' }] });

      const cache = EntityDocumentCache.Instance;
      await cache.Refresh(false);
      const callCount = mockKHConfig.mock.calls.length;
      expect(cache.IsStale).toBe(false);

      cache.Invalidate();

      expect(cache.IsLoaded).toBe(false);
      expect(cache.IsStale).toBe(true);
      expect(cache.GetDocumentType('type-1')).toBeNull();
      await cache.Refresh(false);
      expect(mockKHConfig.mock.calls.length).toBe(callCount + 1);
    });

    it('an infinite window restores the old latch, for a host that manages invalidation itself', async () => {
      EntityDocumentCache.StaleAfterMs = Number.POSITIVE_INFINITY;
      mockKHEntityDocuments.length = 0;
      mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

      const cache = EntityDocumentCache.Instance;
      await cache.Refresh(false);
      const callCount = mockKHConfig.mock.calls.length;
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
});
