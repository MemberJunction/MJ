import { describe, it, expect } from 'vitest';
import { VectorDBBase } from '../generic/VectorDBBase';
import {
  BaseRequestParams,
  BaseResponse,
  CreateIndexParams,
  EditIndexParams,
  IndexList,
  UpdateOptions,
  VectorRecord,
  RecordValues,
  RecordSparseValues,
  RecordMetadata,
  RecordMetadataValue,
  IndexDescription,
} from '../generic/record';
import { QueryOptions, QueryByRecordId, QueryByVectorValues, ScoredRecord, QueryResponse } from '../generic/query.types';

/**
 * Concrete implementation of VectorDBBase for testing
 */
class TestVectorDB extends VectorDBBase {
  listIndexes(): IndexList {
    return { indexes: [] };
  }
  getIndex(params: BaseRequestParams): BaseResponse {
    return { success: true, message: 'ok', data: null };
  }
  createIndex(params: CreateIndexParams): BaseResponse {
    return { success: true, message: 'created', data: null };
  }
  deleteIndex(params: BaseRequestParams): BaseResponse {
    return { success: true, message: 'deleted', data: null };
  }
  editIndex(params: EditIndexParams): BaseResponse {
    return { success: true, message: 'edited', data: null };
  }
  queryIndex(params: QueryOptions): BaseResponse {
    return { success: true, message: 'queried', data: null };
  }
  createRecord(record: VectorRecord): BaseResponse {
    return { success: true, message: 'record created', data: null };
  }
  createRecords(records: VectorRecord[]): BaseResponse {
    return { success: true, message: 'records created', data: null };
  }
  getRecord(param: BaseRequestParams): BaseResponse {
    return { success: true, message: 'record fetched', data: null };
  }
  getRecords(params: BaseRequestParams): BaseResponse {
    return { success: true, message: 'records fetched', data: null };
  }
  updateRecord(record: UpdateOptions): BaseResponse {
    return { success: true, message: 'record updated', data: null };
  }
  updateRecords(records: UpdateOptions): BaseResponse {
    return { success: true, message: 'records updated', data: null };
  }
  deleteRecord(record: VectorRecord): BaseResponse {
    return { success: true, message: 'record deleted', data: null };
  }
  deleteRecords(records: VectorRecord[]): BaseResponse {
    return { success: true, message: 'records deleted', data: null };
  }

  // Expose apiKey for testing
  getApiKeyForTest(): string {
    return this.apiKey;
  }
}

describe('VectorDBBase', () => {
  describe('constructor', () => {
    it('should accept a valid API key', () => {
      const db = new TestVectorDB('test-api-key');
      expect(db.getApiKeyForTest()).toBe('test-api-key');
    });

    it('should throw for empty API key', () => {
      expect(() => new TestVectorDB('')).toThrow('API key cannot be empty');
    });

    it('should throw for whitespace-only API key', () => {
      expect(() => new TestVectorDB('   ')).toThrow('API key cannot be empty');
    });
  });

  describe('index operations', () => {
    let db: TestVectorDB;

    beforeEach(() => {
      db = new TestVectorDB('test-key');
    });

    it('should list indexes', () => {
      const result = db.listIndexes();
      expect(result).toBeDefined();
      expect(result.indexes).toEqual([]);
    });

    it('should get an index', () => {
      const result = db.getIndex({ id: 'test-index' });
      expect(result.success).toBe(true);
    });

    it('should create an index', () => {
      const result = db.createIndex({
        id: 'new-index',
        dimension: 128,
        metric: 'cosine',
      });
      expect(result.success).toBe(true);
      expect(result.message).toBe('created');
    });

    it('should delete an index', () => {
      const result = db.deleteIndex({ id: 'test-index' });
      expect(result.success).toBe(true);
    });

    it('should edit an index', () => {
      const result = db.editIndex({ id: 'test-index' });
      expect(result.success).toBe(true);
    });

    it('should query an index by vector values', () => {
      const queryParams: QueryByVectorValues = {
        vector: [0.1, 0.2, 0.3],
        topK: 5,
        includeValues: true,
        includeMetadata: true,
      };
      const result = db.queryIndex(queryParams);
      expect(result.success).toBe(true);
    });

    it('should query an index by record ID', () => {
      const queryParams: QueryByRecordId = {
        id: 'record-123',
        topK: 5,
      };
      const result = db.queryIndex(queryParams);
      expect(result.success).toBe(true);
    });
  });

  describe('record operations', () => {
    let db: TestVectorDB;

    beforeEach(() => {
      db = new TestVectorDB('test-key');
    });

    it('should create a record', () => {
      const record: VectorRecord = {
        id: 'rec1',
        values: [0.1, 0.2, 0.3],
        metadata: { label: 'test' },
      };
      const result = db.createRecord(record);
      expect(result.success).toBe(true);
    });

    it('should create multiple records', () => {
      const records: VectorRecord[] = [
        { id: 'rec1', values: [0.1, 0.2] },
        { id: 'rec2', values: [0.3, 0.4] },
      ];
      const result = db.createRecords(records);
      expect(result.success).toBe(true);
    });

    it('should get a record', () => {
      const result = db.getRecord({ id: 'rec1' });
      expect(result.success).toBe(true);
    });

    it('should get records', () => {
      const result = db.getRecords({ id: 'batch-id' });
      expect(result.success).toBe(true);
    });

    it('should update a record', () => {
      const update: UpdateOptions = {
        id: 'rec1',
        values: [0.5, 0.6],
        metadata: { updated: 'true' },
      };
      const result = db.updateRecord(update);
      expect(result.success).toBe(true);
    });

    it('should update records', () => {
      const update: UpdateOptions = {
        id: 'batch-id',
        metadata: { batch: 'true' },
      };
      const result = db.updateRecords(update);
      expect(result.success).toBe(true);
    });

    it('should delete a record', () => {
      const record: VectorRecord = { id: 'rec1', values: [0.1] };
      const result = db.deleteRecord(record);
      expect(result.success).toBe(true);
    });

    it('should delete records', () => {
      const records: VectorRecord[] = [
        { id: 'rec1', values: [0.1] },
        { id: 'rec2', values: [0.2] },
      ];
      const result = db.deleteRecords(records);
      expect(result.success).toBe(true);
    });
  });
});

describe('Record types', () => {
  it('should create a valid VectorRecord', () => {
    const record: VectorRecord = {
      id: 'test-id',
      values: [0.1, 0.2, 0.3],
      metadata: { key: 'value' },
    };
    expect(record.id).toBe('test-id');
    expect(record.values).toHaveLength(3);
    expect(record.metadata).toEqual({ key: 'value' });
  });

  it('should create a VectorRecord with sparse values', () => {
    const record: VectorRecord = {
      id: 'sparse-id',
      values: [0.1, 0.2],
      sparseValues: {
        indices: [0, 5, 10],
        values: [0.1, 0.5, 1.0],
      },
    };
    expect(record.sparseValues).toBeDefined();
    expect(record.sparseValues!.indices).toHaveLength(3);
  });

  it('should support various metadata value types', () => {
    const record: VectorRecord = {
      id: 'meta-test',
      values: [1.0],
      metadata: {
        stringVal: 'hello',
        boolVal: true,
        numVal: 42,
        arrayVal: ['a', 'b', 'c'],
      },
    };
    expect(record.metadata!['stringVal']).toBe('hello');
    expect(record.metadata!['boolVal']).toBe(true);
    expect(record.metadata!['numVal']).toBe(42);
    expect(record.metadata!['arrayVal']).toEqual(['a', 'b', 'c']);
  });

  it('should create valid IndexDescription', () => {
    const index: IndexDescription = {
      name: 'my-index',
      dimension: 768,
      metric: 'cosine',
      host: 'https://example.com',
    };
    expect(index.name).toBe('my-index');
    expect(index.dimension).toBe(768);
  });

  it('should create valid ScoredRecord', () => {
    const scored: ScoredRecord = {
      id: 'match-1',
      values: [0.1, 0.2],
      score: 0.95,
    };
    expect(scored.score).toBe(0.95);
  });
});
