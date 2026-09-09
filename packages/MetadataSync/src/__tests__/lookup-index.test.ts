import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncMetadataEngine } from '../lib/sync-metadata-engine';
import { SyncEngine } from '../lib/sync-engine';
import {
  BaseEntity,
  type EntityInfo,
  type EntityFieldInfo,
  type IMetadataProvider,
  type UserInfo,
} from '@memberjunction/core';

interface CapturedRunViewParams {
  EntityName: string;
  ExtraFilter?: string;
  MaxRows?: number;
}

const runViewCalls: CapturedRunViewParams[] = [];
let mockRunViewResults: Array<Record<string, unknown>> = [];

const entityInfoFixture: EntityInfo = {
  Name: 'MJ: Entity Fields',
  PrimaryKeys: [
    { Name: 'ID', Type: 'uniqueidentifier', NeedsQuotes: true } as unknown as EntityFieldInfo,
  ],
  Fields: [
    { Name: 'ID', Type: 'uniqueidentifier', NeedsQuotes: true } as unknown as EntityFieldInfo,
    { Name: 'EntityID', Type: 'uniqueidentifier', NeedsQuotes: true } as unknown as EntityFieldInfo,
    { Name: 'Name', Type: 'nvarchar', NeedsQuotes: true } as unknown as EntityFieldInfo,
    { Name: 'DisplayName', Type: 'nvarchar', NeedsQuotes: true } as unknown as EntityFieldInfo,
    { Name: 'Type', Type: 'nvarchar', NeedsQuotes: true } as unknown as EntityFieldInfo,
  ],
} as unknown as EntityInfo;

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();

  class MockMetadata {
    public EntityByName(name: string): EntityInfo | null {
      if (name === 'MJ: Entity Fields') {
        return entityInfoFixture;
      }
      return null;
    }
  }

  class MockRunView {
    public async RunView(params: CapturedRunViewParams): Promise<{ Success: boolean; Results: Array<Record<string, unknown>> }> {
      runViewCalls.push(params);
      return { Success: true, Results: mockRunViewResults };
    }
  }

  return {
    ...actual,
    Metadata: MockMetadata,
    RunView: MockRunView,
    BaseEngine: class {
      protected ProviderToUse: IMetadataProvider | null = null;
      public Configs: unknown[] = [];
      protected async Load(): Promise<void> {}
      protected SetupGlobalEventListener(): void {}
      protected canUseImmediateMutation(): boolean {
        return true;
      }
    },
  };
});

class FakeEntityField {
  private readonly data: Record<string, unknown>;

  constructor(data: Record<string, unknown>) {
    this.data = { ...data };
  }

  public Get(name: string): unknown {
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(this.data)) {
      if (k.toLowerCase() === lower) {
        return v;
      }
    }
    return undefined;
  }

  public GetAll(): Record<string, unknown> {
    return { ...this.data };
  }
}

function makeFakeEntity(fields: Record<string, unknown>): BaseEntity {
  return new FakeEntityField(fields) as unknown as BaseEntity;
}

function linearScan(
  records: BaseEntity[],
  lookupFields: Array<{ fieldName: string; fieldValue: string }>
): BaseEntity | null {
  for (const entity of records) {
    let allMatch = true;
    for (const { fieldName, fieldValue } of lookupFields) {
      const entityValue = entity.Get(fieldName);
      const normalizedEntityValue = (entityValue?.toString() || '').trim().toLowerCase();
      const normalizedLookupValue = (fieldValue?.toString() || '').trim().toLowerCase();
      if (normalizedEntityValue !== normalizedLookupValue) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) {
      return entity;
    }
  }
  return null;
}

function generate10kRecords(): BaseEntity[] {
  const records: BaseEntity[] = [];
  for (let i = 0; i < 10000; i++) {
    const entityIndex = i % 100;
    records.push(
      makeFakeEntity({
        ID: `F0000000-0000-0000-0000-${i.toString().padStart(12, '0')}`,
        EntityID: `E0000000-0000-0000-0000-${entityIndex.toString().padStart(12, '0')}`,
        Name: `Field_${i}`,
        DisplayName: `Field Display ${i}`,
        Type: i % 2 === 0 ? 'nvarchar' : 'int',
      })
    );
  }
  return records;
}

describe('T18 — Lookup Index over Preload (C7, §3.6, §6 T18)', () => {
  let syncEngine: SyncEngine;
  let syncMetadataEngine: SyncMetadataEngine;
  let records: BaseEntity[];

  beforeEach(() => {
    runViewCalls.length = 0;
    mockRunViewResults = [];
    const contextUser = {} as UserInfo;
    syncEngine = new SyncEngine(contextUser);
    syncMetadataEngine = new SyncMetadataEngine();
    syncMetadataEngine.initializeEngine(syncEngine);
    syncEngine.setMetadataEngine(syncMetadataEngine);

    records = generate10kRecords();
    syncMetadataEngine.setCachedEntitiesForTesting('MJ: Entity Fields', records);
  });

  it('resolves single-key lookups returning the exact same record as linear scan', async () => {
    const testIndices = [0, 42, 1337, 5000, 9999];

    for (const idx of testIndices) {
      const fieldName = `Field_${idx}`;
      const lookupFields = [{ fieldName: 'Name', fieldValue: fieldName }];

      const linearResult = linearScan(records, lookupFields);
      expect(linearResult).not.toBeNull();

      const cachedEntity = syncMetadataEngine.findCachedByLookup('MJ: Entity Fields', lookupFields);
      expect(cachedEntity).toBe(linearResult);

      const resolvedId = await syncEngine.resolveLookup('MJ: Entity Fields', lookupFields);
      expect(resolvedId).toBe(linearResult!.Get('ID'));
    }

    // Single-key lookup by ID
    const sampleId = `F0000000-0000-0000-0000-${(777).toString().padStart(12, '0')}`;
    const idLookup = [{ fieldName: 'ID', fieldValue: sampleId }];
    const linearIdResult = linearScan(records, idLookup);
    expect(linearIdResult).not.toBeNull();

    const cachedIdEntity = syncMetadataEngine.findCachedByLookup('MJ: Entity Fields', idLookup);
    expect(cachedIdEntity).toBe(linearIdResult);
    expect(await syncEngine.resolveLookup('MJ: Entity Fields', idLookup)).toBe(sampleId);
  });

  it('resolves multi-key lookups returning the exact same record as linear scan regardless of field order', async () => {
    const testIndices = [7, 100, 256, 4096, 9998];

    for (const idx of testIndices) {
      const entityIndex = idx % 100;
      const entityId = `E0000000-0000-0000-0000-${entityIndex.toString().padStart(12, '0')}`;
      const fieldName = `Field_${idx}`;

      // Natural order: EntityID then Name
      const lookupFields1 = [
        { fieldName: 'EntityID', fieldValue: entityId },
        { fieldName: 'Name', fieldValue: fieldName },
      ];
      const linearResult1 = linearScan(records, lookupFields1);
      expect(linearResult1).not.toBeNull();

      const cachedEntity1 = syncMetadataEngine.findCachedByLookup('MJ: Entity Fields', lookupFields1);
      expect(cachedEntity1).toBe(linearResult1);

      const resolvedId1 = await syncEngine.resolveLookup('MJ: Entity Fields', lookupFields1);
      expect(resolvedId1).toBe(linearResult1!.Get('ID'));

      // Inverted order: Name then EntityID
      const lookupFields2 = [
        { fieldName: 'Name', fieldValue: fieldName },
        { fieldName: 'EntityID', fieldValue: entityId },
      ];
      const cachedEntity2 = syncMetadataEngine.findCachedByLookup('MJ: Entity Fields', lookupFields2);
      expect(cachedEntity2).toBe(linearResult1);

      const resolvedId2 = await syncEngine.resolveLookup('MJ: Entity Fields', lookupFields2);
      expect(resolvedId2).toBe(linearResult1!.Get('ID'));
    }
  });

  it('matches case-insensitively for both field names and values', async () => {
    const targetIdx = 4242;
    const entityIndex = targetIdx % 100;
    const entityId = `E0000000-0000-0000-0000-${entityIndex.toString().padStart(12, '0')}`;

    // Mixed casing on field names and values
    const lookupFields = [
      { fieldName: 'entityid', fieldValue: entityId.toLowerCase() },
      { fieldName: 'NAME', fieldValue: 'FIELD_4242' },
    ];

    const linearResult = linearScan(records, lookupFields);
    expect(linearResult).not.toBeNull();

    const cachedEntity = syncMetadataEngine.findCachedByLookup('MJ: Entity Fields', lookupFields);
    expect(cachedEntity).toBe(linearResult);

    const resolvedId = await syncEngine.resolveLookup('MJ: Entity Fields', lookupFields);
    expect(resolvedId).toBe(linearResult!.Get('ID'));

    // Single field with varying case
    const singleLookup = [{ fieldName: 'nAmE', fieldValue: 'field_4242' }];
    const linearSingle = linearScan(records, singleLookup);
    expect(linearSingle).not.toBeNull();
    expect(syncMetadataEngine.findCachedByLookup('MJ: Entity Fields', singleLookup)).toBe(linearSingle);
    expect(await syncEngine.resolveLookup('MJ: Entity Fields', singleLookup)).toBe(linearSingle!.Get('ID'));
  });

  it('falls through unchanged on misses to database query', async () => {
    const nonExistentFields = [{ fieldName: 'Name', fieldValue: 'NonExistent_Field_99999' }];

    // 1. Linear scan returns null
    const linearResult = linearScan(records, nonExistentFields);
    expect(linearResult).toBeNull();

    // 2. findCachedByLookup returns null
    const cachedEntity = syncMetadataEngine.findCachedByLookup('MJ: Entity Fields', nonExistentFields);
    expect(cachedEntity).toBeNull();

    // 3. resolveLookup falls through to RunView when not in preloaded cache
    expect(runViewCalls.length).toBe(0);
    // When DB returns empty, it throws the standard lookup failed error
    await expect(syncEngine.resolveLookup('MJ: Entity Fields', nonExistentFields)).rejects.toThrow(
      /No record found in 'MJ: Entity Fields'/
    );
    expect(runViewCalls.length).toBe(1);
    expect(runViewCalls[0].EntityName).toBe('MJ: Entity Fields');
    expect(runViewCalls[0].ExtraFilter).toContain('NonExistent_Field_99999');

    // 4. When RunView returns a DB record, resolveLookup returns its primary key
    mockRunViewResults = [{ ID: 'DB-FOUND-GUID-1234' }];
    const foundId = await syncEngine.resolveLookup('MJ: Entity Fields', nonExistentFields);
    expect(foundId).toBe('DB-FOUND-GUID-1234');
    expect(runViewCalls.length).toBe(2);
  });

  it('rebuilds the index when the preload changes', async () => {
    // Initially, Field_10001 does not exist
    const newFieldLookup = [{ fieldName: 'Name', fieldValue: 'Field_10001' }];
    expect(syncMetadataEngine.findCachedByLookup('MJ: Entity Fields', newFieldLookup)).toBeNull();

    // Add Field_10001 and remove Field_0
    const newRecord = makeFakeEntity({
      ID: 'F0000000-0000-0000-0000-000000010001',
      EntityID: 'E0000000-0000-0000-0000-000000000001',
      Name: 'Field_10001',
      DisplayName: 'Field Display 10001',
      Type: 'nvarchar',
    });

    const updatedRecords = [newRecord, ...records.slice(1)]; // removed records[0] (Field_0)
    syncMetadataEngine.setCachedEntitiesForTesting('MJ: Entity Fields', updatedRecords);

    // Now Field_10001 is found
    const cachedNew = syncMetadataEngine.findCachedByLookup('MJ: Entity Fields', newFieldLookup);
    expect(cachedNew).toBe(newRecord);
    expect(await syncEngine.resolveLookup('MJ: Entity Fields', newFieldLookup)).toBe('F0000000-0000-0000-0000-000000010001');

    // And removed Field_0 is no longer found in cache
    const removedLookup = [{ fieldName: 'Name', fieldValue: 'Field_0' }];
    expect(syncMetadataEngine.findCachedByLookup('MJ: Entity Fields', removedLookup)).toBeNull();
  });
});
