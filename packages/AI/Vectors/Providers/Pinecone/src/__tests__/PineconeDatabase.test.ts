import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */
const mockDescribeIndex = vi.hoisted(() => vi.fn());
const mockListIndexes = vi.hoisted(() => vi.fn());
const mockCreateIndex = vi.hoisted(() => vi.fn());
const mockDeleteIndex = vi.hoisted(() => vi.fn());
const mockIndex = vi.hoisted(() => vi.fn());

const mockIndexInstance = vi.hoisted(() => ({
  query: vi.fn(),
  upsert: vi.fn(),
  fetch: vi.fn(),
  update: vi.fn(),
  deleteOne: vi.fn(),
  deleteMany: vi.fn(),
  deleteAll: vi.fn(),
  namespace: vi.fn().mockReturnValue({ deleteAll: vi.fn() }),
}));

vi.mock('@pinecone-database/pinecone', () => {
  return {
    Pinecone: class MockPinecone {
      describeIndex = mockDescribeIndex;
      listIndexes = mockListIndexes;
      createIndex = mockCreateIndex;
      deleteIndex = mockDeleteIndex;
      Index = mockIndex.mockReturnValue(mockIndexInstance);
      index = mockIndex.mockReturnValue(mockIndexInstance);
      constructor(_opts: Record<string, unknown>) {}
    },
    Index: class {},
    FetchResponse: class {},
    QueryOptions: class {},
  };
});

vi.mock('../config', () => ({
  pineconeDefaultIndex: 'test-default-index',
  openAIAPIKey: 'fake-openai-key',
  pineconeHost: 'fake-host',
  pineconeAPIKey: 'fake-pinecone-key',
}));

vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (_target: unknown) => {},
}));

vi.mock('@memberjunction/ai-vectordb', () => {
  // Mirror the real VectorDBBase response helpers (now hoisted to the base class) so
  // subclasses that call this.wrapSuccessResponse / this.wrapFailureResponse work under the mock.
  class MockVectorDBBase {
    constructor(_apiKey: string) {}
    protected wrapSuccessResponse(data: unknown) {
      return { success: true, message: '', data };
    }
    protected wrapFailureResponse(message?: string) {
      return { success: false, message: message || 'An error occurred', data: null };
    }
  }
  return {
    VectorDBBase: MockVectorDBBase,
    BaseRequestParams: class {},
    BaseResponse: class {},
    CreateIndexParams: class {},
    EditIndexParams: class {},
    IndexDescription: class {},
    IndexList: class {},
    QueryResponse: class {},
    RecordMetadata: class {},
    VectorRecord: class {},
  };
});

vi.mock('@memberjunction/core', () => ({
  LogError: vi.fn(),
  LogStatus: vi.fn(),
}));

import { PineconeDatabase } from '../models/PineconeDatabase';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('PineconeDatabase', () => {
  let db: PineconeDatabase;

  beforeEach(() => {
    vi.clearAllMocks();
    db = new PineconeDatabase('test-pinecone-key');
  });

  /* ---- Constructor ---- */
  describe('constructor', () => {
    it('should create an instance with a Pinecone client', () => {
      expect(db).toBeInstanceOf(PineconeDatabase);
      expect(db.pinecone).toBeDefined();
    });
  });

  /* ---- GetIndex ---- */
  describe('GetIndex', () => {
    it('should return index using provided id', () => {
      const result = db.GetIndex({ id: 'my-index' } as never);
      expect(result.success).toBe(true);
      expect(mockIndex).toHaveBeenCalledWith('my-index');
    });

    it('should use default index when no id is provided', () => {
      const result = db.GetIndex();
      expect(result.success).toBe(true);
      expect(mockIndex).toHaveBeenCalledWith('test-default-index');
    });
  });

  /* ---- ListIndexes ---- */
  describe('ListIndexes', () => {
    it('should call Pinecone listIndexes', async () => {
      const mockIndexList = { indexes: [{ name: 'idx-1' }] };
      mockListIndexes.mockResolvedValueOnce(mockIndexList);

      const result = await db.ListIndexes();
      expect(result).toEqual(mockIndexList);
    });
  });

  /* ---- GetIndexDescription ---- */
  describe('GetIndexDescription', () => {
    it('should call describeIndex with the correct id', async () => {
      mockDescribeIndex.mockResolvedValueOnce({ name: 'my-index', dimension: 1536 });

      const result = await db.GetIndexDescription({ id: 'my-index' } as never);
      expect(result).toEqual({ name: 'my-index', dimension: 1536 });
      expect(mockDescribeIndex).toHaveBeenCalledWith('my-index');
    });
  });

  /* ---- CreateIndex ---- */
  describe('CreateIndex', () => {
    it('should call Pinecone createIndex with correct params', async () => {
      mockCreateIndex.mockResolvedValueOnce({ name: 'new-idx' });

      const result = await db.CreateIndex({
        id: 'new-idx',
        dimension: 1536,
        metric: 'cosine',
        additionalParams: { serverless: { cloud: 'aws', region: 'us-west-2' } },
      } as never);

      expect(result.success).toBe(true);
    });

    it('should return failure on error', async () => {
      mockCreateIndex.mockRejectedValueOnce(new Error('create fail'));

      const result = await db.CreateIndex({
        id: 'bad-idx',
        dimension: 1536,
        metric: 'cosine',
      } as never);

      expect(result.success).toBe(false);
    });
  });

  /* ---- DeleteIndex ---- */
  describe('DeleteIndex', () => {
    it('should call Pinecone deleteIndex', async () => {
      mockDeleteIndex.mockResolvedValueOnce(undefined);
      const result = await db.DeleteIndex({ id: 'del-idx' } as never);
      expect(result.success).toBe(true);
      expect(mockDeleteIndex).toHaveBeenCalledWith('del-idx');
    });

    it('should return failure on error', async () => {
      mockDeleteIndex.mockRejectedValueOnce(new Error('delete fail'));
      const result = await db.DeleteIndex({ id: 'fail-idx' } as never);
      expect(result.success).toBe(false);
    });
  });

  /* ---- QueryIndex ---- */
  describe('QueryIndex', () => {
    it('should query the index and return results', async () => {
      mockIndexInstance.query.mockResolvedValueOnce({ matches: [{ id: 'match1' }] });

      const result = await db.QueryIndex({ vector: [1, 2, 3], topK: 5 } as never);
      expect(result.success).toBe(true);
    });

    it('should return failure on error', async () => {
      mockIndexInstance.query.mockRejectedValueOnce(new Error('query fail'));
      const result = await db.QueryIndex({ vector: [1] } as never);
      expect(result.success).toBe(false);
    });
  });

  /* ---- CreateRecord / CreateRecords ---- */
  describe('CreateRecord', () => {
    it('should upsert a single record', async () => {
      mockIndexInstance.upsert.mockResolvedValueOnce(undefined);
      const result = await db.CreateRecord({ id: 'rec1', values: [1, 2] } as never);
      expect(result.success).toBe(true);
    });
  });

  /* ---- DeleteRecord / DeleteRecords ---- */
  describe('DeleteRecord', () => {
    it('should delete a single record', async () => {
      mockIndexInstance.deleteOne.mockResolvedValueOnce(undefined);
      const result = await db.DeleteRecord({ id: 'rec1' } as never);
      expect(result.success).toBe(true);
    });
  });

  describe('DeleteRecords', () => {
    it('should delete multiple records by ID', async () => {
      mockIndexInstance.deleteMany.mockResolvedValueOnce(undefined);
      const result = await db.DeleteRecords([
        { id: 'r1' }, { id: 'r2' },
      ] as never);
      expect(result.success).toBe(true);
      expect(mockIndexInstance.deleteMany).toHaveBeenCalledWith(['r1', 'r2']);
    });
  });

  /* ---- DeleteAllRecords ---- */
  describe('DeleteAllRecords', () => {
    it('should delete all records from the specified index', async () => {
      mockIndexInstance.deleteAll.mockResolvedValueOnce(undefined);
      const result = await db.DeleteAllRecords('mj-knowledge-index');
      expect(result.success).toBe(true);
      expect(mockIndex).toHaveBeenCalledWith('mj-knowledge-index');
      expect(mockIndexInstance.deleteAll).toHaveBeenCalled();
    });

    it('should delete all records from a specific namespace', async () => {
      const mockNsDeleteAll = vi.fn().mockResolvedValueOnce(undefined);
      mockIndexInstance.namespace.mockReturnValueOnce({ deleteAll: mockNsDeleteAll });
      const result = await db.DeleteAllRecords('mj-knowledge-index', 'my-namespace');
      expect(result.success).toBe(true);
      expect(mockIndexInstance.namespace).toHaveBeenCalledWith('my-namespace');
      expect(mockNsDeleteAll).toHaveBeenCalled();
    });

    it('should return failure on error', async () => {
      mockIndexInstance.deleteAll.mockRejectedValueOnce(new Error('delete all fail'));
      const result = await db.DeleteAllRecords('bad-index');
      expect(result.success).toBe(false);
    });
  });

  /* ---- DeleteRecord with indexName ---- */
  describe('DeleteRecord with indexName', () => {
    it('should use specified index for delete', async () => {
      mockIndexInstance.deleteOne.mockResolvedValueOnce(undefined);
      const result = await db.DeleteRecord({ id: 'rec1' } as never, 'my-index');
      expect(result.success).toBe(true);
      expect(mockIndex).toHaveBeenCalledWith('my-index');
    });
  });

  /* ---- DeleteRecords with indexName ---- */
  describe('DeleteRecords with indexName', () => {
    it('should use specified index for batch delete', async () => {
      mockIndexInstance.deleteMany.mockResolvedValueOnce(undefined);
      const result = await db.DeleteRecords([{ id: 'r1' }, { id: 'r2' }] as never, 'my-index');
      expect(result.success).toBe(true);
      expect(mockIndex).toHaveBeenCalledWith('my-index');
    });
  });

  /* ---- CreateRecords with indexName ---- */
  describe('CreateRecords with indexName', () => {
    it('should use specified index for upsert', async () => {
      mockIndexInstance.upsert.mockResolvedValueOnce(undefined);
      const result = await db.CreateRecords([{ id: 'r1', values: [1] }] as never, 'my-index');
      expect(result.success).toBe(true);
      expect(mockIndex).toHaveBeenCalledWith('my-index');
    });

    // Regression: a thrown upsert error (e.g. dimension mismatch) must surface as a FAILURE,
    // not be swallowed into a success=true response that makes the pipeline claim it worked.
    it('should return failure (not swallow) when upsert throws', async () => {
      mockIndexInstance.upsert.mockRejectedValueOnce(
        new Error('Vector dimension 1536 does not match the dimension of the index 512')
      );
      const result = await db.CreateRecords([{ id: 'r1', values: [1] }] as never, 'my-index');
      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.message).toContain('does not match the dimension');
    });
  });

  /* ---- GetRecords ---- */
  describe('GetRecords', () => {
    it('should return fetched records on success', async () => {
      mockIndexInstance.fetch.mockResolvedValueOnce({ records: {} });
      const result = await db.GetRecords({ id: 'idx', data: ['r1'] } as never);
      expect(result.success).toBe(true);
    });

    // Regression: a thrown fetch error must surface as a FAILURE, not a success with null data.
    it('should return failure (not swallow) when fetch throws', async () => {
      mockIndexInstance.fetch.mockRejectedValueOnce(new Error('fetch boom'));
      const result = await db.GetRecords({ id: 'idx', data: ['r1'] } as never);
      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.message).toContain('fetch boom');
    });
  });

  /* ---- QueryIndex with index name in params ---- */
  describe('QueryIndex with index name', () => {
    it('should use id from params for index selection and strip id from query', async () => {
      mockIndexInstance.query.mockResolvedValueOnce({ matches: [] });
      const result = await db.QueryIndex({ id: 'my-index', vector: [1, 2], topK: 5 } as never);
      expect(result.success).toBe(true);
      expect(mockIndex).toHaveBeenCalledWith('my-index');
      // id should be stripped from the query params passed to index.query()
      expect(mockIndexInstance.query).toHaveBeenCalledWith(
        expect.not.objectContaining({ id: 'my-index' })
      );
    });
  });

  /* ---- GetDefaultIndex ---- */
  describe('GetDefaultIndex', () => {
    it('should return cached default index on second call', async () => {
      const idx = await db.GetDefaultIndex();
      expect(idx).toBeDefined();
      const idx2 = await db.GetDefaultIndex();
      // second call should return same cached instance
      expect(idx2).toBe(idx);
    });
  });

  /* ---- BuildProviderDirectives ---- */
  describe('BuildProviderDirectives', () => {
    it('returns namespace from namespaceField in providerConfig', () => {
      const directives = db.BuildProviderDirectives(
        { OrganizationID: 'org-abc', Name: 'Acme' },
        { namespaceField: 'OrganizationID' },
      );
      expect(directives).toEqual({ namespace: 'org-abc' });
    });

    it('returns empty object when namespaceField is not in providerConfig', () => {
      const directives = db.BuildProviderDirectives(
        { OrganizationID: 'org-abc' },
        {},
      );
      expect(directives).toEqual({});
    });

    it('returns empty object when the named field is absent from the source record', () => {
      const directives = db.BuildProviderDirectives(
        { Name: 'Acme' },
        { namespaceField: 'OrganizationID' },
      );
      expect(directives).toEqual({});
    });

    it('coerces non-string namespace values to string', () => {
      const directives = db.BuildProviderDirectives(
        { TenantID: 42 },
        { namespaceField: 'TenantID' },
      );
      expect(directives).toEqual({ namespace: '42' });
    });
  });

  /* ---- CreateRecords — namespace routing via providerTemporaryDirectives ---- */
  describe('CreateRecords — per-record namespace via providerTemporaryDirectives', () => {
    it('groups records by providerTemporaryDirectives.namespace and upserts per-namespace', async () => {
      const mockNsAUpsert = vi.fn().mockResolvedValue(undefined);
      const mockNsBUpsert = vi.fn().mockResolvedValue(undefined);
      mockIndexInstance.namespace
        .mockReturnValueOnce({ upsert: mockNsAUpsert })
        .mockReturnValueOnce({ upsert: mockNsBUpsert });

      const records = [
        { id: 'r1', values: [1], providerTemporaryDirectives: { namespace: 'org-a' } },
        { id: 'r2', values: [2], providerTemporaryDirectives: { namespace: 'org-b' } },
        { id: 'r3', values: [3], providerTemporaryDirectives: { namespace: 'org-a' } },
      ] as never;

      const result = await db.CreateRecords(records);
      expect(result.success).toBe(true);
      expect(mockIndexInstance.namespace).toHaveBeenCalledWith('org-a');
      expect(mockIndexInstance.namespace).toHaveBeenCalledWith('org-b');
      expect(mockNsAUpsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'r1' }),
          expect.objectContaining({ id: 'r3' }),
        ]),
      );
      expect(mockNsBUpsert).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'r2' })]),
      );
    });

    it('strips providerTemporaryDirectives from records before upsert', async () => {
      const mockNsUpsert = vi.fn().mockResolvedValue(undefined);
      mockIndexInstance.namespace.mockReturnValueOnce({ upsert: mockNsUpsert });

      const records = [
        { id: 'r1', values: [1], metadata: { Entity: 'Contacts' }, providerTemporaryDirectives: { namespace: 'org-x' } },
      ] as never;

      await db.CreateRecords(records);
      const upserted = mockNsUpsert.mock.calls[0][0];
      expect(upserted[0]).not.toHaveProperty('providerTemporaryDirectives');
      expect(upserted[0]).toMatchObject({ id: 'r1', metadata: { Entity: 'Contacts' } });
    });

    it('falls back to providerConfig.namespace for a homogeneous batch with no providerTemporaryDirectives', async () => {
      mockIndexInstance.namespace.mockReturnValueOnce({ upsert: vi.fn().mockResolvedValue(undefined) });

      const records = [{ id: 'r1', values: [1] }] as never;
      const result = await db.CreateRecords(records, undefined, { namespace: 'org-fallback' });

      expect(result.success).toBe(true);
      expect(mockIndexInstance.namespace).toHaveBeenCalledWith('org-fallback');
    });

    it('returns failure when upsert throws in multi-namespace path', async () => {
      mockIndexInstance.namespace.mockReturnValueOnce({
        upsert: vi.fn().mockRejectedValue(new Error('dimension mismatch')),
      });

      const records = [
        { id: 'r1', values: [1], providerTemporaryDirectives: { namespace: 'org-a' } },
      ] as never;

      const result = await db.CreateRecords(records);
      expect(result.success).toBe(false);
      expect(result.message).toContain('dimension mismatch');
    });
  });
});
