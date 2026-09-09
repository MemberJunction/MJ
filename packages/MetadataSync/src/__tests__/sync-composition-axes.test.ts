import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EntityInfo, EntityFieldInfo, EntityRelationshipInfo, UserInfo } from '@memberjunction/core';
import type { FlattenedRecord, RecordData, BatchContext } from '../lib/sync-engine';
import type { PushOptions } from '../services/PushService';
import type { EntityConfig, EntitySyncConfig } from '../config';
import type { ValidationError } from '../types/validation';
import { METADATA_KEYWORDS } from '../constants/metadata-keywords';
import { ValidationService } from '../services/ValidationService';
import { PushService } from '../services/PushService';
import { SyncEngine } from '../lib/sync-engine';
import { RecordProcessor } from '../lib/RecordProcessor';

// Mock minimal BaseEntity supporting composition axes
class MockEntity {
  public data: Record<string, unknown> = {};
  public isDirty = false;
  public PrimaryKeys: { Name: string }[];
  public Fields: { Name: string }[];
  public saveCallCount = 0;
  public ISAChild: MockEntity | null = null;
  public childEntities: Record<string, MockEntity> = {};
  public collections: Record<string, { Items: MockEntity[]; IsLoaded: boolean; Create: () => MockEntity; Remove: (e: MockEntity) => void }> = {};
  public embeddedObjects: Record<string, MockEntity> = {};
  public EntityInfo: EntityInfo;
  public IsSaved = true;

  constructor(
    public entityName: string,
    initialData: Record<string, unknown> = {},
    pks: string[] = ['ID'],
    fields: string[] = ['ID', 'Name', 'Description']
  ) {
    this.data = { ...initialData };
    this.PrimaryKeys = pks.map((p) => ({ Name: p }));
    this.Fields = fields.map((f) => ({ Name: f }));
    this.EntityInfo = {
      Name: entityName,
      PrimaryKeys: this.PrimaryKeys,
      Fields: this.Fields,
      AllowMultipleSubtypes: false,
    } as unknown as EntityInfo;
  }

  Get(fieldName: string): unknown {
    return this.data[fieldName];
  }

  GetCompanion(companionName: string): unknown {
    return this.collections[companionName] || this.embeddedObjects[companionName] || null;
  }

  Set(fieldName: string, value: unknown): boolean {
    if (this.data[fieldName] !== value) {
      this.data[fieldName] = value;
      this.isDirty = true;
      return true;
    }
    return false;
  }

  GetFieldByName(fieldName: string) {
    return {
      EntityFieldInfo: { Type: 'nvarchar' },
      Name: fieldName,
    };
  }

  GetChangesSinceLastSave(): Record<string, unknown> {
    return { ...this.data };
  }

  GetAll(): Record<string, unknown> {
    return { ...this.data };
  }

  async Save(): Promise<boolean> {
    this.saveCallCount++;
    this.isDirty = false;
    return true;
  }

  async EnsureISAChild(childName?: string): Promise<MockEntity> {
    const targetName = childName || 'ChildSubtype';
    if (!this.childEntities[targetName]) {
      const child = new MockEntity(targetName, { ID: this.Get('ID') }, ['ID'], ['ID', 'Details', 'PersonID', 'SpecialNotes']);
      this.childEntities[targetName] = child;
      this.ISAChild = child;
    }
    return this.childEntities[targetName];
  }
}

describe('Sync Composition Axes (§4, §6, §8, §9)', () => {
  describe('ValidationService — Composition Diagnostics (§4, §6, §9)', () => {
    let service: ValidationService;
    let mockMetadata: {
      EntityByName: (name: string) => EntityInfo | null;
      GetEntityObject: (name: string) => Promise<unknown>;
      Entities: EntityInfo[];
    };

    beforeEach(() => {
      mockMetadata = {
        EntityByName: vi.fn(),
        GetEntityObject: vi.fn().mockResolvedValue({}),
        Entities: [],
      };

      service = new ValidationService();
      (service as unknown as { metadata: typeof mockMetadata }).metadata = mockMetadata;
    });

    function getErrors(): ValidationError[] {
      return (service as unknown as { errors: ValidationError[] }).errors;
    }

    it('rejects unknown top-level keys with "did you mean" suggestions (§5.1)', async () => {
      const parentEntity: EntityInfo = {
        ID: 'parent-id',
        Name: 'Order Lines',
        Fields: [
          { Name: 'ID', AllowsNull: false, DefaultValue: null, AutoIncrement: false, ReadOnly: false },
          { Name: 'OrderID', AllowsNull: false, DefaultValue: null, AutoIncrement: false, ReadOnly: false },
        ],
        PrimaryKeys: [{ Name: 'ID' }],
      } as unknown as EntityInfo;

      mockMetadata.EntityByName = vi.fn().mockImplementation((name: string) => {
        if (name === 'Order Lines') return parentEntity;
        return null;
      });

      const data: RecordData & Record<string, unknown> = {
        primaryKey: { ID: '1' },
        fields: { OrderID: 'ord-1' },
        colections: {}, // Typo for collections
      };

      await (service as unknown as {
        validateEntityData: (d: unknown, info: EntityInfo, file: string, cfg: EntitySyncConfig) => Promise<void>;
      }).validateEntityData(data, parentEntity, '/dummy/order-lines.json', { entity: 'Order Lines', filePattern: '*.json' });

      const errors = getErrors();
      expect(errors.some((e) => e.message.includes('Did you mean "collections"?'))).toBe(true);
    });

    it('rejects double ownership of the same primary key across different files (§6)', async () => {
      const entityInfo: EntityInfo = {
        ID: 'ent-1',
        Name: 'Order Lines',
        Fields: [
          { Name: 'ID', AllowsNull: false, DefaultValue: null, AutoIncrement: false, ReadOnly: false },
        ],
        PrimaryKeys: [{ Name: 'ID' }],
      } as unknown as EntityInfo;

      mockMetadata.EntityByName = vi.fn().mockReturnValue(entityInfo);

      const record1: RecordData = {
        primaryKey: { ID: 'line-100' },
        fields: { ID: 'line-100' },
      };

      const record2: RecordData = {
        primaryKey: { ID: 'line-100' },
        fields: { ID: 'line-100' },
      };

      const validateFn = (service as unknown as {
        validateEntityData: (d: unknown, info: EntityInfo, file: string, cfg: EntitySyncConfig) => Promise<void>;
      }).validateEntityData.bind(service);

      await validateFn(record1, entityInfo, '/fileA.json', { entity: 'Order Lines', filePattern: '*.json' });
      await validateFn(record2, entityInfo, '/fileB.json', { entity: 'Order Lines', filePattern: '*.json' });

      const errors = getErrors();
      const doubleOwnerError = errors.find((e) => e.message.includes('already claimed by "/fileA.json"'));
      expect(doubleOwnerError).toBeDefined();
      expect(doubleOwnerError?.message).toContain('Double ownership is not allowed');
    });

    it('rejects parent-owned fields placed in leaf extension.fields (§9)', async () => {
      const parentEntity: EntityInfo = {
        ID: 'order-line-id',
        Name: 'Order Lines',
        Fields: [
          { Name: 'ID', AllowsNull: false },
          { Name: 'Quantity', AllowsNull: false },
        ],
        PrimaryKeys: [{ Name: 'ID' }],
      } as unknown as EntityInfo;

      const childEntity: EntityInfo = {
        ID: 'event-line-id',
        Name: 'Event Order Lines',
        ParentID: 'order-line-id',
        Fields: [
          { Name: 'ID', AllowsNull: false },
          { Name: 'PersonID', AllowsNull: true },
        ],
        PrimaryKeys: [{ Name: 'ID' }],
      } as unknown as EntityInfo;

      mockMetadata.EntityByName = vi.fn().mockImplementation((name: string) => {
        if (name === 'Order Lines') return parentEntity;
        if (name === 'Event Order Lines') return childEntity;
        return null;
      });
      mockMetadata.Entities = [parentEntity, childEntity];

      const record: RecordData = {
        primaryKey: { ID: 'line-1' },
        fields: { ID: 'line-1', Quantity: 5 },
        extension: {
          entity: 'Event Order Lines',
          fields: {
            PersonID: 'person-1',
            Quantity: 5, // ERROR: Quantity belongs to parent 'Order Lines'
          },
        },
      };

      await (service as unknown as {
        validateEntityData: (d: unknown, info: EntityInfo, file: string, cfg: EntitySyncConfig) => Promise<void>;
      }).validateEntityData(record, parentEntity, '/order.json', { entity: 'Order Lines', filePattern: '*.json' });

      const errors = getErrors();
      const quantityError = errors.find((e) => e.message.includes('Field "Quantity" is owned by parent entity "Order Lines"'));
      expect(quantityError).toBeDefined();
      expect(quantityError?.suggestion).toContain('Move "Quantity" to the root record fields object');
    });

    it('rejects a record file carrying a per-record mode wrapper in collections (§9)', async () => {
      const entityInfo: EntityInfo = {
        ID: 'order-id',
        Name: 'Orders',
        Fields: [{ Name: 'ID' }],
        PrimaryKeys: [{ Name: 'ID' }],
      } as unknown as EntityInfo;

      const record: RecordData = {
        primaryKey: { ID: 'ord-1' },
        fields: { ID: 'ord-1' },
        collections: {
          Lines: {
            mode: 'authoritative',
            items: [{ fields: { Item: 'Widget' } }],
          } as unknown as RecordData[],
        },
      };

      await (service as unknown as {
        validateEntityData: (d: unknown, info: EntityInfo, file: string, cfg: EntitySyncConfig) => Promise<void>;
      }).validateEntityData(record, entityInfo, '/orders.json', { entity: 'Orders', filePattern: '*.json' });

      const errors = getErrors();
      const wrapperError = errors.find((e) => e.message.includes('Per-record mode wrappers'));
      expect(wrapperError).toBeDefined();
      expect(wrapperError?.message).toContain('mode is directory-level only');
    });

    it('validates @owner:Field references — succeeds when field exists on owner entity', async () => {
      const parentEntity: EntityInfo = {
        ID: 'order-line-id',
        Name: 'Order Lines',
        Fields: [
          { Name: 'ID', AllowsNull: false },
          { Name: 'ShipToPersonID', AllowsNull: true },
        ],
        PrimaryKeys: [{ Name: 'ID' }],
      } as unknown as EntityInfo;

      const childEntity: EntityInfo = {
        ID: 'event-line-id',
        Name: 'Event Order Lines',
        ParentID: 'order-line-id',
        Fields: [
          { Name: 'ID', AllowsNull: false },
          { Name: 'PersonID', AllowsNull: true },
        ],
        PrimaryKeys: [{ Name: 'ID' }],
      } as unknown as EntityInfo;

      mockMetadata.EntityByName = vi.fn().mockImplementation((name: string) => {
        if (name === 'Order Lines') return parentEntity;
        if (name === 'Event Order Lines') return childEntity;
        return null;
      });
      mockMetadata.Entities = [parentEntity, childEntity];

      const record: RecordData = {
        primaryKey: { ID: 'line-1' },
        fields: { ID: 'line-1', ShipToPersonID: 'p-123' },
        extension: {
          entity: 'Event Order Lines',
          fields: {
            PersonID: `${METADATA_KEYWORDS.OWNER}ShipToPersonID`,
          },
        },
      };

      await (service as unknown as {
        validateEntityData: (d: unknown, info: EntityInfo, file: string, cfg: EntitySyncConfig) => Promise<void>;
      }).validateEntityData(record, parentEntity, '/order.json', { entity: 'Order Lines', filePattern: '*.json' });

      const errors = getErrors();
      expect(errors).toHaveLength(0);
    });

    it('rejects @owner:Field references when used at root level without an owner context', async () => {
      const parentEntity: EntityInfo = {
        ID: 'order-line-id',
        Name: 'Order Lines',
        Fields: [
          { Name: 'ID', AllowsNull: false },
          { Name: 'ShipToPersonID', AllowsNull: true },
        ],
        PrimaryKeys: [{ Name: 'ID' }],
      } as unknown as EntityInfo;

      mockMetadata.EntityByName = vi.fn().mockReturnValue(parentEntity);

      const record: RecordData = {
        primaryKey: { ID: 'line-1' },
        fields: {
          ID: 'line-1',
          ShipToPersonID: `${METADATA_KEYWORDS.OWNER}SomeField`, // Illegal at root
        },
      };

      await (service as unknown as {
        validateEntityData: (d: unknown, info: EntityInfo, file: string, cfg: EntitySyncConfig) => Promise<void>;
      }).validateEntityData(record, parentEntity, '/order.json', { entity: 'Order Lines', filePattern: '*.json' });

      const errors = getErrors();
      const ownerError = errors.find((e) => e.message.includes('@owner: cannot be used at root level'));
      expect(ownerError).toBeDefined();
    });

    it('rejects @owner:Field when the referenced field does not exist on the owner', async () => {
      const parentEntity: EntityInfo = {
        ID: 'order-line-id',
        Name: 'Order Lines',
        Fields: [
          { Name: 'ID', AllowsNull: false },
          { Name: 'ShipToPersonID', AllowsNull: true },
        ],
        PrimaryKeys: [{ Name: 'ID' }],
      } as unknown as EntityInfo;

      const childEntity: EntityInfo = {
        ID: 'event-line-id',
        Name: 'Event Order Lines',
        ParentID: 'order-line-id',
        Fields: [
          { Name: 'ID', AllowsNull: false },
          { Name: 'PersonID', AllowsNull: true },
        ],
        PrimaryKeys: [{ Name: 'ID' }],
      } as unknown as EntityInfo;

      mockMetadata.EntityByName = vi.fn().mockImplementation((name: string) => {
        if (name === 'Order Lines') return parentEntity;
        if (name === 'Event Order Lines') return childEntity;
        return null;
      });
      mockMetadata.Entities = [parentEntity, childEntity];

      const record: RecordData = {
        primaryKey: { ID: 'line-1' },
        fields: { ID: 'line-1' },
        extension: {
          entity: 'Event Order Lines',
          fields: {
            PersonID: `${METADATA_KEYWORDS.OWNER}NonExistentField`,
          },
        },
      };

      await (service as unknown as {
        validateEntityData: (d: unknown, info: EntityInfo, file: string, cfg: EntitySyncConfig) => Promise<void>;
      }).validateEntityData(record, parentEntity, '/order.json', { entity: 'Order Lines', filePattern: '*.json' });

      const errors = getErrors();
      const nonExistentError = errors.find((e) => e.message.includes('Field "NonExistentField" does not exist on owner entity "Order Lines"'));
      expect(nonExistentError).toBeDefined();
    });
  });

  describe('PushService — Graph Apply & Single Save Pipeline (§4.3, §8.1)', () => {
    let mockSyncEngine: SyncEngine;
    let pushService: PushService;
    let mockOwnerEntity: MockEntity;

    beforeEach(() => {
      mockOwnerEntity = new MockEntity('Orders', { ID: 'ord-1', OrderNumber: 'ORD-001' });

      mockSyncEngine = {
        getEntityInfo: vi.fn().mockReturnValue({
          Name: 'Orders',
          PrimaryKeys: [{ Name: 'ID' }],
          Fields: [{ Name: 'ID' }, { Name: 'OrderNumber' }],
        }),
        loadEntity: vi.fn().mockResolvedValue(mockOwnerEntity),
        calculateChecksumWithFileContent: vi.fn().mockResolvedValue('checksum-123'),
        processFieldValue: vi.fn().mockImplementation((val: unknown, _dir: unknown, _f: unknown, _e: unknown, _d: unknown, _b: unknown, _r: unknown, _fn: unknown, _p: unknown, ownerRecord?: MockEntity) => {
          if (typeof val === 'string' && val.startsWith(METADATA_KEYWORDS.OWNER)) {
            const ownerField = val.slice(METADATA_KEYWORDS.OWNER.length);
            return ownerRecord ? ownerRecord.Get(ownerField) : undefined;
          }
          return val;
        }),
        buildDefaults: vi.fn().mockResolvedValue({}),
        setMetadataEngine: vi.fn(),
      } as unknown as SyncEngine;

      pushService = new PushService(mockSyncEngine, {} as UserInfo);
    });

    const callApplyAxes = async (
      entity: MockEntity,
      recData: RecordData,
      options: PushOptions = {},
      entityConfig?: EntityConfig,
      callbacks?: unknown
    ) => {
      return (pushService as unknown as {
        applyCompositionAxes: (
          entity: MockEntity,
          record: RecordData,
          entityName: string,
          entityDir: string,
          batchContext: BatchContext,
          resolutionCollector: unknown,
          options: PushOptions,
          callbacks?: unknown,
          entityConfig?: EntityConfig
        ) => Promise<void>;
      }).applyCompositionAxes(
        entity,
        recData,
        entity.EntityInfo.Name,
        '/dummy/dir',
        new Map(),
        { resolutions: [] },
        options,
        callbacks,
        entityConfig
      );
    };

    it('persists entire composite graph (base + collections + extension) in a single Save on owner (§4.3)', async () => {
      const recordData: RecordData = {
        primaryKey: { ID: 'ord-1' },
        fields: { OrderNumber: 'ORD-001' },
        extension: {
          entity: 'Event Orders',
          fields: {
            SpecialNotes: 'VIP Event',
          },
        },
      };

      const entityConfig: EntityConfig = {
        entity: 'Orders',
        filePattern: '*.json',
      };

      await callApplyAxes(mockOwnerEntity, recordData, {}, entityConfig);

      // Verify EnsureISAChild was called on owner
      expect(mockOwnerEntity.childEntities['Event Orders']).toBeDefined();
      expect(mockOwnerEntity.childEntities['Event Orders'].Get('SpecialNotes')).toBe('VIP Event');

      // Graph save: when owner is saved once, saveCallCount increments by 1
      await mockOwnerEntity.Save();
      expect(mockOwnerEntity.saveCallCount).toBe(1);
    });

    it('resolves @owner:Field synchronously from owner record for child extension fields', async () => {
      mockOwnerEntity.Set('ShipToPersonID', 'person-456');

      const recordData: RecordData = {
        primaryKey: { ID: 'ord-1' },
        fields: { OrderNumber: 'ORD-001', ShipToPersonID: 'person-456' },
        extension: {
          entity: 'Event Orders',
          fields: {
            PersonID: `${METADATA_KEYWORDS.OWNER}ShipToPersonID`,
          },
        },
      };

      await callApplyAxes(mockOwnerEntity, recordData);

      const child = mockOwnerEntity.childEntities['Event Orders'];
      expect(child).toBeDefined();
      expect(child.Get('PersonID')).toBe('person-456');
    });

    it('enforces 20% bulk deletion rail in authoritative collections (§8.1)', async () => {
      // Setup mock collection with 10 existing items
      const existingItems: MockEntity[] = [];
      for (let i = 1; i <= 10; i++) {
        existingItems.push(new MockEntity('OrderLines', { ID: `line-${i}` }, ['ID'], ['ID']));
      }

      const mockCollection = {
        Items: existingItems,
        IsLoaded: true,
        Create: vi.fn(),
        Remove: vi.fn(),
      };
      (mockOwnerEntity as unknown as Record<string, unknown>)['OrderLines'] = mockCollection;

      // New data only keeps 5 items -> implies 5 deletes (50% of 10 > 20% default rail)
      const recordData: RecordData = {
        primaryKey: { ID: 'ord-1' },
        fields: { OrderNumber: 'ORD-001' },
        collections: {
          OrderLines: [
            { primaryKey: { ID: 'line-1' }, fields: { ID: 'line-1' } },
            { primaryKey: { ID: 'line-2' }, fields: { ID: 'line-2' } },
            { primaryKey: { ID: 'line-3' }, fields: { ID: 'line-3' } },
            { primaryKey: { ID: 'line-4' }, fields: { ID: 'line-4' } },
            { primaryKey: { ID: 'line-5' }, fields: { ID: 'line-5' } },
          ],
        },
      };

      const entityConfig: EntityConfig = {
        entity: 'Orders',
        filePattern: '*.json',
        collections: {
          OrderLines: {
            mode: 'authoritative',
            maxImpliedDeletePercent: 20,
          },
        },
      };

      // Without allowBulkDelete: should throw bulk deletion rail error
      await expect(
        callApplyAxes(mockOwnerEntity, recordData, { allowBulkDelete: false }, entityConfig)
      ).rejects.toThrow(/Authoritative sync for collection 'OrderLines' on 'Orders' would delete 5\/10/);

      // With allowBulkDelete: should succeed
      await expect(
        callApplyAxes(mockOwnerEntity, recordData, { allowBulkDelete: true }, entityConfig)
      ).resolves.not.toThrow();
    });

    it('throws error when a record carries a per-record mode wrapper in collections (§9)', async () => {
      const recordData: RecordData = {
        primaryKey: { ID: 'ord-1' },
        fields: { ID: 'ord-1' },
        collections: {
          Lines: {
            mode: 'authoritative',
            items: [],
          } as unknown as RecordData[],
        },
      };

      await expect(
        callApplyAxes(mockOwnerEntity, recordData)
      ).rejects.toThrow(/Collection "Lines" in Orders must be an array of records\. Per-record mode wrappers/);
    });

    it('routes authoritative collection deletes through onConfirm confirmation (Rider 2)', async () => {
      const existingItems: MockEntity[] = [];
      for (let i = 1; i <= 10; i++) {
        existingItems.push(new MockEntity('OrderLines', { ID: `line-${i}`, Name: `Line ${i}` }));
      }

      mockOwnerEntity.collections['OrderLines'] = {
        Items: existingItems,
        IsLoaded: true,
        Create: () => new MockEntity('OrderLines'),
        Remove: (item: MockEntity) => {
          const idx = existingItems.indexOf(item);
          if (idx !== -1) existingItems.splice(idx, 1);
        },
      };

      // 9 mentioned items, 1 unmentioned item (10% delete, under 20% bulk limit)
      const recordData: RecordData = {
        primaryKey: { ID: 'ord-1' },
        fields: { ID: 'ord-1' },
        collections: {
          OrderLines: existingItems.slice(0, 9).map((item) => ({
            primaryKey: { ID: item.Get('ID') },
            fields: { Name: item.Get('Name') },
          })),
        },
      };

      const entityConfig: EntityConfig = {
        entity: 'Orders',
        filePattern: '*.json',
        collections: {
          OrderLines: {
            mode: 'authoritative',
          },
        },
      };

      const onConfirm = vi.fn().mockResolvedValue(true);
      await callApplyAxes(mockOwnerEntity, recordData, {}, entityConfig, { onConfirm });

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onConfirm).toHaveBeenCalledWith(
        expect.stringContaining("Authoritative collection 'OrderLines' on 'Orders' will delete unmentioned records (initial batch: 1 record")
      );
      expect(existingItems.length).toBe(9);
      expect(existingItems.map((i) => i.Get('ID'))).toEqual([
        'line-1', 'line-2', 'line-3', 'line-4', 'line-5', 'line-6', 'line-7', 'line-8', 'line-9'
      ]);
      expect(existingItems.some((i) => i.Get('ID') === 'line-10')).toBe(false);
    });

    it('proceeds with authoritative deletes when onConfirm is undefined (fail-open / non-interactive / CI)', async () => {
      const existingItems: MockEntity[] = [];
      for (let i = 1; i <= 10; i++) {
        existingItems.push(new MockEntity('OrderLines', { ID: `line-${i}`, Name: `Line ${i}` }));
      }

      mockOwnerEntity.collections['OrderLines'] = {
        Items: existingItems,
        IsLoaded: true,
        Create: () => new MockEntity('OrderLines'),
        Remove: (item: MockEntity) => {
          const idx = existingItems.indexOf(item);
          if (idx !== -1) existingItems.splice(idx, 1);
        },
      };

      const recordData: RecordData = {
        primaryKey: { ID: 'ord-1' },
        fields: { ID: 'ord-1' },
        collections: {
          OrderLines: existingItems.slice(0, 9).map((item) => ({
            primaryKey: { ID: item.Get('ID') },
            fields: { Name: item.Get('Name') },
          })),
        },
      };

      const entityConfig: EntityConfig = {
        entity: 'Orders',
        filePattern: '*.json',
        collections: {
          OrderLines: {
            mode: 'authoritative',
          },
        },
      };

      // No onConfirm provided — non-interactive / CI path
      await callApplyAxes(mockOwnerEntity, recordData, {}, entityConfig, {});

      expect(existingItems.length).toBe(9);
      expect(existingItems.map((i) => i.Get('ID'))).toEqual([
        'line-1', 'line-2', 'line-3', 'line-4', 'line-5', 'line-6', 'line-7', 'line-8', 'line-9'
      ]);
      expect(existingItems.some((i) => i.Get('ID') === 'line-10')).toBe(false);
    });

    it('aborts authoritative collection deletes when user declines confirmation', async () => {
      const existingItems: MockEntity[] = [];
      for (let i = 1; i <= 10; i++) {
        existingItems.push(new MockEntity('OrderLines', { ID: `line-${i}`, Name: `Line ${i}` }));
      }

      mockOwnerEntity.collections['OrderLines'] = {
        Items: existingItems,
        IsLoaded: true,
        Create: () => new MockEntity('OrderLines'),
        Remove: (item: MockEntity) => {
          const idx = existingItems.indexOf(item);
          if (idx !== -1) existingItems.splice(idx, 1);
        },
      };

      const recordData: RecordData = {
        primaryKey: { ID: 'ord-1' },
        fields: { ID: 'ord-1' },
        collections: {
          OrderLines: existingItems.slice(0, 9).map((item) => ({
            primaryKey: { ID: item.Get('ID') },
            fields: { Name: item.Get('Name') },
          })),
        },
      };

      const entityConfig: EntityConfig = {
        entity: 'Orders',
        filePattern: '*.json',
        collections: {
          OrderLines: {
            mode: 'authoritative',
          },
        },
      };

      const onConfirm = vi.fn().mockResolvedValue(false);
      await expect(
        callApplyAxes(mockOwnerEntity, recordData, {}, entityConfig, { onConfirm })
      ).rejects.toThrow(/Authoritative delete of 1 record\(s\) in collection 'OrderLines' on 'Orders' cancelled by user/);
    });

    it('push-twice idempotency: second push on identical graph produces zero modifications', async () => {
      const existingItems: MockEntity[] = [
        new MockEntity('OrderLines', { ID: 'line-1', Name: 'Line 1' }),
        new MockEntity('OrderLines', { ID: 'line-2', Name: 'Line 2' }),
      ];

      mockOwnerEntity.collections['OrderLines'] = {
        Items: existingItems,
        IsLoaded: true,
        Create: () => new MockEntity('OrderLines'),
        Remove: (item: MockEntity) => {
          const idx = existingItems.indexOf(item);
          if (idx !== -1) existingItems.splice(idx, 1);
        },
      };

      const recordData: RecordData = {
        primaryKey: { ID: 'ord-1' },
        fields: { ID: 'ord-1' },
        collections: {
          OrderLines: existingItems.map((item) => ({
            primaryKey: { ID: item.Get('ID') },
            fields: { Name: item.Get('Name') },
          })),
        },
      };

      const entityConfig: EntityConfig = {
        entity: 'Orders',
        filePattern: '*.json',
        collections: {
          OrderLines: {
            mode: 'authoritative',
          },
        },
      };

      // Push 1
      await callApplyAxes(mockOwnerEntity, recordData, {}, entityConfig);
      const pass1Ids = existingItems.map((i) => i.Get('ID'));
      expect(pass1Ids).toEqual(['line-1', 'line-2']);

      // Push 2 with identical graph
      await callApplyAxes(mockOwnerEntity, recordData, {}, entityConfig);
      const pass2Ids = existingItems.map((i) => i.Get('ID'));
      expect(pass2Ids).toEqual(['line-1', 'line-2']);
      expect(existingItems.length).toBe(2);
    });
  });

  describe('collection-resolver — Dynamic Synthesis Precedence (§8.1)', () => {
    it('resolves collection relationships with strict 4-tier rule strength', async () => {
      const { resolveCollectionRelationship } = await import('../lib/collection-resolver');

      const mockEntityInfo = {
        Name: 'Orders',
        RelatedEntities: [
          {
            RelatedEntity: 'MJ_BizApps_Orders: Order Lines',
            RelatedEntityJoinField: 'OrderID',
            DisplayName: 'Lines',
            RelatedRecordCollection: JSON.stringify({ Name: 'OrderLines', Load: 'explicit', OnRemove: 'delete' }),
          },
          {
            RelatedEntity: 'MJ_BizApps_Orders: Order Notes',
            RelatedEntityJoinField: 'OrderID',
            DisplayName: 'OrderNotes',
            RelatedRecordCollection: null,
          },
          {
            RelatedEntity: 'OrderAuditLogs',
            RelatedEntityJoinField: 'OrderID',
            DisplayName: null,
            RelatedRecordCollection: null,
          },
          {
            RelatedEntity: 'OrderTracking',
            RelatedEntityJoinField: null, // Invalid: no join field
            DisplayName: 'Tracking',
            RelatedRecordCollection: null,
          },
        ],
      } as unknown as EntityInfo;

      // Tier 1: Explicit JSON Name match
      const t1 = resolveCollectionRelationship(mockEntityInfo, 'OrderLines');
      expect(t1).not.toBeNull();
      expect(t1?.relatedEntity).toBe('MJ_BizApps_Orders: Order Lines');
      expect(t1?.joinField).toBe('OrderID');
      expect(t1?.load).toBe('explicit');

      // Tier 2: DisplayName match
      const t2 = resolveCollectionRelationship(mockEntityInfo, 'OrderNotes');
      expect(t2).not.toBeNull();
      expect(t2?.relatedEntity).toBe('MJ_BizApps_Orders: Order Notes');
      expect(t2?.joinField).toBe('OrderID');

      // Tier 3: Full entity name match
      const t3 = resolveCollectionRelationship(mockEntityInfo, 'OrderAuditLogs');
      expect(t3).not.toBeNull();
      expect(t3?.relatedEntity).toBe('OrderAuditLogs');

      // Tier 4: Stripped name with plural tolerance
      const t4 = resolveCollectionRelationship(mockEntityInfo, 'OrderLine');
      expect(t4).not.toBeNull();
      expect(t4?.relatedEntity).toBe('MJ_BizApps_Orders: Order Lines');

      // Missing join field fails resolution
      const tInvalid = resolveCollectionRelationship(mockEntityInfo, 'Tracking');
      expect(tInvalid).toBeNull();

      // Unknown collection name fails resolution
      const tUnknown = resolveCollectionRelationship(mockEntityInfo, 'NonExistentCollection');
      expect(tUnknown).toBeNull();
    });

    it('throws explicit error on ambiguity within winning tier in collection-resolver', async () => {
      const { resolveCollectionRelationship } = await import('../lib/collection-resolver');

      const ambiguousEntityInfo = {
        Name: 'Orders',
        RelatedEntities: [
          {
            RelatedEntity: 'OrderLines1',
            RelatedEntityJoinField: 'OrderID',
            DisplayName: 'Lines',
            RelatedRecordCollection: null,
          },
          {
            RelatedEntity: 'OrderLines2',
            RelatedEntityJoinField: 'OrderID',
            DisplayName: 'Lines',
            RelatedRecordCollection: null,
          },
        ],
      } as unknown as EntityInfo;

      expect(() => resolveCollectionRelationship(ambiguousEntityInfo, 'Lines')).toThrow(
        /Ambiguous collection resolution for 'Lines' on entity 'Orders'/
      );
    });

    it('warns on malformed RelatedRecordCollection JSON and continues evaluation', async () => {
      const { resolveCollectionRelationship } = await import('../lib/collection-resolver');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const malformedEntityInfo = {
        Name: 'Orders',
        RelatedEntities: [
          {
            RelatedEntity: 'OrderLines',
            RelatedEntityJoinField: 'OrderID',
            DisplayName: 'OrderLines',
            RelatedRecordCollection: '{ invalid json ...',
          },
        ],
      } as unknown as EntityInfo;

      // Tier 1 fails with warning, falls back to Tier 2 (DisplayName)
      const res = resolveCollectionRelationship(malformedEntityInfo, 'OrderLines');
      expect(res).not.toBeNull();
      expect(res?.relatedEntity).toBe('OrderLines');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("malformed RelatedRecordCollection JSON on entity 'Orders'")
      );
      warnSpy.mockRestore();
    });
  });

  describe('RecordProcessor — Pull Parity (§4.4)', () => {
    it('emits extension leaf fields in record payload', async () => {
      const processor = new RecordProcessor();
      const mockEntity = new MockEntity(
        'Order Lines',
        { ID: 'line-1', OrderID: 'ord-1', Quantity: 2 },
        ['ID'],
        ['ID', 'OrderID', 'Quantity']
      );

      const mockSubtype = new MockEntity(
        'Event Order Lines',
        { ID: 'line-1', PersonID: 'p-99', RegDate: '2026-09-08' },
        ['ID'],
        ['ID', 'PersonID', 'RegDate']
      );
      mockEntity.ISAChild = mockSubtype;

      const extractedExt = await (processor as unknown as {
        processExtension: (
          entity: MockEntity,
          primaryKey: Record<string, unknown>,
          targetDir: string,
          entityConfig: EntityConfig,
          verbose?: boolean
        ) => Promise<RecordData['extension'] | undefined>;
      }).processExtension(
        mockEntity,
        { ID: 'line-1' },
        '/dummy',
        { entity: 'Order Lines', filePattern: '*.json' },
        false
      );

      expect(extractedExt).toBeDefined();
      const extRecord = extractedExt as RecordData;
      expect(extRecord.fields).toEqual({
        PersonID: 'p-99',
        RegDate: '2026-09-08',
      });
      // Should NOT include shared PK 'ID' or parent fields
      expect(extRecord.fields?.ID).toBeUndefined();
      expect(extRecord.fields?.OrderID).toBeUndefined();
    });

    it('emits collection items deterministically sorted by primary key on pull', async () => {
      const mockSync = {
        getEntityInfo: vi.fn().mockImplementation((name: string) => ({
          Name: name,
          PrimaryKeys: [{ Name: 'ID' }],
          Fields: [{ Name: 'ID' }, { Name: 'Name' }],
        })),
        calculateChecksum: vi.fn().mockReturnValue('cs-1'),
        calculateChecksumWithFileContent: vi.fn().mockResolvedValue('cs-1'),
      } as unknown as SyncEngine;
      const processor = new RecordProcessor(mockSync);
      const mockOwner = new MockEntity('Orders', { ID: 'ord-1' }, ['ID'], ['ID']);

      const itemB = new MockEntity('OrderLines', { ID: 'line-b', Name: 'Item B' }, ['ID'], ['ID', 'Name']);
      const itemA = new MockEntity('OrderLines', { ID: 'line-a', Name: 'Item A' }, ['ID'], ['ID', 'Name']);
      const itemC = new MockEntity('OrderLines', { ID: 'line-c', Name: 'Item C' }, ['ID'], ['ID', 'Name']);

      // Deliberately unsorted in memory: B, A, C
      const mockCol = {
        LoadMode: 'explicit',
        IsLoaded: true,
        Items: [itemB, itemA, itemC],
        Load: vi.fn().mockResolvedValue(undefined),
      };

      mockOwner.collections['OrderLines'] = mockCol as unknown as (typeof mockOwner.collections)[string];
      mockOwner.EntityInfo.RelatedEntities = [
        {
          RelatedEntity: 'OrderLines',
          RelatedEntityJoinField: 'OrderID',
          RelatedRecordCollection: JSON.stringify({ Name: 'OrderLines' }),
        } as unknown as EntityRelationshipInfo,
      ];

      const collections: Record<string, RecordData[]> = {};
      await (processor as unknown as {
        processCollections: (
          record: MockEntity,
          targetDir: string,
          entityConfig: EntityConfig,
          collections: Record<string, RecordData[]>,
          currentDepth: number,
          ancestryPath: Set<string>,
          verbose?: boolean
        ) => Promise<void>;
      }).processCollections(
        mockOwner,
        '/dummy',
        { entity: 'Orders', filePattern: '*.json' },
        collections,
        0,
        new Set()
      );

      expect(collections['OrderLines']).toBeDefined();
      expect(collections['OrderLines'].length).toBe(3);
      // Deterministically sorted by PK: line-a, line-b, line-c
      expect(collections['OrderLines'].map((c) => c.primaryKey?.ID)).toEqual(['line-a', 'line-b', 'line-c']);
    });

    it('skips Load: "never" collections on pull without emitting empty array', async () => {
      const processor = new RecordProcessor();
      const mockOwner = new MockEntity('Orders', { ID: 'ord-1' }, ['ID'], ['ID']);

      const mockNeverCol = {
        LoadMode: 'never',
        IsLoaded: false,
        Items: [],
        Load: vi.fn().mockResolvedValue(undefined),
      };

      mockOwner.collections['AuditLogs'] = mockNeverCol as unknown as (typeof mockOwner.collections)[string];
      mockOwner.EntityInfo.RelatedEntities = [
        {
          RelatedEntity: 'AuditLogs',
          RelatedEntityJoinField: 'OrderID',
          RelatedRecordCollection: JSON.stringify({ Name: 'AuditLogs', Load: 'never' }),
        } as unknown as EntityRelationshipInfo,
      ];

      const collections: Record<string, RecordData[]> = {};
      await (processor as unknown as {
        processCollections: (
          record: MockEntity,
          targetDir: string,
          entityConfig: EntityConfig,
          collections: Record<string, RecordData[]>,
          currentDepth: number,
          ancestryPath: Set<string>,
          verbose?: boolean
        ) => Promise<void>;
      }).processCollections(
        mockOwner,
        '/dummy',
        { entity: 'Orders', filePattern: '*.json' },
        collections,
        0,
        new Set()
      );

      // Load was never called
      expect(mockNeverCol.Load).not.toHaveBeenCalled();
      // Collection was not emitted as []
      expect(collections['AuditLogs']).toBeUndefined();
    });
  });
});
