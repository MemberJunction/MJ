import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FlattenedRecord, RecordData, BatchContext } from '../lib/sync-engine';
import type { PushOptions } from '../services/PushService';
import type { BaseEntity, UserInfo, EntityInfo } from '@memberjunction/core';

/** Minimal entity with BaseEntity's dirty tracking: Dirty and the change set follow Set(). */
class MockBaseEntity {
  public data: Record<string, unknown>;
  private original: Record<string, unknown>;
  public PrimaryKeys = [{ Name: 'ID' }];
  public Fields = [{ Name: 'ID' }, { Name: 'Name' }, { Name: 'Description' }];
  public saveCalls = 0;

  constructor(initialData: Record<string, unknown> = {}) {
    this.data = { ...initialData };
    this.original = { ...initialData };
  }

  get Dirty(): boolean {
    return Object.keys(this.GetChangesSinceLastSave()).length > 0;
  }

  Get(fieldName: string): unknown {
    return this.data[fieldName];
  }

  Set(fieldName: string, value: unknown): void {
    this.data[fieldName] = value;
  }

  GetFieldByName(fieldName: string) {
    return { Name: fieldName, OldValue: this.original[fieldName], EntityFieldInfo: { Type: 'nvarchar' } };
  }

  GetChangesSinceLastSave(): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this.data)) {
      if (this.original[k] !== v) changes[k] = v;
    }
    return changes;
  }

  NewRecord(): void {
    this.data = {};
    this.original = {};
  }

  GetAll(): Record<string, unknown> {
    return { ...this.data };
  }

  async Save(): Promise<boolean> {
    this.saveCalls++;
    return true;
  }
}

let mockEntityInstance: MockBaseEntity;
vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  class MockMetadata {
    public async GetEntityObject(): Promise<MockBaseEntity> {
      return mockEntityInstance;
    }
    public EntityByName(): EntityInfo | null {
      return {
        Name: 'TestEntity',
        PrimaryKeys: [{ Name: 'ID' }],
        Fields: [{ Name: 'ID' }, { Name: 'Name' }, { Name: 'Description' }],
      } as unknown as EntityInfo;
    }
  }
  return { ...actual, Metadata: MockMetadata };
});

import { PushService } from '../services/PushService';
import { SyncEngine } from '../lib/sync-engine';

class TestablePushService extends PushService {
  public async process(flattenedRecord: FlattenedRecord, options: PushOptions, logs: string[]) {
    const batchContext: BatchContext = new Map();
    return this.processFlattenedRecord(flattenedRecord, '/dummy/dir', options, batchContext, {
      onLog: (msg: string) => logs.push(msg),
    });
  }

  public get Changes() {
    return this.changeDetails;
  }
}

function flatten(record: RecordData): FlattenedRecord {
  return {
    id: 'rec-1',
    record,
    entityName: 'TestEntity',
    parentContext: null,
    dependencies: new Set(),
    isCircular: false,
    dependencyLevel: 0,
    path: 'test/path.json',
    subDirectory: '',
  };
}

describe('push --dry-run reports what a real push would do (#4529)', () => {
  const checksum = 'sha256-in-sync';
  let service: TestablePushService;
  let syncEngine: SyncEngine;

  beforeEach(() => {
    syncEngine = {
      getEntityInfo: vi.fn().mockReturnValue({
        Name: 'TestEntity',
        PrimaryKeys: [{ Name: 'ID' }],
        Fields: [{ Name: 'ID' }, { Name: 'Name' }, { Name: 'Description' }],
      }),
      processFieldValue: vi.fn().mockImplementation((val) => val),
      loadEntity: vi.fn(),
      calculateChecksumWithFileContent: vi.fn().mockResolvedValue(checksum),
      setMetadataEngine: vi.fn(),
      buildDefaults: vi.fn().mockResolvedValue({}),
    } as unknown as SyncEngine;
    service = new TestablePushService(syncEngine, {} as UserInfo);
  });

  function existing(data: Record<string, unknown>): void {
    mockEntityInstance = new MockBaseEntity(data);
    vi.mocked(syncEngine.loadEntity).mockResolvedValue(mockEntityInstance as unknown as BaseEntity);
  }

  it('reports an in-sync record as unchanged, as the real push does', async () => {
    existing({ ID: '1', Name: 'Same', Description: 'Desc' });
    const record: RecordData = {
      primaryKey: { ID: '1' },
      fields: { Name: 'Same', Description: 'Desc' },
      sync: { checksum, lastModified: '2026-01-01T00:00:00.000Z' },
    };
    const logs: string[] = [];

    const dry = await service.process(flatten(record), { dryRun: true }, logs);

    expect(dry.status).toBe('unchanged');
    expect(dry.batchContextEntry).toBeDefined();
    expect(logs.some((l) => l.includes('[DRY RUN] Would update'))).toBe(false);
    expect(service.Changes).toEqual([]);
    expect(mockEntityInstance.saveCalls).toBe(0);
  });

  it('reports a changed record as updated and records the field diff, without saving', async () => {
    existing({ ID: '1', Name: 'Old Name', Description: 'Desc' });
    const record: RecordData = {
      primaryKey: { ID: '1' },
      fields: { Name: 'New Name', Description: 'Desc' },
      sync: { checksum, lastModified: '2026-01-01T00:00:00.000Z' },
    };
    const logs: string[] = [];

    const dry = await service.process(flatten(record), { dryRun: true }, logs);

    expect(dry.status).toBe('updated');
    expect(logs).toContain('[DRY RUN] Would update TestEntity record');
    expect(service.Changes).toHaveLength(1);
    expect(service.Changes[0]).toMatchObject({ entityName: 'TestEntity', Operation: 'updated' });
    expect(service.Changes[0].fields.map((f) => f.field)).toEqual(['Name']);
    expect(mockEntityInstance.saveCalls).toBe(0);
    // The file is left as it was: no sync block rewrite in a dry run.
    expect(record.sync?.lastModified).toBe('2026-01-01T00:00:00.000Z');
  });

  it('reports a record whose file content changed as updated (checksum mismatch)', async () => {
    existing({ ID: '1', Name: 'Same', Description: 'Desc' });
    const record: RecordData = {
      primaryKey: { ID: '1' },
      fields: { Name: 'Same', Description: 'Desc' },
      sync: { checksum: 'sha256-stale', lastModified: '2026-01-01T00:00:00.000Z' },
    };

    const dry = await service.process(flatten(record), { dryRun: true }, []);

    expect(dry.status).toBe('updated');
    expect(mockEntityInstance.saveCalls).toBe(0);
  });

  it('reports a missing record as created, without saving', async () => {
    mockEntityInstance = new MockBaseEntity({});
    vi.mocked(syncEngine.loadEntity).mockResolvedValue(null);
    const record: RecordData = { fields: { Name: 'Brand New' } };
    const logs: string[] = [];

    const dry = await service.process(flatten(record), { dryRun: true }, logs);

    expect(dry.status).toBe('created');
    expect(logs).toContain('[DRY RUN] Would create TestEntity record');
    expect(mockEntityInstance.saveCalls).toBe(0);
  });
});
