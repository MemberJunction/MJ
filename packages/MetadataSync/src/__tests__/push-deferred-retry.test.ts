/**
 * The deferred retry of push (Phase 2.5): it never takes the incremental shortcut, the record's
 * checksum waits for the retry, and the retry sees the batch context of the main pass.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BaseEntity, UserInfo, EntityInfo } from '@memberjunction/core';
import type { RecordData, BatchContext } from '../lib/sync-engine';
import type { BatchContextStub } from '../lib/batch-context-index';
import type { FlattenedRecord } from '../lib/record-dependency-analyzer';
import type { PushCallbacks } from '../services/PushService';

/** Minimal entity with BaseEntity's dirty tracking. */
class RetryEntity {
  public data: Record<string, unknown>;
  private original: Record<string, unknown>;
  public PrimaryKeys = [{ Name: 'ID' }];
  public EntityInfo = { Name: 'TestEntity', SchemaName: 'dbo', BaseTable: 'TestEntity', spUpdateGenerated: true, PrimaryKeys: this.PrimaryKeys };

  constructor(initialData: Record<string, unknown> = {}) {
    this.data = { ...initialData };
    this.original = { ...initialData };
  }

  get Dirty(): boolean {
    return Object.keys(this.GetChangesSinceLastSave()).length > 0;
  }

  get IsSaved(): boolean {
    return Object.keys(this.original).length > 0;
  }

  get PrimaryKey(): { KeyValuePairs: { FieldName: string; Value: unknown }[] } {
    return { KeyValuePairs: [{ FieldName: 'ID', Value: this.data.ID }] };
  }

  Get(fieldName: string): unknown {
    return this.data[fieldName];
  }

  Set(fieldName: string, value: unknown): void {
    this.data[fieldName] = value;
  }

  GetFieldByName(fieldName: string) {
    return { Name: fieldName, OldValue: this.original[fieldName], EntityFieldInfo: { Type: 'nvarchar', CodeName: fieldName } };
  }

  GetChangesSinceLastSave(): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this.data)) {
      if (this.original[k] !== v) changes[k] = v;
    }
    return changes;
  }

  NewRecord(): void {
    this.data = { ID: 'new-id' };
    this.original = {};
  }

  GetAll(): Record<string, unknown> {
    return { ...this.data };
  }

  async Save(): Promise<boolean> {
    this.original = { ...this.data };
    return true;
  }
}

let entityInstance: RetryEntity;
vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  class MockMetadata {
    public static get Provider(): { TransactionDepth: number } {
      return { TransactionDepth: 0 };
    }
    public async GetEntityObject(): Promise<RetryEntity> {
      return entityInstance;
    }
    public EntityByName(): EntityInfo | null {
      return null;
    }
  }
  return { ...actual, Metadata: MockMetadata };
});

import { PushService } from '../services/PushService';
import { SyncEngine, DeferrableLookupError } from '../lib/sync-engine';
import { BatchContextIndex } from '../lib/batch-context-index';

const DEFERRED_LOOKUP = '@lookup:Other.Name=Later?allowDefer';
const entityConfig = { entity: 'TestEntity' };

function flatten(record: RecordData, id = 'rec-1'): FlattenedRecord {
  return { id, record, entityName: 'TestEntity', depth: 0, path: 'TestEntity[0]', dependencies: new Set(), originalIndex: 0, graphId: 'graph-1' };
}

describe('push deferred retry', () => {
  let syncEngine: SyncEngine;
  let service: PushService;
  let callbacks: PushCallbacks;
  let lookupReady: boolean;

  beforeEach(() => {
    syncEngine = new SyncEngine({} as UserInfo);
    vi.spyOn(syncEngine, 'getEntityInfo').mockReturnValue({ Name: 'TestEntity', PrimaryKeys: [{ Name: 'ID' }] } as unknown as EntityInfo);
    vi.spyOn(syncEngine, 'calculateChecksumWithFileContent').mockResolvedValue('sha256-new');
    vi.spyOn(syncEngine, 'buildDefaults').mockResolvedValue({});
    lookupReady = false;
    const realProcess = syncEngine.processFieldValue.bind(syncEngine);
    vi.spyOn(syncEngine, 'processFieldValue').mockImplementation(async (value, ...rest) => {
      if (value === DEFERRED_LOOKUP) {
        if (!lookupReady) {
          throw new DeferrableLookupError('Lookup failed: Other', 'Other', [{ fieldName: 'Name', fieldValue: 'Later' }], DEFERRED_LOOKUP);
        }
        return 'other-1';
      }
      return realProcess(value, ...rest);
    });
    service = new PushService(syncEngine, {} as UserInfo);
    callbacks = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not take the incremental shortcut on the retry', async () => {
    entityInstance = new RetryEntity({ ID: '1', Name: 'Same', Description: null });
    const load = vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(entityInstance as unknown as BaseEntity);
    const record: RecordData = {
      primaryKey: { ID: '1' },
      fields: { Name: 'Same', Description: DEFERRED_LOOKUP },
      sync: { checksum: 'sha256-new', lastModified: '2026-01-01T00:00:00.000Z' },
    };
    lookupReady = true;

    await service['processFlattenedRecord'](flatten(record), '/dummy/dir', { incremental: true }, new Map(), callbacks, entityConfig, false);

    expect(load).toHaveBeenCalled();
    expect(entityInstance.Get('Description')).toBe('other-1');
  });

  it('keeps the old checksum on a deferred result and writes the new one after the retry', async () => {
    entityInstance = new RetryEntity({ ID: '1', Name: 'Old', Description: null });
    vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(entityInstance as unknown as BaseEntity);
    const record: RecordData = {
      primaryKey: { ID: '1' },
      fields: { Name: 'New', Description: DEFERRED_LOOKUP },
      sync: { checksum: 'sha256-old', lastModified: '2026-01-01T00:00:00.000Z' },
    };
    const flattened = flatten(record);

    const first = await service['processFlattenedRecord'](flattened, '/dummy/dir', {}, new Map(), callbacks, entityConfig);
    expect(first.status).toBe('deferred');
    expect(record.sync?.checksum).toBe('sha256-old');

    lookupReady = true;
    service['deferredRecords'] = [first.deferredRecord!];
    const retry = await service['processDeferredRecords']({}, callbacks);

    expect(retry.errors).toBe(0);
    expect(entityInstance.Get('Description')).toBe('other-1');
    expect(record.sync?.checksum).toBe('sha256-new');
  });

  it('gives the retry the batch context of the main pass, so a deferred child finds its parent', async () => {
    const parent: BatchContextStub = {
      EntityInfo: { Name: 'TestEntity', PrimaryKeys: [{ Name: 'ID' }], Fields: [{ Name: 'ID' }] },
      Get: (field: string) => (field === 'ID' ? 'parent-1' : undefined),
      GetAll: () => ({ ID: 'parent-1' }),
    };
    const batchContext: BatchContext = new BatchContextIndex();
    batchContext.set('parent-rec', parent);
    entityInstance = new RetryEntity({});
    const load = vi.spyOn(syncEngine, 'loadEntity').mockResolvedValue(null);
    const child: FlattenedRecord = {
      ...flatten({ fields: { Name: '@parent:ID', Description: DEFERRED_LOOKUP } }, 'child-rec'),
      depth: 1,
      parentContext: { entityName: 'TestEntity', record: { fields: {} }, recordIndex: 0 },
      dependencies: new Set(['parent-rec']),
    };

    const first = await service['processFlattenedRecord'](child, '/dummy/dir', {}, batchContext, callbacks, entityConfig);
    expect(first.status).toBe('deferred');
    // The main pass adds each saved record to its batch context
    batchContext.set(first.batchContextEntry!.key, first.batchContextEntry!.entity);

    // The retry finds the record the first pass created
    load.mockResolvedValue(entityInstance as unknown as BaseEntity);
    lookupReady = true;
    service['deferredRecords'] = [first.deferredRecord!];
    const retry = await service['processDeferredRecords']({}, callbacks);

    expect(retry.errors).toBe(0);
    expect(entityInstance.Get('Name')).toBe('parent-1');
    expect(entityInstance.Get('Description')).toBe('other-1');
  });
});
