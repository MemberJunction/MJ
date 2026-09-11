import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FlattenedRecord } from '../lib/sync-engine';
import type { PushOptions, PushCallbacks } from '../services/PushService';
import type { BatchContext } from '../lib/sync-engine';
import type { EntityConfig } from '../config';
import type { IMetadataProvider, UserInfo, EntityInfo } from '@memberjunction/core';

// Mock minimal BaseEntity
class MockBaseEntity {
  public data: Record<string, unknown> = {};
  public isDirty = false;
  public PrimaryKeys = [{ Name: 'ID' }];
  public Fields = [{ Name: 'ID' }, { Name: 'Name' }, { Name: 'Description' }];

  constructor(initialData: Record<string, unknown> = {}) {
    this.data = { ...initialData };
  }

  Get(fieldName: string): unknown {
    return this.data[fieldName];
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
      EntityFieldInfo: {
        Type: 'nvarchar',
      },
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
    this.isDirty = false;
    return true;
  }
}

// Mock Metadata
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
  return {
    ...actual,
    Metadata: MockMetadata,
  };
});

import { PushService } from '../services/PushService';
import { SyncEngine } from '../lib/sync-engine';

class TestablePushService extends PushService {
  public async callProcessFlattenedRecord(
    flattenedRecord: FlattenedRecord,
    entityDir: string,
    options: PushOptions,
    batchContext: BatchContext,
    callbacks?: PushCallbacks,
    entityConfig?: EntityConfig,
    allowDefer = true,
    recordProvider?: IMetadataProvider
  ) {
    return this.processFlattenedRecord(
      flattenedRecord,
      entityDir,
      options,
      batchContext,
      callbacks,
      entityConfig,
      allowDefer,
      recordProvider
    );
  }
}

describe('T17 — Push Sync Metadata Preservation (C7, §3.5, §6 T17)', () => {
  let pushService: TestablePushService;
  let mockSyncEngine: SyncEngine;
  let contextUser: UserInfo;

  beforeEach(() => {
    contextUser = {} as UserInfo;
    mockSyncEngine = {
      getEntityInfo: vi.fn().mockReturnValue({
        Name: 'TestEntity',
        PrimaryKeys: [{ Name: 'ID' }],
        Fields: [{ Name: 'ID' }, { Name: 'Name' }, { Name: 'Description' }],
      }),
      processFieldValue: vi.fn().mockImplementation((val) => val),
      loadEntity: vi.fn(),
      calculateChecksumWithFileContent: vi.fn(),
      setMetadataEngine: vi.fn(),
      buildDefaults: vi.fn().mockResolvedValue({}),
    } as unknown as SyncEngine;

    pushService = new TestablePushService(mockSyncEngine, contextUser);
  });

  it('keeps lastModified when recomputed checksum equals record.sync.checksum', async () => {
    const originalTimestamp = '2026-01-01T00:00:00.000Z';
    const checksum = 'sha256-matching-checksum';

    // DB has older value ('Old Name'), file has 'New Name' (dirty push relative to DB)
    mockEntityInstance = new MockBaseEntity({ ID: '1', Name: 'Old Name', Description: 'Desc' });
    vi.mocked(mockSyncEngine.loadEntity).mockResolvedValue(mockEntityInstance as unknown as import('@memberjunction/core').BaseEntity);
    vi.mocked(mockSyncEngine.calculateChecksumWithFileContent).mockResolvedValue(checksum);

    const record: import('../lib/sync-engine').RecordData = {
      primaryKey: { ID: '1' },
      fields: { Name: 'New Name', Description: 'Desc' },
      sync: {
        checksum,
        lastModified: originalTimestamp,
      },
    };

    const flattenedRecord: FlattenedRecord = {
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

    const batchContext = new Map();
    const options: PushOptions = { incremental: false };

    await pushService.callProcessFlattenedRecord(
      flattenedRecord,
      '/dummy/dir',
      options,
      batchContext
    );

    // Assert: Checksum matched, so lastModified was preserved
    expect(record.sync).toBeDefined();
    expect(record.sync?.checksum).toBe(checksum);
    expect(record.sync?.lastModified).toBe(originalTimestamp);
  });

  it('updates lastModified when recomputed checksum differs from record.sync.checksum', async () => {
    const originalTimestamp = '2026-01-01T00:00:00.000Z';
    const oldChecksum = 'sha256-old-checksum';
    const newChecksum = 'sha256-new-checksum';

    mockEntityInstance = new MockBaseEntity({ ID: '1', Name: 'Old Name', Description: 'Desc' });
    vi.mocked(mockSyncEngine.loadEntity).mockResolvedValue(mockEntityInstance as unknown as import('@memberjunction/core').BaseEntity);
    vi.mocked(mockSyncEngine.calculateChecksumWithFileContent).mockResolvedValue(newChecksum);

    const record: import('../lib/sync-engine').RecordData = {
      primaryKey: { ID: '1' },
      fields: { Name: 'Updated Name', Description: 'Desc' },
      sync: {
        checksum: oldChecksum,
        lastModified: originalTimestamp,
      },
    };

    const flattenedRecord: FlattenedRecord = {
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

    const batchContext = new Map();
    const options: PushOptions = { incremental: false };

    await pushService.callProcessFlattenedRecord(
      flattenedRecord,
      '/dummy/dir',
      options,
      batchContext
    );

    // Assert: Checksum differed, so lastModified was updated to a new timestamp
    expect(record.sync).toBeDefined();
    expect(record.sync?.checksum).toBe(newChecksum);
    expect(record.sync?.lastModified).not.toBe(originalTimestamp);
    expect(new Date(record.sync!.lastModified).getTime()).toBeGreaterThan(new Date(originalTimestamp).getTime());
  });

  it('push.writeSyncMetadata: false yields no sync block for changed records and deletes existing sync block', async () => {
    mockEntityInstance = new MockBaseEntity({ ID: '1', Name: 'Old Name', Description: 'Desc' });
    vi.mocked(mockSyncEngine.loadEntity).mockResolvedValue(mockEntityInstance as unknown as import('@memberjunction/core').BaseEntity);
    vi.mocked(mockSyncEngine.calculateChecksumWithFileContent).mockResolvedValue('any-checksum');

    const record: import('../lib/sync-engine').RecordData = {
      primaryKey: { ID: '1' },
      fields: { Name: 'New Name', Description: 'Desc' },
      sync: {
        checksum: 'some-checksum',
        lastModified: '2026-01-01T00:00:00.000Z',
      },
    };

    const flattenedRecord: FlattenedRecord = {
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

    const entityConfig: EntityConfig = {
      entity: 'TestEntity',
      filePattern: '**/.*.json',
      push: {
        writeSyncMetadata: false,
      },
    };

    const batchContext = new Map();
    const options: PushOptions = { incremental: false };

    await pushService.callProcessFlattenedRecord(
      flattenedRecord,
      '/dummy/dir',
      options,
      batchContext,
      undefined,
      entityConfig
    );

    // Assert: sync block was removed
    expect(record.sync).toBeUndefined();
  });

  it('push.writeSyncMetadata: false yields no sync block for new records', async () => {
    mockEntityInstance = new MockBaseEntity({ ID: '2', Name: 'Brand New', Description: 'Desc' });
    // loadEntity returns null (record does not exist)
    vi.mocked(mockSyncEngine.loadEntity).mockResolvedValue(null);

    const record: import('../lib/sync-engine').RecordData = {
      primaryKey: { ID: '2' },
      fields: { Name: 'Brand New', Description: 'Desc' },
    };

    const flattenedRecord: FlattenedRecord = {
      id: 'rec-2',
      record,
      entityName: 'TestEntity',
      parentContext: null,
      dependencies: new Set(),
      isCircular: false,
      dependencyLevel: 0,
      path: 'test/path.json',
      subDirectory: '',
    };

    const entityConfig: EntityConfig = {
      entity: 'TestEntity',
      filePattern: '**/.*.json',
      push: {
        writeSyncMetadata: false,
      },
    };

    const batchContext = new Map();
    const options: PushOptions = { incremental: false };

    await pushService.callProcessFlattenedRecord(
      flattenedRecord,
      '/dummy/dir',
      options,
      batchContext,
      undefined,
      entityConfig
    );

    // Assert: No sync block created
    expect(record.sync).toBeUndefined();
  });
});
