import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IsColocatedVectorHost } from '@memberjunction/ai-vectordb';
import type { IMetadataProvider } from '@memberjunction/core';

const { mockRunView, mockRunViews, mockEntities, mockModels, mockVectorDBs, mockProvider } = vi.hoisted(() => {
  const mockRunView = vi.fn();
  const mockRunViews = vi.fn();
  const mockEntities = [
    { ID: 'entity-1', Name: 'MJTestEntity', FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true } },
  ];
  const mockModels = [
    { ID: 'model-1', AIModelType: 'Embeddings', DriverClass: 'TestDriver' },
    { ID: 'model-2', AIModelType: 'LLM', DriverClass: 'TestLLM' },
  ];
  const mockVectorDBs = [
    { ID: 'vdb-1', ClassKey: 'TestVectorDB' },
  ];
  const mockProvider = {
    Entities: mockEntities,
    CurrentUser: { ID: 'user-1', Email: 'test@test.com' },
    EntityByID: (id: string) => mockEntities.find(e => e.ID === id),
    ColocatedDialect: 'sqlserver',
    ColocatedSchema: '__mj',
    RunColocatedSQL: vi.fn(),
  };
  return { mockRunView, mockRunViews, mockEntities, mockModels, mockVectorDBs, mockProvider };
});

vi.mock('@memberjunction/core', () => {
  class MockMetadata {
    Entities = mockEntities;
    CurrentUser = { ID: 'user-1', Email: 'test@test.com' };
    EntityByID(id: string) { return mockEntities.find(e => e.ID === id); }
    static get Provider() { return mockProvider; }
  }
  class MockRunViewClass {
    RunView = mockRunView;
    RunViews = mockRunViews;
    static FromMetadataProvider = vi.fn().mockImplementation(() => new MockRunViewClass());
  }
  return {
    Metadata: MockMetadata,
    RunView: MockRunViewClass,
    CompositeKey: vi.fn().mockImplementation((pairs: Array<{ FieldName: string; Value: string }>) => ({
      KeyValuePairs: pairs,
      Values: () => pairs.map((p: { Value: string }) => p.Value).join(','),
      ToString: () => pairs.map((p: { FieldName: string; Value: string }) => `${p.FieldName}=${p.Value}`).join(', '),
    })),
    UserInfo: vi.fn(),
    BaseEntity: vi.fn(),
    EntityInfo: vi.fn(),
    RunViewResult: vi.fn(),
    LogError: vi.fn(),
  };
});

vi.mock('@memberjunction/aiengine', () => ({
  AIEngine: {
    Instance: {
      Models: mockModels,
      VectorDatabases: mockVectorDBs,
    },
  },
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJVectorDatabaseEntity: vi.fn(),
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
  MJAIModelEntityExtended: vi.fn(),
}));

import { VectorBase } from '../models/VectorBase';

describe('VectorBase', () => {
  let vectorBase: VectorBase;

  beforeEach(() => {
    vi.clearAllMocks();
    vectorBase = new VectorBase();
  });

  describe('constructor', () => {
    it('should initialize with RunView and Metadata', () => {
      expect(vectorBase.Metadata).toBeDefined();
      expect(vectorBase.RunView).toBeDefined();
      expect(vectorBase.CurrentUser).toBeDefined();
    });
  });

  describe('CurrentUser', () => {
    it('should get current user', () => {
      const user = vectorBase.CurrentUser;
      expect(user).toBeDefined();
    });

    it('should set current user', () => {
      const newUser = { ID: 'user-2', Email: 'new@test.com' } as never;
      vectorBase.CurrentUser = newUser;
      expect(vectorBase.CurrentUser).toBe(newUser);
    });
  });

  describe('Provider and colocated host wiring', () => {
    it('should fall back to Metadata.Provider when no provider is supplied', () => {
      expect(vectorBase.Provider).toBe(mockProvider);
      expect(vectorBase.Metadata).toBe(mockProvider);
    });

    it('should satisfy IsColocatedVectorHost via Provider fallback to colocated host', () => {
      expect(IsColocatedVectorHost(vectorBase.Provider)).toBe(true);
      // Contrast with _metadata which is the helper wrapper and does NOT implement IColocatedVectorHost
      expect(IsColocatedVectorHost(vectorBase._metadata)).toBe(false);
    });

    it('should use explicit provider when supplied in constructor', () => {
      const explicitProvider = {
        Entities: mockEntities,
        CurrentUser: { ID: 'user-custom', Email: 'custom@test.com' },
        EntityByID: (id: string) => mockEntities.find(e => e.ID === id),
        ColocatedDialect: 'postgresql',
        ColocatedSchema: 'public',
        RunColocatedSQL: vi.fn(),
      } as IMetadataProvider;
      const customBase = new VectorBase(explicitProvider);
      expect(customBase.Provider).toBe(explicitProvider);
      expect(customBase.Metadata).toBe(explicitProvider);
      expect(IsColocatedVectorHost(customBase.Provider)).toBe(true);
    });
  });

  describe('BuildExtraFilter (protected)', () => {
    it('should build filter from composite keys', () => {
      const compositeKeys = [
        { KeyValuePairs: [{ FieldName: 'ID', Value: '123' }] },
        { KeyValuePairs: [{ FieldName: 'ID', Value: '456' }] },
      ];
      const filter = (vectorBase as unknown as { BuildExtraFilter: (keys: typeof compositeKeys) => string }).BuildExtraFilter(compositeKeys);
      expect(filter).toContain("ID = '123'");
      expect(filter).toContain("ID = '456'");
      expect(filter).toContain(' OR ');
    });

    it('should handle composite keys with multiple fields', () => {
      const compositeKeys = [
        {
          KeyValuePairs: [
            { FieldName: 'ID', Value: '1' },
            { FieldName: 'Type', Value: 'A' },
          ],
        },
      ];
      const filter = (vectorBase as unknown as { BuildExtraFilter: (keys: typeof compositeKeys) => string }).BuildExtraFilter(compositeKeys);
      expect(filter).toContain("ID = '1'");
      expect(filter).toContain("Type = 'A'");
      expect(filter).toContain(' AND ');
    });
  });

  describe('GetAIModel (protected)', () => {
    it('should return default embeddings model when no ID provided', () => {
      const model = (vectorBase as unknown as { GetAIModel: (id?: string) => { ID: string; AIModelType: string } }).GetAIModel();
      expect(model).toBeDefined();
      expect(model.AIModelType).toBe('Embeddings');
    });

    it('should return specific model when ID provided', () => {
      const model = (vectorBase as unknown as { GetAIModel: (id?: string) => { ID: string } }).GetAIModel('model-1');
      expect(model.ID).toBe('model-1');
    });

    it('should throw when no embeddings model found', () => {
      const origModels = [...mockModels];
      mockModels.length = 0;
      mockModels.push({ ID: 'model-x', AIModelType: 'LLM', DriverClass: 'X' });

      expect(() =>
        (vectorBase as unknown as { GetAIModel: (id?: string) => unknown }).GetAIModel()
      ).toThrow('No AI Model Entity found');

      mockModels.length = 0;
      origModels.forEach(m => mockModels.push(m));
    });
  });

  describe('GetVectorDatabase (protected)', () => {
    it('should return default vector database when no ID provided', () => {
      const db = (vectorBase as unknown as { GetVectorDatabase: (id?: string) => { ID: string } }).GetVectorDatabase();
      expect(db).toBeDefined();
      expect(db.ID).toBe('vdb-1');
    });

    it('should return specific vector database when ID provided', () => {
      const db = (vectorBase as unknown as { GetVectorDatabase: (id?: string) => { ID: string } }).GetVectorDatabase('vdb-1');
      expect(db.ID).toBe('vdb-1');
    });

    it('should throw when no vector database found', () => {
      const origDBs = [...mockVectorDBs];
      mockVectorDBs.length = 0;

      expect(() =>
        (vectorBase as unknown as { GetVectorDatabase: (id?: string) => unknown }).GetVectorDatabase()
      ).toThrow('No Vector Database Entity found');

      origDBs.forEach(d => mockVectorDBs.push(d));
    });
  });

  describe('GetRecordsByEntityID (protected)', () => {
    it('should retrieve records by entity ID', async () => {
      const mockRecords = [{ ID: 'rec-1' }, { ID: 'rec-2' }];
      mockRunView.mockResolvedValue({
        Success: true,
        Results: mockRecords,
      });

      const records = await (vectorBase as unknown as { GetRecordsByEntityID: (entityID: string) => Promise<unknown[]> }).GetRecordsByEntityID('entity-1');
      expect(records).toEqual(mockRecords);
    });

    it('should throw when entity not found', async () => {
      await expect(
        (vectorBase as unknown as { GetRecordsByEntityID: (entityID: string) => Promise<unknown[]> }).GetRecordsByEntityID('non-existent')
      ).rejects.toThrow('Entity with ID non-existent not found');
    });

    it('should throw when RunView fails', async () => {
      mockRunView.mockResolvedValue({
        Success: false,
        ErrorMessage: 'Query failed',
      });

      await expect(
        (vectorBase as unknown as { GetRecordsByEntityID: (entityID: string) => Promise<unknown[]> }).GetRecordsByEntityID('entity-1')
      ).rejects.toThrow('Query failed');
    });
  });

  describe('RunViewForSingleValue (protected)', () => {
    it('should return single entity when found', async () => {
      const mockEntity = { ID: 'rec-1', Name: 'Test' };
      mockRunView.mockResolvedValue({
        Success: true,
        RowCount: 1,
        Results: [mockEntity],
      });

      const result = await (vectorBase as unknown as { RunViewForSingleValue: <T>(entityName: string, filter: string) => Promise<T | null> })
        .RunViewForSingleValue('MJTestEntity', "ID = '1'");
      expect(result).toBe(mockEntity);
    });

    it('should return null when no results', async () => {
      mockRunView.mockResolvedValue({
        Success: true,
        RowCount: 0,
        Results: [],
      });

      const result = await (vectorBase as unknown as { RunViewForSingleValue: <T>(entityName: string, filter: string) => Promise<T | null> })
        .RunViewForSingleValue('MJTestEntity', "ID = 'missing'");
      expect(result).toBeNull();
    });

    it('should return null on RunView failure', async () => {
      mockRunView.mockResolvedValue({
        Success: false,
        ErrorMessage: 'Failed',
      });

      const result = await (vectorBase as unknown as { RunViewForSingleValue: <T>(entityName: string, filter: string) => Promise<T | null> })
        .RunViewForSingleValue('MJTestEntity', "ID = '1'");
      expect(result).toBeNull();
    });
  });

  describe('SaveEntity (protected)', () => {
    it('should set ContextCurrentUser and save', async () => {
      const mockSave = vi.fn().mockResolvedValue(true);
      const mockEntity = {
        ContextCurrentUser: null as unknown,
        Save: mockSave,
      };

      const result = await (vectorBase as unknown as { SaveEntity: (entity: typeof mockEntity) => Promise<boolean> })
        .SaveEntity(mockEntity);
      expect(mockEntity.ContextCurrentUser).toBe(vectorBase.CurrentUser);
      expect(mockSave).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('PageRecordsByEntityID (protected)', () => {
    it('should page records correctly', async () => {
      const mockRecords = [{ ID: '1' }, { ID: '2' }];
      mockRunView.mockResolvedValue({
        Success: true,
        Results: mockRecords,
      });

      const result = await (vectorBase as unknown as {
        PageRecordsByEntityID: <T>(params: { EntityID: string; PageNumber: number; PageSize: number; ResultType: string }) => Promise<T[]>
      }).PageRecordsByEntityID({
        EntityID: 'entity-1',
        PageNumber: 1,
        PageSize: 10,
        ResultType: 'simple',
      });
      expect(result).toEqual(mockRecords);
    });

    it('should throw when entity not found', async () => {
      await expect(
        (vectorBase as unknown as {
          PageRecordsByEntityID: <T>(params: { EntityID: string; PageNumber: number; PageSize: number; ResultType: string }) => Promise<T[]>
        }).PageRecordsByEntityID({
          EntityID: 'non-existent',
          PageNumber: 1,
          PageSize: 10,
          ResultType: 'simple',
        })
      ).rejects.toThrow('Entity with ID non-existent not found');
    });
  });
});
