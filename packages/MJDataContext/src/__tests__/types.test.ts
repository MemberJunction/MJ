import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/core', () => ({
  BaseEntity: class {
    PrimaryKey = { ToString: () => 'pk-123' };
    EntityInfo = { ID: 'ent-1', Name: 'TestEntity', Fields: [] };
  },
  DataObjectRelatedEntityParam: class {},
  EntityInfo: class { ID = ''; Name = ''; Fields = []; RelatedEntities = []; },
  LogError: vi.fn(),
  Metadata: class { Entities = []; Provider = {}; },
  KeyValuePair: class {},
  QueryInfo: class { ID = ''; Name = ''; Fields = []; SQL = ''; },
  RunQuery: class { RunQuery = vi.fn() },
  RunView: class { RunView = vi.fn() },
  RunViewParams: class {},
  UserInfo: class {},
  CompositeKey: class { KeyValuePairs: unknown[] = [] },
  IMetadataProvider: class {},
  IRunViewProvider: class {},
}));

vi.mock('@memberjunction/core-entities', () => ({
  DataContextEntity: class { ID = ''; },
  DataContextItemEntity: class {
    ID = '';
    Type = '';
    EntityID = '';
    ViewID = '';
    QueryID = '';
    RecordID = '';
    SQL = '';
    CodeName = '';
    DataJSON = '';
  },
  DataContextItemEntityType: class {},
  UserViewEntityExtended: class {
    ID = '';
    Name = '';
    ViewEntityInfo = { ID: '', Name: '', Fields: [], SchemaName: '', BaseView: '' };
    WhereClause = '';
  },
}));

vi.mock('@memberjunction/global', () => ({
  MJGlobal: {
    Instance: {
      ClassFactory: {
        CreateInstance: () => new (DataContextItemClass)(),
      },
    },
  },
  RegisterClass: () => (_target: Function) => {},
}));

// Need to get reference to the actual class after import
let DataContextItemClass: { new(): Record<string, unknown> };

import { DataContextFieldInfo, DataContextItem, DataContext } from '../types';

describe('MJDataContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DataContextFieldInfo', () => {
    it('should create a field info object', () => {
      const field = new DataContextFieldInfo();
      field.Name = 'TestField';
      field.Type = 'nvarchar';
      field.Description = 'A test field';
      expect(field.Name).toBe('TestField');
      expect(field.Type).toBe('nvarchar');
    });
  });

  describe('DataContextItem', () => {
    it('should have correct default state', () => {
      const item = new DataContextItem();
      expect(item.DataLoaded).toBe(false);
      expect(item.Fields).toEqual([]);
    });

    it('should set DataLoaded when Data is assigned', () => {
      const item = new DataContextItem();
      item.Data = [{ id: 1 }];
      expect(item.DataLoaded).toBe(true);
      expect(item.DataLoadingError).toBeNull();
    });

    it('should generate correct Description for view type', () => {
      const item = new DataContextItem();
      item.Type = 'view';
      item.RecordName = 'Active Users';
      item.EntityName = 'Users';
      expect(item.Description).toBe('View: Active Users, From Entity: Users');
    });

    it('should generate correct Description for query type', () => {
      const item = new DataContextItem();
      item.Type = 'query';
      item.RecordName = 'GetTopProducts';
      expect(item.Description).toBe('Query: GetTopProducts');
    });

    it('should generate correct Description for full_entity type', () => {
      const item = new DataContextItem();
      item.Type = 'full_entity';
      item.EntityName = 'Products';
      expect(item.Description).toBe('Full Entity - All Records: Products');
    });

    it('should generate correct Description for sql type', () => {
      const item = new DataContextItem();
      item.Type = 'sql';
      item.RecordName = 'Custom SQL';
      expect(item.Description).toBe('SQL Statement: Custom SQL');
    });

    it('should append AdditionalDescription when present', () => {
      const item = new DataContextItem();
      item.Type = 'query';
      item.RecordName = 'MyQuery';
      item.AdditionalDescription = 'Extra info';
      expect(item.Description).toContain('(More Info: Extra info)');
    });

    it('should validate data exists when Data is set', () => {
      const item = new DataContextItem();
      item.Data = [];
      expect(item.ValidateDataExists()).toBe(true);
    });

    it('should fail validation when Data is not set', () => {
      const item = new DataContextItem();
      expect(item.ValidateDataExists()).toBe(false);
    });

    it('should skip validation with ignoreFailedLoad when not loaded', () => {
      const item = new DataContextItem();
      expect(item.ValidateDataExists(true)).toBe(true);
    });

    it('should load data from object', () => {
      const item = new DataContextItem();
      const result = item.LoadDataFromObject([{ id: 1 }, { id: 2 }]);
      expect(result).toBe(true);
      expect(item.Data).toHaveLength(2);
    });

    it('should return false when loading null data from object', () => {
      const item = new DataContextItem();
      const result = item.LoadDataFromObject(null as unknown as unknown[]);
      expect(result).toBe(false);
    });

    it('should throw when calling LoadFromSQL on base class', async () => {
      const item = new DataContextItem();
      item.Type = 'sql';
      item.SQL = 'SELECT 1';
      await expect(item.LoadData(null, true)).rejects.toThrow('Not implemented');
    });
  });

  describe('DataContext', () => {
    it('should start with empty Items array', () => {
      const ctx = new DataContext();
      expect(ctx.Items).toEqual([]);
    });

    it('should return true for empty Items array (vacuously valid)', () => {
      const ctx = new DataContext();
      // With no items, .some() returns false, so !false = true (vacuously valid)
      expect(ctx.ValidateDataExists()).toBe(true);
    });

    it('should convert to simple object', () => {
      const ctx = new DataContext();
      const item = new DataContextItem();
      item.Data = [{ id: 1 }];
      ctx.Items.push(item);
      const result = ctx.ConvertToSimpleObject();
      expect(result).toHaveProperty('data_item_0');
      expect(result.data_item_0).toEqual([{ id: 1 }]);
    });

    it('should convert to simple object with custom prefix', () => {
      const ctx = new DataContext();
      const item = new DataContextItem();
      item.Data = [{ id: 1 }];
      ctx.Items.push(item);
      const result = ctx.ConvertToSimpleObject('item_');
      expect(result).toHaveProperty('item_0');
    });

    it('should create simple object type definition', () => {
      const ctx = new DataContext();
      const item = new DataContextItem();
      item.Type = 'query';
      item.RecordName = 'Q1';
      item.Data = [{ id: 1 }];
      ctx.Items.push(item);
      const typeDef = ctx.CreateSimpleObjectTypeDefinition();
      expect(typeDef).toContain('data_item_0');
      expect(typeDef).toContain('Query: Q1');
    });

    it('should load data from two-dimensional object', () => {
      const ctx = new DataContext();
      const item1 = new DataContextItem();
      const item2 = new DataContextItem();
      ctx.Items.push(item1, item2);
      const result = ctx.LoadDataFromObject([[{ a: 1 }], [{ b: 2 }]]);
      expect(result).toBe(true);
      expect(ctx.Items[0].Data).toEqual([{ a: 1 }]);
      expect(ctx.Items[1].Data).toEqual([{ b: 2 }]);
    });

    it('should fail LoadDataFromObject with mismatched array length', () => {
      const ctx = new DataContext();
      ctx.Items.push(new DataContextItem());
      const result = ctx.LoadDataFromObject([[{ a: 1 }], [{ b: 2 }]]);
      expect(result).toBe(false);
    });

    it('should create DataContext from raw data', async () => {
      const raw = {
        ID: 'ctx-123',
        Items: [],
      };
      const ctx = await DataContext.FromRawData(raw);
      expect(ctx.ID).toBe('ctx-123');
      expect(ctx.Items).toEqual([]);
    });

    it('should create DataContext from raw data with null', async () => {
      const ctx = await DataContext.FromRawData(null);
      expect(ctx).toBeDefined();
    });
  });
});
