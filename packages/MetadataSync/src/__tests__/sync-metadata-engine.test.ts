import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncMetadataEngine } from '../lib/sync-metadata-engine';
import { BaseEntity, CompositeKey } from '@memberjunction/core';

// Mock @memberjunction/core
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    BaseEngine: class {
      protected ProviderToUse: any = null;
      public Configs: any[] = [];
      protected async Load() {}
      protected SetupGlobalEventListener() {}
      protected canUseImmediateMutation() {
        return true;
      }
    },
    BaseEntity: class {
      public EntityInfo: any;
      public PrimaryKey: any;
      private data: any = {};
      constructor(entityInfo: any) {
        this.EntityInfo = entityInfo;
      }
      public Get(name: string) {
        return this.data[name];
      }
      public Set(name: string, val: any) {
        this.data[name] = val;
      }
      public GetAll() {
        return { ...this.data };
      }
    },
    CompositeKey: class {
      private keys: any = {};
      public LoadFromSimpleObject(obj: any) {
        this.keys = obj;
      }
      public Equals(other: any) {
        if (!other) return false;
        return JSON.stringify(this.keys) === JSON.stringify(other.keys);
      }
    }
  };
});

describe('SyncMetadataEngine', () => {
  let engine: SyncMetadataEngine;
  let mockSyncEngine: any;

  beforeEach(() => {
    mockSyncEngine = {
      getEntityInfo: vi.fn().mockImplementation((name: string) => {
        if (name === 'CompositeEntity') {
          return {
            Name: name,
            PrimaryKeys: [{ Name: 'KeyA', Type: 'nvarchar' }, { Name: 'KeyB', Type: 'uniqueidentifier' }],
            Fields: [{ Name: 'KeyA', NeedsQuotes: true }, { Name: 'KeyB', NeedsQuotes: true, Type: 'uniqueidentifier' }]
          };
        }
        return {
          Name: name,
          PrimaryKeys: [{ Name: 'ID', Type: 'uniqueidentifier' }],
          Fields: [{ Name: 'ID', NeedsQuotes: true, Type: 'uniqueidentifier' }]
        };
      }),
      serializePrimaryKey: vi.fn()
    };

    engine = new SyncMetadataEngine();
    engine.initializeEngine(mockSyncEngine);
  });

  describe('serializePrimaryKey', () => {
    it('serializes single primary key and normalizes UUID to lowercase', () => {
      const entityInfo = {
        PrimaryKeys: [{ Name: 'ID', Type: 'uniqueidentifier' }]
      };
      const pk = { ID: 'ABC-123-XYZ' };
      const serialized = engine.serializePrimaryKey(entityInfo, pk);
      expect(serialized).toBe('id=abc-123-xyz');
    });

    it('serializes composite primary keys with sorting to guarantee order-independence', () => {
      const entityInfo = {
        PrimaryKeys: [{ Name: 'KeyB', Type: 'uniqueidentifier' }, { Name: 'KeyA', Type: 'nvarchar' }]
      };
      // KeyB is UUID so it normalizes to lowercase, KeyA is nvarchar so it does not
      const pk1 = { KeyB: 'ABC-123-XYZ', KeyA: 'ValueA' };
      const pk2 = { KeyA: 'ValueA', KeyB: 'ABC-123-XYZ' };

      const s1 = engine.serializePrimaryKey(entityInfo, pk1);
      const s2 = engine.serializePrimaryKey(entityInfo, pk2);

      expect(s1).toBe('keya=ValueA|keyb=abc-123-xyz');
      expect(s2).toBe('keya=ValueA|keyb=abc-123-xyz');
      expect(s1).toBe(s2);
    });
  });

  describe('getUniquePrimaryKeys', () => {
    it('deduplicates primary keys based on serialized representation', () => {
      const entityInfo = {
        PrimaryKeys: [{ Name: 'ID', Type: 'uniqueidentifier' }]
      };
      const pks = [
        { ID: 'ABC-123' },
        { ID: 'abc-123' }, // should be treated as duplicate because of normalization
        { ID: 'XYZ-789' }
      ];

      const unique = engine.getUniquePrimaryKeys(entityInfo, pks);
      expect(unique).toHaveLength(2);
      expect(unique[0]).toEqual({ ID: 'ABC-123' });
      expect(unique[1]).toEqual({ ID: 'XYZ-789' });
    });
  });

  describe('buildBulkFilter', () => {
    it('builds SQL filter for single primary keys', () => {
      const entityInfo = {
        PrimaryKeys: [{ Name: 'ID', NeedsQuotes: true }]
      };
      const uniquePks = [{ ID: 'id1' }, { ID: 'id2' }];
      const filter = engine.buildBulkFilter(entityInfo, uniquePks);
      expect(filter).toBe("(ID = 'id1') OR (ID = 'id2')");
    });

    it('builds SQL filter for composite primary keys', () => {
      const entityInfo = {
        PrimaryKeys: [{ Name: 'KeyA', NeedsQuotes: true }, { Name: 'KeyB', NeedsQuotes: false }]
      };
      const uniquePks = [
        { KeyA: 'val1', KeyB: 123 },
        { KeyA: 'val2', KeyB: 456 }
      ];
      const filter = engine.buildBulkFilter(entityInfo, uniquePks);
      expect(filter).toBe("(KeyA = 'val1' AND KeyB = 123) OR (KeyA = 'val2' AND KeyB = 456)");
    });
  });

  describe('lookup cache', () => {
    it('stores, retrieves, and clears lookups', () => {
      engine.setCachedLookup('my-key', 'my-id');
      expect(engine.getCachedLookup('my-key')).toBe('my-id');
      expect(engine.getCachedLookup('missing')).toBeUndefined();

      engine.clearLookupCache();
      expect(engine.getCachedLookup('my-key')).toBeUndefined();
    });
  });

  describe('entity cache operations', () => {
    it('adds and retrieves entities from dynamic properties', () => {
      const entityInfo = { Name: 'TestEntity', PrimaryKeys: [{ Name: 'ID', Type: 'uniqueidentifier' }] };
      const entity = new BaseEntity(entityInfo) as unknown as BaseEntity;
      entity.PrimaryKey = { Equals: (other: any) => other && other.ID === 'id-1', keys: { ID: 'id-1' } };
      (entity as any).Set('ID', 'id-1');

      engine.addEntityToCache('TestEntity', entity);
      
      const cached = engine.getCachedEntities('TestEntity');
      expect(cached).toHaveLength(1);
      expect(cached[0]).toBe(entity);
    });

    it('removes entities from dynamic properties and clears lookup cache', () => {
      const entityInfo = { Name: 'TestEntity', PrimaryKeys: [{ Name: 'ID', Type: 'uniqueidentifier' }] };
      const entity = new BaseEntity(entityInfo) as unknown as BaseEntity;
      entity.PrimaryKey = { Equals: (other: any) => other && other.ID === 'id-1', keys: { ID: 'id-1' } };
      (entity as any).Set('ID', 'id-1');

      engine.addEntityToCache('TestEntity', entity);
      engine.setCachedLookup('some-lookup', 'some-id');

      // Setup mockSyncEngine serializePrimaryKey mock
      mockSyncEngine.serializePrimaryKey.mockReturnValue('id=id-1');

      engine.removeEntityFromCache('TestEntity', { ID: 'id-1' });

      const cached = engine.getCachedEntities('TestEntity');
      expect(cached).toHaveLength(0);
      expect(engine.getCachedLookup('some-lookup')).toBeUndefined(); // lookup cache should be cleared
    });
  });
});
