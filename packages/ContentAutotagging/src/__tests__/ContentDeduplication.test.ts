import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mock functions — tests reconfigure per scenario
const mockRunViewFn = vi.fn().mockResolvedValue({
  Success: true,
  Results: [],
});

const mockSaveFn = vi.fn().mockResolvedValue(true);
const mockNewRecordFn = vi.fn();
const mockGetEntityObjectFn = vi.fn().mockResolvedValue({
  NewRecord: mockNewRecordFn,
  Save: mockSaveFn,
  Set: vi.fn(),
  Get: vi.fn(),
  ID: 'dup-record-id',
  ContentItemAID: '',
  ContentItemBID: '',
  SimilarityScore: 0,
  DetectionMethod: 'Checksum' as const,
  Status: 'Pending' as const,
});

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  class MockMetadata {
    GetEntityObject = mockGetEntityObjectFn;
    // Multi-provider migration: dedup logic uses this.ProviderToUse, which falls back to
    // Metadata.Provider. Mirror the helper instance shape on the static via a lazy getter
    // (vi.mock hoists the factory above any top-level `mockGetEntityObjectFn` declaration,
    // so we can't reference it directly at class-init time — the getter resolves at call time).
    static Provider = {
      get GetEntityObject() { return mockGetEntityObjectFn; },
    };
  }
  class MockRunView {
    RunView = mockRunViewFn;
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
          CreateInstance: vi.fn().mockReturnValue({}),
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
  AIPromptRunner: vi.fn(),
  AIModelRunner: vi.fn(),
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
  TextChunker: { ChunkText: vi.fn().mockReturnValue([]) },
  ChunkTextParams: vi.fn(),
}));

vi.mock('@memberjunction/aiengine', () => ({
  AIEngine: {
    Instance: {
      Config: vi.fn(),
      Models: [],
      Prompts: [],
    },
  },
}));

vi.mock('@memberjunction/tag-engine', () => ({
  TagEngine: { Instance: { Config: vi.fn(), Tags: [], GetTaxonomyTree: vi.fn().mockReturnValue([]) } },
}));

vi.mock('@memberjunction/tag-engine-base', () => ({
  TagEngineBase: class {},
}));

vi.mock('pdf-parse', () => ({ default: vi.fn() }));
vi.mock('officeparser', () => ({ default: { parseOffice: vi.fn() } }));
vi.mock('date-fns-tz', () => ({ toZonedTime: vi.fn() }));
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('cheerio', () => ({ load: vi.fn() }));

import { AutotagBaseEngine } from '../Engine/generic/AutotagBaseEngine';
import { LogError, LogStatus } from '@memberjunction/core';
import type { MJContentItemEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';

/**
 * Creates a mock MJContentItemEntity with the given field overrides.
 */
function createMockContentItem(overrides: Partial<{
  ID: string;
  Name: string | null;
  Checksum: string | null;
  ContentSourceID: string;
}>): MJContentItemEntity {
  return {
    ID: 'ID' in overrides ? overrides.ID : 'item-1',
    Name: 'Name' in overrides ? overrides.Name : 'Test Article',
    Checksum: 'Checksum' in overrides ? overrides.Checksum : 'abc123hash',
    ContentSourceID: 'ContentSourceID' in overrides ? overrides.ContentSourceID : 'source-1',
  } as unknown as MJContentItemEntity;
}

const mockContextUser = { ID: 'user-1', Name: 'Test User' } as unknown as UserInfo;

describe('Content Deduplication', () => {
  let engine: AutotagBaseEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create engine instance directly (bypasses Config/singleton for unit tests)
    engine = new (AutotagBaseEngine as unknown as { new(): AutotagBaseEngine })();
    // Multi-provider migration: AutotagBaseEngine uses this.ProviderToUse, which falls back
    // to Metadata.Provider. Stub the engine's ProviderToUse getter so tests reach the
    // mockGetEntityObjectFn directly instead of going through the (real) BaseEngine fallback.
    Object.defineProperty(engine, 'ProviderToUse', {
      get() {
        return { GetEntityObject: mockGetEntityObjectFn };
      },
      configurable: true,
    });

    // Default: RunView returns no results (no duplicates, no existing records)
    mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

    // Default: entity object mock for creating duplicate records
    mockSaveFn.mockResolvedValue(true);
    mockGetEntityObjectFn.mockResolvedValue({
      NewRecord: mockNewRecordFn,
      Save: mockSaveFn,
      Set: vi.fn(),
      Get: vi.fn(),
      ID: 'dup-record-id',
      ContentItemAID: '',
      ContentItemBID: '',
      SimilarityScore: 0,
      DetectionMethod: 'Checksum' as const,
      Status: 'Pending' as const,
    });
  });

  // ----------------------------------------------------------------
  // Checksum-based dedup
  // ----------------------------------------------------------------
  describe('DetectChecksumDuplicates', () => {
    it('should create a duplicate record when a checksum match is found in a different source', async () => {
      const contentItem = createMockContentItem({
        ID: 'item-A',
        Checksum: 'same-hash',
        ContentSourceID: 'source-1',
      });

      // First call: find items with matching checksum (returns one match)
      // Second call: check existing duplicate records (returns none)
      mockRunViewFn
        .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'item-B' }] })  // checksum matches
        .mockResolvedValueOnce({ Success: true, Results: [] });                  // no existing dup

      await engine.DetectChecksumDuplicates(contentItem, mockContextUser);

      // Should have queried for checksum matches
      expect(mockRunViewFn).toHaveBeenCalledTimes(2);
      const firstCall = mockRunViewFn.mock.calls[0][0];
      expect(firstCall.EntityName).toBe('MJ: Content Items');
      expect(firstCall.ExtraFilter).toContain('same-hash');
      expect(firstCall.ExtraFilter).toContain('source-1');

      // Should have created a duplicate record
      expect(mockGetEntityObjectFn).toHaveBeenCalledWith('MJ: Content Item Duplicates', mockContextUser);
      expect(mockNewRecordFn).toHaveBeenCalled();
      expect(mockSaveFn).toHaveBeenCalled();
    });

    it('should not create a duplicate record when no checksum match is found', async () => {
      const contentItem = createMockContentItem({
        ID: 'item-A',
        Checksum: 'unique-hash',
        ContentSourceID: 'source-1',
      });

      // No matches
      mockRunViewFn.mockResolvedValueOnce({ Success: true, Results: [] });

      await engine.DetectChecksumDuplicates(contentItem, mockContextUser);

      // Only one RunView call (the checksum search), no entity creation
      expect(mockRunViewFn).toHaveBeenCalledTimes(1);
      expect(mockGetEntityObjectFn).not.toHaveBeenCalled();
    });

    it('should not create a duplicate record when the pair already exists', async () => {
      const contentItem = createMockContentItem({
        ID: 'item-A',
        Checksum: 'same-hash',
        ContentSourceID: 'source-1',
      });

      // First call: find checksum match
      // Second call: existing duplicate record found
      mockRunViewFn
        .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'item-B' }] })
        .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'existing-dup' }] });

      await engine.DetectChecksumDuplicates(contentItem, mockContextUser);

      // Should NOT have created a new duplicate record
      expect(mockGetEntityObjectFn).not.toHaveBeenCalled();
    });

    it('should skip detection when content item has no checksum', async () => {
      const contentItem = createMockContentItem({
        ID: 'item-A',
        Checksum: null,
        ContentSourceID: 'source-1',
      });

      await engine.DetectChecksumDuplicates(contentItem, mockContextUser);

      expect(mockRunViewFn).not.toHaveBeenCalled();
    });

    it('should log error and not throw when RunView fails', async () => {
      const contentItem = createMockContentItem({
        ID: 'item-A',
        Checksum: 'some-hash',
        ContentSourceID: 'source-1',
      });

      mockRunViewFn.mockResolvedValueOnce({ Success: false, Results: [], ErrorMessage: 'DB error' });

      // Should not throw
      await engine.DetectChecksumDuplicates(contentItem, mockContextUser);

      expect(mockGetEntityObjectFn).not.toHaveBeenCalled();
    });

    it('should handle multiple checksum matches and create records for each', async () => {
      const contentItem = createMockContentItem({
        ID: 'item-A',
        Checksum: 'shared-hash',
        ContentSourceID: 'source-1',
      });

      // Multiple matches found
      mockRunViewFn
        .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'item-B' }, { ID: 'item-C' }] })
        .mockResolvedValueOnce({ Success: true, Results: [] })  // no existing dup for (A, B)
        .mockResolvedValueOnce({ Success: true, Results: [] }); // no existing dup for (A, C)

      await engine.DetectChecksumDuplicates(contentItem, mockContextUser);

      // Should have created two duplicate records
      expect(mockSaveFn).toHaveBeenCalledTimes(2);
    });
  });

  // ----------------------------------------------------------------
  // Title-based dedup
  // ----------------------------------------------------------------
  describe('DetectTitleDuplicates', () => {
    it('should create a duplicate record when a title match is found in a different source', async () => {
      const contentItem = createMockContentItem({
        ID: 'item-A',
        Name: 'Breaking News Article',
        ContentSourceID: 'source-1',
      });

      mockRunViewFn
        .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'item-B' }] })  // title match
        .mockResolvedValueOnce({ Success: true, Results: [] });                  // no existing dup

      await engine.DetectTitleDuplicates(contentItem, mockContextUser);

      expect(mockRunViewFn).toHaveBeenCalledTimes(2);
      const firstCall = mockRunViewFn.mock.calls[0][0];
      expect(firstCall.EntityName).toBe('MJ: Content Items');
      expect(firstCall.ExtraFilter).toContain('Breaking News Article');

      expect(mockGetEntityObjectFn).toHaveBeenCalledWith('MJ: Content Item Duplicates', mockContextUser);
      expect(mockSaveFn).toHaveBeenCalled();
    });

    it('should not create a duplicate record when no title match is found', async () => {
      const contentItem = createMockContentItem({
        ID: 'item-A',
        Name: 'Unique Title',
        ContentSourceID: 'source-1',
      });

      mockRunViewFn.mockResolvedValueOnce({ Success: true, Results: [] });

      await engine.DetectTitleDuplicates(contentItem, mockContextUser);

      expect(mockRunViewFn).toHaveBeenCalledTimes(1);
      expect(mockGetEntityObjectFn).not.toHaveBeenCalled();
    });

    it('should skip detection when content item has no name', async () => {
      const contentItem = createMockContentItem({
        ID: 'item-A',
        Name: null,
        ContentSourceID: 'source-1',
      });

      await engine.DetectTitleDuplicates(contentItem, mockContextUser);

      expect(mockRunViewFn).not.toHaveBeenCalled();
    });

    it('should skip detection when content item name is empty/whitespace', async () => {
      const contentItem = createMockContentItem({
        ID: 'item-A',
        Name: '   ',
        ContentSourceID: 'source-1',
      });

      await engine.DetectTitleDuplicates(contentItem, mockContextUser);

      expect(mockRunViewFn).not.toHaveBeenCalled();
    });

    it('should not create a duplicate when the pair already exists for Title method', async () => {
      const contentItem = createMockContentItem({
        ID: 'item-A',
        Name: 'Shared Title',
        ContentSourceID: 'source-1',
      });

      mockRunViewFn
        .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'item-B' }] })
        .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'existing-dup' }] });

      await engine.DetectTitleDuplicates(contentItem, mockContextUser);

      expect(mockGetEntityObjectFn).not.toHaveBeenCalled();
    });

    it('should handle titles with single quotes by escaping them', async () => {
      const contentItem = createMockContentItem({
        ID: 'item-A',
        Name: "O'Brien's Article",
        ContentSourceID: 'source-1',
      });

      mockRunViewFn.mockResolvedValueOnce({ Success: true, Results: [] });

      await engine.DetectTitleDuplicates(contentItem, mockContextUser);

      const filter = mockRunViewFn.mock.calls[0][0].ExtraFilter as string;
      expect(filter).toContain("O''Brien''s Article");
    });
  });

  // ----------------------------------------------------------------
  // Combined DetectDuplicates
  // ----------------------------------------------------------------
  describe('DetectDuplicates', () => {
    it('should run both checksum and title detection in parallel', async () => {
      const contentItem = createMockContentItem({
        ID: 'item-A',
        Name: 'Test Article',
        Checksum: 'test-hash',
        ContentSourceID: 'source-1',
      });

      // No matches for either method
      mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

      await engine.DetectDuplicates(contentItem, mockContextUser);

      // Should have made at least 2 RunView calls (one for checksum, one for title)
      expect(mockRunViewFn).toHaveBeenCalledTimes(2);
    });
  });

  // ----------------------------------------------------------------
  // Vector-based dedup
  // ----------------------------------------------------------------
  describe('DetectVectorDuplicates', () => {
    it('should skip when enableVectorDedup is false (default)', async () => {
      const contentItem = createMockContentItem({
        ID: 'item-A',
        ContentSourceID: 'source-1',
      });
      // Override text on the mock
      (contentItem as Record<string, unknown>)['Text'] = 'Some text content';

      await engine.DetectVectorDuplicates(contentItem, mockContextUser);

      // Should not have made any RunView calls
      expect(mockRunViewFn).not.toHaveBeenCalled();
    });

    it('should skip when content item has no text', async () => {
      const contentItem = createMockContentItem({
        ID: 'item-A',
        ContentSourceID: 'source-1',
      });
      (contentItem as Record<string, unknown>)['Text'] = '';

      await engine.DetectVectorDuplicates(contentItem, mockContextUser, true);

      expect(mockRunViewFn).not.toHaveBeenCalled();
    });

    it('should skip when content item text is null', async () => {
      const contentItem = createMockContentItem({
        ID: 'item-A',
        ContentSourceID: 'source-1',
      });
      (contentItem as Record<string, unknown>)['Text'] = null;

      await engine.DetectVectorDuplicates(contentItem, mockContextUser, true);

      expect(mockRunViewFn).not.toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------------
  // Resolution logic
  // ----------------------------------------------------------------
  describe('ResolveContentDuplicate', () => {
    it('should mark duplicate as Dismissed with NotDuplicate resolution', async () => {
      const mockDupEntity = {
        Load: vi.fn().mockResolvedValue(true),
        Save: vi.fn().mockResolvedValue(true),
        Status: 'Pending' as string,
        Resolution: '' as string,
        LatestResult: null as { Message: string } | null,
      };
      mockGetEntityObjectFn.mockResolvedValueOnce(mockDupEntity);

      const result = await engine.ResolveContentDuplicate('dup-123', 'NotDuplicate', mockContextUser);

      expect(result).toBe(true);
      expect(mockDupEntity.Status).toBe('Dismissed');
      expect(mockDupEntity.Resolution).toBe('NotDuplicate');
      expect(mockDupEntity.Save).toHaveBeenCalled();
    });

    it('should mark duplicate as Merged with KeepA resolution', async () => {
      const mockDupEntity = {
        Load: vi.fn().mockResolvedValue(true),
        Save: vi.fn().mockResolvedValue(true),
        Status: 'Pending' as string,
        Resolution: '' as string,
        LatestResult: null as { Message: string } | null,
      };
      mockGetEntityObjectFn.mockResolvedValueOnce(mockDupEntity);

      const result = await engine.ResolveContentDuplicate('dup-456', 'KeepA', mockContextUser);

      expect(result).toBe(true);
      expect(mockDupEntity.Status).toBe('Merged');
      expect(mockDupEntity.Resolution).toBe('KeepA');
    });

    it('should mark duplicate as Merged with KeepB resolution', async () => {
      const mockDupEntity = {
        Load: vi.fn().mockResolvedValue(true),
        Save: vi.fn().mockResolvedValue(true),
        Status: 'Pending' as string,
        Resolution: '' as string,
        LatestResult: null as { Message: string } | null,
      };
      mockGetEntityObjectFn.mockResolvedValueOnce(mockDupEntity);

      const result = await engine.ResolveContentDuplicate('dup-789', 'KeepB', mockContextUser);

      expect(result).toBe(true);
      expect(mockDupEntity.Status).toBe('Merged');
      expect(mockDupEntity.Resolution).toBe('KeepB');
    });

    it('should return false when duplicate record cannot be loaded', async () => {
      const mockDupEntity = {
        Load: vi.fn().mockResolvedValue(false),
        Save: vi.fn(),
        Status: 'Pending' as string,
        Resolution: '' as string,
        LatestResult: null as { Message: string } | null,
      };
      mockGetEntityObjectFn.mockResolvedValueOnce(mockDupEntity);

      const result = await engine.ResolveContentDuplicate('bad-id', 'KeepA', mockContextUser);

      expect(result).toBe(false);
      expect(mockDupEntity.Save).not.toHaveBeenCalled();
    });

    it('should return false when save fails', async () => {
      const mockDupEntity = {
        Load: vi.fn().mockResolvedValue(true),
        Save: vi.fn().mockResolvedValue(false),
        Status: 'Pending' as string,
        Resolution: '' as string,
        LatestResult: { Message: 'Save error' },
      };
      mockGetEntityObjectFn.mockResolvedValueOnce(mockDupEntity);

      const result = await engine.ResolveContentDuplicate('dup-fail', 'KeepA', mockContextUser);

      expect(result).toBe(false);
    });
  });

  // ----------------------------------------------------------------
  // Canonical ordering
  // ----------------------------------------------------------------
  describe('Canonical ID ordering', () => {
    it('should store the lexicographically smaller ID as ContentItemAID', async () => {
      // item-Z (larger) is the "current" item, item-A (smaller) is the match
      const contentItem = createMockContentItem({
        ID: 'zzzz-item',
        Checksum: 'same-hash',
        ContentSourceID: 'source-1',
      });

      const mockDupEntity = {
        NewRecord: mockNewRecordFn,
        Save: mockSaveFn,
        ContentItemAID: '',
        ContentItemBID: '',
        SimilarityScore: 0,
        DetectionMethod: '' as 'Checksum' | 'Title' | 'URL' | 'Vector',
        Status: '' as 'Pending' | 'Confirmed' | 'Dismissed' | 'Merged',
      };
      mockGetEntityObjectFn.mockResolvedValueOnce(mockDupEntity);

      mockRunViewFn
        .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'aaaa-item' }] })  // match
        .mockResolvedValueOnce({ Success: true, Results: [] });                     // no existing dup

      await engine.DetectChecksumDuplicates(contentItem, mockContextUser);

      // aaaa-item < zzzz-item, so aaaa-item should be ContentItemAID
      expect(mockDupEntity.ContentItemAID).toBe('aaaa-item');
      expect(mockDupEntity.ContentItemBID).toBe('zzzz-item');
    });
  });
});
